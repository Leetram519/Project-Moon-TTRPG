
import {
  FORCED_MOVEMENT_ACTION,
  MOVEMENT_NATURES,
  pendingMovementForToken,
  resolveImplicitMovementProfile,
} from "./movement-plan.js";

const FREE_MOVEMENT_ACTIONS = new Set(["displace", FORCED_MOVEMENT_ACTION]);

export function isFreeMovementAction(action) {
  return FREE_MOVEMENT_ACTIONS.has(String(action ?? ""));
}

/**
 * Foundry's recorded `spaces` still counts forced waypoints. If none of the waypoints
 * are voluntary then that total isn't something the actor paid for.
 */
export function voluntaryChunkSpaces(waypoints, measured, recordedSpaces) {
  if (Number(measured) > 0) return measured;
  const list = Array.isArray(waypoints) ? waypoints : [];
  const hasPaid = list.some((waypoint) => (
    waypoint && !waypoint.forced && !waypoint.teleport && !isFreeMovementAction(waypoint.action)
  ));
  if (list.length > 0 && !hasPaid) return 0;
  const spaces = Number(recordedSpaces);
  if (Number.isFinite(spaces) && spaces >= 0) return Math.max(0, Math.round(spaces));
  return 0;
}

export function applyAdditiveSurcharge(cost, distance, perSpace) {
  if (!Number.isFinite(cost)) return cost;
  const surcharge = Number(perSpace) || 0;
  if (surcharge <= 0) return cost;
  if (cost <= 0) return cost;
  return cost + (Number(distance) || 0) * surcharge;
}

/** A pending plan wins if there is one, otherwise we use the implicit voluntary profile. */
export function movementCostSurchargePerSpace(tokenDoc) {
  if (!tokenDoc) return 0;
  const entry = tokenDoc.uuid ? pendingMovementForToken(tokenDoc.uuid) : null;
  if (entry) {
    return entry.plan.rules.spendsMovement ? Math.max(0, Number(entry.plan.rules.costPerSpace) || 0) : 0;
  }
  const { rules } = resolveImplicitMovementProfile({ tokenDoc, nature: MOVEMENT_NATURES.VOLUNTARY, combatant: null });
  return Math.max(0, Number(rules.costPerSpace) || 0);
}

function chebyshevSpaces(from, to, size) {
  if (!(size > 0) || !from || !to) return 0;
  const dx = Math.abs(Number(to.x) - Number(from.x)) / size;
  const dy = Math.abs(Number(to.y) - Number(from.y)) / size;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  return Math.max(0, Math.round(Math.max(dx, dy)));
}

/**
 * Each waypoint's cost got frozen when the move committed, so a surcharge that ends later
 * refunds nothing. A paid step with no recorded cost falls back to its grid spaces
 * (Foundry records 0 for tokens that weren't rendered on the moving client).
 */
export function recordedHistorySquares(waypoints, { gridSize = 0, gridDistance = 1 } = {}) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return 0;
  const unit = Number(gridDistance) > 0 ? Number(gridDistance) : 1;
  let total = 0;
  for (let index = 1; index < waypoints.length; index++) {
    const waypoint = waypoints[index];
    if (!waypoint || waypoint.forced || waypoint.teleport || isFreeMovementAction(waypoint.action)) continue;
    const cost = Number(waypoint.cost);
    const spaces = chebyshevSpaces(waypoints[index - 1], waypoint, gridSize);
    if (Number.isFinite(cost) && cost > 0) total += cost / unit;
    else total += spaces;
  }
  return Math.max(0, Math.round(total));
}
