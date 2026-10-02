/**
 * Unlinked token actors can share a world actor's id so we use uuid as the the real key.
 */
export function actorIdentityKey(actor) {
  if (!actor) return null;
  const uuid = String(actor.uuid ?? "").trim();
  if (uuid) return uuid;
  const id = actor.id ?? actor._id ?? null;
  return id == null || id === "" ? null : String(id);
}

/** True when both refs are the same token actor*/
export function sameActor(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const key = actorIdentityKey(a);
  return !!key && key === actorIdentityKey(b);
}

export function selectRelativeActors(actors, self, kind, isEnemy) {
  const all = [];
  for (const actor of actors ?? []) {
    if (actor) all.push(actor);
  }
  if (kind === "all") return all;
  if (kind === "enemies") {
    return all.filter((actor) => !self || (!sameActor(actor, self) && isEnemy(actor, self)));
  }
  if (kind === "allies") {
    return all.filter((actor) => Boolean(self) && !sameActor(actor, self) && !isEnemy(actor, self));
  }
  return null;
}

/**
 * Same embedded item id can exist on two different actors.
 */
export function itemIdentityKey(item) {
  if (!item) return null;
  const uuid = String(item.uuid ?? "").trim();
  if (uuid) return uuid;
  const id = item.id ?? item._id ?? null;
  if (id == null || id === "") return null;
  const ownerKey = actorIdentityKey(item.actor);
  return ownerKey ? `${ownerKey}:${id}` : `item:${id}`;
}

/** Dialog answerer if we're in one, else self*/
export function resolveBurstBurster(context) {
  return context?._dialogResponder ?? context?.self ?? null;
}

/** First occurrence of each actor, keyed by `actorIdentityKey`. */
export function uniqueBurstOwners(...actors) {
  const out = [];
  const seen = new Set();
  for (const actor of actors) {
    const key = actorIdentityKey(actor);
    if (!actor || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(actor);
  }
  return out;
}

/** Owned by `owner`, including unlinked token copies of the same item. */
export function itemBelongsToActor(item, owner) {
  if (!item || !owner) return false;
  const ownerKey = actorIdentityKey(owner);
  const itemOwnerKey = actorIdentityKey(item.actor);
  if (ownerKey && itemOwnerKey && ownerKey === itemOwnerKey) return true;
  const owned = owner.items?.get?.(item.id ?? item._id);
  if (!owned) return false;
  return itemIdentityKey(owned) === itemIdentityKey(item);
}

/**
 * Dedupes burst/proc listeners. False if the item was skipped or already seen.
 */
export function rememberBurstListenerItem(seenKeys, item, skipItemKey) {
  const key = itemIdentityKey(item);
  if (!key) return false;
  if (skipItemKey && key === skipItemKey) return false;
  if (seenKeys.has(key)) return false;
  seenKeys.add(key);
  return true;
}

export function usedSkillsFromContext({
  sourceItem = null,
  attackerSkill = null,
  defenderSkill = null,
  clash = null,
} = {}) {
  return [sourceItem, attackerSkill, defenderSkill, clash?.attackerSkill, clash?.defenderSkill]
    .filter((item) => item?.type === "skill");
}

export function collectUsedSkills(owner, usedSkills) {
  if (!owner) return [];
  const out = [];
  const seen = new Set();
  for (const item of usedSkills ?? []) {
    if (item?.type !== "skill") continue;
    const key = itemIdentityKey(item);
    if (!key || seen.has(key)) continue;
    if (!itemBelongsToActor(item, owner)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
