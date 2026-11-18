import { currentTurnIdentity } from "../combat/turn-stamps.js";
import { currentTurnCombatant, exactCombatantForToken } from "../combat/combatant-match.js";

const SCOPE = "projectmoonttrpg";
const KEY = "actionState";

export const ACTION_STATE_ENTRY_KEYS = new Set(["protect", "cover", "ready", "disengage"]);

function emptyState() {
  return {
    disengage: false,
    protect: null,
    cover: null,
    ready: null,
  };
}

export function readActionState(combatant) {
  const raw = combatant?.flags?.[SCOPE]?.[KEY];
  if (!raw || typeof raw !== "object") return emptyState();
  return { ...emptyState(), ...raw };
}

export async function patchActionState(combatant, patch = {}) {
  if (!combatant) return null;
  const next = { ...readActionState(combatant), ...patch };
  // assists go through their own serialized route, so we leave the key out and the
  // stored array stays untouched (foundry merges objects but replaces arrays)
  delete next.assists;
  return combatant.update({ [`flags.${SCOPE}.${KEY}`]: next });
}

/**
 * Update data that deletes one flag field. Foundry warns on `-=key` so we use a
 * ForcedDeletion, and it has to be an instance (passing the class itself just gets
 * ignored and the field stays).
 */
export function flagKeyDeletion(path) {
  return { [path]: new foundry.data.operators.ForcedDeletion() };
}

export function actionStateEntryUpdate(key, value) {
  const path = `flags.${SCOPE}.actionState.${key}`;
  if (value != null) return { [path]: value };
  return flagKeyDeletion(path);
}

/**
 * Writes one allowlisted actionState key (null deletes it). Unlike
 * patchActionState this leaves the other keys alone.
 */
export async function writeCombatantActionState(combatant, key, value) {
  if (!combatant || !ACTION_STATE_ENTRY_KEYS.has(key)) return false;
  if (value != null && (typeof value !== "object" || Array.isArray(value))) return false;
  const { canUserUpdateDocument } = await import("../acting-user.js");
  if (canUserUpdateDocument(combatant)) {
    await combatant.update(actionStateEntryUpdate(key, value));
    return true;
  }
  const { runAsCombatantOwnerOrGM } = await import("../easy-effects/gm-route.js");
  return (await runAsCombatantOwnerOrGM(combatant, "setCombatantActionStateEntry", { key, value })) === true;
}

// keyed on the turn identity (an initiative edit can move the turn index) so their next turn just makes it run out
export function makeDisengageStamp(combatant, combat) {
  const turn = currentTurnIdentity(combat, combatant);
  return {
    active: true,
    combatId: combat?.id ?? null,
    combatantId: combatant?.id ?? null,
    started: turn?.started ?? null,
    round: turn?.round ?? combat?.round ?? null,
  };
}

function sameCombatant(left, right) {
  if (!left || !right) return false;
  return left === right || (left.id != null && left.id === right.id);
}

export function isCurrentTurnCombatant(combat, combatant) {
  if (!combat?.started || !combatant) return false;
  const current = currentTurnCombatant(combat);
  if (current) return sameCombatant(current, combatant);
  const currentId = combat.current?.combatantId ?? null;
  return currentId != null && currentId === combatant.id;
}

// a stamp from an earlier turn shouldn't stop Opportunity Attacks
function disengageStampIsActive(stamp, combatant, combat) {
  if (!stamp || typeof stamp !== "object") return false;
  if (stamp.active !== true) return false;
  if (!combat?.started || !combatant) return false;
  if (stamp.combatantId != null && combatant.id != null && stamp.combatantId !== combatant.id) return false;
  if (stamp.combatId != null && combat.id != null && stamp.combatId !== combat.id) return false;
  if (!Number.isInteger(stamp.started)) return false;
  const turn = currentTurnIdentity(combat, combatant);
  if (!turn) return false;
  return turn.started === stamp.started && (turn.round ?? null) === (stamp.round ?? null);
}

/**
 * Only checks the moving Combatant (passed in or found by its Token id), never
 * another Combatant of the same Actor.
 */
export function hasDisengage({ actor, combatant, combat, tokenId, token } = {}) {
  const activeCombat = combat ?? game.combat;
  const resolved = combatant
    ?? exactCombatantForToken(activeCombat, tokenId ?? token?.id ?? actor?.token?.id ?? null);
  if (!resolved) return false;
  return disengageStampIsActive(readActionState(resolved).disengage, resolved, activeCombat);
}

