/**
 * Works out the floor under a token from a plain scene snapshot.
 * An upper level's base only counts as a floor when the level has no move surface right at its base.
 * A floor on a shared boundary goes to the upper level (same as Foundry).
 * Support uses the footprint inset by a quarter space, but Change Level and Teleport Token regions use the full footprint.
 * (this also contains a piece of suffering)
 *  */

const EPS = 1e-6;
const QUARTER_SPACE = 0.25;
const KIND_RANK = { ground: 0, base: 1, surface: 2 };

export function readNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function readBound(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (number === Infinity || number === -Infinity) return number;
  return Number.isFinite(number) ? number : null;
}

function spaces(value) {
  const number = readNumber(value);
  return number != null && number > 0 ? number : 1;
}

function gridOf(grid = {}) {
  const size = readNumber(grid.size);
  const type = grid.type === "hex" || grid.type === "gridless" ? grid.type : "square";
  return {
    size: size != null && size > 0 ? size : 1,
    type,
    columns: grid.columns === true,
    even: grid.even === true,
  };
}

function signedArea(ring) {
  let sum = 0;
  for (let index = 0; index < ring.length; index++) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    sum += start.x * end.y - end.x * start.y;
  }
  return sum / 2;
}

function clockwise(ring) {
  return signedArea(ring) < 0 ? [...ring].reverse() : ring.slice();
}

function samePoint(a, b) {
  return Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS;
}

function orient(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a, b, point) {
  if (Math.abs(orient(a, b, point)) > EPS) return false;
  const dot = (point.x - a.x) * (point.x - b.x) + (point.y - a.y) * (point.y - b.y);
  return dot <= EPS;
}

function pointInRing(point, ring) {
  if (!ring || ring.length < 3) return false;
  for (let index = 0; index < ring.length; index++) {
    if (onSegment(ring[index], ring[(index + 1) % ring.length], point)) return true;
  }
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const start = ring[index];
    const end = ring[previous];
    const crosses = (start.y > point.y) !== (end.y > point.y)
      && point.x < ((end.x - start.x) * (point.y - start.y)) / (end.y - start.y) + start.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function properIntersect(a, b, c, d) {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (Math.abs(o1) <= EPS || Math.abs(o2) <= EPS || Math.abs(o3) <= EPS || Math.abs(o4) <= EPS) return false;
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function edgesCross(left, right) {
  for (let i = 0; i < left.length; i++) {
    const a = left[i];
    const b = left[(i + 1) % left.length];
    for (let j = 0; j < right.length; j++) {
      const c = right[j];
      const d = right[(j + 1) % right.length];
      if (properIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

function ringContains(outer, inner) {
  if (!inner.length) return false;
  if (!inner.every((point) => pointInRing(point, outer))) return false;
  if (inner.length < 2) return true;
  return !edgesCross(outer, inner);
}

function ringsOverlap(left, right) {
  if (!left?.length || !right?.length) return false;
  if (left.length === 1) return pointInRing(left[0], right);
  if (right.length === 1) return pointInRing(right[0], left);
  if (left.some((point) => pointInRing(point, right))) return true;
  if (right.some((point) => pointInRing(point, left))) return true;
  return edgesCross(left, right);
}

function rectRing(shape) {
  const { x, y, width, height } = shape;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

function pointInCircle(point, shape) {
  return Math.hypot(point.x - shape.x, point.y - shape.y) <= shape.radius + EPS;
}

function pointInEllipse(point, shape) {
  const rotation = ((shape.rotation ?? 0) * Math.PI) / 180;
  const dx = point.x - shape.x;
  const dy = point.y - shape.y;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  if (!(shape.radiusX > 0) || !(shape.radiusY > 0)) return false;
  return (localX * localX) / (shape.radiusX * shape.radiusX)
    + (localY * localY) / (shape.radiusY * shape.radiusY) <= 1 + EPS;
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  if (length <= EPS) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function shapeRing(shape) {
  if (!shape) return null;
  if (shape.kind === "rectangle") return rectRing(shape);
  if (shape.kind === "polygon" && Array.isArray(shape.points) && shape.points.length >= 3) return shape.points;
  return null;
}

function shapeContains(shape, footprint) {
  if (shape?.kind === "circle") return footprint.every((point) => pointInCircle(point, shape));
  if (shape?.kind === "ellipse") return footprint.every((point) => pointInEllipse(point, shape));
  const outer = shapeRing(shape);
  if (!outer || !ringContains(outer, footprint)) return false;
  for (const hole of shape.holes ?? []) {
    if (ringsOverlap(hole, footprint)) return false;
  }
  return true;
}

function shapeOverlaps(shape, footprint) {
  if (shape?.kind === "circle") {
    if (footprint.some((point) => pointInCircle(point, shape))) return true;
    if (pointInRing({ x: shape.x, y: shape.y }, footprint)) return true;
    for (let index = 0; index < footprint.length; index++) {
      const start = footprint[index];
      const end = footprint[(index + 1) % footprint.length];
      if (distanceToSegment({ x: shape.x, y: shape.y }, start, end) <= shape.radius + EPS) return true;
    }
    return false;
  }
  if (shape?.kind === "ellipse") return shapeContains(shape, footprint) || footprint.some((point) => pointInEllipse(point, shape));
  const outer = shapeRing(shape);
  if (!outer || !ringsOverlap(outer, footprint)) return false;
  for (const hole of shape.holes ?? []) {
    if (ringContains(hole, footprint)) return false;
  }
  return true;
}

function lineIntersect(first, second) {
  const x1 = first.a.x;
  const y1 = first.a.y;
  const x2 = first.b.x;
  const y2 = first.b.y;
  const x3 = second.a.x;
  const y3 = second.a.y;
  const x4 = second.b.x;
  const y4 = second.b.y;
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

function centroid(ring) {
  let x = 0;
  let y = 0;
  for (const point of ring) {
    x += point.x;
    y += point.y;
  }
  return { x: x / ring.length, y: y / ring.length };
}

function insetConvex(ring, margin) {
  const source = clockwise(ring);
  if (!(margin > 0) || source.length < 3) return source;
  const lines = [];
  for (let index = 0; index < source.length; index++) {
    const start = source[index];
    const end = source[(index + 1) % source.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < EPS) continue;
    const nx = -dy / length;
    const ny = dx / length;
    lines.push({
      a: { x: start.x + nx * margin, y: start.y + ny * margin },
      b: { x: end.x + nx * margin, y: end.y + ny * margin },
    });
  }
  if (lines.length < 3) return [centroid(source)];
  const next = [];
  for (let index = 0; index < lines.length; index++) {
    const hit = lineIntersect(lines[(index + lines.length - 1) % lines.length], lines[index]);
    if (!hit) return [centroid(source)];
    next.push(hit);
  }
  if (signedArea(next) <= EPS) return [centroid(source)];
  return next;
}

function convexHull(points) {
  const sorted = [];
  for (const point of points) {
    if (!sorted.some((other) => samePoint(other, point))) sorted.push({ x: point.x, y: point.y });
  }
  sorted.sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 2) return sorted;
  const cross = (origin, a, b) => (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);
  return hull.length >= 3 ? hull : sorted;
}

function rectangularFootprint(position, size) {
  return rectRing({
    x: position.x,
    y: position.y,
    width: spaces(position.width) * size,
    height: spaces(position.height) * size,
  });
}

/**
 * Foundry's hex size is the flat-to-flat span, so center to vertex is size / sqrt(3)
 * (a pointy hex ends up `size` wide and a flat one `size` tall).
 */
function hexVertices(cx, cy, radius, columns) {
  const start = columns ? Math.PI : -Math.PI / 2;
  const points = [];
  for (let index = 0; index < 6; index++) {
    const angle = start + (index * Math.PI) / 3;
    points.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }
  return points;
}

function hexCenters(position, size, columns, even) {
  const width = spaces(position.width);
  const height = spaces(position.height);
  const radius = size / Math.sqrt(3);
  const centers = [];
  if (!columns) {
    const originX = position.x + size / 2;
    const originY = position.y + radius;
    const rowStep = (size * Math.sqrt(3)) / 2;
    for (let row = 0; row < height; row++) {
      const shifted = even ? row % 2 === 0 : row % 2 === 1;
      for (let col = 0; col < width; col++) {
        centers.push({
          x: originX + col * size + (shifted ? size / 2 : 0),
          y: originY + row * rowStep,
        });
      }
    }
    return centers;
  }
  const originX = position.x + radius;
  const originY = position.y + size / 2;
  const colStep = (size * Math.sqrt(3)) / 2;
  for (let col = 0; col < width; col++) {
    const shifted = even ? col % 2 === 0 : col % 2 === 1;
    for (let row = 0; row < height; row++) {
      centers.push({
        x: originX + col * colStep,
        y: originY + row * size + (shifted ? size / 2 : 0),
      });
    }
  }
  return centers;
}

function occupiedRing(position, grid) {
  if (grid.type !== "hex") return rectangularFootprint(position, grid.size);
  const radius = grid.size / Math.sqrt(3);
  const points = hexCenters(position, grid.size, grid.columns, grid.even)
    .flatMap((center) => hexVertices(center.x, center.y, radius, grid.columns));
  return convexHull(points);
}

function levelIds(surface) {
  if (!Array.isArray(surface?.levelIds)) return [];
  return surface.levelIds.filter((id) => typeof id === "string" && id);
}

function finiteBases(levels) {
  const bases = [];
  for (const level of levels ?? []) {
    const base = readNumber(level?.base);
    if (level?.id && base != null) bases.push({ id: level.id, base });
  }
  return bases;
}

function usableSurfaces(surfaces) {
  return (surfaces ?? []).filter((surface) => {
    if (readNumber(surface?.elevation) == null) return false;
    return (surface.shapes ?? []).some((shape) => shapeRing(shape) || shape?.kind === "circle" || shape?.kind === "ellipse");
  });
}

function implicitGround(snapshot) {
  if ((snapshot.levels ?? []).length > 0) return false;
  if (snapshot.hasUnreadableFloors) return false;
  return true;
}

function trustworthyScene(snapshot) {
  if (implicitGround(snapshot)) return true;
  return finiteBases(snapshot.levels).length > 0 || usableSurfaces(snapshot.surfaces).length > 0;
}

function bandEnds(level) {
  if (!level) return null;
  const bottom = readBound(level.bottom) ?? readNumber(level.base);
  if (bottom == null) return null;
  const top = readBound(level.top) ?? Infinity;
  if (!(top >= bottom)) return null;
  return { bottom, top };
}

function inLevelBand(level, elevation) {
  const band = bandEnds(level);
  if (!band) return false;
  return elevation >= band.bottom - EPS && elevation <= band.top + EPS;
}

function startsAt(level, elevation) {
  const base = readNumber(level?.base);
  return base != null && Math.abs(base - elevation) <= EPS;
}

function levelAmong(ids, byId, elevation, tokenLevelId) {
  if (ids.length === 1) return ids[0];
  if (ids.includes(tokenLevelId)) return tokenLevelId;
  const started = ids.filter((id) => startsAt(byId.get(id), elevation));
  return started.length === 1 ? started[0] : null;
}

function highestLevel(ids, byId, elevation, tokenLevelId) {
  if (!ids.length) return null;
  const bottoms = ids.map((id) => bandEnds(byId.get(id))?.bottom ?? -Infinity);
  const highest = Math.max(...bottoms);
  const tied = ids.filter((_id, index) => bottoms[index] === highest);
  return levelAmong(tied, byId, elevation, tokenLevelId);
}

function levelsById(snapshot) {
  const levels = snapshot?.levels ?? [];
  return new Map(levels.filter((level) => level?.id).map((level) => [level.id, level]));
}

function containingIds(byId, elevation) {
  return [...byId.values()].filter((level) => inLevelBand(level, elevation)).map((level) => level.id);
}

function levelForElevation(snapshot, elevation, candidateIds, tokenLevelId) {
  const listed = [...new Set((candidateIds ?? []).filter((id) => typeof id === "string" && id))];
  const byId = levelsById(snapshot);
  const listedHit = listed.filter((id) => {
    const level = byId.get(id);
    return !bandEnds(level) || inLevelBand(level, elevation);
  });
  if (listedHit.length > 0) return highestLevel(listedHit, byId, elevation, tokenLevelId);
  return highestLevel(containingIds(byId, elevation), byId, elevation, tokenLevelId);
}

/**
 * Which level's walls apply at a point on a path. It stays the mover's level while
 * the elevation is inside it, and past that it's whatever level a floor at that
 * elevation would get.
 */
export function pathLevelAt(snapshot, elevation, moverLevelId) {
  const byId = levelsById(snapshot);
  const own = byId.get(moverLevelId);
  if (!own || !bandEnds(own) || inLevelBand(own, elevation)) return moverLevelId ?? null;
  return highestLevel(containingIds(byId, elevation), byId, elevation, moverLevelId) ?? moverLevelId ?? null;
}

function ownsBase(surface, level) {
  return readNumber(surface.elevation) === level.base && levelIds(surface).includes(level.id);
}

function baseChoice(lowest, snapshot, tokenLevelId) {
  const chosen = levelForElevation(snapshot, lowest[0].base, lowest.map((level) => level.id), tokenLevelId);
  return {
    elevation: lowest[0].base,
    levelId: chosen,
    owner: chosen,
    kind: "base",
  };
}

function cleanRing(points) {
  const ring = [];
  for (const point of points) {
    if (!ring.length || !samePoint(ring[ring.length - 1], point)) ring.push(point);
  }
  if (ring.length >= 2 && samePoint(ring[0], ring[ring.length - 1])) ring.pop();
  return ring;
}

function lineSide(a, b, point) {
  const value = orient(a, b, point);
  if (Math.abs(value) <= 1e-6) return 0;
  return value > 0 ? 1 : -1;
}

function segmentHit(p, q, a, b) {
  const hit = lineIntersect({ a: p, b: q }, { a, b });
  if (!hit) return null;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const length = dx * dx + dy * dy;
  if (length < 1e-12) return null;
  const t = ((hit.x - p.x) * dx + (hit.y - p.y) * dy) / length;
  if (t < -1e-6 || t > 1 + 1e-6) return null;
  return hit;
}

function chordOnSegment(ring, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const length = abx * abx + aby * aby;
  if (length < 1e-12) return false;
  let positive = false;
  let negative = false;
  const hits = [];
  for (const point of ring) {
    const side = lineSide(a, b, point);
    if (side > 0) positive = true;
    else if (side < 0) negative = true;
    else hits.push(point);
  }
  if (!positive || !negative) return false;
  for (let index = 0; index < ring.length; index++) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    if (!lineSide(a, b, start) && !lineSide(a, b, end)) continue;
    if (lineSide(a, b, start) && lineSide(a, b, end) && lineSide(a, b, start) !== lineSide(a, b, end)) {
      const hit = segmentHit(start, end, a, b);
      if (hit) hits.push(hit);
    }
  }
  if (hits.length < 2) return false;
  const params = hits.map((hit) => ((hit.x - a.x) * abx + (hit.y - a.y) * aby) / length);
  const minT = Math.min(...params);
  const maxT = Math.max(...params);
  return maxT > 1e-6 && minT < 1 - 1e-6;
}

function splitConvexByLine(ring, a, b) {
  const positive = [];
  const negative = [];
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const currentSide = lineSide(a, b, current);
    const nextSide = lineSide(a, b, next);
    if (currentSide >= 0) positive.push(current);
    if (currentSide <= 0) negative.push(current);
    if (currentSide && nextSide && currentSide !== nextSide) {
      const hit = segmentHit(current, next, a, b);
      if (hit) {
        positive.push(hit);
        negative.push(hit);
      }
    }
  }
  return [cleanRing(positive), cleanRing(negative)].filter((part) => part.length >= 3 && Math.abs(signedArea(part)) > 1e-4);
}

function unionCovers(footprint, shapes, depth = 0) {
  if (shapes.some((shape) => shapeContains(shape, footprint))) return true;
  if (depth > 16) return false;
  const area = Math.abs(signedArea(footprint));
  for (const shape of shapes) {
    const rings = [shapeRing(shape), ...(shape.holes ?? [])].filter((ring) => ring && ring.length >= 2);
    for (const ring of rings) {
      for (let index = 0; index < ring.length; index++) {
        const start = ring[index];
        const end = ring[(index + 1) % ring.length];
        if (!chordOnSegment(footprint, start, end)) continue;
        const parts = splitConvexByLine(footprint, start, end);
        if (parts.length < 2) continue;
        if (!parts.every((part) => Math.abs(signedArea(part)) < area - 1e-4)) continue;
        return parts.every((part) => unionCovers(part, shapes, depth + 1));
      }
    }
  }
  return false;
}

function surfaceFloor(group, footprint, snapshot, tokenLevelId) {
  const shapes = group.flatMap((surface) => surface.shapes ?? []);
  if (!unionCovers(footprint, shapes)) return null;
  const touching = group.filter((surface) => (surface.shapes ?? []).some((shape) => shapeOverlaps(shape, footprint)));
  const owners = [...new Set(touching.map((surface) => surface.owner ?? null))];
  const elevation = readNumber(group[0].elevation);
  return {
    elevation,
    owner: owners.length === 1 ? owners[0] : null,
    levelId: levelForElevation(snapshot, elevation, touching.flatMap((surface) => levelIds(surface)), tokenLevelId),
    kind: "surface",
  };
}

function surfaceFloors(surfaces, footprint, snapshot, tokenLevelId) {
  const groups = new Map();
  for (const surface of surfaces) {
    const elevation = readNumber(surface.elevation);
    const key = String(elevation);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(surface);
  }
  const floors = [];
  for (const group of groups.values()) {
    const floor = surfaceFloor(group, footprint, snapshot, tokenLevelId);
    if (floor) floors.push(floor);
  }
  return floors;
}

function floorsAt(snapshot, footprint, tokenLevelId) {
  const floors = [];
  const bases = finiteBases(snapshot.levels);
  const surfaces = usableSurfaces(snapshot.surfaces);
  if (bases.length) {
    const lowestElevation = Math.min(...bases.map((level) => level.base));
    const lowest = bases.filter((level) => level.base === lowestElevation);
    floors.push(baseChoice(lowest, snapshot, tokenLevelId));
    for (const level of bases) {
      if (level.base === lowestElevation) continue;
      if (surfaces.some((surface) => ownsBase(surface, level))) continue;
      floors.push({
        elevation: level.base,
        levelId: levelForElevation(snapshot, level.base, [level.id], tokenLevelId),
        owner: level.id,
        kind: "base",
      });
    }
  } else if (implicitGround(snapshot)) {
    floors.push({ elevation: 0, levelId: null, owner: null, kind: "ground" });
  }

  floors.push(...surfaceFloors(surfaces, footprint, snapshot, tokenLevelId));
  return floors;
}

function highestAtOrBelow(floors, elevation) {
  let best = null;
  for (const floor of floors) {
    if (floor.elevation > elevation) continue;
    if (!best || floor.elevation > best.elevation) {
      best = floor;
      continue;
    }
    if (floor.elevation === best.elevation && KIND_RANK[floor.kind] > KIND_RANK[best.kind]) best = floor;
  }
  return best;
}

function inBand(elevation, region) {
  const bottom = region.bottom == null ? null : readNumber(region.bottom);
  const top = region.top == null ? null : readNumber(region.top);
  if (region.bottom != null && bottom == null) return false;
  if (region.top != null && top == null) return false;
  if (bottom != null && elevation < bottom) return false;
  if (top != null && elevation > top) return false;
  return true;
}

function shapesOverlap(shapes, footprint) {
  return (shapes ?? []).some((shape) => shapeOverlaps(shape, footprint));
}

function transitionFlags(regions, footprint, elevation) {
  const flags = { changeLevel: false, teleportToken: false };
  for (const region of regions) {
    if (region.kind !== "changeLevel" && region.kind !== "teleportToken") continue;
    if (!inBand(elevation, region)) continue;
    if (!shapesOverlap(region.shapes, footprint)) continue;
    flags[region.kind] = true;
  }
  return flags;
}

function emptyResult(transitions = { changeLevel: false, teleportToken: false }) {
  return { trustworthy: false, supported: false, floor: null, transitions };
}

/**
 * `floor` is the highest floor at or below the token (null if there isn't one or we
 * can't read the scene's floors). `supported` just means the token is standing right on it.
 * @param {object} snapshot Plain scene copy from `snapshotFromScene`.
 * @param {object} position Token top-left in pixels, size in grid spaces, elevation, and level id.
 * @returns {{
 *   trustworthy: boolean,
 *   supported: boolean,
 *   floor: { elevation: number, levelId: string|null, owner: string|null, kind: "ground"|"base"|"surface" }|null,
 *   transitions: { changeLevel: boolean, teleportToken: boolean }
 * }}
 */
export function queryFloor(snapshot, position = {}) {
  if (!snapshot) return emptyResult();
  const grid = gridOf(snapshot.grid);
  const elevation = readNumber(position.elevation);
  const x = readNumber(position.x);
  const y = readNumber(position.y);
  if (elevation == null || x == null || y == null) return emptyResult();

  const placed = { ...position, x, y };
  const full = occupiedRing(placed, grid);
  if (full.length < 3) return emptyResult();
  const inset = insetConvex(full, grid.size * QUARTER_SPACE);
  const transitions = transitionFlags(snapshot.transitions, full, elevation);
  if (!trustworthyScene(snapshot)) return emptyResult(transitions);
  const floor = highestAtOrBelow(floorsAt(snapshot, inset, position.levelId ?? null), elevation);
  return {
    trustworthy: true,
    supported: floor != null && floor.elevation === elevation,
    floor,
    transitions,
  };
}
