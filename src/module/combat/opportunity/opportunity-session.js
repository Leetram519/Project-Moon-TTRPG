import {
  analyzeOpportunityMovement,
  canPayOpportunityAttack,
  isOpportunityCapableWeapon,
} from "./opportunity-movement.js";
import { normalizeFoundryOpportunityPath } from "./opportunity-path.js";
import { actorItem, documentId, warnAbnormal } from "../../shared-helpers.js";

export const OPPORTUNITY_SESSION_STATES = {
  PENDING: "pending",
  AWAITING_DECISION: "awaiting-decision",
  AWAITING_ATTACK_RESOLUTION: "awaiting-attack-resolution",
  CONTINUABLE: "continuable",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
};

export const OPPORTUNITY_DECISION_STATES = {
  PENDING: "pending",
  RESOLVED: "resolved",
  AWAITING_ATTACK_RESOLUTION: "awaiting-attack-resolution",
  RESOLVING_ATTACK: "resolving-attack",
  ATTACK_COMMITTED: "attack-committed",
  RESOLUTION_ERROR: "resolution-error",
};

export const OPPORTUNITY_DECISIONS = {
  PASS: "pass",
  ATTACK: "attack",
  EXPIRED: "expired",
};

export const OPPORTUNITY_DECISION_REASONS = {
  NOT_FOUND: "not-found",
  NOT_PENDING: "not-pending",
  INVALID_WEAPON: "invalid-weapon",
  STALE_WEAPON: "stale-weapon",
  REACTION_UNAVAILABLE: "reaction-unavailable",
  REACTOR_MISMATCH: "reactor-mismatch",
  SESSION_INACTIVE: "session-inactive",
  NOT_CURRENT_CHECKPOINT: "not-current-checkpoint",
  NOT_ATTACK_INTENT: "not-attack-intent",
  ALREADY_RESOLVING: "already-resolving",
  NO_AMMO: "no-ammo",
  MOVER_GONE: "mover-gone",
  DECLARATION_FAILED: "declaration-failed",
  AMMO_CONSUME_FAILED: "ammo-consume-failed",
  ATTACK_SETUP_FAILED: "attack-setup-failed",
};

export const OPPORTUNITY_FLAG_SCOPE = "projectmoonttrpg";
export const OPPORTUNITY_FLAG_KEY = "opportunityDecision";

const sessions = new Map();
const opportunityIndex = new Map();
const movementAliases = new Map();
const sessionListeners = new Map();
let generatedOperationCount = 0;

function opportunityIdFor(movementId, pathIndex, reactorCombatantId) {
  return `${movementId}:${pathIndex}:${reactorCombatantId}`;
}

function resolveSession(sessionOrId) {
  if (!sessionOrId) return null;
  if (typeof sessionOrId === "object") return sessionOrId;
  return sessions.get(String(sessionOrId)) ?? null;
}

function findDecision(session, opportunityId) {
  if (!session || opportunityId == null) return null;
  const id = String(opportunityId);
  for (const checkpoint of session.checkpoints) {
    for (const decision of checkpoint.opportunities) {
      if (decision.opportunityId === id) return decision;
    }
  }
  return null;
}

function pathEntryMatchesCell(entry, cell) {
  if (entry?.i !== cell?.i || entry?.j !== cell?.j) return false;
  if (Number.isFinite(Number(entry?.elevationSquare)) && Number.isFinite(Number(cell?.elevationSquare))) {
    return Number(entry.elevationSquare) === Number(cell.elevationSquare);
  }
  const entryElevation = Number(entry?.elevation);
  const cellElevation = Number(cell?.elevation);
  if (Number.isFinite(entryElevation) && Number.isFinite(cellElevation)) {
    return entryElevation === cellElevation;
  }
  return true;
}

function attachPathMeta(cell, path) {
  if (!cell) return cell ?? null;
  const indexed = Number.isFinite(Number(cell.sourcePathIndex))
    ? path?.[Number(cell.sourcePathIndex)]
    : null;
  const listed = indexed && pathEntryMatchesCell(indexed, cell) ? indexed : null;
  const match = listed ?? path?.find((entry) => pathEntryMatchesCell(entry, cell)) ?? null;
  if (!match) return { ...cell };
  return {
    ...match,
    ...cell,
    x: cell.x ?? match.x,
    y: cell.y ?? match.y,
    elevation: cell.elevation ?? match.elevation,
    sourcePathIndex: cell.sourcePathIndex ?? match.sourcePathIndex,
    sourceWaypointIndex: cell.sourceWaypointIndex ?? match.sourceWaypointIndex,
    rawWaypoint: cell.rawWaypoint ?? match.rawWaypoint ?? null,
  };
}

function buildDecision(movementId, opportunity, path) {
  return {
    opportunityId: opportunityIdFor(
      movementId,
      opportunity.pathIndex,
      opportunity.reactorCombatantId,
    ),
    reactorActorId: opportunity.reactorActorId ?? null,
    reactorTokenId: opportunity.reactorTokenId ?? null,
    reactorCombatantId: opportunity.reactorCombatantId ?? null,
    reactorName: opportunity.reactorName ?? null,
    eligibleWeaponIds: [...(opportunity.eligibleWeaponIds ?? [])],
    pauseAt: attachPathMeta(opportunity.pauseAt, path),
    exitTo: attachPathMeta(opportunity.exitTo, path),
    pathIndex: opportunity.pathIndex,
    decision: null,
    chosenWeaponId: null,
    state: OPPORTUNITY_DECISION_STATES.PENDING,
    messageId: null,
    declarationId: null,
    clashId: null,
    result: null,
    resolutionComplete: null,
  };
}

const OPEN_ATTACK_STATES = new Set([
  OPPORTUNITY_DECISION_STATES.AWAITING_ATTACK_RESOLUTION,
  OPPORTUNITY_DECISION_STATES.RESOLVING_ATTACK,
  OPPORTUNITY_DECISION_STATES.ATTACK_COMMITTED,
]);

const DECISION_STATE_RANK = {
  [OPPORTUNITY_DECISION_STATES.PENDING]: 0,
  [OPPORTUNITY_DECISION_STATES.AWAITING_ATTACK_RESOLUTION]: 1,
  [OPPORTUNITY_DECISION_STATES.RESOLVING_ATTACK]: 2,
  [OPPORTUNITY_DECISION_STATES.ATTACK_COMMITTED]: 3,
  [OPPORTUNITY_DECISION_STATES.RESOLVED]: 4,
  [OPPORTUNITY_DECISION_STATES.RESOLUTION_ERROR]: 4,
};

const TERMINAL_SESSION_STATES = new Set([
  OPPORTUNITY_SESSION_STATES.COMPLETED,
  OPPORTUNITY_SESSION_STATES.CANCELLED,
  OPPORTUNITY_SESSION_STATES.EXPIRED,
]);

export function sessionIsTerminal(session) {
  return TERMINAL_SESSION_STATES.has(session?.state);
}

export function sessionWasAbandoned(session) {
  return session?.state === OPPORTUNITY_SESSION_STATES.CANCELLED
    || session?.state === OPPORTUNITY_SESSION_STATES.EXPIRED;
}

function isOpenAttackState(state) {
  return OPEN_ATTACK_STATES.has(state);
}

function isOrchestrationResolvedState(state) {
  return state === OPPORTUNITY_DECISION_STATES.RESOLVED
    || state === OPPORTUNITY_DECISION_STATES.RESOLUTION_ERROR;
}

function isDecisionResolutionComplete(decision) {
  if (!decision) return false;
  if (decision.state === OPPORTUNITY_DECISION_STATES.RESOLUTION_ERROR) return true;
  if (decision.state !== OPPORTUNITY_DECISION_STATES.RESOLVED) return false;
  if (decision.resolutionComplete === false) return false;
  if (decision.result?.resolutionComplete === false) return false;
  return true;
}

function notifySession(session) {
  const listeners = sessionListeners.get(session);
  if (!listeners?.size) return;
  for (const listener of [...listeners]) {
    try {
      listener(session);
    } catch (error) {
      warnAbnormal("session listener failed", { error, movementId: session.movementId });
    }
  }
}

function refreshSessionState(session) {
  if (!session) return null;
  if (TERMINAL_SESSION_STATES.has(session.state)) {
    notifySession(session);
    return session.state;
  }

  const current = getCurrentCheckpoint(session);
  if (!current) {
    session.state = OPPORTUNITY_SESSION_STATES.COMPLETED;
    notifySession(session);
    return session.state;
  }

  const decisions = current.opportunities;
  if (decisions.some((entry) => isOpenAttackState(entry.state))) {
    session.state = OPPORTUNITY_SESSION_STATES.AWAITING_ATTACK_RESOLUTION;
    notifySession(session);
    return session.state;
  }
  if (decisions.length && decisions.every((entry) => isDecisionResolutionComplete(entry))) {
    session.state = OPPORTUNITY_SESSION_STATES.CONTINUABLE;
    notifySession(session);
    return session.state;
  }
  session.state = OPPORTUNITY_SESSION_STATES.AWAITING_DECISION;
  notifySession(session);
  return session.state;
}

function registerSession(session) {
  const existing = sessions.get(session.movementId);
  if (existing && existing !== session) {
    warnAbnormal("replacing existing movement session", { movementId: session.movementId });
    forgetSession(existing);
  }
  sessions.set(session.movementId, session);
  for (const checkpoint of session.checkpoints) {
    for (const decision of checkpoint.opportunities) {
      opportunityIndex.set(decision.opportunityId, session.movementId);
    }
  }
  return session;
}

function forgetAliases(session) {
  if (!session) return;
  for (const alias of session.movementAliases ?? []) {
    if (movementAliases.get(alias) === session.movementId) movementAliases.delete(alias);
  }
  for (const [alias, canonical] of [...movementAliases.entries()]) {
    if (canonical === session.movementId) movementAliases.delete(alias);
  }
}

function forgetSession(session) {
  if (!session) return;
  sessions.delete(session.movementId);
  forgetAliases(session);
  sessionListeners.delete(session);
  for (const checkpoint of session.checkpoints ?? []) {
    for (const decision of checkpoint.opportunities ?? []) {
      opportunityIndex.delete(decision.opportunityId);
    }
  }
}

function resolveMovementId(input = {}) {
  const injected = input.movementId ?? input.movement?.id;
  if (injected != null && String(injected).length) return String(injected);
  generatedOperationCount += 1;
  const generated = `pmttrpg-oa-op-${generatedOperationCount}`;
  warnAbnormal("Foundry movement id unavailable; using a system operation id", {
    movementId: generated,
  });
  return generated;
}

function reject(reason, extra = {}) {
  return { ok: false, reason, stale: reason === OPPORTUNITY_DECISION_REASONS.NOT_PENDING, ...extra };
}

function reactorIdsMatch(decision, provided = {}) {
  const checks = [
    ["reactorCombatantId", provided.reactorCombatantId ?? provided.combatant],
    ["reactorTokenId", provided.reactorTokenId ?? provided.token],
    ["reactorActorId", provided.reactorActorId ?? provided.actor],
  ];
  for (const [field, value] of checks) {
    if (value == null) continue;
    const id = typeof value === "object" ? documentId(value) : String(value);
    if (id != null && id !== String(decision[field])) return false;
  }
  return true;
}

/** Narrows the stored weapons to the ones still held and OA-capable, and payable if you pass a combatant. */
export function refreshOpportunityEligibleWeapons(sessionOrId, opportunityId, {
  actor,
  combatant,
  combat,
} = {}) {
  const session = resolveSession(sessionOrId);
  const decision = findDecision(session, opportunityId);
  if (!decision) return [];
  if (!actor) return [...decision.eligibleWeaponIds];

  const still = [];
  for (const weaponId of decision.eligibleWeaponIds) {
    const weapon = actorItem(actor, weaponId);
    if (!weapon) continue;
    if (!isOpportunityCapableWeapon(weapon)) continue;
    if (combatant && !canPayOpportunityAttack(actor, { combatant, weapon, combat })) continue;
    still.push(String(weaponId));
  }
  decision.eligibleWeaponIds = still;
  return still;
}

export function getOpportunitySession(movementId) {
  if (movementId == null) return null;
  const id = String(movementId);
  return sessions.get(id) ?? sessions.get(movementAliases.get(id)) ?? null;
}

/** Aliases a later Foundry movement id onto an existing session. Opportunity ids keep the original session id. */
export function bindOpportunitySessionMovementId(sessionOrId, foundryMovementId) {
  const session = resolveSession(sessionOrId);
  if (!session || foundryMovementId == null) return session;
  const alias = String(foundryMovementId);
  if (!alias.length || alias === session.movementId) return session;

  const claimed = sessions.get(alias) ?? sessions.get(movementAliases.get(alias));
  if (claimed && claimed !== session) {
    warnAbnormal("movement id already claimed by another session", {
      alias,
      movementId: session.movementId,
    });
    return session;
  }

  movementAliases.set(alias, session.movementId);
  if (!Array.isArray(session.movementAliases)) session.movementAliases = [];
  if (!session.movementAliases.includes(alias)) session.movementAliases.push(alias);
  notifySession(session);
  return session;
}

function subscribeOpportunitySession(sessionOrId, listener) {
  const session = resolveSession(sessionOrId);
  if (!session || typeof listener !== "function") return () => {};
  let listeners = sessionListeners.get(session);
  if (!listeners) {
    listeners = new Set();
    sessionListeners.set(session, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) sessionListeners.delete(session);
  };
}

function isCheckpointOrchestrationReady(checkpoint) {
  if (!checkpoint?.opportunities?.length) return true;
  return checkpoint.opportunities.every((entry) => isDecisionResolutionComplete(entry));
}

/**
 * Resolves with `ok: true` once every decision at the checkpoint is done (a
 * resolution error counts as done), or `ok: false` if the session ends first.
 */
export function waitForOpportunityCheckpointResolution(sessionOrId, checkpoint) {
  const session = resolveSession(sessionOrId);
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve(payload);
    };
    const check = () => {
      const current = resolveSession(session);
      if (!current || TERMINAL_SESSION_STATES.has(current.state)) {
        finish({
          ok: false,
          reason: current?.state ?? OPPORTUNITY_DECISION_REASONS.NOT_FOUND,
          session: current,
        });
        return;
      }
      const target = checkpoint ?? getCurrentCheckpoint(current);
      if (isCheckpointOrchestrationReady(target)) {
        finish({ ok: true, reason: OPPORTUNITY_SESSION_STATES.CONTINUABLE, session: current, checkpoint: target });
      }
    };
    unsubscribe = subscribeOpportunitySession(session, check);
    check();
  });
}

export function getOpportunitySessionByOpportunityId(opportunityId) {
  if (opportunityId == null) return null;
  const movementId = opportunityIndex.get(String(opportunityId));
  return movementId ? getOpportunitySession(movementId) : null;
}

export function listOpportunitySessions() {
  return [...sessions.values()];
}

export function getCurrentCheckpoint(sessionOrId) {
  const session = resolveSession(sessionOrId);
  if (!session) return null;
  return session.checkpoints[session.currentCheckpointIndex] ?? null;
}

export function getOpportunityDecision(sessionOrId, opportunityId) {
  return findDecision(resolveSession(sessionOrId), opportunityId);
}

export function getAwaitingAttackDecisions(sessionOrId) {
  const session = resolveSession(sessionOrId);
  if (!session) return [];
  const found = [];
  for (const checkpoint of session.checkpoints) {
    for (const decision of checkpoint.opportunities) {
      if (decision.state === OPPORTUNITY_DECISION_STATES.AWAITING_ATTACK_RESOLUTION) {
        found.push(decision);
      }
    }
  }
  return found;
}

/**
 * Only `analysis.automaticCheckpoints` turn into session checkpoints. The raw ones
 * and the repeated exits stay on the session for diagnostics.
 */
export function createOpportunitySession(input = {}) {
  const movementId = resolveMovementId(input);
  const automatic = input.analysis?.automaticCheckpoints;
  if (!Array.isArray(automatic) || !automatic.length) {
    warnAbnormal("no automatic checkpoints; session not created", { movementId });
    return null;
  }

  const path = Array.isArray(input.path) ? input.path : [];
  const checkpoints = automatic.map((checkpoint) => ({
    pathIndex: checkpoint.pathIndex,
    pauseAt: attachPathMeta(checkpoint.pauseAt, path),
    exitTo: attachPathMeta(checkpoint.exitTo, path),
    opportunities: (checkpoint.opportunities ?? []).map((opportunity) => (
      buildDecision(movementId, {
        ...opportunity,
        reactorName: opportunity.reactorName
          ?? input.reactorNames?.[opportunity.reactorCombatantId]
          ?? null,
        pauseAt: opportunity.pauseAt ?? checkpoint.pauseAt,
        exitTo: opportunity.exitTo ?? checkpoint.exitTo,
        pathIndex: opportunity.pathIndex ?? checkpoint.pathIndex,
      }, path)
    )),
  })).filter((checkpoint) => checkpoint.opportunities.length);

  if (!checkpoints.length) {
    warnAbnormal("automatic checkpoints had no opportunities", { movementId });
    return null;
  }

  const session = {
    id: movementId,
    movementId,
    moverTokenId: input.moverTokenId ?? documentId(input.moverToken) ?? null,
    moverActorId: input.moverActorId ?? documentId(input.moverActor) ?? null,
    moverCombatantId: input.moverCombatantId ?? documentId(input.moverCombatant) ?? null,
    moverName: input.moverName ?? input.moverToken?.name ?? input.moverActor?.name ?? null,
    path,
    rawCheckpoints: input.analysis?.checkpoints ?? [],
    rawExits: input.analysis?.rawExits ?? [],
    checkpoints,
    currentCheckpointIndex: 0,
    decisions: checkpoints.flatMap((checkpoint) => checkpoint.opportunities),
    state: OPPORTUNITY_SESSION_STATES.AWAITING_DECISION,
    movementActionId: input.movementActionId ?? null,
  };

  refreshSessionState(session);
  return registerSession(session);
}

export function createOpportunitySessionFromMovement(input = {}) {
  const adapted = normalizeFoundryOpportunityPath({
    ...input,
    origin: input.origin ?? input.moverToken ?? input.token,
  });
  const classifyInput = {
    ...input,
    path: adapted.cells,
    waypoints: input.waypoints ?? adapted.waypoints,
    forced: input.forced === true || adapted.cells.some((cell) => cell.forced === true),
    teleport: input.teleport === true || adapted.cells.some((cell) => cell.teleport === true),
    action: input.action ?? adapted.cells.find((cell) => cell.action)?.action,
  };
  const analysis = analyzeOpportunityMovement(classifyInput);
  if (!analysis.context.relevant || !analysis.automaticCheckpoints.length) {
    return { session: null, analysis, path: adapted };
  }
  const session = createOpportunitySession({
    ...input,
    analysis,
    path: adapted.cells,
  });
  return { session, analysis, path: adapted };
}

export function createOpportunitySessionFromCheckpoints(input = {}) {
  return createOpportunitySession({
    ...input,
    analysis: {
      automaticCheckpoints: input.automaticCheckpoints ?? input.checkpoints ?? [],
      checkpoints: input.rawCheckpoints ?? input.checkpoints ?? [],
      rawExits: input.rawExits ?? [],
    },
  });
}

export function decideOpportunityPass(sessionOrId, opportunityId) {
  const session = resolveSession(sessionOrId);
  const decision = findDecision(session, opportunityId);
  if (!decision) return reject(OPPORTUNITY_DECISION_REASONS.NOT_FOUND);
  if (decision.state !== OPPORTUNITY_DECISION_STATES.PENDING || decision.decision != null) {
    return reject(OPPORTUNITY_DECISION_REASONS.NOT_PENDING, { session, decision });
  }

  decision.decision = OPPORTUNITY_DECISIONS.PASS;
  decision.chosenWeaponId = null;
  decision.state = OPPORTUNITY_DECISION_STATES.RESOLVED;
  decision.resolutionComplete = true;
  refreshSessionState(session);
  return { ok: true, session, decision };
}

export function decideOpportunityAttack(sessionOrId, opportunityId, options = {}) {
  const session = resolveSession(sessionOrId);
  const decision = findDecision(session, opportunityId);
  if (!decision) return reject(OPPORTUNITY_DECISION_REASONS.NOT_FOUND);
  if (decision.state !== OPPORTUNITY_DECISION_STATES.PENDING || decision.decision != null) {
    return reject(OPPORTUNITY_DECISION_REASONS.NOT_PENDING, { session, decision });
  }
  if (!reactorIdsMatch(decision, options)) {
    return reject(OPPORTUNITY_DECISION_REASONS.REACTOR_MISMATCH, { session, decision });
  }

  let chosenWeaponId = options.chosenWeaponId != null && String(options.chosenWeaponId) !== ""
    ? String(options.chosenWeaponId)
    : null;
  if (!chosenWeaponId && decision.eligibleWeaponIds.length === 1) {
    chosenWeaponId = String(decision.eligibleWeaponIds[0]);
  }
  if (!chosenWeaponId || !decision.eligibleWeaponIds.includes(chosenWeaponId)) {
    warnAbnormal("Attack chosen with a weapon that is not eligible", {
      opportunityId,
      chosenWeaponId,
      eligibleWeaponIds: decision.eligibleWeaponIds,
    });
    return reject(OPPORTUNITY_DECISION_REASONS.INVALID_WEAPON, { session, decision });
  }

  const actor = options.actor ?? options.combatant?.actor ?? options.token?.actor ?? null;
  const combatant = options.combatant ?? null;
  const combat = options.combat ?? null;
  const weapon = actorItem(actor, chosenWeaponId);

  if (!actor || !weapon) {
    refreshOpportunityEligibleWeapons(session, opportunityId, { actor, combatant, combat });
    warnAbnormal("chosen OA weapon is missing on the reactor Actor", {
      opportunityId,
      chosenWeaponId,
    });
    return reject(OPPORTUNITY_DECISION_REASONS.STALE_WEAPON, {
      session,
      decision,
      eligibleWeaponIds: decision.eligibleWeaponIds,
    });
  }

  if (!isOpportunityCapableWeapon(weapon)) {
    refreshOpportunityEligibleWeapons(session, opportunityId, { actor, combatant, combat });
    warnAbnormal("chosen OA weapon is no longer held or OA-capable", {
      opportunityId,
      chosenWeaponId,
    });
    return reject(OPPORTUNITY_DECISION_REASONS.STALE_WEAPON, {
      session,
      decision,
      eligibleWeaponIds: decision.eligibleWeaponIds,
    });
  }

  if (!combatant || !canPayOpportunityAttack(actor, { combatant, weapon, combat })) {
    refreshOpportunityEligibleWeapons(session, opportunityId, { actor, combatant, combat });
    warnAbnormal("reactor can no longer pay OPPORTUNITY_ATTACK", {
      opportunityId,
      chosenWeaponId,
    });
    return reject(OPPORTUNITY_DECISION_REASONS.REACTION_UNAVAILABLE, {
      session,
      decision,
      eligibleWeaponIds: decision.eligibleWeaponIds,
    });
  }

  decision.decision = OPPORTUNITY_DECISIONS.ATTACK;
  decision.chosenWeaponId = chosenWeaponId;
  decision.state = OPPORTUNITY_DECISION_STATES.AWAITING_ATTACK_RESOLUTION;
  refreshSessionState(session);
  return { ok: true, session, decision };
}

export function claimOpportunityAttackResolution(sessionOrId, opportunityId) {
  const session = resolveSession(sessionOrId);
  const decision = findDecision(session, opportunityId);
  if (!decision) return reject(OPPORTUNITY_DECISION_REASONS.NOT_FOUND);
  if (
    decision.state === OPPORTUNITY_DECISION_STATES.RESOLVING_ATTACK
    || decision.state === OPPORTUNITY_DECISION_STATES.ATTACK_COMMITTED
  ) {
    return reject(OPPORTUNITY_DECISION_REASONS.ALREADY_RESOLVING, { session, decision, stale: true });
  }
  if (
    decision.decision !== OPPORTUNITY_DECISIONS.ATTACK
    || decision.state !== OPPORTUNITY_DECISION_STATES.AWAITING_ATTACK_RESOLUTION
    || !decision.chosenWeaponId
  ) {
    return reject(OPPORTUNITY_DECISION_REASONS.NOT_ATTACK_INTENT, { session, decision });
  }
  decision.state = OPPORTUNITY_DECISION_STATES.RESOLVING_ATTACK;
  refreshSessionState(session);
  return { ok: true, session, decision };
}

/** Only call this for failures before the attack is declared and its cost is paid. */
export function restoreOpportunityAttackIntent(sessionOrId, opportunityId, options = {}) {
  const session = resolveSession(sessionOrId);
  const decision = findDecision(session, opportunityId);
  if (!decision) return reject(OPPORTUNITY_DECISION_REASONS.NOT_FOUND);
  if (
    decision.state !== OPPORTUNITY_DECISION_STATES.AWAITING_ATTACK_RESOLUTION
    && decision.state !== OPPORTUNITY_DECISION_STATES.RESOLVING_ATTACK
  ) {
    return reject(OPPORTUNITY_DECISION_REASONS.NOT_PENDING, { session, decision });
  }

  decision.decision = null;
  decision.chosenWeaponId = null;
  decision.state = OPPORTUNITY_DECISION_STATES.PENDING;
  decision.declarationId = null;
  decision.clashId = null;
  decision.result = null;
  if (options.actor) {
    refreshOpportunityEligibleWeapons(session, opportunityId, {
      actor: options.actor,
      combatant: options.combatant,
      combat: options.combat,
    });
  }
  refreshSessionState(session);
  return { ok: true, session, decision };
}

export function commitOpportunityAttackDeclaration(sessionOrId, opportunityId, extras = {}) {
  const session = resolveSession(sessionOrId);
  const decision = findDecision(session, opportunityId);
  if (!decision) return reject(OPPORTUNITY_DECISION_REASONS.NOT_FOUND);
  if (decision.state !== OPPORTUNITY_DECISION_STATES.RESOLVING_ATTACK) {
    return reject(OPPORTUNITY_DECISION_REASONS.NOT_PENDING, { session, decision });
  }
  decision.state = OPPORTUNITY_DECISION_STATES.ATTACK_COMMITTED;
  if (extras.declarationId != null) decision.declarationId = extras.declarationId;
  refreshSessionState(session);
  return { ok: true, session, decision };
}

export function failOpportunityAttackResolution(sessionOrId, opportunityId, result = null) {
  const session = resolveSession(sessionOrId);
  const decision = findDecision(session, opportunityId);
  if (!decision) return reject(OPPORTUNITY_DECISION_REASONS.NOT_FOUND);
  if (
    decision.state !== OPPORTUNITY_DECISION_STATES.RESOLVING_ATTACK
    && decision.state !== OPPORTUNITY_DECISION_STATES.ATTACK_COMMITTED
  ) {
    return reject(OPPORTUNITY_DECISION_REASONS.NOT_PENDING, { session, decision });
  }
  decision.state = OPPORTUNITY_DECISION_STATES.RESOLUTION_ERROR;
  decision.resolutionComplete = true;
  if (result) {
    decision.result = {
      ...result,
      resolutionComplete: result.resolutionComplete !== false,
    };
  }
  refreshSessionState(session);
  return { ok: true, session, decision };
}

const FINALIZABLE_ATTACK_STATES = new Set([
  OPPORTUNITY_DECISION_STATES.AWAITING_ATTACK_RESOLUTION,
  OPPORTUNITY_DECISION_STATES.RESOLVING_ATTACK,
  OPPORTUNITY_DECISION_STATES.ATTACK_COMMITTED,
]);

/**
 * `movementRisk: false` keeps the previous movement directive, and
 * `resolutionComplete: false` leaves the checkpoint paused even if the directive is known.
 */
export function applyOpportunityAttackOutcome(sessionOrId, opportunityId, result = null) {
  const session = resolveSession(sessionOrId);
  const decision = findDecision(session, opportunityId);
  if (!decision) return reject(OPPORTUNITY_DECISION_REASONS.NOT_FOUND);

  if (
    decision.state === OPPORTUNITY_DECISION_STATES.RESOLVED
    || decision.state === OPPORTUNITY_DECISION_STATES.RESOLUTION_ERROR
  ) {
    return { ok: true, stale: true, alreadyResolved: true, session, decision };
  }

  if (decision.decision !== OPPORTUNITY_DECISIONS.ATTACK || !FINALIZABLE_ATTACK_STATES.has(decision.state)) {
    return reject(OPPORTUNITY_DECISION_REASONS.NOT_PENDING, { session, decision });
  }

  const incoming = result && typeof result === "object" ? { ...result } : {};
  const movementRisk = incoming.movementRisk !== false;
  const resolutionComplete = incoming.resolutionComplete !== false;
  const previous = decision.result && typeof decision.result === "object" ? { ...decision.result } : {};
  const nextResult = { ...previous, ...incoming };

  if (!movementRisk) {
    if (previous.movementDirective != null) {
      nextResult.movementDirective = previous.movementDirective;
    } else {
      delete nextResult.movementDirective;
    }
  }

  nextResult.movementRisk = movementRisk;
  nextResult.resolutionComplete = resolutionComplete;
  decision.result = nextResult;
  decision.resolutionComplete = resolutionComplete;
  if (nextResult.clashId != null) decision.clashId = nextResult.clashId;

  if (resolutionComplete) {
    decision.state = OPPORTUNITY_DECISION_STATES.RESOLVED;
  }

  refreshSessionState(session);
  return { ok: true, session, decision };
}

/**
 * For after the Opportunity Attack clash finishes. The Attack has to be claimed or
 * committed already. A pending or just chosen one gets rejected.
 */
export function markOpportunityAttackResolved(sessionOrId, opportunityId, result = null) {
  const session = resolveSession(sessionOrId);
  const decision = findDecision(session, opportunityId);
  if (!decision) return reject(OPPORTUNITY_DECISION_REASONS.NOT_FOUND);
  if (
    decision.state === OPPORTUNITY_DECISION_STATES.RESOLVED
    || decision.state === OPPORTUNITY_DECISION_STATES.RESOLUTION_ERROR
  ) {
    return { ok: true, stale: true, alreadyResolved: true, session, decision };
  }
  if (
    decision.state !== OPPORTUNITY_DECISION_STATES.ATTACK_COMMITTED
    && decision.state !== OPPORTUNITY_DECISION_STATES.RESOLVING_ATTACK
  ) {
    return reject(OPPORTUNITY_DECISION_REASONS.NOT_PENDING, { session, decision });
  }
  return applyOpportunityAttackOutcome(session, opportunityId, result);
}

export function advanceCheckpoint(sessionOrId) {
  const session = resolveSession(sessionOrId);
  if (!session) return { ok: false, reason: OPPORTUNITY_DECISION_REASONS.NOT_FOUND };
  if (session.state !== OPPORTUNITY_SESSION_STATES.CONTINUABLE) {
    return { ok: false, reason: "not-continuable", session };
  }
  session.currentCheckpointIndex += 1;
  if (session.currentCheckpointIndex >= session.checkpoints.length) {
    session.state = OPPORTUNITY_SESSION_STATES.COMPLETED;
    return { ok: true, session, checkpoint: null };
  }
  refreshSessionState(session);
  return { ok: true, session, checkpoint: getCurrentCheckpoint(session) };
}

function finishSession(sessionOrId, state) {
  const session = resolveSession(sessionOrId);
  if (!session) return null;
  session.state = state;
  notifySession(session);
  forgetSession(session);
  return session;
}

export function completeOpportunitySession(sessionOrId) {
  return finishSession(sessionOrId, OPPORTUNITY_SESSION_STATES.COMPLETED);
}

export function cancelOpportunitySession(sessionOrId) {
  return finishSession(sessionOrId, OPPORTUNITY_SESSION_STATES.CANCELLED);
}

export function expireOpportunitySession(sessionOrId) {
  return finishSession(sessionOrId, OPPORTUNITY_SESSION_STATES.EXPIRED);
}

export function forcePassPendingOpportunities(sessionOrId) {
  const session = resolveSession(sessionOrId);
  if (!session) return reject(OPPORTUNITY_DECISION_REASONS.NOT_FOUND);
  const current = getCurrentCheckpoint(session);
  if (!current) return { ok: false, reason: "no-checkpoint", session };

  const passed = [];
  const skipped = [];
  for (const decision of current.opportunities) {
    if (decision.state === OPPORTUNITY_DECISION_STATES.PENDING && decision.decision == null) {
      const result = decideOpportunityPass(session, decision.opportunityId);
      if (result.ok) passed.push(decision);
      else skipped.push(decision);
      continue;
    }
    if (!isOrchestrationResolvedState(decision.state)) skipped.push(decision);
  }
  return { ok: true, session, passed, skipped };
}

export function opportunityFlagsOnMessage(message) {
  return message.getFlag(OPPORTUNITY_FLAG_SCOPE, OPPORTUNITY_FLAG_KEY) ?? null;
}

function sessionForOpportunityFlags(flags) {
  if (!flags) return null;
  if (flags.movementId) return getOpportunitySession(flags.movementId);
  if (flags.opportunityId) return getOpportunitySessionByOpportunityId(flags.opportunityId);
  return null;
}

/**
 * Deleting the card or flushing the log removes the only control for a pending
 * Opportunity. Attacks that are already resolving are left alone.
 */
export function forcePassOpportunitiesForRemovedChat(message, options = {}) {
  const targets = options.deleteAll
    ? listOpportunitySessions()
    : [sessionForOpportunityFlags(opportunityFlagsOnMessage(message))].filter(Boolean);
  const results = [];
  for (const session of targets) {
    const checkpoint = getCurrentCheckpoint(session);
    const pending = checkpoint?.opportunities?.some((decision) => (
      decision.state === OPPORTUNITY_DECISION_STATES.PENDING && decision.decision == null
    ));
    if (!pending) continue;
    results.push(forcePassPendingOpportunities(session));
  }
  return results;
}

/** Expires a pending Opportunity without recording it as a voluntary Pass. */
export function expirePendingOpportunityDecision(sessionOrId, opportunityId, extras = {}) {
  const session = resolveSession(sessionOrId);
  const decision = findDecision(session, opportunityId);
  if (!decision) return reject(OPPORTUNITY_DECISION_REASONS.NOT_FOUND);
  if (decision.state !== OPPORTUNITY_DECISION_STATES.PENDING || decision.decision != null) {
    return reject(OPPORTUNITY_DECISION_REASONS.NOT_PENDING, { session, decision });
  }

  decision.decision = OPPORTUNITY_DECISIONS.EXPIRED;
  decision.chosenWeaponId = null;
  decision.state = OPPORTUNITY_DECISION_STATES.RESOLVED;
  decision.resolutionComplete = true;
  decision.result = {
    expired: true,
    movementDirective: "revalidate",
    resolutionComplete: true,
    ...(extras.result ?? {}),
  };
  refreshSessionState(session);
  return { ok: true, session, decision };
}

export function serializeOpportunityDecision(decision, extras = {}) {
  if (!decision) return null;
  return {
    version: 1,
    movementId: extras.movementId ?? decision.movementId ?? null,
    opportunityId: decision.opportunityId,
    checkpointPathIndex: decision.pathIndex,
    moverTokenId: extras.moverTokenId ?? null,
    moverActorId: extras.moverActorId ?? null,
    moverCombatantId: extras.moverCombatantId ?? null,
    moverName: extras.moverName ?? null,
    movementActionId: extras.movementActionId ?? null,
    reactorTokenId: decision.reactorTokenId,
    reactorActorId: decision.reactorActorId,
    reactorCombatantId: decision.reactorCombatantId,
    reactorName: extras.reactorName ?? decision.reactorName ?? null,
    eligibleWeaponIds: [...decision.eligibleWeaponIds],
    eligibleWeapons: extras.eligibleWeapons ?? [],
    decision: decision.decision,
    chosenWeaponId: decision.chosenWeaponId,
    state: decision.state,
    declarationId: decision.declarationId ?? null,
    clashId: decision.clashId ?? null,
    result: decision.result ?? null,
    resolutionComplete: decision.resolutionComplete
      ?? decision.result?.resolutionComplete
      ?? null,
    pauseAt: decision.pauseAt
      ? {
        i: decision.pauseAt.i,
        j: decision.pauseAt.j,
        x: decision.pauseAt.x,
        y: decision.pauseAt.y,
        elevation: decision.pauseAt.elevation,
        sourcePathIndex: decision.pauseAt.sourcePathIndex,
        sourceWaypointIndex: decision.pauseAt.sourceWaypointIndex,
      }
      : null,
    messageId: extras.messageId ?? decision.messageId ?? null,
    exitTo: decision.exitTo
      ? {
        i: decision.exitTo.i,
        j: decision.exitTo.j,
        x: decision.exitTo.x,
        y: decision.exitTo.y,
        elevation: decision.exitTo.elevation,
        sourcePathIndex: decision.exitTo.sourcePathIndex,
        sourceWaypointIndex: decision.exitTo.sourceWaypointIndex,
      }
      : null,
  };
}

/** Rebuilds a pending Opportunity from chat flags after a reload, but not the paused movement. */
export function hydrateOpportunitySessionFromFlags(flags) {
  if (!flags?.movementId || !flags?.opportunityId) return null;
  const existing = getOpportunitySession(flags.movementId);
  if (existing) {
    const decision = findDecision(existing, flags.opportunityId);
    if (decision && decision.state === OPPORTUNITY_DECISION_STATES.PENDING && flags.decision) {
      decision.decision = flags.decision;
      decision.chosenWeaponId = flags.chosenWeaponId ?? null;
      decision.state = flags.state ?? decision.state;
      decision.declarationId = flags.declarationId ?? decision.declarationId ?? null;
      decision.clashId = flags.clashId ?? decision.clashId ?? null;
      decision.result = flags.result ?? decision.result ?? null;
      refreshSessionState(existing);
    }
    return existing;
  }

  warnAbnormal("hydrating Opportunity from chat flags; paused movement is not restored", {
    movementId: flags.movementId,
    opportunityId: flags.opportunityId,
  });

  const session = createOpportunitySession({
    movementId: flags.movementId,
    moverTokenId: flags.moverTokenId,
    moverActorId: flags.moverActorId,
    moverCombatantId: flags.moverCombatantId,
    moverName: flags.moverName,
    movementActionId: flags.movementActionId ?? null,
    analysis: {
      automaticCheckpoints: [{
        pathIndex: flags.checkpointPathIndex ?? 0,
        pauseAt: flags.pauseAt ?? null,
        exitTo: flags.exitTo ?? null,
        opportunities: [{
          reactorActorId: flags.reactorActorId,
          reactorTokenId: flags.reactorTokenId,
          reactorCombatantId: flags.reactorCombatantId,
          reactorName: flags.reactorName,
          eligibleWeaponIds: flags.eligibleWeaponIds ?? [],
          pauseAt: flags.pauseAt ?? null,
          exitTo: flags.exitTo ?? null,
          pathIndex: flags.checkpointPathIndex ?? 0,
        }],
      }],
      checkpoints: [],
      rawExits: [],
    },
  });
  if (!session) return null;

  const decision = findDecision(session, flags.opportunityId);
  if (decision) {
    decision.messageId = flags.messageId ?? null;
    if (flags.decision) {
      decision.decision = flags.decision;
      decision.chosenWeaponId = flags.chosenWeaponId ?? null;
      decision.state = flags.state
        ?? (flags.decision === OPPORTUNITY_DECISIONS.PASS
          ? OPPORTUNITY_DECISION_STATES.RESOLVED
          : OPPORTUNITY_DECISION_STATES.AWAITING_ATTACK_RESOLUTION);
      decision.declarationId = flags.declarationId ?? decision.declarationId ?? null;
      decision.clashId = flags.clashId ?? decision.clashId ?? null;
      decision.result = flags.result ?? decision.result ?? null;
      refreshSessionState(session);
    }
  }
  return session;
}

function applyFlagFields(decision, flags) {
  if (flags.decision != null) decision.decision = flags.decision;
  if (flags.chosenWeaponId !== undefined) decision.chosenWeaponId = flags.chosenWeaponId ?? null;
  if (flags.state) decision.state = flags.state;
  if (flags.declarationId !== undefined) decision.declarationId = flags.declarationId ?? null;
  if (flags.clashId !== undefined) decision.clashId = flags.clashId ?? null;
  if (flags.result !== undefined) decision.result = flags.result ?? null;
  if (flags.resolutionComplete !== undefined) {
    decision.resolutionComplete = flags.resolutionComplete;
  } else if (flags.result && flags.result.resolutionComplete !== undefined) {
    decision.resolutionComplete = flags.result.resolutionComplete;
  }
  if (Array.isArray(flags.eligibleWeaponIds) && decision.state === OPPORTUNITY_DECISION_STATES.PENDING) {
    decision.eligibleWeaponIds = [...flags.eligibleWeaponIds];
  }
}

export function applyOpportunityFlagsToSession(flags) {
  if (!flags?.movementId || !flags?.opportunityId) return null;
  const session = getOpportunitySession(flags.movementId);
  if (!session) return null;
  const decision = findDecision(session, flags.opportunityId);
  if (!decision) return session;

  if (decision.state !== OPPORTUNITY_DECISION_STATES.PENDING) {
    const nextRank = DECISION_STATE_RANK[flags.state];
    const currentRank = DECISION_STATE_RANK[decision.state] ?? 0;
    if (flags.state && nextRank > currentRank) {
      applyFlagFields(decision, flags);
      refreshSessionState(session);
    } else if (flags.result !== undefined && flags.state === decision.state && currentRank >= 3) {
      decision.result = flags.result ?? null;
      if (flags.resolutionComplete !== undefined) {
        decision.resolutionComplete = flags.resolutionComplete;
      } else if (flags.result?.resolutionComplete !== undefined) {
        decision.resolutionComplete = flags.result.resolutionComplete;
      }
      if (decision.resolutionComplete === true) {
        decision.state = OPPORTUNITY_DECISION_STATES.RESOLVED;
      }
      refreshSessionState(session);
    }
    return session;
  }

  if (!flags.decision) {
    if (Array.isArray(flags.eligibleWeaponIds)) {
      decision.eligibleWeaponIds = [...flags.eligibleWeaponIds];
    }
    return session;
  }
  applyFlagFields(decision, flags);
  if (!flags.state) {
    decision.state = flags.decision === OPPORTUNITY_DECISIONS.PASS
      ? OPPORTUNITY_DECISION_STATES.RESOLVED
      : OPPORTUNITY_DECISION_STATES.AWAITING_ATTACK_RESOLUTION;
  }
  refreshSessionState(session);
  return session;
}
