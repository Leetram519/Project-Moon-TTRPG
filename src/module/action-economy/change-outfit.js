import {
  applyDeclaredOwnedItemUpdate,
  declareActorAction,
} from "./declare.js";
import { ACTION_KINDS, ECONOMY_TYPES, actionEconomyApplies } from "./kinds.js";
import { exhaustAllReactions } from "./reaction-credits.js";
import { pruneContentReactionCredits } from "./held-weapon-reactions.js";
import { checkWorkflowTiming, warnNotYourTurn } from "./timing.js";
import { itemPickerRows, pickRadioRow } from "../apps/dialog-wait.js";

export function getEligibleOutfits(actor) {
  if (!actor) return [];
  return actor.items
    .filter((item) => item.type === "outfit")
    .sort((a, b) => {
      const eq = Number(!!b.system?.equipped) - Number(!!a.system?.equipped);
      if (eq) return eq;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
}

function equippedOutfits(actor) {
  return getEligibleOutfits(actor).filter((item) => !!item.system?.equipped);
}

function isAlreadyCurrentOutfit(actor, outfit) {
  if (!actor || !outfit || outfit.type !== "outfit") return false;
  if (!outfit.system?.equipped) return false;
  const equipped = equippedOutfits(actor);
  return equipped.length === 1 && equipped[0].id === outfit.id;
}

function resolveOwnedOutfit(actor, outfit) {
  if (!actor || !outfit) return null;
  const selected = actor.items.get(outfit.id ?? outfit) ?? null;
  if (!selected || selected.type !== "outfit") return null;
  return selected;
}

async function promptOutfitChoice(actor, outfits) {
  const preferred = outfits.find((item) => !item.system?.equipped) ?? outfits[0];
  const itemId = await pickRadioRow({
    title: game.i18n.localize("PMTTRPG.ActionMenu.ChangeOutfit"),
    hint: game.i18n.localize("PMTTRPG.ActionMenu.ChooseOutfit"),
    inputName: "outfitId",
    rows: itemPickerRows(outfits, game.i18n.localize("PMTTRPG.ToolWorn"), preferred?.id),
  });
  return itemId ? actor.items.get(itemId) ?? null : null;
}

async function applyOutfitEquipment(actor, selectedId) {
  const selected = resolveOwnedOutfit(actor, selectedId);
  if (!selected) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.ActionMenu.OutfitUnavailable"));
    return;
  }

  const outfits = getEligibleOutfits(actor);
  const updates = [];
  for (const outfit of outfits) {
    const want = outfit.id === selected.id;
    if (!!outfit.system?.equipped === want) continue;
    updates.push({ _id: outfit.id, "system.equipped": want });
  }
  for (const update of updates) {
    const outfit = actor.items.get(update._id);
    if (!outfit) continue;
    await applyDeclaredOwnedItemUpdate(actor, outfit, {
      "system.equipped": update["system.equipped"],
    });
  }
}

// needs the declaration's Combatant since a linked actor placed twice has one per token
async function consumeRemainingReactions(actor, combatant) {
  await pruneContentReactionCredits(actor, combatant ? { combatant } : {});
  const result = await exhaustAllReactions(actor, combatant ? { combatant } : {});
  if (!result.ok) {
    throw new Error(`reaction exhaustion failed (${result.reason})`);
  }
}

async function applyChangeOutfitConsequences(actor, selectedId, combatant = null, combat = null) {
  try {
    await applyOutfitEquipment(actor, selectedId);
  } catch (error) {
    console.error("[PMTTRPG] outfit update failed after declaration", error);
    ui.notifications.error(game.i18n.localize("PMTTRPG.ActionMenu.ChangeOutfitFailed"));
    return;
  }

  if (!actionEconomyApplies(combat, combatant)) return;
  try {
    await consumeRemainingReactions(actor, combatant);
  } catch (error) {
    console.error("[PMTTRPG] Change Outfit reaction update failed after declaration", error);
    ui.notifications.error(game.i18n.localize("PMTTRPG.ActionMenu.ChangeOutfitFailed"));
  }
}

export async function startChangeOutfit(actor, options = {}) {
  if (!actor) return;

  const timing = checkWorkflowTiming(actor, options, { economyType: ECONOMY_TYPES.ACTION, kind: ACTION_KINDS.CHANGE_OUTFIT });
  if (!timing.ok) {
    warnNotYourTurn(options);
    return { ok: false, reason: timing.reason };
  }

  const outfits = getEligibleOutfits(actor);
  if (!outfits.length) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.ActionMenu.NoOutfit"));
    return;
  }

  let selected;
  if (outfits.length === 1) {
    selected = outfits[0];
  } else {
    selected = await promptOutfitChoice(actor, outfits);
    if (!selected) return;
  }

  selected = resolveOwnedOutfit(actor, selected);
  if (!selected) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.ActionMenu.OutfitUnavailable"));
    return;
  }

  if (isAlreadyCurrentOutfit(actor, selected)) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.ActionMenu.OutfitAlreadyEquipped"));
    return;
  }

  const result = await declareActorAction({
    actor,
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.CHANGE_OUTFIT,
    cost: 1,
    item: selected,
    combatant: timing.combatant ?? options.combatant ?? null,
    tokenId: options.tokenId ?? options.token?.id ?? null,
    timing: options.timing ?? null,
    consume: options.consume,
  });
  if (!result.ok) return result;

  await applyChangeOutfitConsequences(actor, selected.id, result.declaration?.combatant ?? null, result.declaration?.combat ?? null);
  return result;
}
