import { canUserUpdateDocument } from "../acting-user.js";
import { queryFloorForToken, snapshotFromScene } from "../canvas/floor-snapshot.js";
import { transitionEntry } from "../canvas/landing-resolve.js";
import { hasOpportunityTokenLock } from "../combat/opportunity/opportunity-orchestrator.js";
import { isGrappleParticipant } from "../grapple/grapple-restrictions.js";
import { executeMovementPlan, isParticipantLocked } from "../movement/movement-commit.js";
import {
  MOVEMENT_DISTANCE_MODES,
  MOVEMENT_NATURES,
  MOVEMENT_PATH_MODES,
  beginPendingMovement,
  createMovementPlan,
  pendingMovementForToken,
} from "../movement/movement-plan.js";
import { gridUnit, snapshotTokenOrigin } from "../movement/movement-points.js";

const GAP_EPSILON = 1e-6;
const BUSY_STATES = new Set(["planned", "pending", "paused"]);

export const FALL_REASON = {
  GRAPPLE: "PMTTRPG.Falling.Unavailable.Grapple",
  BUSY: "PMTTRPG.Falling.Unavailable.Busy",
  PAUSED: "PMTTRPG.Falling.Unavailable.Paused",
  TRANSITION: "PMTTRPG.Falling.Unavailable.Transition",
};

/** @type {Set<string>} */
const inFlight = new Set();

function hidden(origin = null, floor = null) {
  return { visible: false, enabled: false, reasonKey: null, floor, origin };
}

function shown(enabled, reasonKey, floor, origin) {
  return { visible: true, enabled, reasonKey: enabled ? null : reasonKey, floor, origin };
}

function descentFloor(tokenDoc, query) {
  if (!query?.trustworthy || query.supported || !query.floor) return null;
  const source = Number(tokenDoc?._source?.elevation ?? tokenDoc?.elevation);
  const elevation = Number(query.floor.elevation);
  if (!Number.isFinite(source) || !Number.isFinite(elevation)) return null;
  if ((source - elevation) / gridUnit(tokenDoc?.parent?.grid) <= GAP_EPSILON) return null;
  return query.floor;
}

function transitionAtOrigin(query) {
  return query?.transitions?.changeLevel === true || query?.transitions?.teleportToken === true;
}

function transitionOnDescent(tokenDoc, origin, floor) {
  const scene = tokenDoc?.parent;
  if (!scene || !origin || !floor) return false;
  const snapshot = snapshotFromScene(scene);
  if (!snapshot) return false;
  return transitionEntry(snapshot, {
    from: origin,
    to: { x: origin.x, y: origin.y, elevation: floor.elevation },
    width: origin.width,
    height: origin.height,
    depth: origin.depth,
  }) != null;
}

// Foundry sets this back to null once the animation ends
function animationPending(tokenDoc) {
  return tokenDoc?.object?.movementAnimationPromise != null;
}

function authorized(tokenDoc, user) {
  return !!user && canUserUpdateDocument(tokenDoc, user);
}

export function fallAvailability(tokenDoc, user, { at = "render" } = {}) {
  const origin = snapshotTokenOrigin(tokenDoc);
  if (!tokenDoc || !fallingEnabled() || !authorized(tokenDoc, user)) return hidden(origin);
  const query = queryFloorForToken(tokenDoc);
  const floor = descentFloor(tokenDoc, query);
  if (!floor || transitionAtOrigin(query)) return hidden(origin, query?.floor ?? null);
  if (transitionOnDescent(tokenDoc, origin, floor)) return shown(false, FALL_REASON.TRANSITION, floor, origin);
  if (isGrappleParticipant(tokenDoc)) return shown(false, FALL_REASON.GRAPPLE, floor, origin);
  const state = tokenDoc.movement?.state;
  if (BUSY_STATES.has(state)) return shown(false, FALL_REASON.BUSY, floor, origin);
  if (game.paused && !user.isGM) {
    return shown(false, FALL_REASON.PAUSED, floor, origin);
  }
  if (at === "click") {
    const key = tokenDoc.uuid;
    const busy = animationPending(tokenDoc)
      || isParticipantLocked(key)
      || hasOpportunityTokenLock(tokenDoc)
      || pendingMovementForToken(key)
      || inFlight.has(key);
    if (busy) return shown(false, FALL_REASON.BUSY, floor, origin);
  }
  return shown(true, null, floor, origin);
}

export async function startFallDescent(tokenDoc, user) {
  const availability = fallAvailability(tokenDoc, user, { at: "click" });
  if (!availability.visible || !availability.enabled) {
    return { ok: false, reason: availability.reasonKey ?? "unavailable", outcome: null, reports: [] };
  }
  const key = tokenDoc.uuid;
  inFlight.add(key);
  try {
    const origin = snapshotTokenOrigin(tokenDoc);
    const floor = availability.floor;
    const plan = createMovementPlan({
      nature: MOVEMENT_NATURES.FORCED,
      vertical: true,
      trustedPolicy: true,
      movementActionId: foundry.utils.randomID(),
      source: {
        kind: "fall",
        actorUuid: tokenDoc.actor?.uuid ?? null,
        tokenUuid: tokenDoc.uuid,
      },
      mover: {
        tokenUuid: tokenDoc.uuid,
        actorUuid: tokenDoc.actor?.uuid ?? null,
        combatantId: tokenDoc.combatant?.id ?? null,
      },
      pathMode: MOVEMENT_PATH_MODES.DIRECT,
      distanceMode: MOVEMENT_DISTANCE_MODES.UP_TO,
      destination: { x: origin.x, y: origin.y, elevation: floor.elevation },
      landing: "none",
      report: { force: false, falling: true },
      collision: { surfaces: "stop", transitions: "stop" },
      expectedOrigins: { [tokenDoc.uuid]: origin },
      onStaleOrigin: "abort",
      requireVerifiedRest: { elevation: floor.elevation },
    });
    const pending = beginPendingMovement(plan);
    const moved = await executeMovementPlan(pending);
    return {
      ok: moved?.ok === true,
      outcome: moved?.outcome ?? null,
      reason: moved?.reason ?? null,
      stopReason: moved?.stopReason ?? null,
      notified: moved?.notified === true,
      reports: moved?.reports ?? [],
    };
  } catch (error) {
    console.warn("[PMTTRPG] fall failed", { tokenId: tokenDoc?.id ?? null, error });
    return { ok: false, reason: "failed", outcome: null, reports: [] };
  } finally {
    inFlight.delete(key);
  }
}

const SETTING = "falling";

export function registerFallingSetting() {
  game.settings.register("projectmoonttrpg", SETTING, {
    name: "PMTTRPG.Settings.falling.name",
    hint: "PMTTRPG.Settings.falling.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
}

export function fallingEnabled() {
  return game.settings.get("projectmoonttrpg", SETTING) !== false;
}
