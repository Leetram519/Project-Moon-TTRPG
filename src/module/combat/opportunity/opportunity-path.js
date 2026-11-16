import {
  normalizeOpportunityCell,
  opportunityPointWithTokenSize,
  opportunityStepSquares,
  OPPORTUNITY_PATH_WARNINGS,
  readGridSize,
} from "./opportunity-movement.js";
import { tokenDocument, warnAbnormal } from "../../shared-helpers.js";

const OPPORTUNITY_PATH_SOURCES = {
  COMPLETE_PATH: "completePath",
  GET_COMPLETE_MOVEMENT_PATH: "getCompleteMovementPath",
  WAYPOINTS: "waypoints",
  NONE: "none",
};

const OPPORTUNITY_PATH_ADAPTER_WARNINGS = {
  NO_PATH: "no-path",
};

/** `sourcePathIndex` for the origin cell we prepend (it isn't on the Foundry path). */
const ANALYSIS_ORIGIN_SOURCE_INDEX = -1;

function asPointList(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.waypoints)) return value.waypoints;
  if (Array.isArray(value?.path)) return value.path;
  return [];
}

function serializeRawWaypoint(point) {
  if (!point || typeof point !== "object") return null;
  const raw = {
    x: Number.isFinite(Number(point.x)) ? Number(point.x) : undefined,
    y: Number.isFinite(Number(point.y)) ? Number(point.y) : undefined,
    elevation: point.elevation,
    width: point.width,
    height: point.height,
    depth: point.depth,
    action: point.action,
    forced: point.forced === true ? true : undefined,
    teleport: point.teleport === true ? true : undefined,
    checkpoint: point.checkpoint,
    explicit: point.explicit,
    snapped: point.snapped,
  };
  return raw;
}

/**
 * Uses `completePath` if we have it, otherwise `getCompleteMovementPath` fills
 * in the steps between the waypoints, and the raw waypoints are the last fallback.
 */
function resolveSourcePoints({ token, waypoints, completePath, origin } = {}) {
  const complete = asPointList(completePath);
  if (complete.length >= 1) {
    return { points: complete, source: OPPORTUNITY_PATH_SOURCES.COMPLETE_PATH };
  }

  const userWaypoints = asPointList(waypoints);
  const doc = tokenDocument(token);
  if (doc && userWaypoints.length >= 1) {
    try {
      const expanded = doc.getCompleteMovementPath(expanderInputFor(userWaypoints, origin));
      const points = asPointList(expanded);
      if (points.length >= 1) {
        return {
          points,
          source: OPPORTUNITY_PATH_SOURCES.GET_COMPLETE_MOVEMENT_PATH,
        };
      }
    } catch (error) {
      warnAbnormal("getCompleteMovementPath failed; using raw waypoints", {
        error,
      });
    }
  }

  if (userWaypoints.length >= 1) {
    return { points: userWaypoints, source: OPPORTUNITY_PATH_SOURCES.WAYPOINTS };
  }

  return { points: [], source: OPPORTUNITY_PATH_SOURCES.NONE };
}

export function recordedElevationsDiffer(a, b) {
  const left = Number(a?.elevation);
  const right = Number(b?.elevation);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return left !== right;
}

function sameCell(a, b) {
  return a && b && a.i === b.i && a.j === b.j && a.elevationSquare === b.elevationSquare;
}

function matchUserWaypointIndex(cell, userCells) {
  if (!cell || !userCells.length) return null;
  for (let index = 0; index < userCells.length; index++) {
    const user = userCells[index];
    if (!sameCell(user, cell)) continue;
    return index;
  }
  return null;
}

function segmentWaypointIndex(pathIndex, userCells, cells) {
  const exact = matchUserWaypointIndex(cells[pathIndex], userCells);
  if (exact != null) return exact;
  for (let index = 0; index < userCells.length; index++) {
    const user = userCells[index];
    if (!user) continue;
    const found = cells.findIndex((cell) => sameCell(cell, user));
    if (found >= pathIndex) return index;
  }
  return userCells.length ? userCells.length - 1 : null;
}

function samePoint(a, b) {
  if (!a || !b) return false;
  if (recordedElevationsDiffer(a, b)) return false;
  if (Number.isFinite(Number(a.i)) && Number.isFinite(Number(b.i))
    && Number.isFinite(Number(a.j)) && Number.isFinite(Number(b.j))) {
    return Number(a.i) === Number(b.i) && Number(a.j) === Number(b.j);
  }
  const ax = Number(a.x);
  const ay = Number(a.y);
  const bx = Number(b.x);
  const by = Number(b.y);
  if (![ax, ay, bx, by].every(Number.isFinite)) return false;
  return Math.round(ax) === Math.round(bx) && Math.round(ay) === Math.round(by);
}

function inferOpportunityOrigin(token, explicit) {
  if (explicit) return explicit;
  const doc = tokenDocument(token);
  if (!doc) return null;
  const source = doc._source ?? doc;
  if (!Number.isFinite(Number(source.x)) && !Number.isFinite(Number(source.i))) return null;
  return {
    x: source.x,
    y: source.y,
    i: source.i,
    j: source.j,
    elevation: source.elevation,
    width: source.width,
    height: source.height,
    depth: source.depth,
  };
}

function expanderInputFor(waypoints, origin) {
  if (!origin || !waypoints.length) return waypoints;
  if (samePoint(waypoints[0], origin)) return waypoints;
  return [origin, ...waypoints];
}

/**
 * Foundry's complete paths often leave out the Token's current cell, so we add
 * it to the front if it's missing (the committed waypoints don't change).
 */
function ensureOpportunityAnalysisOrigin(cells, origin, options = {}) {
  const list = Array.isArray(cells) ? cells : [];
  if (!origin) return list;
  const originCell = normalizeOpportunityCell(origin, options);
  if (!originCell) return list;
  if (list.length && sameCell(list[0], originCell)) return list;
  return [{
    ...originCell,
    sourcePathIndex: ANALYSIS_ORIGIN_SOURCE_INDEX,
    sourceWaypointIndex: null,
    analysisOrigin: true,
    rawWaypoint: serializeRawWaypoint(origin),
  }, ...list];
}

/**
 * Turns Foundry v14 waypoints or a complete constrained path into the ordered
 * cells `analyzeOpportunityMovement` wants. Each cell keeps its pixel position
 * and source indexes so we can map `pauseAt` and `exitTo` back to Foundry points.
 */
export function normalizeFoundryOpportunityPath({
  token,
  waypoints,
  completePath,
  origin,
  grid,
  gridSize,
} = {}) {
  const warnings = [];
  const options = { grid, gridSize: gridSize ?? readGridSize({ grid, gridSize }) };
  const userWaypoints = asPointList(waypoints);
  const originPoint = opportunityPointWithTokenSize(inferOpportunityOrigin(token, origin), token);
  const resolved = resolveSourcePoints({
    token,
    waypoints: userWaypoints,
    completePath,
    origin: originPoint,
  });

  if (!resolved.points.length) {
    warnings.push(OPPORTUNITY_PATH_ADAPTER_WARNINGS.NO_PATH);
    warnAbnormal("no usable Foundry movement path", {
      source: resolved.source,
      waypointCount: userWaypoints.length,
      completeCount: asPointList(completePath).length,
    });
    return {
      cells: [],
      source: resolved.source,
      waypoints: userWaypoints,
      warnings,
    };
  }

  const userCells = userWaypoints.map((point) => normalizeOpportunityCell(
    opportunityPointWithTokenSize(point, token),
    options,
  ));
  const built = [];

  for (let sourcePathIndex = 0; sourcePathIndex < resolved.points.length; sourcePathIndex++) {
    const point = resolved.points[sourcePathIndex];
    const cell = normalizeOpportunityCell(opportunityPointWithTokenSize(point, token), options);
    if (!cell) {
      warnings.push(OPPORTUNITY_PATH_WARNINGS.MISSING_GRID);
      warnAbnormal("Foundry path point could not be normalized", {
        sourcePathIndex,
        source: resolved.source,
        gridSize: options.gridSize,
      });
      return {
        cells: [],
        source: resolved.source,
        waypoints: userWaypoints,
        warnings,
      };
    }

    if (built.length && sameCell(built[built.length - 1], cell)) continue;

    built.push({
      ...cell,
      sourcePathIndex,
      sourceWaypointIndex: matchUserWaypointIndex(cell, userCells),
      forced: point?.forced === true,
      teleport: point?.teleport === true,
      action: point?.action,
      snapped: point?.snapped,
      explicit: point?.explicit,
      rawWaypoint: serializeRawWaypoint(point),
    });
  }

  const cells = ensureOpportunityAnalysisOrigin(built, originPoint, options);

  if (cells.length < 2) {
    warnings.push(OPPORTUNITY_PATH_ADAPTER_WARNINGS.NO_PATH);
    warnAbnormal("no usable Foundry movement path", {
      source: resolved.source,
      waypointCount: userWaypoints.length,
      completeCount: asPointList(completePath).length,
    });
    return {
      cells: [],
      source: resolved.source,
      waypoints: userWaypoints,
      warnings,
    };
  }

  for (let index = 0; index < cells.length; index++) {
    if (cells[index].sourceWaypointIndex == null) {
      cells[index].sourceWaypointIndex = segmentWaypointIndex(index, userCells, cells);
    }
  }

  for (let index = 1; index < cells.length; index++) {
    const step = opportunityStepSquares(cells[index - 1], cells[index]);
    if (step != null && step > 1) {
      warnings.push(OPPORTUNITY_PATH_WARNINGS.PATH_NOT_STEPPED);
      warnAbnormal("complete path still has an unstepped jump; that crossing is skipped", {
        pathIndex: index - 1,
        step,
        source: resolved.source,
        snapped: cells[index]?.snapped,
      });
      break;
    }
  }

  return {
    cells,
    source: resolved.source,
    waypoints: userWaypoints,
    warnings,
  };
}
