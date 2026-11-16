import { normalizeWeaponProperties } from "../item/weapon-properties.js";
import {
  deriveContentReactionContributions,
  getReactionCredits,
  isContentReactionSourceKey,
  isCreditLive,
  isGrantReactionSourceKey,
  isHeldWeaponReactionSourceKey,
  resolveReactionCreditCombatant,
  writeReactionCreditLedger,
} from "./reaction-credits.js";
import { combatantsActingFor, unlinkedTokenCombatants } from "./acting-token.js";
import { actorItems } from "../shared-helpers.js";

const SCOPE = "projectmoonttrpg";
const GRANT_KEY = "heldWeaponReactionGrants";
const GRANT_PATH = `flags.${SCOPE}.${GRANT_KEY}`;

const SOURCE_KEYS = {
  small: (itemId) => `held:small:${itemId}`,
  sturdy: (itemId) => `held:sturdy:${itemId}`,
  oneHand: "held:oneHand",
  dualDefensive: "held:dualWield:defensive",
};

function listHeldWeapons(actor) {
  return actorItems(actor).filter((item) => item.type === "weapon" && !!item.system.equipped);
}

export function heldWeaponIds(actor) {
  return listHeldWeapons(actor).map((item) => item.id).filter((id) => typeof id === "string" && id);
}

function describeHeldWeapon(item) {
  const props = normalizeWeaponProperties(item?.system);
  return {
    id: item.id,
    formProperty: props.formProperty,
    handProperty: props.handProperty,
  };
}

function isOneHandedHand(handProperty) {
  return handProperty === "off1h" || handProperty === "def1h";
}

function contribution(kindRestriction, sourceKey, sourceItemIds, itemRestriction = null) {
  return {
    kindRestriction,
    sourceKey,
    sourceItemIds: sourceItemIds.slice(),
    itemRestriction,
  };
}

/**
 * The Reaction credits a set of held weapons gives. Small weapons give a Counter
 * credit each and Sturdy ones a Block credit. A single one-handed weapon gives a
 * Universal credit (Dual Wielding doesn't get it), and Dual Wielding two
 * Defensive one-handed weapons adds a Block.
 */
function deriveHeldWeaponReactionContributions(weapons) {
  const held = weapons.map(describeHeldWeapon);

  const contributions = [];
  for (const weapon of held) {
    if (weapon.formProperty === "small") {
      contributions.push(contribution("counter", SOURCE_KEYS.small(weapon.id), [weapon.id], weapon.id));
    }
    if (weapon.formProperty === "sturdy") {
      contributions.push(contribution("block", SOURCE_KEYS.sturdy(weapon.id), [weapon.id], null));
    }
  }

  const oneHanded = held.filter((weapon) => isOneHandedHand(weapon.handProperty));
  const dualWield = oneHanded.length >= 2;
  if (!dualWield && oneHanded.length === 1) {
    contributions.push(contribution("universal", SOURCE_KEYS.oneHand, oneHanded.map((weapon) => weapon.id), null));
  }

  const defensive = oneHanded.filter((weapon) => weapon.handProperty === "def1h");
  if (dualWield && defensive.length >= 2) {
    contributions.push(contribution("block", SOURCE_KEYS.dualDefensive, defensive.map((weapon) => weapon.id), null));
  }

  return contributions.sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));
}

function deriveHeldWeaponReactionContributionsFromActor(actor) {
  return deriveHeldWeaponReactionContributions(listHeldWeapons(actor));
}

function creditRecord(credit) {
  return {
    id: credit.id,
    kindRestriction: credit.kindRestriction,
    sourceKey: credit.sourceKey,
    sourceItemIds: Array.isArray(credit.sourceItemIds) ? credit.sourceItemIds.slice() : [],
    itemRestriction: credit.itemRestriction ?? null,
    spent: credit.spent === true,
    ...(credit.expires ? { expires: { ...credit.expires } } : {}),
    ...(credit.label ? { label: credit.label } : {}),
    ...(credit.grantedBy ? { grantedBy: credit.grantedBy } : {}),
  };
}

function isDerivedSourceKey(sourceKey) {
  return isHeldWeaponReactionSourceKey(sourceKey) || isContentReactionSourceKey(sourceKey);
}

/**
 * `ownsKey` says which credits `desired` decides about (held weapons by default).
 * Those get kept, unspent or dropped, and every other credit stays unless
 * `keepCredit` says no.
 */
function mergeHeldWeaponCredits(existing, desired, {
  createKeys,
  unspendHeld,
  ownsKey = isHeldWeaponReactionSourceKey,
  keepCredit = null,
}) {
  const desiredKeys = new Set(desired.map((entry) => entry.sourceKey));
  const allowedCreate = createKeys instanceof Set ? createKeys : new Set(createKeys ?? []);
  const next = [];
  const present = new Set();

  for (const credit of existing) {
    if (!ownsKey(credit.sourceKey)) {
      if (typeof keepCredit === "function" && !keepCredit(credit)) continue;
      next.push(creditRecord(credit));
      continue;
    }
    if (!desiredKeys.has(credit.sourceKey)) continue;
    next.push({
      ...creditRecord(credit),
      spent: unspendHeld ? false : credit.spent === true,
    });
    present.add(credit.sourceKey);
  }

  for (const contrib of desired) {
    if (!allowedCreate.has(contrib.sourceKey) || present.has(contrib.sourceKey)) continue;
    next.push({
      id: foundry.utils.randomID(),
      kindRestriction: contrib.kindRestriction,
      sourceKey: contrib.sourceKey,
      sourceItemIds: contrib.sourceItemIds.slice(),
      itemRestriction: contrib.itemRestriction,
      spent: false,
    });
    present.add(contrib.sourceKey);
  }

  return next;
}

function currentRound(options = {}) {
  const raw = options.round ?? options.combat?.round ?? game.combat?.round;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function readGrantMemory(combatant, round) {
  const raw = combatant?.flags?.[SCOPE]?.[GRANT_KEY];
  if (!raw || typeof raw !== "object") return new Set();
  if (round == null || Number(raw.round) !== round) return new Set();
  const ids = Array.isArray(raw.weaponIds) ? raw.weaponIds : [];
  return new Set(ids.filter((id) => typeof id === "string" && id));
}

function grantUpdate(round, weaponIds) {
  if (round == null) return {};
  return {
    [GRANT_PATH]: {
      round,
      weaponIds: [...weaponIds],
    },
  };
}

function sameCreditIds(before, after) {
  if (before.length !== after.length) return false;
  return before.every((credit, index) => (
    credit.id === after[index].id
    && credit.spent === after[index].spent
    && credit.sourceKey === after[index].sourceKey
  ));
}

async function persistMergedCredits(actor, options, nextCredits, extraUpdate = {}) {
  const combatant = resolveReactionCreditCombatant(actor, options);
  if (!combatant) return { ok: true, skipped: true, credits: [] };

  const existing = getReactionCredits(combatant);
  if (sameCreditIds(existing, nextCredits) && !Object.keys(extraUpdate).length) {
    return { ok: true, skipped: true, credits: existing };
  }

  const persist = await writeReactionCreditLedger(combatant, nextCredits, extraUpdate);
  if (!persist.ok) return { ok: false, reason: persist.reason, credits: existing };
  return { ok: true, credits: nextCredits };
}

/**
 * Call this before the item update and hand the result to
 * applyHeldLoadoutTransitionForActor after it. Unlinked tokens of a world actor
 * count too (their items inherit from it).
 */
export function captureHeldWeaponIdsForActor(actor, { combat = game.combat } = {}) {
  const combatants = [...combatantsActingFor(actor, combat), ...unlinkedTokenCombatants(actor, combat)];
  return combatants.map((combatant) => ({ combatant, previousHeldWeaponIds: heldWeaponIds(combatant.actor ?? actor) }));
}

/** The same first-swap transition as Change Weapons, once per captured Combatant. */
export async function applyHeldLoadoutTransitionForActor(actor, captured, { combat = game.combat } = {}) {
  const results = [];
  for (const { combatant, previousHeldWeaponIds } of Array.isArray(captured) ? captured : []) {
    results.push(await applyHeldLoadoutTransition(combatant.actor ?? actor, {
      combatant,
      combat,
      previousHeldWeaponIds,
      round: combat?.round ?? null,
    }));
  }
  return results;
}

/** Rebuilds the held-weapon and [Always Active] credits (all unspent again) on an action economy refresh and drops grants that ran out. */
export async function refreshReactionCredits(actor, options = {}) {
  const combatant = resolveReactionCreditCombatant(actor, options);
  if (!combatant) return { ok: true, skipped: true, credits: [] };
  const desired = [
    ...deriveHeldWeaponReactionContributionsFromActor(actor),
    ...deriveContentReactionContributions(combatant.actor ?? actor),
  ];
  const next = mergeHeldWeaponCredits(getReactionCredits(combatant), desired, {
    createKeys: new Set(desired.map((entry) => entry.sourceKey)),
    unspendHeld: true,
    ownsKey: isDerivedSourceKey,
    keepCredit: (credit) => !isGrantReactionSourceKey(credit.sourceKey)
      || isCreditLive(credit, { combatant, combat: options.combat ?? null, actor }),
  });
  return persistMergedCredits(actor, options, next);
}

/** Drops the [Always Active] credits whose source doesn't grant them anymore (never makes new ones). */
export async function pruneContentReactionCredits(actor, options = {}) {
  const combatant = resolveReactionCreditCombatant(actor, options);
  if (!combatant) return { ok: true, skipped: true, credits: [] };
  const next = mergeHeldWeaponCredits(getReactionCredits(combatant), deriveContentReactionContributions(combatant.actor ?? actor), {
    createKeys: new Set(),
    unspendHeld: false,
    ownsKey: isContentReactionSourceKey,
  });
  return persistMergedCredits(actor, options, next);
}

function firstSwapCreateKeys(desired, firstSwapWeaponIds) {
  const unlocked = new Set(firstSwapWeaponIds);
  const keys = new Set();
  for (const contrib of desired) {
    if (contrib.sourceItemIds.some((itemId) => unlocked.has(itemId))) {
      keys.add(contrib.sourceKey);
    }
  }
  return keys;
}

/**
 * For a weapon change during play. Credits the new loadout doesn't give get
 * removed right away, but missing ones only get granted for weapons you swap to
 * for the first time this round.
 */
export async function applyHeldLoadoutTransition(actor, options = {}) {
  const combatant = resolveReactionCreditCombatant(actor, options);
  if (!combatant) return { ok: true, skipped: true, credits: [], grantedWeaponIds: [] };

  const currentIds = heldWeaponIds(actor);
  const previousIds = new Set(
    Array.isArray(options.previousHeldWeaponIds)
      ? options.previousHeldWeaponIds.filter((id) => typeof id === "string" && id)
      : currentIds,
  );
  const newlyHeld = currentIds.filter((id) => !previousIds.has(id));

  const round = currentRound(options);
  const granted = readGrantMemory(combatant, round);
  const firstSwap = newlyHeld.filter((id) => !granted.has(id));
  for (const id of firstSwap) granted.add(id);

  const desired = deriveHeldWeaponReactionContributionsFromActor(actor);
  const next = mergeHeldWeaponCredits(getReactionCredits(combatant), desired, {
    createKeys: firstSwapCreateKeys(desired, firstSwap),
    unspendHeld: false,
  });

  const extraUpdate = firstSwap.length ? grantUpdate(round, granted) : {};
  const persist = await persistMergedCredits(actor, options, next, extraUpdate);
  return { ...persist, grantedWeaponIds: firstSwap };
}
