/**
 * One `movementActionId` for one logical movement, across OA pauses, re-commits and linked
 * follows. Foundry gives out a new movement id when the OA origin gate re-commits, and its
 * continuation updates don't carry our options either, so the client that started the move
 * maps each Foundry id back to the action id. It all lives on that client until `endMovementAction`.
 */

const SCOPE = "projectmoonttrpg";

const foundryAliases = new Map();

const actions = new Map();

export function ensureProjectOptions(options) {
  if (!options.projectmoonttrpg || typeof options.projectmoonttrpg !== "object") options.projectmoonttrpg = {};
  return options.projectmoonttrpg;
}

function stateFor(movementActionId) {
  const key = String(movementActionId);
  let state = actions.get(key);
  if (!state) {
    state = { processed: new Set(), traversal: [] };
    actions.set(key, state);
  }
  return state;
}

export function ensureMovementActionId(options = {}) {
  const pmt = ensureProjectOptions(options);
  const existing = typeof pmt.movementActionId === "string" && pmt.movementActionId.trim();
  if (existing) return pmt.movementActionId;
  pmt.movementActionId = foundry.utils.randomID();
  return pmt.movementActionId;
}

export function readMovementActionId(options = {}) {
  const id = options?.[SCOPE]?.movementActionId;
  return typeof id === "string" && id.trim() ? id : null;
}

export function bindFoundryMovementId(movementActionId, foundryMovementId) {
  if (!movementActionId || foundryMovementId == null) return;
  foundryAliases.set(String(foundryMovementId), String(movementActionId));
  stateFor(movementActionId);
}

export function movementActionIdFor(foundryMovementId) {
  if (foundryMovementId == null) return null;
  return foundryAliases.get(String(foundryMovementId)) ?? null;
}

/** So something keyed to this movement (like an OA crossing) only gets handled once, even across OA pauses. */
export function markMovementActionProcessed(movementActionId, key) {
  if (!movementActionId || !key) return;
  stateFor(movementActionId).processed.add(String(key));
}

export function wasMovementActionProcessed(movementActionId, key) {
  if (!movementActionId || !key) return false;
  return actions.get(String(movementActionId))?.processed.has(String(key)) ?? false;
}

export function recordTraversal(movementActionId, cells = []) {
  if (!movementActionId || !Array.isArray(cells)) return;
  const state = stateFor(movementActionId);
  for (const cell of cells) {
    if (!cell || typeof cell !== "object") continue;
    state.traversal.push({ ...cell, index: state.traversal.length });
  }
}

export function endMovementAction(movementActionId) {
  if (!movementActionId) return;
  const key = String(movementActionId);
  actions.delete(key);
  for (const [alias, owner] of [...foundryAliases.entries()]) {
    if (owner === key) foundryAliases.delete(alias);
  }
}
