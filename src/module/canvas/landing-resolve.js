/**
 * Works out where a forced move lands, what surface it hits and whether it enters a transition region.
 * Floors and ceilings stop the token right where it meets them, not on a whole square.
 * A transition stops the move on the last whole square before the token enters it.
 */

import { queryFloor } from "./floor-query.js";

function num(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readGrid(snapshot) {
  const grid = snapshot?.grid ?? {};
  const size = num(grid.size, 1);
  const distance = num(grid.distance, 1);
  return {
    size: size > 0 ? size : 1,
    distance: distance > 0 ? distance : 1,
  };
}

/** Flat Chebyshev distance plus the height, in squares (keeps the fractional square). */
export function additiveSquares(from, to, grid) {
  const size = Number(grid?.size) > 0 ? Number(grid.size) : 1;
  const unit = Number(grid?.distance) > 0 ? Number(grid.distance) : 1;
  return Math.max(
    Math.abs((to?.x ?? 0) - (from?.x ?? 0)) / size,
    Math.abs((to?.y ?? 0) - (from?.y ?? 0)) / size,
  ) + Math.abs((to?.elevation ?? 0) - (from?.elevation ?? 0)) / unit;
}

function pointAtFraction(from, to, fraction) {
  if (fraction === 1) return { x: to.x, y: to.y, elevation: to.elevation };
  return {
    x: from.x + (to.x - from.x) * fraction,
    y: from.y + (to.y - from.y) * fraction,
    elevation: from.elevation + (to.elevation - from.elevation) * fraction,
  };
}

function pointAlong(from, to, total, squares) {
  if (!(total > 0)) return { x: from.x, y: from.y, elevation: from.elevation };
  return pointAtFraction(from, to, squares / total);
}

function aimPoint(origin, destination, requested, grid) {
  const natural = additiveSquares(origin, destination, grid);
  if (!(natural > 0) || !(requested > 0)) {
    return { x: origin.x, y: origin.y, elevation: origin.elevation };
  }
  return pointAtFraction(origin, destination, Math.min(1, requested / natural));
}

export function completedSquares(distance) {
  if (!(distance > 0)) return 0;
  const nearest = Math.round(distance);
  if (Math.abs(distance - nearest) <= 1e-6) return nearest;
  return Math.floor(distance);
}

function fallingDice(squares, rank) {
  const fallen = Math.max(0, Math.floor(num(squares, 0)));
  const cushion = Math.floor(num(rank, 0)) + 1;
  return Math.max(0, fallen - cushion);
}

function diceResult(squares) {
  const count = Math.max(0, Math.floor(num(squares, 0)));
  return {
    squares: count,
    dice: count,
    formula: count > 0 ? `${count}d8` : null,
  };
}

function pose(point, token) {
  return {
    x: point.x,
    y: point.y,
    width: token.width,
    height: token.height,
    elevation: point.elevation,
    levelId: token.levelId ?? null,
  };
}

function tokenOf(motion, origin) {
  const depthKnown = motion.depthKnown !== false;
  return {
    width: num(motion.width, 1) > 0 ? num(motion.width, 1) : 1,
    height: num(motion.height, 1) > 0 ? num(motion.height, 1) : 1,
    depth: depthKnown ? Math.max(0, num(motion.depth, 0)) : null,
    depthKnown,
    levelId: motion.levelId ?? origin?.levelId ?? null,
  };
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);
}

function levelBases(snapshot) {
  const planes = [];
  const levels = snapshot?.levels ?? [];
  for (const level of levels) {
    const base = Number(level?.base);
    if (level?.id && Number.isFinite(base)) planes.push(base);
  }
  if (!levels.length && !snapshot?.hasUnreadableFloors) planes.push(0);
  return uniqueSorted(planes);
}

function floorPlanes(snapshot) {
  return uniqueSorted([...levelBases(snapshot), ...surfacePlanes(snapshot)]);
}

function surfacePlanes(snapshot) {
  const planes = [];
  for (const surface of snapshot?.surfaces ?? []) {
    const elevation = Number(surface?.elevation);
    if (Number.isFinite(elevation) && surface.shapes?.length) planes.push(elevation);
  }
  return uniqueSorted(planes);
}

function supportAt(snapshot, position, elevation) {
  const result = queryFloor(snapshot, { ...position, elevation });
  if (!result.trustworthy || !result.supported || result.floor?.elevation !== elevation) return null;
  return result.floor;
}

function surfaceAt(snapshot, position, elevation) {
  const floor = supportAt(snapshot, position, elevation);
  if (!floor || floor.kind !== "surface") return null;
  return floor;
}

function firstSurface(snapshot, from, to, token) {
  const elev0 = from.elevation;
  const elev1 = to.elevation;
  const hits = [];
  if (elev1 < elev0 - 1e-9) {
    for (const plane of floorPlanes(snapshot)) {
      if (plane >= elev0 - 1e-9 || plane < elev1 - 1e-9) continue;
      const fraction = (plane - elev0) / (elev1 - elev0);
      if (fraction <= 1e-9 || fraction > 1 + 1e-9) continue;
      const point = pointAtFraction(from, to, Math.min(1, fraction));
      point.elevation = plane;
      const floor = supportAt(snapshot, pose(point, token), plane);
      if (!floor) continue;
      hits.push({ fraction: Math.min(1, fraction), kind: "floor", elevation: plane, floor, point });
    }
  }
  if (elev1 > elev0 + 1e-9 && token.depthKnown !== false) {
    const depth = token.depth;
    for (const plane of surfacePlanes(snapshot)) {
      const feet = plane - depth;
      if (feet <= elev0 + 1e-9 || feet > elev1 + 1e-9) continue;
      const fraction = (feet - elev0) / (elev1 - elev0);
      const point = pointAtFraction(from, to, Math.min(1, fraction));
      point.elevation = feet;
      const cover = surfaceAt(snapshot, pose({ ...point, elevation: plane }, token), plane);
      if (!cover) continue;
      const kind = depth > 0 ? "ceiling" : "floor";
      hits.push({
        fraction: Math.min(1, fraction),
        kind,
        elevation: feet,
        floor: cover,
        point,
      });
    }
    // From below a level base is a ceiling. If we stopped right at the base the body
    // would be inside the level, and unfortunately Foundry's move can then wait
    // forever while the movement lock is held.
    for (const plane of levelBases(snapshot)) {
      if (plane <= elev0 + 1e-9) continue;
      const slab = supportAt(snapshot, pose({ x: from.x, y: from.y, elevation: plane }, token), plane);
      if (!slab || slab.elevation !== plane || slab.kind === "surface") continue;
      const feet = plane - Math.max(0, depth);
      const stopElevation = Math.max(elev0, feet);
      if (stopElevation > elev1 + 1e-9) continue;
      let fraction = (stopElevation - elev0) / (elev1 - elev0);
      if (fraction <= 1e-9) fraction = 1e-6;
      if (fraction > 1 - 1e-9) continue;
      const point = pointAtFraction(from, to, fraction);
      point.elevation = stopElevation;
      hits.push({ fraction, kind: "ceiling", elevation: stopElevation, floor: slab, point });
    }
  }
  hits.sort((left, right) => left.fraction - right.fraction || (left.kind === "floor" ? -1 : 1));
  return hits[0] ?? null;
}

function transitionAt(snapshot, position) {
  const flags = queryFloor(snapshot, position).transitions ?? {};
  if (flags.changeLevel) return "changeLevel";
  if (flags.teleportToken) return "teleportToken";
  return null;
}

function transitionFractions(snapshot, from, to, token, total) {
  const fractions = new Set([0, 1]);
  const span = Math.max(0.05, Math.min(token.width, token.height));
  const step = Math.min(0.25, span * 0.5);
  const samples = Math.max(8, Math.ceil(total / step));
  for (let index = 0; index <= samples; index++) fractions.add(index / samples);
  const delta = to.elevation - from.elevation;
  if (Math.abs(delta) > 1e-9) {
    for (const region of snapshot?.transitions ?? []) {
      for (const edge of [region?.bottom, region?.top]) {
        if (!Number.isFinite(edge)) continue;
        const fraction = (edge - from.elevation) / delta;
        if (fraction > 0 && fraction < 1) fractions.add(fraction);
      }
    }
  }
  return [...fractions].sort((left, right) => left - right);
}

function firstTransition(snapshot, from, to, token, grid) {
  const total = additiveSquares(from, to, grid);
  const kindAt = (fraction) => transitionAt(snapshot, pose(pointAtFraction(from, to, fraction), token));
  if (kindAt(0)) return { fraction: 0, kind: kindAt(0) };
  let previous = 0;
  for (const fraction of transitionFractions(snapshot, from, to, token, total)) {
    if (fraction <= 0) continue;
    if (!kindAt(fraction)) {
      previous = fraction;
      continue;
    }
    let left = previous;
    let right = fraction;
    for (let step = 0; step < 24; step++) {
      const mid = (left + right) / 2;
      if (kindAt(mid)) right = mid;
      else left = mid;
    }
    return { fraction: right, kind: kindAt(right) };
  }
  return null;
}

function blankRest(elevation, basis) {
  return { elevation, basis, levelId: null, owner: null };
}

function knownRest(floor) {
  return {
    elevation: floor.elevation,
    basis: "known-floor",
    levelId: floor.levelId ?? null,
    owner: floor.owner ?? null,
  };
}

function fallFrom(apex, restElevation, grid, rank, reportFalling, basis) {
  if (!reportFalling || basis !== "known-floor") return null;
  const squares = completedSquares((apex - restElevation) / grid.distance);
  if (!(squares > 0)) return null;
  const dice = fallingDice(squares, rank);
  return {
    fromElevation: apex,
    toElevation: restElevation,
    squares,
    dice,
    formula: dice > 0 ? `${dice}d8` : null,
  };
}

/** First floor or ceiling the segment runs into. `elevation` is the feet at contact (not snapped to a square). */
export function surfaceContact(snapshot, segment = {}) {
  const from = {
    x: num(segment.from?.x),
    y: num(segment.from?.y),
    elevation: num(segment.from?.elevation),
  };
  const to = {
    x: num(segment.to?.x, from.x),
    y: num(segment.to?.y, from.y),
    elevation: num(segment.to?.elevation, from.elevation),
  };
  const hit = firstSurface(snapshot, from, to, tokenOf(segment, segment.from));
  if (!hit) return null;
  return {
    kind: hit.kind,
    elevation: hit.elevation,
    levelId: hit.floor?.levelId ?? null,
    owner: hit.floor?.owner ?? null,
    fraction: hit.fraction,
    point: hit.point,
  };
}

export function transitionEntry(snapshot, segment = {}) {
  const grid = readGrid(snapshot);
  const from = {
    x: num(segment.from?.x),
    y: num(segment.from?.y),
    elevation: num(segment.from?.elevation),
  };
  const to = {
    x: num(segment.to?.x, from.x),
    y: num(segment.to?.y, from.y),
    elevation: num(segment.to?.elevation, from.elevation),
  };
  const entry = firstTransition(snapshot, from, to, tokenOf(segment, segment.from), grid);
  if (!entry) return null;
  const total = additiveSquares(from, to, grid);
  const entrySquares = entry.fraction * total;
  const stopSquares = Math.max(0, Math.floor(entrySquares - 1e-9));
  return {
    kind: "transition",
    transition: entry.kind,
    fraction: entry.fraction,
    stopSquares,
    point: pointAlong(from, to, total, stopSquares),
  };
}

function settleDown(snapshot, from, floor, token, grid) {
  const to = { x: from.x, y: from.y, elevation: floor.elevation };
  const entry = firstTransition(snapshot, from, to, token, grid);
  const total = additiveSquares(from, to, grid);
  if (entry && entry.fraction < 1 - 1e-9) {
    const stopSquares = Math.max(0, Math.floor(entry.fraction * total - 1e-9));
    return { blocked: true, point: pointAlong(from, to, total, stopSquares), transition: entry.kind };
  }
  return { blocked: false, point: to, floor };
}

function returnDown(snapshot, from, origin, token) {
  const target = { x: from.x, y: from.y, elevation: origin.elevation };
  const hit = firstSurface(snapshot, from, target, token);
  if (hit?.kind === "floor" && hit.fraction < 1 - 1e-9) {
    return { landed: true, point: { ...hit.point, elevation: hit.elevation }, floor: hit.floor };
  }
  const standing = supportAt(snapshot, pose(target, token), origin.elevation);
  if (standing?.kind === "surface") return { landed: true, point: target, floor: standing };
  return { landed: false, point: target };
}

/**
 * If `landing` isn't "none" then settling can add a vertical leg (it doesn't count toward the actual or unspent squares).
 * @param {object} snapshot Floor snapshot from `snapshotFromScene`.
 * @param {object} motion Plain throw: origin, destination, requestedSpaces, token size and depth, rank, landing, plus the surfaces ("ignore"), transitions ("allow") and reportFalling switches.
 */
export function resolveLanding(snapshot, motion = {}) {
  const grid = readGrid(snapshot);
  const origin = {
    x: num(motion.origin?.x),
    y: num(motion.origin?.y),
    elevation: num(motion.origin?.elevation),
    levelId: motion.origin?.levelId ?? null,
  };
  const destination = {
    x: num(motion.destination?.x, origin.x),
    y: num(motion.destination?.y, origin.y),
    elevation: num(motion.destination?.elevation, origin.elevation),
  };
  const requestedSpaces = Math.max(0, Math.floor(num(motion.requestedSpaces, 0)));
  const token = tokenOf(motion, origin);
  const aimed = aimPoint(origin, destination, requestedSpaces, grid);
  const segmentSquares = additiveSquares(origin, aimed, grid);
  const reportFalling = motion.reportFalling !== false;
  const settle = motion.landing !== "none";
  const stopSurfaces = motion.surfaces !== "ignore";
  const stopTransitions = motion.transitions !== "allow";
  const rank = num(motion.rank, 0);

  const originQuery = queryFloor(snapshot, pose(origin, token));
  const originSupported = !!(originQuery.trustworthy && originQuery.supported);

  let physical = { x: aimed.x, y: aimed.y, elevation: aimed.elevation };
  let travelled = segmentSquares;
  let stopReason = null;
  let collided = null;

  let transitionCut = null;
  if (stopTransitions && segmentSquares > 0) {
    const entry = firstTransition(snapshot, origin, aimed, token, grid);
    if (entry && entry.fraction < 1 - 1e-9) {
      const entrySquares = entry.fraction * segmentSquares;
      const stopSquares = Math.max(0, Math.floor(entrySquares - 1e-9));
      transitionCut = { distance: stopSquares, transition: entry.kind };
    }
  }

  let surfaceCut = null;
  if (stopSurfaces && segmentSquares > 0) {
    const hit = firstSurface(snapshot, origin, aimed, token);
    if (hit && hit.fraction < 1 - 1e-9) {
      surfaceCut = {
        distance: hit.fraction * segmentSquares,
        kind: hit.kind,
        elevation: hit.elevation,
        floor: hit.floor,
        point: hit.point,
      };
    }
  }

  if (surfaceCut && (!transitionCut || surfaceCut.distance <= transitionCut.distance + 1e-9)) {
    travelled = surfaceCut.distance;
    physical = { x: surfaceCut.point.x, y: surfaceCut.point.y, elevation: surfaceCut.elevation };
    stopReason = "surface";
    collided = {
      kind: surfaceCut.kind,
      elevation: surfaceCut.elevation,
      levelId: surfaceCut.floor?.levelId ?? null,
      owner: surfaceCut.floor?.owner ?? null,
      transition: null,
    };
  } else if (transitionCut) {
    travelled = transitionCut.distance;
    physical = pointAlong(origin, aimed, segmentSquares, transitionCut.distance);
    stopReason = "transition";
    collided = {
      kind: "transition",
      elevation: physical.elevation,
      levelId: null,
      owner: null,
      transition: transitionCut.transition,
    };
  }

  const actualSpaces = completedSquares(travelled);
  const unspentSpaces = Math.max(0, requestedSpaces - actualSpaces);
  let apexElevation = Math.max(origin.elevation, physical.elevation);
  let landing = null;
  let basis = "unsupported";
  let rest = blankRest(physical.elevation, basis);

  const endQuery = queryFloor(snapshot, pose(physical, token));
  const ceilingStop = collided?.kind === "ceiling";

  if (stopReason === "transition") {
    if (endQuery.supported && endQuery.floor) {
      basis = "known-floor";
      rest = knownRest(endQuery.floor);
      physical = { ...physical, elevation: endQuery.floor.elevation };
    } else {
      basis = "unsupported";
      rest = blankRest(physical.elevation, basis);
    }
  } else if (endQuery.supported && endQuery.floor && !ceilingStop) {
    basis = "known-floor";
    rest = knownRest(endQuery.floor);
    physical = { ...physical, elevation: endQuery.floor.elevation };
  } else if (settle && originSupported && endQuery.trustworthy && endQuery.floor && endQuery.floor.elevation < physical.elevation - 1e-9) {
    const dropped = settleDown(snapshot, physical, endQuery.floor, token, grid);
    if (dropped.blocked) {
      basis = "unsupported";
      physical = dropped.point;
      rest = blankRest(physical.elevation, basis);
      stopReason = stopReason ?? "transition";
      collided = collided ?? {
        kind: "transition",
        elevation: physical.elevation,
        levelId: null,
        owner: null,
        transition: dropped.transition,
      };
    } else {
      landing = {
        x: dropped.point.x,
        y: dropped.point.y,
        elevation: dropped.point.elevation,
        path: [
          { x: physical.x, y: physical.y, elevation: physical.elevation },
          { x: dropped.point.x, y: dropped.point.y, elevation: dropped.point.elevation },
        ],
      };
      basis = "known-floor";
      rest = knownRest(dropped.floor);
      physical = { x: dropped.point.x, y: dropped.point.y, elevation: dropped.point.elevation };
    }
  } else if (settle && !originSupported && physical.elevation > origin.elevation + 1e-9) {
    const returned = returnDown(snapshot, physical, origin, token);
    if (returned.landed) {
      basis = "known-floor";
      rest = knownRest(returned.floor);
      physical = returned.point;
      apexElevation = Math.max(apexElevation, physical.elevation, origin.elevation);
    } else {
      basis = "trajectory";
      physical = returned.point;
      rest = blankRest(origin.elevation, basis);
    }
  } else {
    basis = "unsupported";
    rest = blankRest(physical.elevation, basis);
  }

  apexElevation = Math.max(apexElevation, origin.elevation, physical.elevation);
  if (landing) apexElevation = Math.max(apexElevation, landing.path[0].elevation);

  const forceSquares = stopReason === "surface" ? unspentSpaces : 0;
  return {
    trustworthy: !!(originQuery.trustworthy || endQuery.trustworthy),
    basis,
    stopReason,
    collided,
    apexElevation,
    physical,
    rest,
    landing,
    requestedSpaces,
    actualSpaces,
    unspentSpaces,
    fall: fallFrom(apexElevation, rest.elevation, grid, rank, reportFalling, basis),
    force: diceResult(forceSquares),
  };
}
