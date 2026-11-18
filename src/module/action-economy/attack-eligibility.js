/**
 * Normal Attacks need a held weapon (the Community Rule says it has to be unsheathed
 * and held). Held just means the owned Item has `system.equipped === true`.
 */

import { actorItems } from "../shared-helpers.js";

const WEAPON_ATTACK_REASONS = {
  NOT_HELD: "weapon-not-held",
  NOT_OWNED: "weapon-not-owned",
};

function ownedWeapon(actor, weapon) {
  if (!actor || weapon?.type !== "weapon") return null;
  const owned = actor.items.get(weapon.id);
  return owned?.type === "weapon" ? owned : null;
}

export function isWeaponHeldForAttack(weapon) {
  return weapon?.type === "weapon" && weapon.system?.equipped === true;
}

export function listHeldAttackWeapons(actor, weaponType) {
  const want = String(weaponType ?? "").toLowerCase();
  if (!actor || !want) return [];
  return actorItems(actor)
    .filter((item) => isWeaponHeldForAttack(item) && String(item.system?.weaponType ?? "").toLowerCase() === want)
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

function validateWeaponAttackEligibility(actor, weapon) {
  if (!weapon || weapon.type !== "weapon") {
    return { ok: true, applicable: false, actor, weapon: weapon ?? null };
  }

  const live = ownedWeapon(actor, weapon);
  if (!live) {
    return {
      ok: false,
      applicable: true,
      reason: WEAPON_ATTACK_REASONS.NOT_OWNED,
      actor,
      weapon,
    };
  }

  if (live.system?.equipped !== true) {
    return {
      ok: false,
      applicable: true,
      reason: WEAPON_ATTACK_REASONS.NOT_HELD,
      actor,
      weapon: live,
    };
  }

  return { ok: true, applicable: true, actor, weapon: live };
}

function notifyWeaponAttackIneligible(result, { warn = true, path = null } = {}) {
  if (!result || result.ok || warn === false) return;

  const key = result.reason === WEAPON_ATTACK_REASONS.NOT_OWNED
    ? "PMTTRPG.Attack.WeaponUnavailable"
    : "PMTTRPG.Attack.WeaponNotHeld";
  ui.notifications.warn(game.i18n.localize(key));

  if (path) {
    console.warn("[PMTTRPG] weapon attack rejected", {
      reason: result.reason,
      path,
      actorId: result.actor?.id ?? null,
      weaponId: result.weapon?.id ?? null,
    });
  }
}

export function rejectUnheldWeaponAttack(actor, weapon, options = {}) {
  const result = validateWeaponAttackEligibility(actor, weapon);
  if (!result.ok) notifyWeaponAttackIneligible(result, options);
  return result;
}
