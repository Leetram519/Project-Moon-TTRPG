/**
 * Turns a MovementPlan into a ProposedMovement. A `direct` plan picks its end cell on a
 * straight line from the origin and a `free` one just follows its waypoints. Foundry fills
 * in the path between them unless the plan is vertical.
 */

import { additiveSquares, completedSquares, resolveLanding, surfaceContact, transitionEntry } from "../canvas/landing-resolve.js";
import { pathLevelAt, queryFloor } from "../canvas/floor-query.js";
import { snapshotFromScene } from "../canvas/floor-snapshot.js";
import {
  FORCED_MOVEMENT_ACTION,
  MOVEMENT_DISTANCE_MODES,
  MOVEMENT_NATURES,
  MOVEMENT_PATH_MODES,
  HAZARD_POLICIES,
} from "./movement-plan.js";
import { gridUnit, normalizeMovementPoint, snapshotTokenOrigin } from "./movement-points.js";
import { cloneData } from "../shared-helpers.js";

const STOP_REASONS = {
  WALL: "wall",
  BOUNDS: "bounds",
  SURFACE: "surface",
  TRANSITION: "transition",
  DISTANCE: "distance",
  UNSUPPORTED: "unsupported",
};

export const HARD_STOPS = new Set([STOP_REASONS.WALL, STOP_REASONS.BOUNDS, STOP_REASONS.SURFACE]);

/** Foundry stores depth in grid squares. Missing depth means unknown (not zero). */
function readTokenDepth(tokenDoc, gridDistance = 1) {
  const source = tokenDoc?._source ?? {};
  const raw = Object.prototype.hasOwnProperty.call(source, "depth") ? source.depth : tokenDoc?.depth;
  if (raw == null || raw === "") return { depthKnown: false, depth: 0 };
  const squares = Number(raw);
  if (!Number.isFinite(squares) || squares < 0) return { depthKnown: false, depth: 0 };
  const unit = Number(gridDistance) > 0 ? Number(gridDistance) : 1;
  return { depthKnown: true, depth: squares * unit };
}

// no grid when the mover got deleted and the caller didn't pass one
function offsetOf(point, grid) {
  if (!grid) return { i: Math.floor(point.y), j: Math.floor(point.x) };
  const { i, j } = grid.getOffset({ x: point.x, y: point.y });
  return { i, j };
}

function pointOf(offset, grid, elevation) {
  if (!grid) return { x: offset.j, y: offset.i, elevation };
  const { x, y } = grid.getTopLeftPoint(offset);
  return { x, y, elevation };
}

export function elevationSquares(delta, gridDistance = 1) {
  const unit = Number(gridDistance) > 0 ? Number(gridDistance) : 1;
  return Math.max(0, Math.round(Math.abs(Number(delta) || 0) / unit));
}

function heightSquares(from, to, grid) {
  const delta = (to?.elevation ?? 0) - (from?.elevation ?? 0);
  return roundHeight(Math.abs(delta) / gridUnit(grid));
}

function flatSquares(from, to, grid) {
  const a = offsetOf(from, grid);
  const b = offsetOf(to, grid);
  return Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j));
}

export function planSquaresBetween(from, to, grid) {
  return flatSquares(from, to, grid) + heightSquares(from, to, grid);
}

// any height above zero is at least one square
function roundHeight(continuous) {
  const squares = Math.max(0, Math.round(continuous));
  if (squares > 0) return squares;
  if (continuous > 1e-6) return 1;
  return 0;
}

function pathHeightOnce(path, grid) {
  const unit = gridUnit(grid);
  let height = 0;
  for (let index = 1; index < path.length; index++) {
    height += Math.abs((path[index].elevation ?? 0) - (path[index - 1].elevation ?? 0)) / unit;
  }
  return roundHeight(height);
}

function pathSpaces(path, grid, vertical = false) {
  if (!path || path.length < 2) return 0;
  let flat = 0;
  for (let index = 1; index < path.length; index++) flat += flatSquares(path[index - 1], path[index], grid);
  if (!vertical) return flat;
  return flat + pathHeightOnce(path, grid);
}

/**
 * For a path that got cut short. Flat travel counts grid steps (an off-grid origin gives the
 * same count). With `partialEnd` the last point is partway along a step and gets measured as a
 * distance.
 */
function travelledSquares(path, grid, vertical = false, { partialEnd = false } = {}) {
  if (!path || path.length < 2) return 0;
  let flat = 0;
  let height = 0;
  const unit = gridUnit(grid);
  const size = Number(grid?.size) > 0 ? Number(grid.size) : 1;
  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1];
    const to = path[index];
    if (partialEnd && index === path.length - 1) {
      flat += Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) / size;
    } else {
      flat += flatSquares(from, to, grid);
    }
    if (vertical) height += Math.abs((to.elevation ?? 0) - (from.elevation ?? 0)) / unit;
  }
  return vertical || partialEnd ? completedSquares(flat + height) : flat;
}

// Math.round sends -1.5 to -1 but 1.5 to 2
function roundAway(value) {
  return Math.sign(value) * Math.round(Math.abs(value));
}

function nearPoint(a, b) {
  return Math.abs(a.x - b.x) <= 0.5 && Math.abs(a.y - b.y) <= 0.5;
}

function segmentProgress(from, to, hit) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-8) return null;
  const t = ((hit.x - from.x) * dx + (hit.y - from.y) * dy) / len2;
  const px = from.x + dx * t;
  const py = from.y + dy * t;
  if ((hit.x - px) ** 2 + (hit.y - py) ** 2 > 1) return null;
  return t;
}

function samePoint(a, b) {
  return nearPoint(a, b) && Math.abs((a.elevation ?? 0) - (b.elevation ?? 0)) <= 1e-6;
}

/** A blocked path from Foundry ends on the wall contact, not on a grid cell. */
function squaresBeforeWall(planned, constrained) {
  const hit = constrained.at(-1);
  if (!hit || !planned.length) return planned.slice(0, 1);
  let landed = -1;
  for (let index = planned.length - 1; index >= 0; index--) {
    if (samePoint(planned[index], hit)) {
      landed = index;
      break;
    }
  }
  if (landed >= 0) return planned.slice(0, landed + 1);
  for (let index = 1; index < planned.length; index++) {
    const t = segmentProgress(planned[index - 1], planned[index], hit);
    if (t != null && t >= 0 && t < 1) return planned.slice(0, index);
  }
  const prior = constrained.length > 1 ? constrained.at(-2) : null;
  if (prior) {
    for (let index = planned.length - 1; index >= 0; index--) {
      if (samePoint(planned[index], prior)) return planned.slice(0, index + 1);
    }
  }
  return planned.slice(0, 1);
}

function bodyOf(tokenDoc, grid) {
  const source = tokenDoc?._source ?? {};
  const depth = readTokenDepth(tokenDoc, grid?.distance);
  return {
    width: Number(source.width) > 0 ? Number(source.width) : 1,
    height: Number(source.height) > 0 ? Number(source.height) : 1,
    depth: depth.depth,
    depthKnown: depth.depthKnown,
    levelId: source.level ?? null,
  };
}

/**
 * Foundry checks each step against the walls of the level its first waypoint is on.
 * A vertical path can leave the mover's level.
 */
function wallLevels(path, moverLevelId, snapshot) {
  if (!moverLevelId || !snapshot?.levels?.length) return path.map(() => null);
  return path.map((point) => pathLevelAt(snapshot, point.elevation ?? 0, moverLevelId));
}

/**
 * Foundry's movement check stops at a Define Surface too. If the next step would go down into the
 * floor under the token or up into a surface at its head then that surface is what stopped it.
 */
function surfaceAtStop(stop, next, snapshot, body) {
  if (!stop || !next || !snapshot) return null;
  const from = stop.elevation ?? 0;
  const to = next.elevation ?? from;
  const at = (elevation) => {
    const query = queryFloor(snapshot, { x: stop.x, y: stop.y, width: body.width, height: body.height, elevation, levelId: body.levelId });
    return query?.supported === true && Math.abs(Number(query.floor?.elevation) - elevation) <= 1e-6;
  };
  if (to < from - 1e-9) return at(from) ? "floor" : null;
  if (to > from + 1e-9 && body.depthKnown) return at(from + body.depth) ? "ceiling" : null;
  return null;
}

function completePath(tokenDoc, points, grid, vertical = false) {
  if (!vertical) {
    try {
      const path = tokenDoc.getCompleteMovementPath(points);
      if (path.length) return path.map((entry) => normalizeMovementPoint(entry) ?? entry);
    } catch (error) {
      console.warn("[PMTTRPG] getCompleteMovementPath failed; using waypoints only", error);
    }
  }
  const out = [points[0]];
  for (let index = 1; index < points.length; index++) {
    const from = offsetOf(points[index - 1], grid);
    const to = offsetOf(points[index], grid);
    const steps = Math.max(Math.abs(to.i - from.i), Math.abs(to.j - from.j));
    const elevFrom = points[index - 1].elevation ?? 0;
    const elevTo = points[index].elevation ?? elevFrom;
    if (steps === 0) {
      if (vertical && elevFrom !== elevTo) {
        const point = points[index];
        out.push({ x: point.x, y: point.y, elevation: elevTo });
      }
      continue;
    }
    for (let step = 1; step <= steps; step++) {
      const elevation = vertical
        ? (step === steps ? elevTo : elevFrom + ((elevTo - elevFrom) * step) / steps)
        : elevTo;
      out.push(pointOf({
        i: from.i + roundAway(((to.i - from.i) * step) / steps),
        j: from.j + roundAway(((to.j - from.j) * step) / steps),
      }, grid, elevation));
    }
  }
  return out;
}

function truncateBySpaces(path, maxSpaces, grid, vertical = false) {
  if (!Number.isFinite(maxSpaces)) return path;
  const out = [path[0]];
  let spent = 0;
  for (let index = 1; index < path.length; index++) {
    if (vertical) {
      if (pathSpaces(path.slice(0, index + 1), grid, true) > maxSpaces) break;
    } else {
      const step = flatSquares(path[index - 1], path[index], grid);
      if (spent + step > maxSpaces) break;
      spent += step;
    }
    out.push(path[index]);
  }
  return out;
}

function directTarget(origin, destination, { steps, grid, vertical = false }) {
  const o = offsetOf(origin, grid);
  const d = offsetOf(destination, grid);
  const di = d.i - o.i;
  const dj = d.j - o.j;
  const flat = Math.max(Math.abs(di), Math.abs(dj));
  const height = vertical ? heightSquares(origin, destination, grid) : 0;
  const n = vertical ? flat + height : flat;
  if (n === 0) return null;
  const fraction = steps / n;
  const offset = { i: o.i + roundAway(di * fraction), j: o.j + roundAway(dj * fraction) };
  const destElevation = destination.elevation ?? origin.elevation ?? 0;
  const originElevation = origin.elevation ?? 0;
  let elevation = destElevation;
  if (vertical && fraction > 1) {
    elevation = originElevation + (destElevation - originElevation) * fraction;
  } else if (vertical && fraction < 1) {
    const chosenFlat = Math.max(Math.abs(offset.i - o.i), Math.abs(offset.j - o.j));
    const room = Math.max(0, steps - chosenFlat);
    const used = Math.min(room, height);
    const unit = gridUnit(grid);
    const sign = destElevation >= originElevation ? 1 : -1;
    // part of a square of height costs a whole one, but the elevation stops at the aim
    elevation = originElevation + sign * Math.min(used * unit, Math.abs(destElevation - originElevation));
  }
  return { offset, elevation, naturalSpaces: n };
}

function pathLength(path, grid) {
  let total = 0;
  for (let index = 1; index < path.length; index++) total += additiveSquares(path[index - 1], path[index], grid);
  return total;
}

function environmentObstacle(path, { snapshot, grid, token, surfaces, transitions }) {
  if (!snapshot || path.length < 2) return null;
  let best = null;
  let travelled = 0;
  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1];
    const to = path[index];
    const length = additiveSquares(from, to, grid);
    const body = {
      from,
      to,
      width: token.width,
      height: token.height,
      depth: token.depth,
      depthKnown: token.depthKnown,
      levelId: token.levelId,
    };
    if (surfaces === "stop" && length > 0) {
      const underfoot = surfaceAtStop(from, to, snapshot, body) === "floor";
      const hit = underfoot
        ? { kind: "floor", fraction: 0, point: from, elevation: from.elevation ?? 0 }
        : surfaceContact(snapshot, body);
      const nextElevation = path[index + 1]?.elevation;
      const rising = (to.elevation ?? 0) > (from.elevation ?? 0);
      const continuesPast = index < path.length - 1
        && Number.isFinite(nextElevation)
        && Number.isFinite(hit?.elevation)
        && (rising ? nextElevation > hit.elevation + 1e-9 : nextElevation < hit.elevation - 1e-9);
      const interior = hit && hit.fraction > 1e-9 && hit.fraction < 1 - 1e-9;
      const endpointCross = hit && hit.fraction >= 1 - 1e-9 && hit.fraction <= 1 + 1e-9 && continuesPast;
      if (underfoot || interior || endpointCross) {
        const distance = travelled + hit.fraction * length;
        if (!best || distance < best.distance - 1e-9) {
          best = {
            distance,
            stopReason: STOP_REASONS.SURFACE,
            kind: hit.kind,
            point: hit.point,
            elevation: hit.elevation,
            levelId: hit.levelId ?? null,
            owner: hit.owner ?? null,
            segment: index,
          };
        }
      }
    }
    if (transitions === "stop" && length > 0) {
      const entry = transitionEntry(snapshot, body);
      if (entry && entry.fraction < 1 - 1e-9) {
        const distance = travelled + Math.min(length, entry.stopSquares);
        if (!best || distance < best.distance - 1e-9) {
          best = {
            distance,
            stopReason: STOP_REASONS.TRANSITION,
            kind: "transition",
            point: entry.point,
            elevation: entry.point?.elevation,
            transition: entry.transition,
            segment: index,
          };
        }
      }
    }
    travelled += length;
  }
  return best;
}

function withinBounds(point, tokenDoc, sceneRect) {
  if (!sceneRect) return true;
  const size = Number(tokenDoc?.parent?.grid?.size) || 0;
  const width = (Number(tokenDoc?._source?.width) || 1) * size;
  const height = (Number(tokenDoc?._source?.height) || 1) * size;
  return point.x >= sceneRect.x
    && point.y >= sceneRect.y
    && point.x + width <= sceneRect.x + sceneRect.width
    && point.y + height <= sceneRect.y + sceneRect.height;
}

function failure(reason, origin, extra = {}) {
  return {
    origin,
    destination: origin,
    path: origin ? [origin] : [],
    traversed: [],
    requestedSpaces: 0,
    actualSpaces: 0,
    unspentSpaces: 0,
    cost: 0,
    stopReason: STOP_REASONS.UNSUPPORTED,
    failure: reason,
    collided: null,
    hazardCrossings: [],
    oaCrossings: [],
    elevationDelta: 0,
    wallsChecked: false,
    ...extra,
  };
}

export function resolveMovementPlan(pending, env = {}) {
  const plan = pending.plan;
  const request = pending.request;
  const rules = plan.rules;
  const moverUuid = plan.roles.mover.tokenUuid;
  const tokenDoc = env.resolveUuid(moverUuid);
  const origin = plan.expectedOrigins[moverUuid] ?? snapshotTokenOrigin(tokenDoc);
  if (!tokenDoc || !origin) return failure("mover-missing", origin ?? null);

  const grid = env.grid ?? tokenDoc.parent?.grid ?? null;
  const unit = Number(grid?.distance) || 1;
  const forced = request.nature === MOVEMENT_NATURES.FORCED;
  const action = forced ? FORCED_MOVEMENT_ACTION : (tokenDoc.movementAction ?? undefined);
  const caps = [request.distance, rules.distanceMax].filter((value) => Number.isInteger(value));
  const maxSpaces = caps.length ? Math.min(...caps) : Infinity;
  const originPoint = { x: origin.x, y: origin.y, elevation: origin.elevation ?? 0 };
  const vertical = rules?.vertical?.allowed === true;

  let requestedSpaces;
  let naturalSpaces;
  let path;
  if (request.pathMode === MOVEMENT_PATH_MODES.DIRECT) {
    const destination = request.destination ?? request.waypoints.at(-1) ?? null;
    if (!destination) return failure("no-destination", originPoint);
    const exact = request.distanceMode === MOVEMENT_DISTANCE_MODES.EXACT && Number.isFinite(maxSpaces);
    const probe = directTarget(originPoint, destination, { steps: 1, grid, vertical });
    if (!probe) return failure("no-direction", originPoint);
    naturalSpaces = probe.naturalSpaces;
    requestedSpaces = exact ? maxSpaces : Math.min(naturalSpaces, maxSpaces);
    const target = directTarget(originPoint, destination, { steps: requestedSpaces, grid, vertical });
    const originOffset = offsetOf(originPoint, grid);
    const verticalOnly = vertical && target.offset.i === originOffset.i && target.offset.j === originOffset.j;
    const endElevation = vertical ? target.elevation : (destination.elevation ?? originPoint.elevation);
    const end = verticalOnly
      ? { x: originPoint.x, y: originPoint.y, elevation: endElevation }
      : pointOf(target.offset, grid, endElevation);
    path = completePath(tokenDoc, [originPoint, end], grid, vertical);
  } else {
    const waypoints = request.waypoints.length ? request.waypoints : [request.destination].filter(Boolean);
    if (!waypoints.length) return failure("no-destination", originPoint);
    const full = completePath(tokenDoc, [originPoint, ...waypoints], grid, vertical);
    naturalSpaces = pathSpaces(full, grid, vertical);
    path = truncateBySpaces(full, maxSpaces, grid, vertical);
    requestedSpaces = Math.min(naturalSpaces, maxSpaces);
  }

  let stopReason = naturalSpaces > requestedSpaces
    && request.distanceMode !== MOVEMENT_DISTANCE_MODES.EXACT ? STOP_REASONS.DISTANCE : null;
  let collided = null;
  let wallsChecked = false;
  let measured = null;

  let sceneSnapshot;
  const floorSnapshot = () => {
    if (sceneSnapshot === undefined) sceneSnapshot = env.floorSnapshot ?? (tokenDoc.parent ? snapshotFromScene(tokenDoc.parent) : null);
    return sceneSnapshot;
  };

  const placeable = tokenDoc.object ?? null;
  if (rules.collision?.walls === "stop" && placeable) {
    wallsChecked = true;
    try {
      const planned = path.map((point) => ({ x: point.x, y: point.y, elevation: point.elevation ?? 0 }));
      const levels = vertical ? wallLevels(path, origin.level ?? null, floorSnapshot()) : [];
      const [constrainedPath, wasConstrained] = placeable.constrainMovementPath(
        path.map((point, index) => ({ ...point, action, ...(levels[index] ? { level: levels[index] } : {}) })),
        { preview: false, ignoreCost: true },
      );
      if (wasConstrained) {
        path = squaresBeforeWall(planned, constrainedPath);
        const surface = vertical ? surfaceAtStop(path.at(-1), planned[path.length], floorSnapshot(), bodyOf(tokenDoc, grid)) : null;
        stopReason = surface ? STOP_REASONS.SURFACE : STOP_REASONS.WALL;
        collided = {
          kind: surface ?? "wall",
          documentUuid: null,
          pathIndex: Math.max(0, path.length - 1),
          ...(surface ? { elevation: path.at(-1)?.elevation ?? null } : {}),
        };
        measured = { actualSpaces: travelledSquares(path, grid, vertical) };
      }
    } catch (error) {
      wallsChecked = false;
      console.warn("[PMTTRPG] constrainMovementPath failed; walls not checked", error);
    }
  }

  const sceneRect = tokenDoc.parent?.dimensions?.sceneRect ?? null;
  if (rules.collision?.bounds === "stop" && sceneRect) {
    const cut = path.findIndex((point, index) => index > 0 && !withinBounds(point, tokenDoc, sceneRect));
    if (cut > 0) {
      path = path.slice(0, cut);
      stopReason = STOP_REASONS.BOUNDS;
      collided = { kind: "bounds", documentUuid: null, pathIndex: Math.max(0, path.length - 1) };
      measured = { actualSpaces: travelledSquares(path, grid, vertical) };
    }
  }

  if (rules.collision?.surfaces === "stop" || rules.collision?.transitions === "stop") {
    const earlier = earlierEnvironmentCut(path, {
      snapshot: floorSnapshot(),
      grid,
      tokenDoc,
      surfaces: rules.collision?.surfaces,
      transitions: rules.collision?.transitions,
      blockedAt: stopReason ? pathLength(path, grid) : Infinity,
      vertical,
    });
    if (earlier) {
      path = earlier.path;
      stopReason = earlier.stopReason;
      collided = earlier.collided;
      measured = { actualSpaces: earlier.actualSpaces };
    }
  }

  return finishResolution({
    plan, rules, tokenDoc, grid, unit, originPoint, path, requestedSpaces, stopReason, collided, wallsChecked, env, vertical, measured,
  });
}

function earlierEnvironmentCut(path, { snapshot, grid, tokenDoc, surfaces, transitions, blockedAt, vertical = false }) {
  const hit = environmentObstacle(path, {
    snapshot,
    grid,
    surfaces,
    transitions,
    token: bodyOf(tokenDoc, grid),
  });
  if (!hit || hit.distance >= blockedAt - 1e-6) return null;
  const prefix = path.slice(0, hit.segment);
  const start = path[hit.segment - 1];
  const finish = path[hit.segment];
  let end = hit.point ?? start;
  // partway along a one-cell step the token would end up between cells
  if (hit.stopReason === STOP_REASONS.TRANSITION && flatSquares(start, finish, grid) === 1) end = start;
  const repeatsStart = nearPoint(end, start)
    && Math.abs((end.elevation ?? hit.elevation ?? 0) - (start.elevation ?? 0)) <= 1e-9;
  const partway = !repeatsStart && !nearPoint(end, finish);
  const next = repeatsStart ? prefix : [...prefix, {
    x: end.x,
    y: end.y,
    elevation: end.elevation ?? hit.elevation ?? 0,
  }];
  return {
    path: next,
    stopReason: hit.stopReason,
    collided: {
      kind: hit.kind,
      pathIndex: Math.max(0, next.length - 1),
      elevation: hit.elevation ?? end.elevation ?? null,
      levelId: hit.levelId ?? null,
      owner: hit.owner ?? null,
      transition: hit.transition ?? null,
      regionUuid: null,
    },
    actualSpaces: travelledSquares(next, grid, vertical, { partialEnd: partway }),
  };
}

function measureCost(tokenDoc, path, rules, grid, unit, vertical = false) {
  if (!rules.spendsMovement) return 0;
  const spaces = pathSpaces(path, grid, vertical);
  const placeable = tokenDoc.object ?? null;
  if (placeable && path.length > 1) {
    try {
      const cost = Number(placeable.measureMovementPath(path).cost);
      if (Number.isFinite(cost)) return Math.round(cost / unit);
    } catch (error) {
      console.warn("[PMTTRPG] measureMovementPath failed; counting spaces", error);
    }
  }
  return spaces * (1 + (Number(rules.costPerSpace) || 0));
}

function finishResolution({ plan, rules, tokenDoc, grid, unit, originPoint, path, requestedSpaces, stopReason, collided, wallsChecked, env, vertical = false, measured = null }) {
  const actualSpaces = Number.isFinite(measured?.actualSpaces) ? measured.actualSpaces : pathSpaces(path, grid, vertical);
  const destination = path.at(-1) ?? originPoint;
  const traversed = path.slice(1).map((point, index) => ({
    index,
    x: point.x,
    y: point.y,
    elevation: point.elevation ?? 0,
    cell: { ...offsetOf(point, grid), elevation: point.elevation ?? 0 },
  }));
  const hazardCrossings = [];
  if (rules.hazards === HAZARD_POLICIES.INTERACT && typeof env.regionsAt === "function") {
    for (const step of traversed) {
      let regions = [];
      try {
        regions = env.regionsAt(step) ?? [];
      } catch (error) {
        console.warn("[PMTTRPG] movement region lookup failed", error);
      }
      for (const region of regions) {
        const regionUuid = region?.uuid ?? null;
        if (regionUuid) hazardCrossings.push({ movementActionId: plan.movementActionId, regionUuid, cell: step.cell, index: step.index });
      }
    }
  }
  return {
    origin: originPoint,
    destination: { x: destination.x, y: destination.y, elevation: destination.elevation ?? 0 },
    path: path.map((point) => ({ x: point.x, y: point.y, elevation: point.elevation ?? 0 })),
    traversed,
    requestedSpaces,
    actualSpaces,
    unspentSpaces: Math.max(0, requestedSpaces - actualSpaces),
    cost: measureCost(tokenDoc, path, rules, grid, unit, vertical),
    stopReason: stopReason ?? (actualSpaces < requestedSpaces ? STOP_REASONS.UNSUPPORTED : null),
    failure: null,
    collided,
    hazardCrossings,
    oaCrossings: [],
    elevationDelta: (destination.elevation ?? 0) - (originPoint.elevation ?? 0),
    apexElevation: Math.max(originPoint.elevation ?? 0, ...path.map((point) => point.elevation ?? 0)),
    wallsChecked,
    resolvedAgainst: cloneData(plan.expectedOrigins),
  };
}

/** Keeps the path through `index`. A collision past the cut gets cleared and the stop becomes `distance`. */
export function truncateResolvedMovement(pending, index, env = {}) {
  const resolved = pending.plan.resolved;
  if (!resolved || !Number.isInteger(index) || index < 0 || index >= resolved.path.length) return resolved;
  const tokenDoc = env.resolveUuid(pending.plan.roles.mover.tokenUuid) ?? {};
  const grid = env.grid ?? tokenDoc.parent?.grid ?? null;
  const path = resolved.path.slice(0, index + 1);
  let stopReason = resolved.stopReason ?? STOP_REASONS.DISTANCE;
  let collided = resolved.collided ?? null;
  if (collided && Number.isInteger(collided.pathIndex) && index < collided.pathIndex) {
    if (HARD_STOPS.has(stopReason) || stopReason === STOP_REASONS.TRANSITION) stopReason = STOP_REASONS.DISTANCE;
    collided = null;
  }
  const vertical = pending.plan.rules?.vertical?.allowed === true;
  const cut = index < resolved.path.length - 1;
  const travelled = cut ? { actualSpaces: travelledSquares(path, grid, vertical) } : { actualSpaces: resolved.actualSpaces };
  return finishResolution({
    plan: pending.plan,
    rules: pending.plan.rules,
    tokenDoc,
    grid,
    unit: Number(grid?.distance) || 1,
    originPoint: resolved.origin,
    path,
    requestedSpaces: resolved.requestedSpaces,
    stopReason,
    collided,
    wallsChecked: resolved.wallsChecked,
    env,
    vertical,
    measured: travelled,
  });
}

function planRequestsLanding(pending) {
  const request = pending.plan.request ?? {};
  const rules = pending.plan.rules ?? {};
  return request.landing === "settle" || rules.landing === "settle"
    || request.report?.falling === true || rules.report?.falling === true
    || !!request.requireVerifiedRest;
}

export function applyForcedLanding(pending, env = {}) {
  const resolved = pending?.plan?.resolved;
  if (!resolved || resolved.failure) return resolved;
  if (pending.plan.request?.nature !== MOVEMENT_NATURES.FORCED) return resolved;
  if (!planRequestsLanding(pending)) return resolved;
  const tokenDoc = env.resolveUuid(pending.plan.roles?.mover?.tokenUuid);
  const grid = env.grid ?? tokenDoc?.parent?.grid ?? null;
  const snapshot = env.floorSnapshot ?? (tokenDoc?.parent ? snapshotFromScene(tokenDoc.parent) : null);
  if (!snapshot) return resolved;
  const source = tokenDoc?._source ?? {};
  const depth = readTokenDepth(tokenDoc, grid?.distance);
  const rules = pending.plan.rules ?? {};
  const landing = resolveLanding(snapshot, {
    origin: { ...resolved.origin, levelId: source.level ?? resolved.origin?.level ?? null },
    destination: resolved.destination,
    requestedSpaces: 1e6,
    width: Number(source.width) > 0 ? Number(source.width) : 1,
    height: Number(source.height) > 0 ? Number(source.height) : 1,
    depth: depth.depth,
    depthKnown: depth.depthKnown,
    rank: Number(tokenDoc?.actor?.system?.attributes?.rank?.value) || 0,
    landing: rules.landing === "settle" ? "settle" : "none",
    surfaces: "ignore",
    transitions: "allow",
    reportFalling: rules.report?.falling === true,
  });
  return {
    ...resolved,
    apexElevation: Math.max(Number(resolved.apexElevation) || 0, Number(landing.apexElevation) || 0),
    rest: landing.rest,
    landing: landing.landing,
    fall: landing.fall,
  };
}
