import { actorIdentityKey } from "../easy-effects/burst-roles.js";

function entryTokenId(entry) {
  return entry?.tokenId ?? entry?.token?.id ?? null;
}

function entryActorId(entry) {
  return entry?.actorId ?? entry?.actor?.id ?? null;
}

export function listCombatants(combatants) {
  if (!combatants) return [];
  if (typeof combatants.values === "function") return [...combatants.values()];
  if (typeof combatants[Symbol.iterator] === "function") return [...combatants];
  return [];
}

export function turnsOf(combat) {
  return combat ? [...combat.turns] : [];
}

export function currentTurnCombatant(combat) {
  return combat?.combatant ?? null;
}

export function combatantName(combatant) {
  return combatant?.name ?? combatant?.token?.name ?? combatant?.actor?.name ?? "";
}

export function combatantOf(combat, id) {
  if (!combat || id == null) return null;
  return combat.combatants.get(String(id)) ?? null;
}

export function exactCombatantForToken(combat, tokenId) {
  if (!combat || tokenId == null) return null;
  const matches = combat.combatants.filter((entry) => entry.tokenId === tokenId);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * A token id matches that combatant only.
 * An actor id matches only when one combatant has it.
 */
export function findCombatant({ combatants, tokenId = null, actorId = null } = {}) {
  const list = listCombatants(combatants);
  if (tokenId) {
    return list.find((entry) => entryTokenId(entry) === tokenId) ?? null;
  }
  if (!actorId) return null;
  const matches = list.filter((entry) => entryActorId(entry) === actorId);
  return matches.length === 1 ? matches[0] : null;
}

/** Keeps the first entry for each actor uuid. */
export function uniqueActorEntries(entries, actorOf = (entry) => entry?.actor) {
  const seen = new Set();
  const out = [];
  for (const entry of listCombatants(entries)) {
    const actor = actorOf(entry);
    const key = actorIdentityKey(actor);
    if (!actor || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/** True when another entry has this actor's uuid. */
export function hasAnotherCombatantForActor(combatants, actor, exceptCombatantId = null) {
  const key = actorIdentityKey(actor);
  if (!key) return false;
  for (const entry of listCombatants(combatants)) {
    if (exceptCombatantId && entry?.id === exceptCombatantId) continue;
    if (actorIdentityKey(entry?.actor) === key) return true;
  }
  return false;
}
