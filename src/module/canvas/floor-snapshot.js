/**
 * Copies the scene into the plain snapshot `queryFloor` reads (just numbers and
 * shapes, no document references).
 */

import { queryFloor, readBound, readNumber } from "./floor-query.js";

function firstNumber(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function firstPositive(...values) {
  for (const value of values) {
    const number = readNumber(value);
    if (number != null && number > 0) return number;
  }
  return 1;
}

function gridKind(grid) {
  if (grid.isGridless) return "gridless";
  return grid.isHexagonal ? "hex" : "square";
}

function gridFromScene(scene) {
  const grid = scene?.grid ?? {};
  const type = gridKind(grid);
  const size = readNumber(grid.size);
  const distance = readNumber(grid.distance);
  return {
    size: size != null && size > 0 ? size : 1,
    distance: distance != null && distance > 0 ? distance : 1,
    type,
    columns: type === "hex" && grid.columns === true,
    even: type === "hex" && grid.even === true,
  };
}

function pairPoints(points) {
  if (!Array.isArray(points) || points.length < 2) return [];
  if (typeof points[0] === "object") {
    const paired = [];
    for (const point of points) {
      const x = readNumber(point?.x);
      const y = readNumber(point?.y);
      if (x == null || y == null) continue;
      paired.push({ x, y });
    }
    return paired;
  }
  const paired = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    const x = readNumber(points[index]);
    const y = readNumber(points[index + 1]);
    if (x == null || y == null) continue;
    paired.push({ x, y });
  }
  return paired;
}

function rectPoints(x, y, width, height) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

// degrees to radians leaves a tiny residue on right angles, so we round it off
function roundCoord(value) {
  const rounded = Math.round(value * 1e9) / 1e9;
  return rounded === 0 ? 0 : rounded;
}

function rotateRect(x, y, width, height, degrees) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return rectPoints(x, y, width, height).map((point) => {
    const dx = point.x - cx;
    const dy = point.y - cy;
    return {
      x: roundCoord(cx + dx * cos - dy * sin),
      y: roundCoord(cy + dx * sin + dy * cos),
    };
  });
}

function normalizeShape(shape) {
  const type = shape?.type;
  if (type === "rectangle") {
    const x = readNumber(shape.x);
    const y = readNumber(shape.y);
    const width = readNumber(shape.width);
    const height = readNumber(shape.height);
    if (x == null || y == null || width == null || height == null) return null;
    const rotation = readNumber(shape.rotation) ?? 0;
    if (rotation) return { kind: "polygon", points: rotateRect(x, y, width, height, rotation), hole: shape.hole === true };
    return { kind: "rectangle", x, y, width, height, hole: shape.hole === true };
  }
  if (type === "circle") {
    const x = readNumber(shape.x);
    const y = readNumber(shape.y);
    const radius = readNumber(shape.radius);
    if (x == null || y == null || radius == null) return null;
    return { kind: "circle", x, y, radius, hole: shape.hole === true };
  }
  if (type === "ellipse") {
    const x = readNumber(shape.x);
    const y = readNumber(shape.y);
    const radiusX = readNumber(shape.radiusX);
    const radiusY = readNumber(shape.radiusY);
    if (x == null || y == null || radiusX == null || radiusY == null) return null;
    return {
      kind: "ellipse",
      x,
      y,
      radiusX,
      radiusY,
      rotation: readNumber(shape.rotation) ?? 0,
      hole: shape.hole === true,
    };
  }
  if (type === "polygon") {
    const points = pairPoints(shape.points);
    if (points.length < 3) return null;
    return { kind: "polygon", points, hole: shape.hole === true };
  }
  return null;
}

function holeRing(shape) {
  if (shape.kind === "rectangle") return rectPoints(shape.x, shape.y, shape.width, shape.height);
  if (shape.kind === "polygon") return shape.points;
  return null;
}

// Foundry cuts a hole out of every shape listed before it (a solid listed after it gets added back whole).
function groupShapes(shapes) {
  const solids = [];
  for (const shape of shapes) {
    const ring = shape.hole ? holeRing(shape) : null;
    if (shape.hole && ring) {
      for (const host of solids) {
        host.holes ??= [];
        host.holes.push(ring);
      }
      continue;
    }
    if (shape.hole) continue;
    const solid = { ...shape };
    delete solid.hole;
    solids.push(solid);
  }
  return solids;
}

// if we can't copy a shape (like a grid or emanation shape, or a round hole) then we read the region's polygon tree
function shapesFromRegion(region) {
  const normalized = region.shapes.map(normalizeShape);
  if (normalized.every((shape) => shape && (!shape.hole || holeRing(shape)))) return groupShapes(normalized);
  const shapes = [];
  for (const node of region.polygonTree) {
    if (node.isHole) continue;
    const points = pairPoints(node.points);
    if (points.length < 3) continue;
    const holes = node.children.map((child) => pairPoints(child.points)).filter((ring) => ring.length >= 3);
    shapes.push(holes.length ? { kind: "polygon", points, holes } : { kind: "polygon", points });
  }
  return shapes;
}

function levelIdsFrom(region) {
  return [...region.levels];
}

function elevationBand(region) {
  const elevation = region?.elevation ?? {};
  return {
    bottom: readNumber(elevation.bottom),
    top: readNumber(elevation.top),
  };
}

function levelsFromScene(scene, state) {
  const levels = [];
  for (const level of scene.levels) {
    const elevation = level.elevation;
    const explicitBase = readNumber(elevation.base);
    const bottom = readBound(elevation.bottom);
    const top = readBound(elevation.top);
    const base = explicitBase != null ? explicitBase : bottom;
    if (base == null) {
      state.unreadable = true;
      continue;
    }
    levels.push({
      id: level.id,
      base,
      bottom: bottom != null ? bottom : base,
      top,
    });
  }
  return levels;
}

function surfacesFromScene(scene, state) {
  let raw = [];
  try {
    // read move surfaces from every level (a level filter would drop the floors on other levels)
    raw = scene.getSurfaces({ type: "move" });
  } catch {
    state.unreadable = true;
    return [];
  }
  const surfaces = [];
  for (const surface of raw) {
    const elevation = readNumber(surface.elevation);
    const shapes = shapesFromRegion(surface.region);
    if (elevation == null || !shapes.length) {
      state.unreadable = true;
      continue;
    }
    surfaces.push({
      elevation,
      levelIds: levelIdsFrom(surface.region),
      owner: surface.region.id,
      shapes,
    });
  }
  return surfaces;
}

function transitionsFromScene(scene) {
  const transitions = [];
  for (const region of scene.regions) {
    const kinds = new Set();
    for (const behavior of region.behaviors) {
      if (behavior.disabled) continue;
      if (behavior.type === "changeLevel" || behavior.type === "teleportToken") kinds.add(behavior.type);
    }
    if (!kinds.size) continue;
    const shapes = shapesFromRegion(region);
    if (!shapes.length) continue;
    const band = elevationBand(region);
    for (const kind of kinds) {
      transitions.push({ kind, shapes, bottom: band.bottom, top: band.top });
    }
  }
  return transitions;
}

export function snapshotFromScene(scene) {
  const state = { unreadable: false };
  const levels = levelsFromScene(scene, state);
  const surfaces = surfacesFromScene(scene, state);
  return {
    grid: gridFromScene(scene),
    levels,
    surfaces,
    transitions: transitionsFromScene(scene),
    hasUnreadableFloors: state.unreadable,
  };
}

const NO_SCENE = {
  trustworthy: false,
  supported: false,
  floor: null,
  transitions: { changeLevel: false, teleportToken: false },
};

export function queryFloorForToken(tokenDoc) {
  const scene = tokenDoc?.parent ?? null;
  if (!scene) return NO_SCENE;
  const source = tokenDoc?._source ?? {};
  // `_source.elevation` is what the last move committed (the getter follows the animation)
  const rawElevation = source.elevation ?? tokenDoc?.elevation;
  const elevation = rawElevation == null || rawElevation === "" ? 0 : Number(rawElevation);
  return queryFloor(snapshotFromScene(scene), {
    x: firstNumber(source.x, tokenDoc?.x, 0),
    y: firstNumber(source.y, tokenDoc?.y, 0),
    width: firstPositive(source.width, tokenDoc.width),
    height: firstPositive(source.height, tokenDoc.height),
    elevation,
    levelId: tokenDoc?.level ?? source.level ?? null,
  });
}
