/**
 * Lets you pick a cell on the canvas. The caller gives the distance measure and what to draw on hover.
 * If the prepare step no longer matches what the hover showed then you have to click the same cell again.
 */

import { clampElevationToBudget, gridUnit } from "../movement/movement-points.js";
import { planSquaresBetween } from "../movement/movement-resolve.js";
import { localize } from "../shared-helpers.js";

const PICKER_REACH_LAYER = "pmttrpg-point-picker-reach";
const PICKER_HOVER_LAYER = "pmttrpg-point-picker-hover";

const REACH_COLOR = 0x2f6f4e;
const VALID_COLOR = 0x33bb66;
const INVALID_COLOR = 0xe23d28;
const PATH_COLOR = 0xf4f1e8;
const MARK_COLOR = 0xf4f1e8;
const CONTACT_COLOR = 0xe23d28;

const STEPS = {
  arrowup: [-1, 0],
  arrowdown: [1, 0],
  arrowleft: [0, -1],
  arrowright: [0, 1],
  w: [-1, 0],
  keyw: [-1, 0],
  s: [1, 0],
  keys: [1, 0],
  a: [0, -1],
  keya: [0, -1],
  d: [0, 1],
  keyd: [0, 1],
};

let openPick = null;

function offsetOf(point, grid) {
  return grid.getOffset({ x: point.x, y: point.y });
}

function pointFromOffset(offset, grid, elevation) {
  const { x, y } = grid.getTopLeftPoint(offset);
  return { x, y, elevation };
}

export function snapPointToCell(point, grid, elevation = 0) {
  return pointFromOffset(offsetOf(point, grid), grid, elevation);
}

export function gridSpacesBetween(a, b, grid) {
  const from = offsetOf(a, grid);
  const to = offsetOf(b, grid);
  return Math.max(Math.abs(from.i - to.i), Math.abs(from.j - to.j));
}

function cellsInReach(origin, maxSpaces, grid, measure, elevation = origin?.elevation ?? 0) {
  const budget = Math.floor(Number(maxSpaces));
  if (!Number.isFinite(budget) || budget < 0) return [];
  const originOffset = offsetOf(origin, grid);
  const cells = [];
  for (let row = -budget; row <= budget; row += 1) {
    for (let column = -budget; column <= budget; column += 1) {
      const point = pointFromOffset({ i: originOffset.i + row, j: originOffset.j + column }, grid, elevation);
      if (measure(origin, point) <= budget) cells.push(point);
    }
  }
  return cells;
}

function pickerElevationForKey(elevation, key, grid) {
  const name = String(key ?? "").toLowerCase();
  if (name === "e" || name === "keye") return (Number(elevation) || 0) + gridUnit(grid);
  if (name === "q" || name === "keyq") return (Number(elevation) || 0) - gridUnit(grid);
  return null;
}

function editableTarget(target) {
  const tag = target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target?.isContentEditable === true;
}

function keyStep(event) {
  const key = event.key.toLowerCase();
  const code = event.code.toLowerCase();
  return STEPS[key] ?? STEPS[code] ?? null;
}

function cellKey(cell) {
  return `${cell.x}:${cell.y}:${cell.elevation}`;
}

function cellCenter(cell, grid) {
  const size = Number(grid?.size) || 1;
  return { x: cell.x + size / 2, y: cell.y + size / 2 };
}

function claim(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function labelText(description) {
  const label = description?.label ?? {};
  const chips = (label.chips ?? []).map((chip) => chip?.text).filter(Boolean);
  const chipLine = chips.join(" · ");
  return [label.title, ...(label.lines ?? []), chipLine, label.hint].filter((line) => line).join("\n");
}

function withLines(description, extra) {
  const label = description?.label ?? { title: "", lines: [], chips: [] };
  const lines = [...(label.lines ?? [])];
  for (const line of extra) {
    if (line && !lines.includes(line)) lines.push(line);
  }
  return { ...description, label: { ...label, lines } };
}

function shownDescription(description, { changed = false } = {}) {
  const shown = withLines(description ?? {}, changed ? [localize("PMTTRPG.PlannedMovement.ChangedByEffect")] : []);
  return { ...shown, label: { ...shown.label, hint: localize("PMTTRPG.PlannedMovement.PickPointHint") } };
}

function invalidDescription(reasonKey = "PMTTRPG.PlannedMovement.PickOutOfRange") {
  return {
    valid: false,
    reasonKey,
    signature: null,
    path: [],
    marks: [],
    ghost: null,
    label: {
      title: "",
      lines: [localize(reasonKey)],
      chips: [],
    },
  };
}

function makeGraphics() {
  const graphics = new PIXI.Graphics();
  graphics.eventMode = "none";
  return graphics;
}

function drawPolyline(graphics, points) {
  if (points.length < 2) return;
  graphics.lineStyle(3, PATH_COLOR, 0.95);
  graphics.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) graphics.lineTo(points[index].x, points[index].y);
}

function drawDot(graphics, x, y, radius, color) {
  graphics.beginFill(color, 0.95);
  graphics.drawCircle(x, y, radius);
  graphics.endFill();
}

function drawCross(graphics, x, y, size) {
  graphics.lineStyle(2, CONTACT_COLOR, 1);
  graphics.moveTo(x - size, y - size);
  graphics.lineTo(x + size, y + size);
  graphics.moveTo(x + size, y - size);
  graphics.lineTo(x - size, y + size);
}

function clearContainer(container) {
  for (const child of container.removeChildren()) child.destroy();
}

function ghostSprite(token, ghost, grid) {
  const texture = token?.texture;
  if (!texture || !ghost) return null;
  const sprite = new PIXI.Sprite(texture);
  sprite.width = (Number(token.document.width) || 1) * grid.size;
  sprite.height = (Number(token.document.height) || 1) * grid.size;
  sprite.alpha = 0.5;
  sprite.x = ghost.x;
  sprite.y = ghost.y;
  sprite.anchor.set(0, 0);
  sprite.eventMode = "none";
  sprite.pickerMark = "ghost";
  return sprite;
}

function labelNode(text, cell, grid) {
  if (!text) return null;
  const { PreciseText } = foundry.canvas.containers;
  const label = new PreciseText(text, PreciseText.getTextStyle({ fontSize: 14, align: "center" }));
  const center = cellCenter(cell, grid);
  label.x = center.x;
  label.y = center.y - 8;
  label.anchor.set(0.5, 1);
  label.eventMode = "none";
  label.pickerMark = "label";
  return label;
}

function labelBackdrop(label) {
  const { width, height } = label;
  if (!width || !height) return null;
  const graphics = makeGraphics();
  const pad = 6;
  const x = label.x - width / 2 - pad;
  const y = label.y - height - pad;
  graphics.beginFill(0x000000, 0.6);
  graphics.drawRoundedRect(x, y, width + pad * 2, height + pad * 2, 6);
  graphics.endFill();
  graphics.pickerMark = "label-backdrop";
  return graphics;
}

/**
 * `validate` replaces the reach test for each cell (a refusal shows its `reasonKey`).
 * `clampHeight` gives the height a cell allows for a requested elevation and defaults to the budget clamp.
 * @returns {Promise<{x:number,y:number,elevation:number}|null>}
 */
export async function pickCanvasPoint({
  anchorTokenId = null,
  origin = null,
  maxSpaces = 0,
  measure = null,
  describe = null,
  prepare = null,
  validate = null,
  clampHeight = null,
} = {}) {
  openPick?.cancel(null);
  let resolvePick;
  const done = new Promise((resolve) => { resolvePick = resolve; });
  const session = { open: true, cleanup: () => {}, cancel: null };
  const closePick = (target, value) => {
    if (!target.open) return;
    target.open = false;
    target.cleanup();
    if (openPick === target) openPick = null;
    resolvePick(value);
  };
  session.cancel = (value) => closePick(session, value);
  openPick = session;

  if (!canvas.ready || !origin) {
    closePick(session, null);
    return done;
  }

  const grid = canvas.grid;
  const gridLayer = canvas.interface.grid;
  const measureFn = typeof measure === "function"
    ? measure
    : (from, to) => planSquaresBetween(from, to, grid);
  const clampToCell = typeof clampHeight === "function"
    ? clampHeight
    : (point, next) => clampElevationToBudget(origin, point, next, maxSpaces, grid, measureFn);
  const square = grid.isSquare;
  let elevation = Number(origin.elevation) || 0;
  let lastRaw = null;
  let keyboardCell = null;
  let pointerOwned = true;
  let armed = null;
  let busy = false;
  let reachElevation = null;
  const cache = new Map();

  const currentCell = () => {
    const raw = !pointerOwned && keyboardCell ? keyboardCell : (lastRaw ?? origin);
    return snapPointToCell(raw, grid, elevation);
  };

  const overlay = new PIXI.Container();
  overlay.eventMode = "none";
  overlay.interactive = false;
  overlay.interactiveChildren = false;
  canvas.controls.addChild(overlay);

  const token = () => canvas.tokens.get(anchorTokenId);

  const paintReach = () => {
    if (reachElevation === elevation) return;
    reachElevation = elevation;
    gridLayer.clearHighlightLayer(PICKER_REACH_LAYER);
    if (!square) return;
    for (const cell of cellsInReach(origin, maxSpaces, grid, measureFn, elevation)) {
      gridLayer.highlightPosition(PICKER_REACH_LAYER, {
        x: cell.x,
        y: cell.y,
        color: REACH_COLOR,
        alpha: 0.28,
      });
    }
  };

  const paintOverlay = (cell, description) => {
    clearContainer(overlay);
    if (!description) return;
    if (square && Array.isArray(description.path) && description.path.length > 1) {
      const graphics = makeGraphics();
      graphics.pickerMark = "path";
      drawPolyline(graphics, description.path.map((point) => cellCenter(point, grid)));
      for (const mark of description.marks ?? []) {
        const center = cellCenter(mark, grid);
        if (mark.kind === "contact") drawCross(graphics, center.x, center.y, 8);
        else drawDot(graphics, center.x, center.y, mark.kind === "apex" ? 6 : 5, MARK_COLOR);
      }
      overlay.addChild(graphics);
      const sprite = ghostSprite(token(), description.ghost, grid);
      if (sprite) overlay.addChild(sprite);
    }
    const label = labelNode(labelText(shownDescription(description, { changed: description.changed === true })), cell, grid);
    if (label) {
      const backdrop = labelBackdrop(label);
      if (backdrop) overlay.addChild(backdrop);
      overlay.addChild(label);
    }
  };

  const paintHover = (cell, description) => {
    gridLayer.clearHighlightLayer(PICKER_HOVER_LAYER);
    gridLayer.highlightPosition(PICKER_HOVER_LAYER, {
      x: cell.x,
      y: cell.y,
      color: description?.valid ? VALID_COLOR : INVALID_COLOR,
    });
    paintOverlay(cell, description);
  };

  // a cell out of reach at the origin's height is out of reach at every height
  // we don't clamp those cells (it would drop the chosen height back to the origin's)
  const outOfReach = (cell) => measureFn(origin, {
    x: cell.x,
    y: cell.y,
    elevation: Number(origin.elevation) || 0,
  }) > maxSpaces;

  function fitHeight(cell) {
    if (outOfReach(cell)) return snapPointToCell(cell, grid, elevation);
    const next = clampToCell(cell, elevation);
    if (next === elevation) return snapPointToCell(cell, grid, elevation);
    elevation = next;
    reachElevation = null;
    if (keyboardCell) keyboardCell = { ...keyboardCell, elevation: next };
    return snapPointToCell(cell, grid, elevation);
  }

  async function descriptionFor(cell) {
    if (typeof validate === "function") {
      const verdict = validate(cell) ?? { ok: true };
      if (!verdict.ok) return invalidDescription(verdict.reasonKey ?? "PMTTRPG.PlannedMovement.PickOutOfRange");
    } else if (measureFn(origin, cell) > maxSpaces) return invalidDescription();
    const key = cellKey(cell);
    if (cache.has(key)) return cache.get(key);
    let value = { valid: true, signature: null, path: [], marks: [], ghost: null, label: { title: "", lines: [], chips: [] } };
    if (typeof describe === "function") {
      try {
        const result = describe(cell);
        value = result && typeof result.then === "function" ? await result : result;
      } catch (error) {
        console.warn("[PMTTRPG] Point picker describe failed", error);
        value = invalidDescription();
      }
    }
    if (value && typeof value === "object") cache.set(key, value);
    return value;
  }

  let hoverToken = 0;
  async function drawCell(cell) {
    const ticket = ++hoverToken;
    const description = await descriptionFor(cell);
    if (!session.open || ticket !== hoverToken) return;
    paintReach();
    paintHover(cell, description);
  }

  async function confirmCell(cell) {
    if (!cell || busy) return;
    const shown = await descriptionFor(cell);
    if (!session.open) return;
    paintHover(cell, shown);
    if (!shown?.valid) return;
    const key = cellKey(cell);
    if (armed?.key === key) {
      closePick(session, cell);
      return;
    }
    busy = true;
    let prepared = shown;
    try {
      if (typeof prepare === "function") prepared = await prepare(cell);
    } catch (error) {
      console.warn("[PMTTRPG] Point picker prepare failed", error);
      return;
    } finally {
      busy = false;
    }
    if (!session.open) return;
    if (!prepared?.valid) {
      armed = null;
      paintHover(cell, prepared ?? shown);
      return;
    }
    if ((prepared.signature ?? null) === (shown.signature ?? null)) {
      closePick(session, cell);
      return;
    }
    armed = { key };
    paintHover(cell, { ...prepared, changed: true });
  }

  const applyElevation = (next) => {
    const cell = currentCell();
    if (outOfReach(cell)) return;
    const clamped = clampToCell(cell, next);
    if (clamped === elevation) return;
    elevation = clamped;
    reachElevation = null;
    if (keyboardCell) keyboardCell = { ...keyboardCell, elevation };
    void drawCell(currentCell());
  };

  const nudge = (row, column) => {
    const cell = currentCell();
    const offset = offsetOf(cell, grid);
    keyboardCell = pointFromOffset({ i: offset.i + row, j: offset.j + column }, grid, elevation);
    pointerOwned = false;
    keyboardCell = fitHeight(keyboardCell);
    void drawCell(keyboardCell);
  };

  const worldPoint = (event) => {
    const { x, y } = event.getLocalPosition(canvas.stage);
    return { x, y };
  };

  const onMove = (event) => {
    if (!session.open) return;
    const raw = worldPoint(event);
    pointerOwned = true;
    keyboardCell = null;
    lastRaw = raw;
    void drawCell(fitHeight(snapPointToCell(raw, grid, elevation)));
  };

  const onDown = (event) => {
    if (!session.open || event.button === 2) return;
    claim(event);
    if (event.button !== 0) return;
    pointerOwned = true;
    keyboardCell = null;
    lastRaw = worldPoint(event);
    void confirmCell(fitHeight(currentCell()));
  };

  const onKey = (event) => {
    if (!session.open || editableTarget(event.target)) return;
    if (event.key === "Escape") {
      claim(event);
      closePick(session, null);
      return;
    }
    const stepped = pickerElevationForKey(elevation, event.code, grid)
      ?? pickerElevationForKey(elevation, event.key, grid);
    if (stepped != null) {
      claim(event);
      applyElevation(stepped);
      return;
    }
    if (event.key === "Enter" || event.code === "Enter" || event.code === "NumpadEnter") {
      claim(event);
      void confirmCell(currentCell());
      return;
    }
    const step = keyStep(event);
    if (!step) return;
    claim(event);
    nudge(step[0], step[1]);
  };

  const onWheel = (event) => {
    if (!session.open || editableTarget(event.target) || !event.ctrlKey) return;
    claim(event);
    const direction = event.deltaY < 0 ? 1 : -1;
    applyElevation(elevation + direction * gridUnit(grid));
  };

  const onTearDown = () => closePick(session, null);
  const onDelete = (doc) => {
    if (anchorTokenId && doc.id === anchorTokenId) closePick(session, null);
  };

  const listen = (type, handler) => {
    canvas.stage.addEventListener(type, handler, { capture: true });
    return () => canvas.stage.removeEventListener(type, handler, { capture: true });
  };
  const unlistenDown = listen("pointerdown", onDown);
  const swallow = (event) => {
    if (!session.open || event.button === 2) return;
    claim(event);
  };
  const unlistenRest = ["pointerup", "pointertap", "click"].map((type) => listen(type, swallow));
  canvas.stage.on("pointermove", onMove);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("wheel", onWheel, { capture: true, passive: false });
  Hooks.on("canvasTearDown", onTearDown);
  Hooks.on("deleteToken", onDelete);
  gridLayer.addHighlightLayer(PICKER_REACH_LAYER);
  gridLayer.addHighlightLayer(PICKER_HOVER_LAYER);

  session.cleanup = () => {
    canvas.stage.off("pointermove", onMove);
    unlistenDown();
    for (const unlisten of unlistenRest) unlisten();
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("wheel", onWheel, { capture: true });
    Hooks.off("canvasTearDown", onTearDown);
    Hooks.off("deleteToken", onDelete);
    clearContainer(overlay);
    canvas.controls.removeChild(overlay);
    overlay.destroy({ children: true });
    gridLayer.destroyHighlightLayer(PICKER_REACH_LAYER);
    gridLayer.destroyHighlightLayer(PICKER_HOVER_LAYER);
  };

  void drawCell(currentCell());
  try {
    return await done;
  } finally {
    closePick(session, null);
  }
}
