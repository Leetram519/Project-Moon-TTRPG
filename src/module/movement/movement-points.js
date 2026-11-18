function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeMovementPoint(raw) {
  if (!raw || typeof raw !== "object") return null;
  const x = finite(raw.x);
  const y = finite(raw.y);
  if (x == null || y == null) return null;
  return { x, y, elevation: finite(raw.elevation) ?? 0 };
}

export function normalizeMovementReference(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.type === "document") {
    const uuid = typeof raw.uuid === "string" ? raw.uuid.trim() : "";
    return uuid ? { type: "document", uuid } : null;
  }
  if (raw.type === "point") {
    const point = normalizeMovementPoint(raw);
    return point ? { type: "point", ...point } : null;
  }
  return null;
}

export function snapshotTokenOrigin(tokenDoc) {
  const source = tokenDoc?._source ?? tokenDoc;
  const point = normalizeMovementPoint(source);
  if (!point) return null;
  return {
    ...point,
    width: finite(source.width),
    height: finite(source.height),
    level: source.level ?? null,
  };
}

function sameRounded(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return left === right;
  return Math.round(left) === Math.round(right);
}

function sameElevation(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return left === right;
  return Math.abs(left - right) <= 1e-6;
}

/**
 * x and y get rounded the way Foundry cleans its integer fields, and elevation
 * allows 1e-6. A recorded level has to match (even if the token doesn't have one).
 */
export function positionsMatch(expected, actual) {
  const a = normalizeMovementPoint(expected);
  const b = normalizeMovementPoint(actual);
  if (!a || !b) return false;
  if (!sameRounded(a.x, b.x) || !sameRounded(a.y, b.y) || !sameElevation(a.elevation, b.elevation)) return false;
  for (const key of ["width", "height"]) {
    const left = finite(expected?.[key]);
    const right = finite(actual?.[key]);
    if (left != null && right != null && left !== right) return false;
  }
  const leftLevel = expected?.level ?? null;
  const rightLevel = actual?.level ?? null;
  if (leftLevel != null && leftLevel !== rightLevel) return false;
  return true;
}

export function gridUnit(grid) {
  const unit = Number(grid?.distance);
  return unit > 0 ? unit : 1;
}

/** Clamps the height on this cell to what `measure` still accepts, stepping back toward the origin's elevation. */
export function clampElevationToBudget(origin, point, elevation, maxSpaces, grid, measure) {
  const unit = gridUnit(grid);
  const base = Number(origin?.elevation) || 0;
  const budget = Math.max(0, Math.floor(Number(maxSpaces) || 0));
  const requested = Number.isFinite(Number(elevation)) ? Number(elevation) : base;
  const at = (value) => measure(origin, {
    x: point?.x ?? origin?.x ?? 0,
    y: point?.y ?? origin?.y ?? 0,
    elevation: value,
  });
  if (at(requested) <= budget) return requested;
  const direction = requested > base ? -1 : 1;
  const limit = Math.ceil(Math.abs(requested - base) / unit) + 1;
  let cursor = requested;
  for (let step = 0; step < limit; step += 1) {
    cursor += direction * unit;
    const crossed = direction < 0 ? cursor < base - 1e-6 : cursor > base + 1e-6;
    if (crossed) break;
    if (at(cursor) <= budget) return cursor;
  }
  return base;
}
