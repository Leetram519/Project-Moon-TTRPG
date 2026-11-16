
function tokenCenter(token) {
  if (!token) return null;
  if (token.center && Number.isFinite(token.center.x) && Number.isFinite(token.center.y)) {
    return token.center;
  }
  if (token.object?.center) return token.object.center;
  const point = token.getCenterPoint();
  if (Number.isFinite(point.x) && Number.isFinite(point.y)) return point;
  return null;
}

export function tokenIdOf(token) {
  return token?.id ?? token?.document?.id ?? token?.object?.id ?? null;
}

export function normalizeToken(token) {
  if (!token) return null;
  if (token.document && token.center && token.documentName !== "Token") return token;
  if (token.object) return token.object;
  const id = tokenIdOf(token);
  const placed = id ? canvas.tokens?.get(id) : null;
  return placed ?? token;
}

function tokenActor(token) {
  return token?.actor ?? token?.document?.actor ?? token?.object?.actor ?? null;
}

function tokenBelongsToActor(token, actor) {
  if (!token || !actor) return false;
  const owned = tokenActor(token);
  if (owned === actor) return true;
  if (actor.isToken) return tokenIdOf(token) === tokenIdOf(actor.token);
  const actorId = actor.id;
  const ownedId = owned?.id ?? token.actorId ?? token.document?.actorId ?? null;
  return Boolean(actorId && ownedId && actorId === ownedId);
}

export function resolveOriginatingToken(actor, provided = null) {
  const supplied = normalizeToken(provided);
  if (supplied && tokenBelongsToActor(supplied, actor)) return supplied;
  if (actor?.token) return normalizeToken(actor.token);
  return null;
}

function gridForToken(token) {
  const scene = token?.document?.parent ?? token?.scene ?? token?.parent ?? null;
  return scene?.grid ?? canvas.grid;
}

function tokenGridOffset(token) {
  const placed = normalizeToken(token);
  const grid = gridForToken(placed);
  if (!grid) return null;
  const center = tokenCenter(placed);
  if (!center) return null;
  const offset = grid.getOffset(center);
  if (!offset || !Number.isFinite(offset.i) || !Number.isFinite(offset.j)) return null;
  return { i: offset.i, j: offset.j };
}

export function gridSpan(value) {
  const size = Math.trunc(Number(value));
  return size > 0 ? size : 1;
}

/** Squares between two spans on one axis. Overlapping is 0 and touching is 1. */
export function gridSpanGap(startA, spanA, startB, spanB) {
  const endA = startA + gridSpan(spanA) - 1;
  const endB = startB + gridSpan(spanB) - 1;
  if (endA < startB) return startB - endA;
  if (endB < startA) return startA - endB;
  return 0;
}

/**
 * Turns a top-left pixel and a size in squares into `{ row, col, rows, cols }` (`i` is the row).
 * On square grids we read the offset at the center of the top-left square (since the exact corner can land on the neighbouring square).
 */
export function gridBoxAt(grid, { x, y, width = 1, height = 1 } = {}) {
  if (!grid) return null;
  const left = Number(x);
  const top = Number(y);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  const rawSize = Number(grid.size);
  const size = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 0;
  const cols = gridSpan(width);
  const rows = gridSpan(height);
  const square = grid.isSquare;
  const point = square
    ? { x: left + size / 2, y: top + size / 2 }
    : { x: left + (cols * size) / 2, y: top + (rows * size) / 2 };
  const offset = grid.getOffset(point);
  if (!offset || !Number.isFinite(offset.i) || !Number.isFinite(offset.j)) return null;
  return square
    ? { row: offset.i, col: offset.j, rows, cols }
    : { row: offset.i, col: offset.j, rows: 1, cols: 1 };
}

/**
 * The squares a token takes up, from its committed position and size. Reads
 * `_source` because Token#animate merges every frame into the TokenDocument (so
 * `x` and `width` are in-between values while it slides or resizes).
 */
export function tokenGridBox(token) {
  const placed = normalizeToken(token);
  const grid = gridForToken(placed);
  if (!grid) return null;
  const doc = placed?.document ?? placed;
  const source = doc?._source ?? doc;
  if (grid.isSquare) {
    const box = gridBoxAt(grid, { x: source?.x, y: source?.y, width: source?.width, height: source?.height });
    if (box) return box;
  }
  const center = tokenGridOffset(placed);
  return center ? { row: center.i, col: center.j, rows: 1, cols: 1 } : null;
}

export function gridBoxGap(a, b) {
  if (!a || !b) return null;
  if (![a.row, a.col, b.row, b.col].every(Number.isFinite)) return null;
  return Math.max(
    gridSpanGap(a.row, a.rows, b.row, b.rows),
    gridSpanGap(a.col, a.cols, b.col, b.cols),
  );
}

/** Squares between two tokens' occupied squares (adjacent is 1). */
export function tokenDistanceSquares(fromToken, toToken) {
  return gridBoxGap(tokenGridBox(fromToken), tokenGridBox(toToken));
}
