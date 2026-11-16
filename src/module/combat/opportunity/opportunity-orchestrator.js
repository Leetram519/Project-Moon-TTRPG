import { hasDisengage } from "../../action-economy/combat-flags.js";
import { FORCED_MOVEMENT_ACTION } from "../../movement/movement-plan.js";
import { analyzeOpportunityMovement, filterConsumedOpportunityCrossings, normalizeOpportunityCell, opportunityCrossingKey } from "./opportunity-movement.js";
import { markMovementActionProcessed } from "../../movement/movement-actions.js";
import { normalizeFoundryOpportunityPath, recordedElevationsDiffer } from "./opportunity-path.js";
import {
  filterAutomaticCheckpointsByPromptPreference,
  isAdministrativeMovementActive,
} from "./opportunity-preferences.js";
import {
  advanceCheckpoint,
  bindOpportunitySessionMovementId,
  cancelOpportunitySession,
  completeOpportunitySession,
  createOpportunitySession,
  expirePendingOpportunityDecision,
  expireOpportunitySession,
  getCurrentCheckpoint,
  getOpportunitySession,
  listOpportunitySessions,
  OPPORTUNITY_DECISION_STATES,
  OPPORTUNITY_DECISIONS,
  sessionIsTerminal,
  sessionWasAbandoned,
  waitForOpportunityCheckpointResolution,
} from "./opportunity-session.js";
import { documentId, projectOptions, warnAbnormal } from "../../shared-helpers.js";
import { resolveTokenDocument } from "../../acting-user.js";
import { findCombatant } from "../combatant-match.js";

const OPPORTUNITY_LIVE_DIRECTIVES = {
  STOP_IN_RANGE: "stop-in-range",
  REVALIDATE: "revalidate",
};

async function presentOpportunityPrompt(session) {
  const { presentOpportunitySession } = await import("./opportunity-prompt.js");
  return presentOpportunitySession(session);
}

async function expirePromptSurface(session, extras) {
  const { expireOpportunityPromptSurface } = await import("./opportunity-prompt.js");
  return expireOpportunityPromptSurface(session, extras);
}

async function exhaustSquares(actor) {
  const { exhaustRemainingSquares } = await import("../movement.js");
  return exhaustRemainingSquares(actor);
}

const PAUSE_KEY_PREFIX = "pmttrpg-oa";
const UNSAFE_METHODS = new Set(["undo", "paste"]);
const TELEPORT_ACTIONS = new Set(["blink", "displace", "teleport"]);

const runtimes = new Map();
const tokenLocks = new Map();
const checkpointClaims = new Map();

const ROUTINE_CLEANUP_REASONS = new Set([
  "turn-changed",
  "combat-ended",
  "mover-deleted",
  "movement-finished-before-remaining-opportunity",
]);

const ERROR_KEYS = new Set(["PMTTRPG.Opportunity.ResolutionErrorContinue"]);

function warnUser(key, extra) {
  const text = game.i18n.localize(key);
  if (ERROR_KEYS.has(key)) ui.notifications.error(text);
  else ui.notifications.warn(text);
  warnAbnormal(text, extra);
}

function movementInstruction(tokenDoc, options = {}) {
  return options.movement?.[tokenDoc.id] ?? null;
}

export function isOpportunityContinuation(options = {}) {
  const pmt = projectOptions(options);
  if (pmt.ignoreOpportunityAttacks === true) return true;
  if (options._resumeMovement || options._stopMovement || options._pauseMovement) return true;
  if (options._clearMovementHistory || options.isUndo || options.undo || options.isPaste) return true;
  return Boolean(options._movementArguments?.continuationId);
}

function originContinuationId(options = {}) {
  const id = projectOptions(options).opportunityContinuationOf;
  return id == null ? null : String(id);
}

/**
 * Just reads the Opportunity token lock, without the warning or the stale-lock
 * cleanup that shouldBlockOverlappingOpportunityMove does.
 */
export function hasOpportunityTokenLock(tokenDoc) {
  if (!tokenDoc) return false;
  const locked = tokenLocks.get(tokenDoc.id);
  if (!locked) return false;
  const runtime = runtimes.get(locked);
  return !!runtime && runtime.tokenId === tokenDoc.id;
}

export function shouldBlockOverlappingOpportunityMove(tokenDoc, options = {}) {
  if (!tokenDoc || isOpportunityContinuation(options)) return false;
  const locked = tokenLocks.get(tokenDoc.id);
  if (!locked) return false;
  const runtime = runtimes.get(locked);
  if (!runtime || runtime.tokenId !== tokenDoc.id) {
    tokenLocks.delete(tokenDoc.id);
    return false;
  }
  const continuationOf = originContinuationId(options);
  if (continuationOf && (continuationOf === String(locked) || continuationOf === String(runtime.movementId))) {
    return false;
  }
  // an intercepted move() takes the lock before its own commit reaches _preUpdate.
  // That commit goes through until its movement starts.
  const preparedId = projectOptions(options).opportunityPrepared;
  if (preparedId != null && String(preparedId) === String(locked) && !runtime.foundryMovementId) {
    return false;
  }
  warnUser("PMTTRPG.Opportunity.SecondMoveBlocked", { tokenId: tokenDoc.id, movementId: locked });
  return true;
}

function movementMethod(instruction, options = {}) {
  return String(instruction?.method ?? options.method ?? "").trim().toLowerCase();
}

function waypointList(instruction, changed = {}) {
  if (Array.isArray(instruction?.waypoints) && instruction.waypoints.length) {
    return instruction.waypoints;
  }
  if (instruction?.destination) return [instruction.destination];
  if ("x" in changed || "y" in changed || "elevation" in changed) {
    return [{
      x: changed.x,
      y: changed.y,
      elevation: changed.elevation,
    }];
  }
  return [];
}

function actionIsTeleport(value) {
  return TELEPORT_ACTIONS.has(String(value ?? "").trim().toLowerCase());
}

function originFromToken(tokenDoc) {
  const source = tokenDoc._source ?? tokenDoc;
  return {
    x: source.x,
    y: source.y,
    elevation: source.elevation,
    width: source.width,
    height: source.height,
    depth: source.depth,
    shape: source.shape,
    level: source.level,
  };
}

function positionsEqual(a, b) {
  if (!a || !b) return false;
  if (recordedElevationsDiffer(a, b)) return false;
  if (Number.isFinite(Number(a.i)) && Number.isFinite(Number(b.i))
    && Number.isFinite(Number(a.j)) && Number.isFinite(Number(b.j))) {
    if (Number(a.i) === Number(b.i) && Number(a.j) === Number(b.j)) return true;
  }
  const ax = Number(a.x);
  const ay = Number(a.y);
  const bx = Number(b.x);
  const by = Number(b.y);
  if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) {
    return false;
  }
  return Math.round(ax) === Math.round(bx) && Math.round(ay) === Math.round(by);
}

/** Foundry won't hold a checkpoint on the Token's current cell, but one at another elevation is fine. */
function isOpportunityCheckpointAtMovementOrigin({
  checkpoint,
  tokenDocument,
  origin,
  grid,
  gridSize,
} = {}) {
  const pauseAt = checkpoint?.pauseAt;
  if (!pauseAt) return false;
  const originPoint = origin ?? (tokenDocument ? originFromToken(tokenDocument) : null);
  if (!originPoint) return false;
  const options = {
    grid: grid ?? tokenDocument?.parent?.grid ?? canvas.grid,
    gridSize: gridSize ?? tokenDocument?.parent?.grid?.size ?? canvas.grid?.size,
  };
  const pauseCell = normalizeOpportunityCell(pauseAt, options);
  const originCell = normalizeOpportunityCell(originPoint, options);
  if (pauseCell && originCell) {
    return pauseCell.i === originCell.i && pauseCell.j === originCell.j
      && pauseCell.elevationSquare === originCell.elevationSquare;
  }
  return positionsEqual(pauseAt, originPoint);
}

function asWaypointList(waypoints) {
  if (Array.isArray(waypoints)) return waypoints;
  if (waypoints) return [waypoints];
  return [];
}

function stampMovementInstruction(tokenDoc, waypoints, options = {}) {
  const list = asWaypointList(waypoints);
  if (!options.movement) options.movement = {};
  const current = options.movement[tokenDoc.id];
  if (!current) {
    options.movement[tokenDoc.id] = {
      waypoints: list,
      method: options.method,
    };
    return options;
  }
  if (!Array.isArray(current.waypoints) || !current.waypoints.length) {
    current.waypoints = list;
  }
  return options;
}

function snapshotDeferredMove(tokenDoc, waypoints, options = {}) {
  const instruction = movementInstruction(tokenDoc, options);
  const pmt = projectOptions(options);
  return {
    movementActionId: pmt.movementActionId ?? null,
    movementPlanned: pmt.movementPlanned ?? null,
    waypoints: asWaypointList(waypoints).map((waypoint) => ({ ...waypoint })),
    method: instruction?.method ?? options.method,
    autoRotate: options.autoRotate,
    showRuler: options.showRuler,
    constrainOptions: options.constrainOptions,
    measureOptions: options.measureOptions,
    animate: options.animate,
    animation: options.animation,
    pan: options.pan,
    combat: options.combat,
    action: instruction?.action,
  };
}

function continuationMoveOptions(tokenDoc, session, deferred) {
  const options = {
    method: deferred.method,
    autoRotate: deferred.autoRotate,
    showRuler: deferred.showRuler,
    constrainOptions: deferred.constrainOptions,
    measureOptions: deferred.measureOptions,
    animate: deferred.animate,
    animation: deferred.animation,
    pan: deferred.pan,
    combat: deferred.combat,
    projectmoonttrpg: {
      opportunityContinuationOf: session.movementId,
      // reuse the original movement action so planned movement and hazards see the resumed move as the same movement
      ...(deferred.movementActionId ? { movementActionId: deferred.movementActionId } : {}),
      ...(deferred.movementPlanned ? { movementPlanned: deferred.movementPlanned } : {}),
    },
    movement: {
      [tokenDoc.id]: {
        waypoints: (deferred.waypoints ?? []).map((waypoint) => ({ ...waypoint })),
        method: deferred.method,
        action: deferred.action,
      },
    },
  };
  return options;
}

function completePathFor(tokenDoc, waypoints) {
  const origin = originFromToken(tokenDoc);
  const prefixed = [origin, ...waypoints];
  try {
    const expanded = tokenDoc.getCompleteMovementPath(prefixed);
    return expanded.length >= 2 ? expanded : prefixed;
  } catch (error) {
    warnAbnormal("getCompleteMovementPath failed; using prefixed waypoints", {
      tokenId: tokenDoc.id,
      error,
    });
    return prefixed;
  }
}

function findOpportunityWaypointIndex(waypoints, pauseAt) {
  if (!Array.isArray(waypoints) || !pauseAt) return -1;
  return waypoints.findIndex((waypoint) => positionsEqual(waypoint, pauseAt));
}

/** Matches in path order. A waypoint that returns to an earlier pixel gets the later visit. */
function waypointPathIndexes(waypoints, path) {
  const indexes = [];
  if (!Array.isArray(path) || !path.length) return indexes;
  let searchFrom = 0;
  for (const waypoint of waypoints) {
    let found = -1;
    for (let index = searchFrom; index < path.length; index++) {
      if (!positionsEqual(path[index], waypoint)) continue;
      found = index;
      searchFrom = index + 1;
      break;
    }
    indexes.push(found);
  }
  return indexes;
}

function pauseIndexOnPath(checkpoint, path) {
  if (!Array.isArray(path) || !path.length) return -1;
  const pauseAt = checkpoint?.pauseAt;
  const pathIndex = Number(checkpoint?.pathIndex);
  if (Number.isInteger(pathIndex) && pathIndex >= 0 && pathIndex < path.length
    && positionsEqual(path[pathIndex], pauseAt)) {
    return pathIndex;
  }

  const source = Number(pauseAt?.sourcePathIndex);
  if (Number.isFinite(source)) {
    const bySource = path.findIndex((cell) => Number(cell.sourcePathIndex) === source);
    if (bySource >= 0) return bySource;
  }

  if (Number.isInteger(pathIndex) && pathIndex >= 0) {
    const bySourceIndex = path.findIndex((cell) => Number(cell.sourcePathIndex) === pathIndex);
    if (bySourceIndex >= 0) return bySourceIndex;
  }

  return path.findIndex((cell) => positionsEqual(cell, pauseAt));
}

function resolveCheckpointPlacement(waypoints, checkpoint, { path } = {}) {
  const pauseAt = checkpoint?.pauseAt;
  const pauseIdx = pauseIndexOnPath(checkpoint, path);
  if (pauseIdx >= 0 && Array.isArray(path) && path.length) {
    const occurrences = waypointPathIndexes(waypoints, path);
    for (let index = 0; index < waypoints.length; index++) {
      const at = occurrences[index];
      if (at < 0) continue;
      if (at === pauseIdx) return { index, reuse: true };
      if (at > pauseIdx) return { index, reuse: false };
    }
    return { index: waypoints.length, reuse: false };
  }

  const existing = findOpportunityWaypointIndex(waypoints, pauseAt);
  if (existing >= 0) return { index: existing, reuse: true };
  return { index: findInsertIndex(waypoints, pauseAt), reuse: false };
}

function injectOpportunityCheckpoints(waypoints, checkpoints, { origin, path } = {}) {
  const result = (waypoints ?? []).map((waypoint) => ({ ...waypoint }));
  const mapping = [];

  for (const checkpoint of checkpoints ?? []) {
    const pauseAt = checkpoint.pauseAt;
    const placement = resolveCheckpointPlacement(result, checkpoint, { origin, path });
    if (placement.reuse && placement.index >= 0 && placement.index < result.length) {
      result[placement.index] = { ...result[placement.index], checkpoint: true };
      mapping.push({
        pathIndex: checkpoint.pathIndex,
        waypointIndex: placement.index,
        reused: true,
        x: result[placement.index].x,
        y: result[placement.index].y,
        sourcePathIndex: pauseAt?.sourcePathIndex ?? null,
      });
      continue;
    }

    const insertAt = placement.index;
    const inserted = {
      x: Number.isFinite(Number(pauseAt?.x)) ? Math.round(Number(pauseAt.x)) : pauseAt?.x,
      y: Number.isFinite(Number(pauseAt?.y)) ? Math.round(Number(pauseAt.y)) : pauseAt?.y,
      elevation: pauseAt?.elevation,
      checkpoint: true,
      explicit: false,
    };
    result.splice(insertAt, 0, inserted);
    mapping.push({
      pathIndex: checkpoint.pathIndex,
      waypointIndex: insertAt,
      reused: false,
      x: inserted.x,
      y: inserted.y,
      sourcePathIndex: pauseAt?.sourcePathIndex ?? null,
    });
  }

  return { waypoints: result, mapping };
}

/**
 * Fallback for when there's no analysis path or the pause isn't on it. Without
 * path-order matching it can't handle a path that visits the pause cell more than once.
 */
function findInsertIndex(waypoints, pauseAt) {
  const segment = Number(pauseAt?.sourceWaypointIndex);
  if (Number.isInteger(segment) && segment >= 0) {
    return Math.min(segment, waypoints.length);
  }

  const pauseOrder = Number(pauseAt?.sourcePathIndex);
  if (Number.isFinite(pauseOrder)) {
    for (let index = 0; index < waypoints.length; index++) {
      const waypointOrder = Number(waypoints[index]?.sourcePathIndex);
      if (Number.isFinite(waypointOrder) && waypointOrder > pauseOrder) return index;
    }
  }

  return waypoints.length ? waypoints.length - 1 : 0;
}

function destinationMatchesPauseAt(destination, pauseAt) {
  return positionsEqual(destination, pauseAt);
}

function consumeResolvedCrossings(session) {
  if (!session?.movementActionId) return;
  const current = getCurrentCheckpoint(session);
  for (const decision of current?.opportunities ?? []) {
    if (
      decision.state !== OPPORTUNITY_DECISION_STATES.RESOLVED
      && decision.state !== OPPORTUNITY_DECISION_STATES.RESOLUTION_ERROR
    ) continue;
    const key = opportunityCrossingKey({
      reactorCombatantId: decision.reactorCombatantId,
      pauseAt: decision.pauseAt,
    });
    if (key) markMovementActionProcessed(session.movementActionId, key);
  }
}

function aggregateCheckpointMovementDirective(checkpoint) {
  for (const decision of checkpoint?.opportunities ?? []) {
    if (decision.state === OPPORTUNITY_DECISION_STATES.RESOLUTION_ERROR) continue;
    if (decision.decision === OPPORTUNITY_DECISIONS.PASS) continue;
    if (decision.decision === OPPORTUNITY_DECISIONS.EXPIRED) continue;
    if (decision.result?.movementRisk === false) continue;
    if (decision.result?.movementDirective === OPPORTUNITY_LIVE_DIRECTIVES.STOP_IN_RANGE) {
      return OPPORTUNITY_LIVE_DIRECTIVES.STOP_IN_RANGE;
    }
  }
  return OPPORTUNITY_LIVE_DIRECTIVES.REVALIDATE;
}

function pauseKeyFor(session, checkpoint) {
  return `${PAUSE_KEY_PREFIX}:${session.movementId}:${checkpoint.pathIndex}`;
}

function claimCheckpoint(session, checkpoint) {
  const key = `${session.movementId}:${checkpoint.pathIndex}`;
  if (checkpointClaims.has(key)) return false;
  checkpointClaims.set(key, true);
  return true;
}

function releaseCheckpoint(session, checkpoint) {
  checkpointClaims.delete(`${session.movementId}:${checkpoint.pathIndex}`);
}

function rememberRuntime(session, extras = {}) {
  const runtime = {
    movementId: session.movementId,
    tokenId: session.moverTokenId,
    foundryMovementId: extras.foundryMovementId ?? null,
    pauseKey: extras.pauseKey ?? null,
    exhausted: false,
    ...extras,
  };
  runtimes.set(session.movementId, runtime);
  if (session.moverTokenId) tokenLocks.set(session.moverTokenId, session.movementId);
  return runtime;
}

function runtimeFor(sessionOrId, tokenDoc) {
  const session = typeof sessionOrId === "object"
    ? sessionOrId
    : getOpportunitySession(sessionOrId);
  if (session && runtimes.has(session.movementId)) return runtimes.get(session.movementId);
  if (tokenDoc) {
    const locked = tokenLocks.get(tokenDoc.id);
    if (locked && runtimes.has(locked)) return runtimes.get(locked);
  }
  return null;
}

function forgetRuntime(session) {
  if (!session) return;
  const runtime = runtimes.get(session.movementId);
  runtimes.delete(session.movementId);
  for (const alias of session.movementAliases ?? []) runtimes.delete(alias);
  if (runtime?.tokenId && tokenLocks.get(runtime.tokenId) === session.movementId) {
    tokenLocks.delete(runtime.tokenId);
  }
  for (const key of [...checkpointClaims.keys()]) {
    if (key.startsWith(`${session.movementId}:`)) checkpointClaims.delete(key);
  }
}

function isMovementInitiator(movement, user) {
  if (user?.isSelf) return true;
  if (movement?.user?.isSelf) return true;
  const userId = user?.id ?? movement?.user?.id;
  return userId != null && userId === game.user.id;
}

/**
 * Foundry puts `state` on TokenDocument#movement, not on the operation record that
 * `_onUpdateMovement` gets. Without this a finished segment would keep the token lock.
 */
function observedMovementState(tokenDoc, movement) {
  if (typeof movement?.state === "string" && movement.state) return movement.state;
  const live = tokenDoc?.movement;
  if (!live) return null;
  if (movement?.id != null && live.id != null && String(live.id) !== String(movement.id)) return null;
  return typeof live.state === "string" ? live.state : null;
}

function resolveMoverActor(tokenDoc) {
  return tokenDoc?.actor ?? null;
}

async function waitForMovementAnimation(tokenDoc) {
  const token = tokenDoc?.object;
  if (!token || tokenDoc.rendered === false) return;
  await token.movementAnimationPromise;
}

function tokenStillAtPauseAt(tokenDoc, pauseAt) {
  if (!tokenDoc || !pauseAt) return false;
  // i/j come from the pause point but elevation from the Token (one that climbed won't match)
  const source = tokenDoc._source ?? tokenDoc;
  return positionsEqual({
    x: tokenDoc.x,
    y: tokenDoc.y,
    i: pauseAt.i,
    j: pauseAt.j,
    elevation: source.elevation ?? tokenDoc.elevation,
  }, pauseAt)
    || positionsEqual(originFromToken(tokenDoc), pauseAt);
}

function canContinueOpportunityMovement(tokenDoc, session, movement, checkpoint) {
  if (!tokenDoc || !session) return false;
  if (documentId(tokenDoc) !== session.moverTokenId) return false;
  if (!resolveMoverActor(tokenDoc)) return false;
  if (!getOpportunitySession(session.movementId)) return false;
  if (sessionWasAbandoned(session)) return false;
  if (movement && movement.state === "stopped") return false;
  const pauseAt = checkpoint?.pauseAt ?? getCurrentCheckpoint(session)?.pauseAt;
  if (pauseAt && !tokenStillAtPauseAt(tokenDoc, pauseAt)) return false;
  return true;
}

function expireUnresolvedPending(session, reason) {
  const current = getCurrentCheckpoint(session);
  if (!current) return;
  for (const decision of current.opportunities) {
    if (decision.state !== OPPORTUNITY_DECISION_STATES.PENDING) continue;
    expirePendingOpportunityDecision(session, decision.opportunityId, {
      result: { reason, movementDirective: OPPORTUNITY_LIVE_DIRECTIVES.REVALIDATE },
    });
  }
}

async function cleanupSession(session, {
  tokenDoc,
  reason,
  stop = false,
  expire = true,
} = {}) {
  const runtime = session ? runtimeFor(session, tokenDoc) : null;
  if (runtime) runtime.closing = true;
  if (session) expireUnresolvedPending(session, reason ?? "session-cleanup");
  try {
    await expirePromptSurface(session, {
      expired: expire,
      cancelled: !expire,
    });
  } catch (error) {
    warnAbnormal("prompt cleanup failed", { error, movementId: session?.movementId });
  }
  if (stop && tokenDoc) {
    try {
      tokenDoc.stopMovement();
    } catch (error) {
      warnAbnormal("stopMovement failed during cleanup", { error, tokenId: tokenDoc.id });
    }
  }
  if (session) {
    if (expire) expireOpportunitySession(session);
    forgetRuntime(session);
  }
  if (reason && !ROUTINE_CLEANUP_REASONS.has(reason)) {
    warnAbnormal(reason, { movementId: session?.movementId });
  }
}

async function resumeSameMovement(tokenDoc, runtime) {
  if (!tokenDoc || !runtime?.foundryMovementId || !runtime.pauseKey) return false;
  try {
    tokenDoc.resumeMovement(runtime.foundryMovementId, runtime.pauseKey);
    return true;
  } catch (error) {
    warnAbnormal("resumeMovement failed", {
      error,
      movementId: runtime.foundryMovementId,
    });
    return false;
  }
}

export function prepareOpportunityTokenUpdate(tokenDoc, changed = {}, options = {}) {
  const empty = {
    bypassed: true,
    reason: null,
    session: null,
    waypoints: null,
    originalWaypoints: null,
    mapping: [],
    originGate: false,
  };

  if (!tokenDoc) return empty;

  const continuationOf = originContinuationId(options);
  if (continuationOf) {
    return prepareOriginContinuation(tokenDoc, changed, options, continuationOf, empty);
  }

  const preparedId = projectOptions(options).opportunityPrepared;
  if (preparedId) {
    const session = getOpportunitySession(preparedId);
    if (session) {
      const runtime = runtimeFor(session, tokenDoc);
      return {
        bypassed: false,
        reason: null,
        session,
        waypoints: movementInstruction(tokenDoc, options)?.waypoints ?? null,
        originalWaypoints: runtime?.originalWaypoints ?? null,
        mapping: runtime?.mapping ?? [],
        originGate: runtime?.originGate === true,
      };
    }
  }

  if (isOpportunityContinuation(options)) {
    return { ...empty, reason: "continuation" };
  }

  const instruction = movementInstruction(tokenDoc, options);
  const method = movementMethod(instruction, options);
  if (UNSAFE_METHODS.has(method)) return { ...empty, reason: method || "unsafe-method" };

  const combat = options.combat ?? game.combat ?? null;
  if (!combat?.started) return { ...empty, reason: "no-combat" };

  const moverCombatant = findCombatant({ combatants: combat.combatants, tokenId: tokenDoc.id });
  if (!moverCombatant) return { ...empty, reason: "no-mover-combatant" };
  if (documentId(combat.combatant) !== documentId(moverCombatant)) {
    return { ...empty, reason: "not-current-turn" };
  }

  const originalWaypoints = waypointList(instruction, changed);
  if (!originalWaypoints.length) return { ...empty, reason: "no-waypoints" };

  const forced = instruction?.forced === true
    || originalWaypoints.some((waypoint) => waypoint?.forced === true || waypoint?.action === FORCED_MOVEMENT_ACTION);
  const teleport = instruction?.teleport === true
    || actionIsTeleport(instruction?.action)
    || originalWaypoints.some((waypoint) => waypoint?.teleport === true || actionIsTeleport(waypoint?.action));

  if (forced) return { ...empty, reason: "forced" };
  if (teleport) return { ...empty, reason: "teleport" };

  const origin = originFromToken(tokenDoc);
  const grid = tokenDoc.parent?.grid ?? canvas.grid;
  const gridSize = tokenDoc.parent?.grid?.size ?? canvas.grid?.size;
  const completePath = completePathFor(tokenDoc, originalWaypoints);
  const adapted = normalizeFoundryOpportunityPath({
    token: tokenDoc,
    waypoints: originalWaypoints,
    completePath,
    origin,
    grid,
    gridSize,
  });

  const analysis = analyzeOpportunityMovement({
    combat,
    moverToken: tokenDoc,
    moverCombatant,
    path: adapted.cells,
    waypoints: originalWaypoints,
    method,
    action: instruction?.action ?? originalWaypoints.find((waypoint) => waypoint?.action)?.action,
    forced: false,
    teleport: false,
    gridSize,
    grid,
    adminSuppressed: isAdministrativeMovementActive(options),
    disengageSuppressed: hasDisengage({
      actor: resolveMoverActor(tokenDoc),
      combatant: moverCombatant,
      combat,
      tokenId: tokenDoc.id,
    }),
  });

  if (!analysis.context.relevant || !analysis.automaticCheckpoints.length) {
    return { ...empty, reason: analysis.context.reason ?? "no-opportunity", analysis };
  }

  const movementActionId = projectOptions(options).movementActionId ?? null;
  const automatic = filterConsumedOpportunityCrossings(
    filterAutomaticCheckpointsByPromptPreference(analysis.automaticCheckpoints),
    movementActionId,
  );
  if (!automatic.length) {
    return { ...empty, reason: "prompt-preference-off", analysis };
  }

  const session = createOpportunitySession({
    movementId: instruction?.id,
    moverToken: tokenDoc,
    moverTokenId: tokenDoc.id,
    moverActor: resolveMoverActor(tokenDoc),
    moverActorId: documentId(resolveMoverActor(tokenDoc)),
    moverCombatant,
    moverCombatantId: documentId(moverCombatant),
    moverName: resolveMoverActor(tokenDoc)?.name ?? tokenDoc.name,
    movementActionId,
    path: adapted.cells,
    analysis: { ...analysis, automaticCheckpoints: automatic },
  });
  if (!session) return { ...empty, reason: "session-not-created", analysis };

  const originGate = isOpportunityCheckpointAtMovementOrigin({
    checkpoint: session.checkpoints[0],
    tokenDocument: tokenDoc,
    origin,
    grid,
    gridSize,
  });
  const injectable = originGate ? session.checkpoints.slice(1) : session.checkpoints;
  const injected = injectOpportunityCheckpoints(
    originalWaypoints,
    injectable,
    { origin, path: adapted.cells },
  );

  if (!originGate) {
    if (!options.movement) options.movement = {};
    if (!options.movement[tokenDoc.id]) options.movement[tokenDoc.id] = { ...instruction };
    options.movement[tokenDoc.id].waypoints = injected.waypoints;
  }

  rememberRuntime(session, {
    tokenId: tokenDoc.id,
    mapping: injected.mapping,
    originalWaypoints,
    originGate,
    continuationWaypoints: injected.waypoints,
  });

  return {
    bypassed: false,
    reason: null,
    session,
    analysis,
    waypoints: originGate ? originalWaypoints : injected.waypoints,
    originalWaypoints,
    mapping: injected.mapping,
    originGate,
  };
}

function prepareOriginContinuation(tokenDoc, changed, options, continuationOf, empty) {
  const session = getOpportunitySession(continuationOf);
  if (!session) return { ...empty, reason: "continuation" };

  const runtime = runtimeFor(session, tokenDoc);
  const instruction = movementInstruction(tokenDoc, options);
  const originalWaypoints = runtime?.originalWaypoints
    ?? waypointList(instruction, changed);
  const remaining = session.checkpoints.slice(session.currentCheckpointIndex);
  const injected = remaining.length
    ? injectOpportunityCheckpoints(
      originalWaypoints,
      remaining,
      { origin: originFromToken(tokenDoc), path: session.path },
    )
    : { waypoints: originalWaypoints, mapping: [] };

  if (!options.movement) options.movement = {};
  if (!options.movement[tokenDoc.id]) options.movement[tokenDoc.id] = { ...instruction };
  options.movement[tokenDoc.id].waypoints = injected.waypoints;

  rememberRuntime(session, {
    ...(runtime ?? {}),
    tokenId: tokenDoc.id,
    mapping: injected.mapping,
    originalWaypoints,
    originGate: false,
    deferredMove: null,
    continuationWaypoints: injected.waypoints,
  });

  return {
    bypassed: false,
    reason: null,
    session,
    waypoints: injected.waypoints,
    originalWaypoints,
    mapping: injected.mapping,
    originGate: false,
    originContinuation: true,
  };
}

/**
 * A commit that gets refused or throws never starts its movement. Without this the
 * token would stay locked until the turn changes.
 */
async function commitPreparedMove(tokenDoc, session, waypoints, options, commitMove) {
  let result;
  try {
    result = await commitMove(waypoints, options);
  } catch (error) {
    await releaseUnstartedSession(session, tokenDoc);
    throw error;
  }
  if (!result) await releaseUnstartedSession(session, tokenDoc);
  return result;
}

async function releaseUnstartedSession(session, tokenDoc) {
  if (!session || !getOpportunitySession(session.movementId)) return;
  if (runtimeFor(session, tokenDoc)?.foundryMovementId) return;
  await cleanupStoppedSession(session, tokenDoc);
}

/**
 * Runs Foundry's `_preUpdate` after prepareOpportunityTokenUpdate and releases the session
 * of a movement Foundry drops. Only accepted movement ends up in `options._movement`.
 * Unfortunately we miss a later `preUpdateToken` veto.
 */
export async function finishOpportunityTokenUpdate(tokenDoc, prepared, options, preUpdate) {
  if (!prepared?.session) return preUpdate();
  let allowed;
  try {
    allowed = await preUpdate();
  } catch (error) {
    await releaseUnstartedSession(prepared.session, tokenDoc);
    throw error;
  }
  if (allowed === false || !options?._movement?.[tokenDoc.id]) {
    await releaseUnstartedSession(prepared.session, tokenDoc);
  }
  return allowed;
}

export async function interceptOpportunityTokenMove(tokenDoc, waypoints, options = {}, commitMove) {
  if (!tokenDoc || typeof commitMove !== "function") return { handled: false };
  if (isOpportunityContinuation(options) || originContinuationId(options)) {
    return { handled: false };
  }

  stampMovementInstruction(tokenDoc, waypoints, options);
  let prepared;
  try {
    prepared = prepareOpportunityTokenUpdate(tokenDoc, {}, options);
  } catch (error) {
    warnAbnormal("Opportunity prepare failed during move intercept", {
      tokenId: tokenDoc.id,
      error,
    });
    return { handled: false };
  }

  if (prepared.session) {
    if (!options.projectmoonttrpg) options.projectmoonttrpg = {};
    options.projectmoonttrpg.opportunityPrepared = prepared.session.movementId;
  }

  if (!prepared.originGate) {
    const nextWaypoints = prepared.waypoints ?? asWaypointList(waypoints);
    return { handled: true, result: await commitPreparedMove(tokenDoc, prepared.session, nextWaypoints, options, commitMove) };
  }

  const result = await runOriginOpportunityGate(
    tokenDoc,
    prepared,
    asWaypointList(waypoints),
    options,
    commitMove,
  );
  return { handled: true, result };
}

async function runOriginOpportunityGate(tokenDoc, prepared, waypoints, options, commitMove) {
  const session = prepared.session;
  const checkpoint = getCurrentCheckpoint(session);
  if (!session || !checkpoint) {
    return commitMove(asWaypointList(waypoints), options);
  }

  const previous = runtimeFor(session, tokenDoc);
  const runtime = rememberRuntime(session, {
    ...(previous ?? {}),
    tokenId: tokenDoc.id,
    mapping: prepared.mapping ?? previous?.mapping,
    originalWaypoints: prepared.originalWaypoints ?? asWaypointList(waypoints),
    originGate: true,
    deferredMove: snapshotDeferredMove(
      tokenDoc,
      prepared.originalWaypoints ?? waypoints,
      options,
    ),
    continuationWaypoints: previous?.continuationWaypoints ?? null,
  });
  if (!claimCheckpoint(session, checkpoint)) {
    return false;
  }

  try {
    await presentOpportunityPrompt(session);
  } catch (error) {
    warnUser("PMTTRPG.Opportunity.PromptFailed", { error, movementId: session.movementId });
    expireUnresolvedPending(session, "prompt-failed");
    await cleanupSession(session, { tokenDoc, reason: "prompt-failed", expire: true, stop: false });
    return commitMove(asWaypointList(runtime.deferredMove?.waypoints ?? waypoints), {
      ...options,
      projectmoonttrpg: { ...(projectOptions(options)), ignoreOpportunityAttacks: true },
    });
  }

  let waitResult;
  try {
    waitResult = await waitForOpportunityCheckpointResolution(session, checkpoint);
  } catch (error) {
    warnUser("PMTTRPG.Opportunity.WaitFailed", {
      error,
      movementId: session.movementId,
      tokenId: tokenDoc.id,
    });
    expireUnresolvedPending(session, "waiter-failed");
    await cleanupSession(session, { tokenDoc, reason: "waiter-failed", expire: true, stop: false });
    return commitMove(asWaypointList(runtime.deferredMove?.waypoints ?? waypoints), {
      ...options,
      projectmoonttrpg: { ...(projectOptions(options)), ignoreOpportunityAttacks: true },
    });
  }

  const live = getOpportunitySession(session.movementId) ?? session;
  const liveRuntime = runtimeFor(live, tokenDoc);
  if (
    !waitResult?.ok
    || sessionWasAbandoned(live)
    || liveRuntime?.closing
    || !liveRuntime?.deferredMove
  ) {
    if (liveRuntime && !liveRuntime.closing && getOpportunitySession(live.movementId)) {
      await cleanupSession(live, { tokenDoc, reason: "origin-gate-cancelled", expire: true, stop: false });
    }
    return false;
  }

  expireGoneReactors(live);
  const current = getCurrentCheckpoint(live) ?? checkpoint;
  for (const decision of current.opportunities ?? []) {
    if (decision.state === OPPORTUNITY_DECISION_STATES.RESOLUTION_ERROR) {
      warnUser("PMTTRPG.Opportunity.ResolutionErrorContinue", {
        opportunityId: decision.opportunityId,
      });
    }
  }

  consumeResolvedCrossings(live);
  const directive = aggregateCheckpointMovementDirective(current);
  if (directive === OPPORTUNITY_LIVE_DIRECTIVES.STOP_IN_RANGE) {
    liveRuntime.closing = true;
    liveRuntime.deferredMove = null;
    await exhaustMoverOnce(live, liveRuntime, tokenDoc);
    await expirePromptSurface(live);
    completeOpportunitySession(live);
    forgetRuntime(live);
    return false;
  }

  if (!canContinueOpportunityMovement(tokenDoc, live, null, current)) {
    warnAbnormal("origin Opportunity continue is no longer valid", {
      movementId: live.movementId,
      tokenId: tokenDoc.id,
    });
    await cleanupSession(live, { tokenDoc, reason: "revalidate-failed", expire: true, stop: false });
    return false;
  }

  advanceCheckpoint(live);
  const deferred = liveRuntime.deferredMove;
  liveRuntime.originGate = false;
  liveRuntime.deferredMove = null;
  const nextOptions = continuationMoveOptions(tokenDoc, live, deferred);
  const nextWaypoints = deferred.waypoints ?? asWaypointList(waypoints);
  if (!getCurrentCheckpoint(live)) {
    completeOpportunitySession(live);
    forgetRuntime(live);
  }
  return commitPreparedMove(tokenDoc, live, nextWaypoints, nextOptions, commitMove);
}

function expireGoneReactors(session) {
  const current = getCurrentCheckpoint(session);
  if (!current) return;
  for (const decision of current.opportunities) {
    if (decision.state !== OPPORTUNITY_DECISION_STATES.PENDING) continue;
    const tokenId = decision.reactorTokenId;
    if (!tokenId) continue;
    if (resolveTokenDocument(tokenId)) continue;
    warnAbnormal("reactor Token missing; expiring pending Opportunity", {
      opportunityId: decision.opportunityId,
      tokenId,
    });
    expirePendingOpportunityDecision(session, decision.opportunityId, {
      result: { reason: "reactor-gone", movementDirective: OPPORTUNITY_LIVE_DIRECTIVES.REVALIDATE },
    });
  }
}

async function exhaustMoverOnce(session, runtime, tokenDoc) {
  if (runtime.exhausted) return;
  runtime.exhausted = true;
  const actor = tokenDoc?.actor ?? resolveTokenDocument(session.moverTokenId)?.actor;
  if (!actor) return;
  await exhaustSquares(actor);
}

async function orchestrateCheckpoint(tokenDoc, session, checkpoint, movement) {
  const runtime = runtimeFor(session, tokenDoc) ?? rememberRuntime(session, {
    tokenId: tokenDoc.id,
    foundryMovementId: movement?.id ?? null,
  });
  runtime.foundryMovementId = movement?.id ?? runtime.foundryMovementId;
  runtime.pauseKey = pauseKeyFor(session, checkpoint);

  try {
    tokenDoc.pauseMovement(runtime.pauseKey);
  } catch (error) {
    warnAbnormal("pauseMovement failed; ordinary movement continues", {
      error,
      movementId: session.movementId,
    });
    await cleanupSession(session, { tokenDoc, reason: "pause-failed", expire: true });
    return;
  }

  try {
    await waitForMovementAnimation(tokenDoc);
    if (!tokenStillAtPauseAt(tokenDoc, checkpoint.pauseAt)) {
      warnAbnormal("Token was not at pauseAt after animation", {
        tokenId: tokenDoc.id,
        pauseAt: checkpoint.pauseAt,
        x: tokenDoc.x,
        y: tokenDoc.y,
      });
    }
    // a vertical exit has the same x and y as the pause (just one square higher or lower)
    const elevation = (tokenDoc._source ?? tokenDoc).elevation ?? tokenDoc.elevation;
    if (destinationMatchesPauseAt({ x: tokenDoc.x, y: tokenDoc.y, elevation }, checkpoint.exitTo)) {
      warnAbnormal("Token reached exitTo before Opportunity resolution", {
        tokenId: tokenDoc.id,
        exitTo: checkpoint.exitTo,
      });
    }

    try {
      await presentOpportunityPrompt(session);
    } catch (error) {
      warnUser("PMTTRPG.Opportunity.PromptFailed", { error, movementId: session.movementId });
      expireUnresolvedPending(session, "prompt-failed");
      const resumed = await resumeSameMovement(tokenDoc, runtime);
      if (!resumed) tokenDoc.stopMovement();
      await cleanupSession(session, { tokenDoc, reason: "prompt-failed", expire: true });
      return;
    }

    let waitResult;
    try {
      waitResult = await waitForOpportunityCheckpointResolution(session, checkpoint);
    } catch (error) {
      warnUser("PMTTRPG.Opportunity.WaitFailed", {
        error,
        movementId: session.movementId,
        tokenId: tokenDoc.id,
      });
      expireUnresolvedPending(session, "waiter-failed");
      const resumed = await resumeSameMovement(tokenDoc, runtime);
      if (!resumed) tokenDoc.stopMovement();
      await cleanupSession(session, { tokenDoc, reason: "waiter-failed", expire: true });
      return;
    }

    const live = getOpportunitySession(session.movementId) ?? session;
    if (!waitResult?.ok || sessionWasAbandoned(live)) {
      tokenDoc.stopMovement();
      await expirePromptSurface(live);
      forgetRuntime(live);
      return;
    }

    expireGoneReactors(live);
    const current = getCurrentCheckpoint(live) ?? checkpoint;
    for (const decision of current.opportunities ?? []) {
      if (decision.state === OPPORTUNITY_DECISION_STATES.RESOLUTION_ERROR) {
        warnUser("PMTTRPG.Opportunity.ResolutionErrorContinue", {
          opportunityId: decision.opportunityId,
        });
      }
    }

    consumeResolvedCrossings(live);
    const directive = aggregateCheckpointMovementDirective(current);
    if (directive === OPPORTUNITY_LIVE_DIRECTIVES.STOP_IN_RANGE) {
      runtime.closing = true;
      tokenDoc.stopMovement();
      await exhaustMoverOnce(live, runtime, tokenDoc);
      await expirePromptSurface(live);
      completeOpportunitySession(live);
      forgetRuntime(live);
      return;
    }

    if (!canContinueOpportunityMovement(tokenDoc, live, tokenDoc.movement, current)) {
      warnAbnormal("movement is no longer valid after Opportunity resolution", {
        movementId: live.movementId,
        tokenId: tokenDoc.id,
      });
      runtime.closing = true;
      tokenDoc.stopMovement();
      await cleanupSession(live, { tokenDoc, reason: "revalidate-failed", expire: true });
      return;
    }

    advanceCheckpoint(live);
    const resumed = await resumeSameMovement(tokenDoc, runtime);
    if (!resumed) {
      warnUser("PMTTRPG.Opportunity.MovementResumeFailed", { movementId: live.movementId });
      tokenDoc.stopMovement();
      await cleanupSession(live, { tokenDoc, reason: "resume-failed", expire: true });
      return;
    }

    const next = getCurrentCheckpoint(live);
    if (!next) {
      await expirePromptSurface(live);
      completeOpportunitySession(live);
      forgetRuntime(live);
    }
  } catch (error) {
    warnUser("PMTTRPG.Opportunity.WaitFailed", {
      error,
      movementId: session.movementId,
      tokenId: tokenDoc.id,
    });
    expireUnresolvedPending(session, "orchestrator-failed");
    const resumed = await resumeSameMovement(tokenDoc, runtime);
    if (!resumed) tokenDoc.stopMovement();
    await cleanupSession(session, { tokenDoc, reason: "orchestrator-failed", expire: true });
  }
}

export function onOpportunityTokenMovement(tokenDoc, movement, operation, user) {
  if (!tokenDoc || !movement) return;
  if (!isMovementInitiator(movement, user)) return;

  const session = getOpportunitySession(movement.id)
    ?? (tokenLocks.get(tokenDoc.id) ? getOpportunitySession(tokenLocks.get(tokenDoc.id)) : null);
  if (!session) return;
  if (isOpportunityContinuation(operation) && operation?._resumeMovement) return;

  bindOpportunitySessionMovementId(session, movement.id);
  const runtime = runtimeFor(session, tokenDoc) ?? rememberRuntime(session, {
    tokenId: tokenDoc.id,
    foundryMovementId: movement.id,
  });
  runtime.foundryMovementId = movement.id;

  const movementState = observedMovementState(tokenDoc, movement);
  if (movementState === "completed" || movementState === "stopped") {
    if (movementState === "stopped") {
      void cleanupStoppedSession(session, tokenDoc);
      return;
    }
    const remaining = getCurrentCheckpoint(session);
    if (!remaining) {
      completeOpportunitySession(session);
      forgetRuntime(session);
      return;
    }
    void cleanupSession(session, {
      tokenDoc,
      reason: "movement-finished-before-remaining-opportunity",
      expire: true,
    });
    return;
  }

  const checkpoint = getCurrentCheckpoint(session);
  if (!checkpoint) return;
  if (!destinationMatchesPauseAt(movement.destination, checkpoint.pauseAt)) return;
  if (destinationMatchesPauseAt(movement.destination, checkpoint.exitTo)) return;
  if (!claimCheckpoint(session, checkpoint)) return;

  void orchestrateCheckpoint(tokenDoc, session, checkpoint, movement).catch(async (error) => {
    releaseCheckpoint(session, checkpoint);
    warnAbnormal("checkpoint orchestration failed", { error, movementId: session.movementId });
    void cleanupSession(session, { tokenDoc, reason: "orchestrator-failed", expire: true, stop: false });
    const resumed = await resumeSameMovement(tokenDoc, runtime);
    if (resumed) return;
    try {
      tokenDoc.stopMovement();
    } catch (stopError) {
      warnAbnormal("stopMovement failed after a failed checkpoint", { error: stopError, tokenId: tokenDoc.id });
    }
  });
}

async function cleanupStoppedSession(session, tokenDoc) {
  if (!session) return;
  const runtime = runtimeFor(session, tokenDoc);
  if (runtime?.closing) return;
  if (sessionIsTerminal(session)) {
    forgetRuntime(session);
    return;
  }
  expireUnresolvedPending(session, "movement-cancelled");
  await expirePromptSurface(session, { cancelled: true });
  cancelOpportunitySession(session);
  forgetRuntime(session);
}

export function onOpportunityTokenMovementStopped(tokenDoc) {
  const locked = tokenDoc ? tokenLocks.get(tokenDoc.id) : null;
  const runtime = locked ? runtimes.get(locked) : null;
  if (runtime?.originGate && !runtime.foundryMovementId) return;
  const session = locked ? getOpportunitySession(locked) : null;
  if (!session) return;
  void cleanupStoppedSession(session, tokenDoc);
}

function sessionsOwningToken(tokenId) {
  return listOpportunitySessions().filter((session) => session.moverTokenId === tokenId);
}

function handleOpportunityCombatUpdate(combat, changed = {}) {
  if (!combat) return;
  if (changed.started === false) {
    handleOpportunityCombatEnd(combat);
    return;
  }
  if (!("turn" in changed) && !("round" in changed)) return;
  const currentId = documentId(combat.combatant);
  for (const session of listOpportunitySessions()) {
    if (!session.moverCombatantId) continue;
    const moverCombat = game.combats.find((entry) => entry.combatants.has(session.moverCombatantId));
    if (moverCombat && moverCombat.id !== combat.id) continue;
    if (String(session.moverCombatantId) === String(currentId)) continue;
    const tokenDoc = resolveTokenDocument(session.moverTokenId);
    void cleanupSession(session, {
      tokenDoc,
      reason: "turn-changed",
      stop: true,
      expire: true,
    });
  }
}

function handleOpportunityCombatEnd(_combat) {
  for (const session of listOpportunitySessions()) {
    const tokenDoc = resolveTokenDocument(session.moverTokenId);
    void cleanupSession(session, {
      tokenDoc,
      reason: "combat-ended",
      stop: true,
      expire: true,
    });
  }
}

function handleOpportunityTokenDeleted(tokenDoc) {
  const tokenId = documentId(tokenDoc);
  if (!tokenId) return;
  for (const session of sessionsOwningToken(tokenId)) {
    void cleanupSession(session, {
      tokenDoc: null,
      reason: "mover-deleted",
      stop: false,
      expire: true,
    });
  }
  for (const session of listOpportunitySessions()) {
    const current = getCurrentCheckpoint(session);
    if (!current) continue;
    for (const decision of current.opportunities) {
      if (decision.reactorTokenId !== tokenId) continue;
      if (decision.state !== OPPORTUNITY_DECISION_STATES.PENDING) continue;
      expirePendingOpportunityDecision(session, decision.opportunityId, {
        result: { reason: "reactor-gone", movementDirective: OPPORTUNITY_LIVE_DIRECTIVES.REVALIDATE },
      });
    }
  }
}

export function registerOpportunityOrchestrator() {
  Hooks.on("updateCombat", (combat, changed) => {
    handleOpportunityCombatUpdate(combat, changed ?? {});
  });
  Hooks.on("deleteCombat", (combat) => {
    handleOpportunityCombatEnd(combat);
  });
  Hooks.on("deleteToken", (tokenDoc) => {
    handleOpportunityTokenDeleted(tokenDoc);
  });
}
