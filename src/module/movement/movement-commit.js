/**
 * Planned movement, from the plan to the commit. Ordinary drags take Foundry's normal path
 * unless a movement contribution changes the voluntary baseline or a processor claims the move.
 *
 * Linked participants follow the root one segment at a time. If a child can't follow then an
 * `abortRootSegment` child stops that root segment and a `bestEffort` one gets dropped. We
 * don't use one `Scene#moveTokens` bundle because players usually can't update the other token.
 */

import { canActAs, canUserUpdateDocument } from "../acting-user.js";
import { exactCombatantForToken } from "../combat/combatant-match.js";
import { findRelationshipForTarget } from "../grapple/grapple-state.js";
import { warnUser } from "../shared-helpers.js";
import {
  bindFoundryMovementId,
  endMovementAction,
  ensureMovementActionId,
  ensureProjectOptions,
  movementActionIdFor,
  readMovementActionId,
  recordTraversal,
} from "./movement-actions.js";
import { applyPlanOperations, applyProposalOperations } from "./movement-operations.js";
import {
  FORCED_MOVEMENT_ACTION,
  LINKED_FAILURE_POLICIES,
  MOVEMENT_NATURES,
  OA_MOVEMENT_MODES,
  PLAN_STATUS,
  beginPendingMovement,
  createMovementPlan,
  defineMovementRuleSubject,
  deriveMovementRules,
  endPendingMovement,
  pendingMovementForAction,
  pendingMovementForToken,
  pendingMovementView,
  resolveImplicitMovementProfile,
} from "./movement-plan.js";
import { MOVEMENT_PHASES, movementProcessorClaims, runMovementPhase } from "./movement-processors.js";
import { positionsMatch, snapshotTokenOrigin } from "./movement-points.js";
import { HARD_STOPS, applyForcedLanding, resolveMovementPlan, truncateResolvedMovement } from "./movement-resolve.js";
import { createKeyedQueue } from "../keyed-queue.js";

const MOVEMENT_COMMITTED_HOOK = "pmttrpg.movementCommitted";

function defaultEnv() {
  return {
    resolveUuid: (uuid) => {
      try {
        return fromUuidSync(uuid) ?? null;
      } catch {
        return null;
      }
    },
    resolveCombatant: (id) => game.combat?.combatants.get(id) ?? null,
    canUpdate: (doc) => canUserUpdateDocument(doc),
    hasActiveGM: () => !!game.users.activeGM,
    isAdministrative: () => false,
    hasOpportunityLock: () => false,
    routeToGM: async (op, payload) => {
      const { runOnPrimaryGM } = await import("../easy-effects/gm-route.js");
      return runOnPrimaryGM(op, payload);
    },
    regionsAt: null,
    callHook: (name, payload) => Hooks.callAll(name, payload),
  };
}

let configuredEnv = {};

function configurePlannedMovement(env = {}) {
  configuredEnv = { ...configuredEnv, ...env };
}

function withEnv(env) {
  return { ...defaultEnv(), ...configuredEnv, ...(env ?? {}) };
}

function isContinuation(options = {}, instruction = null) {
  if (options._resumeMovement || options._stopMovement || options._pauseMovement) return true;
  if (options._clearMovementHistory || options.isUndo || options.undo || options.isPaste) return true;
  if (options._movementArguments?.continuationId) return true;
  const method = String(instruction?.method ?? options.method ?? "");
  return method === "undo" || method === "paste";
}

function captureLinkedOrigins(pending, env) {
  for (const linked of pending.plan.roles.linked) {
    if (pending.plan.expectedOrigins[linked.tokenUuid]) continue;
    const doc = env.resolveUuid(linked.tokenUuid);
    const origin = snapshotTokenOrigin(doc);
    if (origin) pending.plan.expectedOrigins[linked.tokenUuid] = origin;
  }
}

/** Everything up to the commit. The plan ends up `resolved`, `manual` or `aborted`. */
export async function preparePendingMovement(pending, env = {}) {
  const d = withEnv(env);
  deriveMovementRules(pending, d);
  await runMovementPhase(MOVEMENT_PHASES.PLAN, pending);
  applyPlanOperations(pending);
  captureLinkedOrigins(pending, d);
  if (pending.plan.status === PLAN_STATUS.MANUAL || pending.plan.status === PLAN_STATUS.ABORTED) return pending;

  pending.plan.resolved = resolveMovementPlan(pending, d);
  if (pending.plan.resolved.failure) {
    pending.abortReason = pending.plan.resolved.failure;
    pending.plan.status = PLAN_STATUS.ABORTED;
    return pending;
  }
  await runMovementPhase(MOVEMENT_PHASES.RESOLVED, pending);
  const truncateAt = applyProposalOperations(pending);
  if (truncateAt != null) pending.plan.resolved = truncateResolvedMovement(pending, truncateAt, d);
  pending.plan.resolved = applyForcedLanding(pending, d);
  if (pending.plan.status === PLAN_STATUS.PLANNED) pending.plan.status = PLAN_STATUS.RESOLVED;
  return pending;
}

/** Hover preview geometry. It skips the plan and resolved processors (the click can still come out different). */
export function previewPendingMovement(pending, env = {}) {
  const d = withEnv(env);
  deriveMovementRules(pending, d);
  if (pending.plan.status === PLAN_STATUS.MANUAL || pending.plan.status === PLAN_STATUS.ABORTED) {
    return markProvisional(pending);
  }
  pending.plan.resolved = resolveMovementPlan(pending, d);
  if (pending.plan.resolved?.failure) {
    pending.abortReason = pending.plan.resolved.failure;
    pending.plan.status = PLAN_STATUS.ABORTED;
    return markProvisional(pending);
  }
  pending.plan.resolved = applyForcedLanding(pending, d);
  if (pending.plan.status === PLAN_STATUS.PLANNED) pending.plan.status = PLAN_STATUS.RESOLVED;
  return markProvisional(pending);
}

function markProvisional(pending) {
  pending.preview = true;
  const resolved = pending.plan.resolved;
  if (resolved && typeof resolved === "object") {
    resolved.provisional = true;
    resolved.confirmed = false;
  }
  return pending;
}

export function movementOutcomeSignature(resolved) {
  if (!resolved || resolved.failure) return "";
  const destination = resolved.destination ?? {};
  const rest = resolved.rest ?? {};
  return [
    destination.x ?? "",
    destination.y ?? "",
    destination.elevation ?? 0,
    resolved.stopReason ?? "",
    resolved.unspentSpaces ?? 0,
    rest.basis ?? "",
    rest.elevation ?? "",
    resolved.apexElevation ?? "",
    resolved.fall?.squares ?? "",
  ].join("|");
}

function revalidateExpectedOrigins(pending, env = {}) {
  const d = withEnv(env);
  const against = pending.plan.resolved?.resolvedAgainst ?? pending.plan.expectedOrigins;
  const stale = [];
  const uuids = [pending.plan.roles.mover.tokenUuid, ...pending.plan.roles.linked.map((entry) => entry.tokenUuid)];
  for (const uuid of uuids) {
    const expected = against[uuid];
    if (!expected) continue;
    const current = snapshotTokenOrigin(d.resolveUuid(uuid));
    if (!current || !positionsMatch(expected, current)) stale.push(uuid);
  }
  return { ok: stale.length === 0, stale };
}

function landingLevel(pending) {
  const rest = pending.plan.resolved?.rest;
  if (rest?.basis === "known-floor" && rest.levelId) return rest.levelId;
  return null;
}

function originLevel(pending) {
  const uuid = pending.plan.roles?.mover?.tokenUuid;
  return pending.plan.expectedOrigins?.[uuid]?.level ?? null;
}

function systemMoveOptions(projectmoonttrpg) {
  return {
    method: "api",
    autoRotate: false,
    constrainOptions: { ignoreWalls: true, ignoreCost: true },
    projectmoonttrpg,
  };
}

function planInstruction(pending, path) {
  const forced = pending.plan.request.nature === MOVEMENT_NATURES.FORCED;
  const straight = pending.plan.request.animation === "straight";
  const moverUuid = pending.plan.roles.mover.tokenUuid;
  const fromLevel = pending.plan.expectedOrigins?.[moverUuid]?.level ?? null;
  const nextLevel = landingLevel(pending);
  const last = path.length - 1;
  // Foundry animates every waypoint it keeps (and drops the intermediate flag on input).
  // A straight throw only sends the last stop, and the resolved path still has every square.
  const waypoints = path.map((point, index) => ({
    x: point.x,
    y: point.y,
    elevation: point.elevation ?? 0,
    ...(forced ? { action: FORCED_MOVEMENT_ACTION } : {}),
    ...(nextLevel && nextLevel !== fromLevel && index === last ? { level: nextLevel } : {}),
  }));
  const animated = straight && waypoints.length > 1 ? [waypoints[last]] : waypoints;
  const options = systemMoveOptions({
    movementPlanId: pending.plan.id,
    movementActionId: pending.plan.movementActionId,
    ...(pending.plan.rules.opportunityAttack.mode === OA_MOVEMENT_MODES.NONE ? { ignoreOpportunityAttacks: true } : {}),
  });
  return { waypoints: animated, options };
}

function commitTail(resolved) {
  const landing = (resolved.landing?.path ?? []).slice(1);
  if (landing.length) return landing;
  const end = resolved.destination;
  const rest = resolved.rest;
  if (!end || !rest) return [];
  if (Math.abs((rest.elevation ?? 0) - (end.elevation ?? 0)) <= 1e-6) return [];
  return [{ x: end.x, y: end.y, elevation: rest.elevation }];
}

function buildPlanMovementInstruction(pending) {
  const resolved = pending.plan.resolved ?? {};
  let points = [...(resolved.path ?? []).slice(1), ...commitTail(resolved)];
  if (!points.length) {
    const level = landingLevel(pending);
    const uuid = pending.plan.roles?.mover?.tokenUuid;
    const origin = pending.plan.expectedOrigins?.[uuid];
    if (level && origin && level !== (origin.level ?? null)) {
      points = [{ x: origin.x, y: origin.y, elevation: origin.elevation ?? 0 }];
    }
  }
  return planInstruction(pending, points);
}

function expectedCommitPoint(pending) {
  const resolved = pending.plan.resolved ?? {};
  const tail = commitTail(resolved);
  const point = tail.at(-1) ?? resolved.destination ?? resolved.path?.at(-1) ?? null;
  if (!point) return null;
  return {
    x: point.x,
    y: point.y,
    elevation: point.elevation ?? 0,
    level: landingLevel(pending) ?? originLevel(pending),
  };
}

function movementProvenance(pending, kind) {
  const resolved = pending.plan.resolved ?? {};
  return {
    planId: pending.plan.id,
    declarationId: pending.plan.roles?.source?.declarationId ?? null,
    kind,
    collision: resolved.collided?.kind ?? null,
    squares: kind === "force" ? Math.floor(Number(resolved.unspentSpaces) || 0) : (resolved.fall?.squares ?? 0),
  };
}

async function postForceCollisionCard(mover, resolved, movementReport) {
  const { postForceCollisionDamage } = await import("../falling/damage.js");
  return postForceCollisionDamage(mover, resolved, { movementReport });
}

async function postFallingCard(mover, report, movementReport) {
  const { postFallingDamage } = await import("../falling/damage.js");
  return postFallingDamage(mover, report, { movementReport });
}

async function reportCompletedMovement(pending, mover) {
  if (pending.reported) return [];
  pending.reported = true;
  const resolved = pending.plan.resolved ?? {};
  const rules = pending.plan.rules ?? {};
  const reports = [];
  const hard = HARD_STOPS.has(resolved.stopReason);
  const forceOn = rules.report?.force === "post";
  if (forceOn && hard && Math.floor(Number(resolved.unspentSpaces) || 0) > 0) {
    await postForceCollisionCard(mover, resolved, movementProvenance(pending, "force"));
    reports.push({ kind: "force", squares: Math.floor(Number(resolved.unspentSpaces) || 0) });
  }
  if (rules.report?.falling === true && resolved.fall) {
    const { fallingDamageDice } = await import("../falling/damage.js");
    const rank = Number(mover?.actor?.system?.attributes?.rank?.value) || 0;
    const dice = fallingDamageDice(resolved.fall.squares, rank);
    if (dice > 0) {
      const report = { ...resolved.fall, dice, formula: `${dice}d8`, rank };
      await postFallingCard(mover, report, movementProvenance(pending, "falling"));
      reports.push({ kind: "falling", squares: resolved.fall.squares, dice });
    }
  }
  return reports;
}

async function moveToken(tokenDoc, tokenUuid, waypoints, options, expectedOrigin, d) {
  if (!waypoints.length) return { ok: true, moved: false, outcome: "completed", committed: snapshotTokenOrigin(tokenDoc) };
  if (d.canUpdate(tokenDoc)) {
    const result = await tokenDoc.move(waypoints, options);
    if (result === false) return { ok: false, moved: false, reason: "refused", outcome: "refused" };
    return { ok: true, moved: true, outcome: "completed", committed: snapshotTokenOrigin(tokenDoc) };
  }
  if (!d.hasActiveGM()) {
    warnUser("PMTTRPG.PlannedMovement.NoGM");
    return { ok: false, reason: "no-gm", outcome: "unknown", notified: true };
  }
  const routed = await d.routeToGM("commitPlannedMovement", { tokenUuid, waypoints, options, expectedOrigin });
  if (!routed || routed.ok !== true) {
    const timedOut = routed == null;
    return {
      ok: false,
      reason: timedOut ? "unknown" : (routed.reason ?? "gm-failed"),
      outcome: timedOut ? "unknown" : "refused",
    };
  }
  if (!routed.committed) {
    return { ok: false, reason: "unknown", outcome: "unknown" };
  }
  return { ok: true, moved: true, outcome: "completed", committed: routed.committed };
}

/** True if the plan asked to land on one known floor and the rest ended up somewhere else. */
function verifiedRestRefused(pending) {
  const required = pending.plan.request.requireVerifiedRest;
  if (!required) return false;
  const rest = pending.plan.resolved?.rest;
  if (rest?.basis !== "known-floor") return true;
  return Math.abs(Number(rest.elevation) - Number(required.elevation)) > 1e-6;
}

/**
 * Runs the whole pipeline for a plan the system started (like a Throw). If the mover moved
 * after we resolved it then we resolve once more, unless `onStaleOrigin` is "abort".
 */
export async function executeMovementPlan(pending, env = {}) {
  const d = withEnv(env);
  try {
    await preparePendingMovement(pending, d);
    if (pending.plan.status === PLAN_STATUS.MANUAL) {
      return { ok: false, reason: "manual", manualReason: pending.manualReason, resolved: pending.plan.resolved };
    }
    if (pending.plan.status === PLAN_STATUS.ABORTED) {
      return { ok: false, reason: pending.abortReason ?? "aborted", resolved: pending.plan.resolved };
    }
    if (pending.plan.resolved.elevationDelta !== 0 && pending.plan.rules?.vertical?.allowed !== true) {
      warnUser("PMTTRPG.PlannedMovement.VerticalUnsupported");
      return { ok: false, reason: "vertical-unsupported", resolved: pending.plan.resolved, notified: true };
    }

    const moverUuid = pending.plan.roles.mover.tokenUuid;
    const keys = [moverUuid, ...pending.plan.roles.linked.map((entry) => entry.tokenUuid)];
    return await withMovementParticipantLocks(keys, async () => {
      const mover = d.resolveUuid(moverUuid);
      if (isExternallyMoving(mover, {
        actionIdFor: movementActionIdFor,
        movementActionId: pending.plan.movementActionId,
        hasOpportunityLock: d.hasOpportunityLock,
      })) {
        warnUser("PMTTRPG.PlannedMovement.ParticipantBusy", { name: mover?.name ?? "" });
        return { ok: false, reason: "busy", resolved: pending.plan.resolved, notified: true };
      }

      let check = revalidateExpectedOrigins(pending, d);
      if (!check.ok && check.stale.includes(moverUuid)) {
        if (pending.plan.request.onStaleOrigin === "abort") {
          warnUser("PMTTRPG.PlannedMovement.StaleOrigin", { name: mover?.name ?? "" });
          pending.plan.status = PLAN_STATUS.ABORTED;
          return { ok: false, reason: "stale", resolved: pending.plan.resolved, reports: [], notified: true };
        }
        console.warn("[PMTTRPG] mover moved after resolution; re-resolving once", { planId: pending.plan.id });
        pending.plan.expectedOrigins[moverUuid] = snapshotTokenOrigin(mover);
        pending.plan.status = PLAN_STATUS.PLANNED;
        await preparePendingMovement(pending, d);
        if (pending.plan.status !== PLAN_STATUS.RESOLVED) {
          return { ok: false, reason: pending.abortReason ?? pending.plan.status, resolved: pending.plan.resolved };
        }
        check = revalidateExpectedOrigins(pending, d);
        if (!check.ok && check.stale.includes(moverUuid)) {
          warnUser("PMTTRPG.PlannedMovement.StaleOrigin", { name: mover?.name ?? "" });
          pending.plan.status = PLAN_STATUS.ABORTED;
          return { ok: false, reason: "stale", resolved: pending.plan.resolved, notified: true };
        }
      }
      if (verifiedRestRefused(pending)) {
        pending.plan.status = PLAN_STATUS.ABORTED;
        return {
          ok: false,
          reason: "support-changed",
          stopReason: pending.plan.resolved?.stopReason ?? null,
          resolved: pending.plan.resolved,
          reports: [],
        };
      }

      pending.plan.status = PLAN_STATUS.COMMITTING;
      const { waypoints, options } = buildPlanMovementInstruction(pending);
      const moved = await moveToken(mover, moverUuid, waypoints, options, pending.plan.resolved.resolvedAgainst[moverUuid], d);
      if (!moved.ok) {
        pending.plan.status = PLAN_STATUS.ABORTED;
        return {
          ok: false,
          reason: moved.reason ?? "commit-failed",
          outcome: moved.outcome ?? "refused",
          notified: moved.notified === true,
          resolved: pending.plan.resolved,
          reports: [],
        };
      }
      const expected = expectedCommitPoint(pending);
      const committed = moved.committed ?? snapshotTokenOrigin(mover);
      if (expected && !positionsMatch(expected, committed)) {
        pending.plan.status = PLAN_STATUS.ABORTED;
        return { ok: false, reason: "mismatch", outcome: "interrupted", resolved: pending.plan.resolved, reports: [] };
      }
      pending.plan.status = PLAN_STATUS.COMMITTED;
      const cells = pending.plan.resolved.traversed.map((step) => step.cell);
      const tail = commitTail(pending.plan.resolved);
      if (tail.length) {
        const end = tail.at(-1);
        cells.push({ x: end.x, y: end.y, elevation: end.elevation ?? 0 });
      }
      recordTraversal(pending.plan.movementActionId, cells);
      await runMovementPhase(MOVEMENT_PHASES.COMMITTED, pending);
      d.callHook(MOVEMENT_COMMITTED_HOOK, pendingMovementView(pending));
      let reports = [];
      if (pending.plan.request.nature === MOVEMENT_NATURES.FORCED) {
        try {
          reports = await reportCompletedMovement(pending, mover);
        } catch (error) {
          console.warn("[PMTTRPG] movement damage report failed", error);
        }
      }
      return { ok: true, outcome: "completed", resolved: pending.plan.resolved, reports };
    });
  } finally {
    endPendingMovement(pending.plan.id);
    endMovementAction(pending.plan.movementActionId);
  }
}

/**
 * Decides if an ordinary drag or `move()` needs a plan. Gives back `{ planned: false }`
 * for Foundry's normal path, `{ planned: true, refuse }` if the plan has to stop the
 * move, or `{ planned: true, pending }` once it's rewritten `options`.
 */
export async function planVoluntaryMovement(tokenDoc, options = {}, env = {}, { waypoints: explicit = null } = {}) {
  const d = withEnv(env);
  const pmt = options.projectmoonttrpg ?? {};
  if (!tokenDoc) return { planned: false, reason: "no-token" };
  if (pmt.movementPlanId) return { planned: false, reason: "plan-commit" };
  if (pmt.movementPlanned) return { planned: false, reason: "already-planned" };
  const instruction = options.movement?.[tokenDoc.id] ?? null;
  if (isContinuation(options, instruction)) return { planned: false, reason: "continuation" };
  if (d.isAdministrative(options)) return { planned: false, reason: "administrative" };

  const waypoints = Array.isArray(explicit) && explicit.length
    ? explicit
    : (Array.isArray(instruction?.waypoints) ? instruction.waypoints : []);
  if (!waypoints.length) return { planned: false, reason: "no-waypoints" };

  const combatant = exactCombatantForToken(game.combat, tokenDoc.id);
  const probe = resolveImplicitMovementProfile({ tokenDoc, nature: MOVEMENT_NATURES.VOLUNTARY, combatant });
  const claims = movementProcessorClaims({ nature: MOVEMENT_NATURES.VOLUNTARY, mover: tokenDoc, combatant });
  if (!probe.changed && !claims.length) return { planned: false, reason: "fast-path" };

  const movementActionId = ensureMovementActionId(options);
  const previous = pendingMovementForToken(tokenDoc.uuid);
  if (previous) {
    endPendingMovement(previous.plan.id);
  }
  const plan = createMovementPlan({
    nature: MOVEMENT_NATURES.VOLUNTARY,
    movementActionId,
    mover: { tokenUuid: tokenDoc.uuid, actorUuid: tokenDoc.actor?.uuid ?? null, combatantId: combatant?.id ?? null },
    waypoints,
    pathMode: "free",
    expectedOrigins: { [tokenDoc.uuid]: snapshotTokenOrigin(tokenDoc) },
  });
  const pending = beginPendingMovement(plan);
  await preparePendingMovement(pending, d);

  if (plan.status === PLAN_STATUS.MANUAL) {
    warnUser(pending.manualReason ?? "PMTTRPG.PlannedMovement.ManualAdjudication", { name: tokenDoc.name ?? "" });
    endPendingMovement(plan.id);
    return { planned: true, refuse: true, reason: "manual" };
  }
  if (plan.status === PLAN_STATUS.ABORTED) {
    console.warn("[PMTTRPG] voluntary movement plan aborted; native movement continues", { reason: pending.abortReason });
    endPendingMovement(plan.id);
    return { planned: false, reason: "aborted" };
  }

  const target = ensureProjectOptions(options);
  target.movementPlanned = plan.id;
  target.movementActionId = movementActionId;
  if (plan.rules.opportunityAttack.mode === OA_MOVEMENT_MODES.NONE) target.ignoreOpportunityAttacks = true;
  let rewritten = null;
  if (plan.resolved?.stopReason === "distance") {
    rewritten = plan.resolved.path.slice(1).map((point) => ({ x: point.x, y: point.y, elevation: point.elevation }));
    if (instruction) instruction.waypoints = rewritten;
  }
  return { planned: true, pending, waypoints: rewritten };
}

function linkedProblem(pending, linked, segmentPath, d) {
  const child = d.resolveUuid(linked.tokenUuid);
  if (!child) return { reason: "missing" };
  if (isExternallyMoving(child, {
    actionIdFor: movementActionIdFor,
    movementActionId: pending.plan.movementActionId,
    hasOpportunityLock: d.hasOpportunityLock,
  })) return { reason: "busy", child };
  const expected = pending.linkedExpected?.[linked.tokenUuid] ?? pending.plan.expectedOrigins[linked.tokenUuid];
  if (expected && !positionsMatch(expected, snapshotTokenOrigin(child))) return { reason: "stale", child };
  if (child.object && segmentPath.length) {
    try {
      const origin = snapshotTokenOrigin(child);
      const [, wasConstrained] = child.object.constrainMovementPath(
        [{ x: origin.x, y: origin.y, elevation: origin.elevation }, ...segmentPath],
        { preview: false, ignoreCost: true },
      );
      if (wasConstrained) return { reason: "blocked", child };
    } catch (error) {
      console.warn("[PMTTRPG] linked path check failed", error);
    }
  }
  if (!d.canUpdate(child) && !d.hasActiveGM()) return { reason: "no-committer", child };
  return { reason: null, child };
}

/** Checks the linked followers against the exact root segment about to commit (false stops that segment). */
export function preflightRequiredLinkedSegment(rootDoc, movement, operation = {}, env = {}) {
  const d = withEnv(env);
  const actionId = readMovementActionId(operation) ?? movementActionIdFor(movement?.id);
  if (!actionId || !movement?.id) return true;
  const pending = pendingMovementForAction(actionId);
  if (!pending) return true;
  bindFoundryMovementId(actionId, movement.id);
  // a linked child's own move shares the action id, so only check the mover's segments
  if (pending.plan.roles.mover.tokenUuid !== rootDoc?.uuid) return true;
  const passed = movement.passed?.waypoints ?? [];
  if (!passed.length) return true;

  pending.linkedSegments ??= new Map();
  for (const linked of pending.plan.roles.linked) {
    if (pending.droppedLinked.has(linked.tokenUuid)) continue;
    const segmentPath = passed.map((waypoint) => ({
      x: waypoint.x + linked.follow.dx,
      y: waypoint.y + linked.follow.dy,
      elevation: (waypoint.elevation ?? 0) + (linked.follow.dElevation ?? 0),
      action: FORCED_MOVEMENT_ACTION,
    }));
    const problem = linkedProblem(pending, linked, segmentPath, d);
    if (problem.reason) {
      const name = problem.child?.name ?? "";
      if (linked.failurePolicy === LINKED_FAILURE_POLICIES.ABORT_ROOT_SEGMENT) {
        warnUser("PMTTRPG.PlannedMovement.LinkedSegmentBlocked", { name, reason: game.i18n.localize(`PMTTRPG.PlannedMovement.LinkedReason.${problem.reason}`) });
        return false;
      }
      warnUser("PMTTRPG.PlannedMovement.LinkedDropped", { name });
      pending.droppedLinked.add(linked.tokenUuid);
      continue;
    }
    pending.linkedSegments.set(linked.tokenUuid, { movementId: movement.id, waypoints: segmentPath });
  }
  return true;
}

async function commitLinkedSegment(pending, rootDoc, linked, segment, d) {
  const uuid = linked.tokenUuid;
  const child = d.resolveUuid(uuid);
  const expected = pending.linkedExpected?.[uuid] ?? pending.plan.expectedOrigins[uuid] ?? null;
  const options = systemMoveOptions({
    movementPlanId: `${pending.plan.id}:${uuid}`,
    movementActionId: pending.plan.movementActionId,
    ignoreOpportunityAttacks: true,
  });
  const last = segment.waypoints.at(-1);
  pending.linkedExpected ??= {};
  // the next root segment's preflight checks against where this follow ends
  if (last && expected) pending.linkedExpected[uuid] = { ...expected, x: last.x, y: last.y, elevation: last.elevation };

  let result;
  try {
    result = await withMovementParticipantLocks([uuid], () => moveToken(child, uuid, segment.waypoints, options, expected, d));
  } catch (error) {
    result = { ok: false, reason: "threw", error };
  }
  if (result.ok) return;
  if (linked.failurePolicy === LINKED_FAILURE_POLICIES.ABORT_ROOT_SEGMENT) {
    warnUser("PMTTRPG.PlannedMovement.LinkedCommitFailed", { name: child?.name ?? "" }, result);
    try {
      rootDoc.stopMovement();
    } catch (error) {
      console.warn("[PMTTRPG] stopMovement failed after linked commit failure", error);
    }
  } else {
    warnUser("PMTTRPG.PlannedMovement.LinkedDropped", { name: child?.name ?? "" }, result);
  }
  pending.droppedLinked.add(uuid);
}

function observedState(tokenDoc, movement) {
  if (typeof movement?.state === "string" && movement.state) return movement.state;
  const live = tokenDoc?.movement;
  if (!live || (movement?.id != null && live.id != null && live.id !== movement.id)) return null;
  return typeof live.state === "string" ? live.state : null;
}

/** Runs on the client that started the move, after each committed root segment. */
export function onPlannedMovementUpdate(rootDoc, movement, operation = {}, user = null, env = {}) {
  const d = withEnv(env);
  if (!(user?.isSelf || movement?.user?.isSelf)) return;
  const actionId = readMovementActionId(operation) ?? movementActionIdFor(movement?.id);
  if (!actionId) return;
  const pending = pendingMovementForAction(actionId);
  if (!pending) return;
  if (movement?.id) bindFoundryMovementId(actionId, movement.id);
  if (pending.plan.roles.mover.tokenUuid !== rootDoc?.uuid) return;
  const state = observedState(rootDoc, movement);
  const executing = pending.plan.status === PLAN_STATUS.COMMITTING || pending.plan.status === PLAN_STATUS.COMMITTED;
  const executorOwned = executing && state !== "stopped";

  const passed = movement?.passed?.waypoints ?? [];
  if (passed.length) {
    if (!executorOwned) {
      recordTraversal(actionId, passed.map((waypoint) => ({ x: waypoint.x, y: waypoint.y, elevation: waypoint.elevation ?? 0 })));
    }
    for (const linked of pending.plan.roles.linked) {
      if (pending.droppedLinked.has(linked.tokenUuid)) continue;
      const segment = pending.linkedSegments?.get(linked.tokenUuid);
      if (!segment || segment.movementId !== movement.id) continue;
      pending.linkedSegments.delete(linked.tokenUuid);
      void commitLinkedSegment(pending, rootDoc, linked, segment, d);
    }
  }
  if (executorOwned) return;

  if (state === "completed" || state === "stopped") {
    void runMovementPhase(MOVEMENT_PHASES.COMMITTED, pending).finally(() => {
      d.callHook(MOVEMENT_COMMITTED_HOOK, pendingMovementView(pending));
      endPendingMovement(pending.plan.id);
      endMovementAction(actionId);
    });
  }
}

export function onPlannedMovementStopped(rootDoc) {
  const pending = rootDoc?.uuid ? pendingMovementForToken(rootDoc.uuid) : null;
  if (!pending || pending.plan.status === PLAN_STATUS.COMMITTING) return;
  endPendingMovement(pending.plan.id);
  endMovementAction(pending.plan.movementActionId);
}

/** You can move a token you can act as (the GM always can) or the target of a Grapple you're holding. */
function authorizePlannedMovementCommit(user, tokenDoc) {
  if (!user || !tokenDoc || tokenDoc.documentName !== "Token") return false;
  if (canActAs(tokenDoc.actor ?? null, tokenDoc.id, user)) return true;
  const combatant = tokenDoc.combatant ?? null;
  const combat = combatant?.combat ?? null;
  if (!combat || combatant?.id == null) return false;
  const relationship = findRelationshipForTarget(combat, combatant.id);
  if (!relationship) return false;
  const grappler = combat.combatants.get(String(relationship.grapplerCombatantId)) ?? null;
  if (!grappler) return false;
  return canActAs(grappler.actor, grappler.tokenId, user);
}

const ROUTED_POLICY_KEYS = ["landing", "report", "collision", "trustedPolicy", "onStaleOrigin", "requireVerifiedRest"];

function claimsMovementPolicy(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (ROUTED_POLICY_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key))) return true;
  if (value.projectmoonttrpg && claimsMovementPolicy(value.projectmoonttrpg, seen)) return true;
  if (value.options && claimsMovementPolicy(value.options, seen)) return true;
  if (Array.isArray(value.waypoints) && value.waypoints.some((point) => claimsMovementPolicy(point, seen))) return true;
  return false;
}

/** GM side of a routed commit. Refuses it if the user can't move this token or the payload sets movement policy keys. */
export async function commitPlannedMovementRequest(data = {}, env = {}) {
  const d = withEnv(env);
  const tokenDoc = d.resolveUuid(data?.tokenUuid);
  if (!tokenDoc || tokenDoc.documentName !== "Token") return { ok: false, reason: "missing" };
  if (!authorizePlannedMovementCommit(env.fromUser ?? null, tokenDoc)) {
    return { ok: false, reason: "forbidden" };
  }
  if (claimsMovementPolicy(data)) return { ok: false, reason: "malformed" };
  return commitPlannedMovementAsGM(data, env);
}

async function commitPlannedMovementAsGM({ tokenUuid, waypoints, options, expectedOrigin } = {}, env = {}) {
  const d = withEnv(env);
  const tokenDoc = d.resolveUuid(tokenUuid);
  if (!tokenDoc || tokenDoc.documentName !== "Token") return { ok: false, reason: "missing" };
  return withMovementParticipantLocks([tokenUuid], async () => {
    if (expectedOrigin && !positionsMatch(expectedOrigin, snapshotTokenOrigin(tokenDoc))) {
      return { ok: false, reason: "stale" };
    }
    const safeOptions = {
      ...(options ?? {}),
      projectmoonttrpg: { ...(options?.projectmoonttrpg ?? {}) },
    };
    const result = await tokenDoc.move(Array.isArray(waypoints) ? waypoints : [], safeOptions);
    return {
      ok: result !== false,
      reason: result === false ? "refused" : undefined,
      committed: snapshotTokenOrigin(tokenDoc),
    };
  });
}

function registerForcedMovementAction() {
  CONFIG.Token.movement.actions[FORCED_MOVEMENT_ACTION] = {
    label: "PMTTRPG.PlannedMovement.ForcedAction",
    icon: "fa-solid fa-person-falling-burst",
    img: null,
    order: 90,
    teleport: false,
    measure: true,
    walls: "move",
    visualize: true,
    canSelect: false,
    terrainAction: "walk",
    costMultiplier: 0,
  };
}

export function registerPlannedMovement(env = {}) {
  defineMovementRuleSubject();
  registerForcedMovementAction();
  configurePlannedMovement(env);
}

/**
 * If two plans share a token the later one waits.
 * Locks are taken in sorted key order so plans can't deadlock.
 */


const participants = createKeyedQueue();

function withMovementParticipantLocks(keys, task) {
  const ordered = [...new Set((keys ?? []).filter(Boolean).map(String))].sort();
  const acquire = (index) => (index >= ordered.length
    ? Promise.resolve().then(task)
    : participants.run(ordered[index], () => acquire(index + 1)));
  return acquire(0);
}

export function isParticipantLocked(key) {
  return participants.isBusy(String(key ?? ""));
}

/** Whether the token is moving, paused or held by an Opportunity lock for something other than this movement action. */
function isExternallyMoving(tokenDoc, { actionIdFor, movementActionId = null, hasOpportunityLock } = {}) {
  if (!tokenDoc) return false;
  const movement = tokenDoc.movement;
  const active = movement && (movement.state === "pending" || movement.state === "paused");
  if (active) {
    const owner = actionIdFor(movement.id);
    if (!movementActionId || owner !== movementActionId) return true;
  }
  if (hasOpportunityLock(tokenDoc)) {
    const owner = active ? actionIdFor(movement.id) : null;
    if (!movementActionId || owner !== movementActionId) return true;
  }
  return false;
}
