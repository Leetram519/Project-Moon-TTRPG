import { actorItems } from "../shared-helpers.js";

function listReadyAmmunition(actor) {
  return actorItems(actor)
    .filter((item) => item.type === "ammunition" && Number(item.system.quantity) > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function peekFirstReadyAmmunition(actor) {
  return listReadyAmmunition(actor)[0] ?? null;
}

export function weaponRequiresAmmunition(weapon) {
  return String(weapon?.system?.weaponType ?? "").toLowerCase() === "ranged";
}

export async function consumeAmmunitionCharge(ammo, { actor } = {}) {
  const qty = Number(ammo?.system?.quantity ?? 0);
  if (!ammo || qty <= 0) return false;
  const { runAsOwnerOrGM } = await import("../easy-effects/gm-route.js");
  await runAsOwnerOrGM(ammo.actor ?? actor, "updateOwnedItem", {
    itemUuid: ammo.uuid,
    update: { "system.quantity": Math.max(0, qty - 1) },
  });
  return true;
}
