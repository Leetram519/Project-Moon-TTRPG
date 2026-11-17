import { PMTTRPGUtility } from "../utility.js";
import { ACTION_KINDS, ECONOMY_TYPES } from "./kinds.js";
import { checkActionTiming } from "./timing.js";
import { declareActorAction, refuseIfUnaffordable } from "./declare.js";
import {
  getActionDefinition,
  groupedActionDefinitions,
} from "./catalog.js";
import {
  attachActionStatesToMenuRows,
  getActionStateEntries,
} from "./presentation.js";
import { getEffectiveReactionAvailability, resolveReactionCreditCombatant } from "./reaction-credits.js";
import { startAssist } from "./assist.js";
import { startGrapple, startGrappleReduceReactions, grappleMenuRowState } from "../grapple/grapple.js";
import { startBreakFree } from "../grapple/break-free.js";
import { startThrow } from "../grapple/throw.js";
import { startChangeOutfit } from "./change-outfit.js";
import { startChangeWeapons } from "./change-weapons.js";
import { startConvertToReactions } from "./convert-to-reactions.js";
import { startDash } from "./dash.js";
import { startDisengage } from "./disengage.js";
import { startProtect } from "./protect.js";
import { startReady } from "./ready.js";
import { startTakeCover } from "./take-cover.js";
import { startReduceStatus } from "./reduce-status.js";
import { startUseTool } from "./use-tool.js";
import { listHeldAttackWeapons } from "./attack-eligibility.js";
import {
  buildCustomActionMenuRows,
  collectProvidedActions,
  isCustomActionRowId,
  listActionMenuCategories,
  runCustomActionMenuChoice,
} from "./custom-actions.js";
import { cancelButton, confirmButton, itemPickerRows, pickRadioRow, waitForWindowChoice } from "../apps/dialog-wait.js";
import { ACTING_PURPOSES, resolveActingContext } from "./acting-token.js";

const { renderTemplate } = foundry.applications.handlebars;

const TEMPLATE_MENU = "systems/projectmoonttrpg/templates/dialog/action-menu.hbs";

const WORKFLOWS = {
  meleeAttack: (actor, options) => startWeaponAttack(actor, "melee", options),
  rangedAttack: (actor, options) => startWeaponAttack(actor, "ranged", options),
  assist: (actor, options) => startAssist(actor, options),
  changeOutfit: (actor, options) => startChangeOutfit(actor, options),
  changeWeapons: (actor, options) => startChangeWeapons(actor, options),
  convertToReactions: (actor, options) => startConvertToReactions(actor, options),
  dash: (actor, options) => startDash(actor, options),
  disengage: (actor, options) => startDisengage(actor, options),
  reduceStatus: (actor, options) => startReduceStatus(actor, options),
  useTool: (actor, options) => startUseTool(actor, options),
  protect: (actor, options) => startProtect(actor, options),
  ready: (actor, options) => startReady(actor, options),
  takeCover: (actor, options) => startTakeCover(actor, options),
  grapple: (actor, options) => startGrapple(actor, options),
  breakFree: (actor, options) => startBreakFree(actor, options),
  throw: (actor, options) => startThrow(actor, options),
  grappleReduceReactions: (actor, options) => startGrappleReduceReactions(actor, options),
};

const ATTACK_ROW_WEAPON_TYPES = { meleeAttack: "melee", rangedAttack: "ranged" };

function builtInRowState(def, context) {
  const weaponType = ATTACK_ROW_WEAPON_TYPES[def.id];
  if (weaponType && !getEligibleAttackWeapons(context.actor, weaponType).length) {
    const key = weaponType === "ranged" ? "PMTTRPG.ActionMenu.NoRangedWeapon" : "PMTTRPG.ActionMenu.NoMeleeWeapon";
    return { disabled: true, disabledReason: game.i18n.localize(key) };
  }
  const reactionsFor = (target) => getEffectiveReactionAvailability(target.actor, { combatant: target }).effective;
  let state = null;
  try {
    state = grappleMenuRowState(def.id, { combat: context.combat, combatant: context.combatant, reactionsFor });
  } catch (error) {
    console.warn("[PMTTRPG] Action Menu row state failed", error);
  }
  if (!state) return def.contextual ? { hidden: true } : {};
  return state;
}

function builtInRowTiming(def, context, entries) {
  const check = checkActionTiming({
    combat: context.combat,
    combatant: context.combatant,
    economyType: def.economyType ?? ECONOMY_TYPES.ACTION,
    kind: def.kind,
  });
  if (check.ok) {
    return check.asReaction && def.offTurnCostKey ? { costLabel: game.i18n.localize(def.offTurnCostKey) } : {};
  }
  if (def.endableOffTurn && (entries ?? []).some((entry) => entry?.actionId === def.id)) return {};
  return { disabled: true, disabledReason: game.i18n.localize("PMTTRPG.ActionMenu.NotYourTurn") };
}

function startCatalogWorkflow(actionId, actor, options) {
  const def = getActionDefinition(actionId);
  const start = def?.workflow ? WORKFLOWS[def.workflow] : null;
  if (!start) {
    ui.notifications.info(game.i18n.format("PMTTRPG.ActionMenu.NotImplemented", {
      name: def ? game.i18n.localize(def.labelKey) : actionId,
    }));
    return;
  }
  return start(actor, options);
}

export function getEligibleAttackWeapons(actor, weaponType) {
  return listHeldAttackWeapons(actor, weaponType);
}

async function promptWeaponChoice(actor, weapons, weaponType) {
  const itemId = await pickRadioRow({
    title: weaponType === "ranged"
      ? game.i18n.localize("PMTTRPG.ActionMenu.RangedAttack")
      : game.i18n.localize("PMTTRPG.ActionMenu.MeleeAttack"),
    hint: game.i18n.localize("PMTTRPG.ActionMenu.ChooseWeapon"),
    inputName: "weaponId",
    rows: itemPickerRows(weapons, game.i18n.localize("PMTTRPG.ToolHeld")),
  });
  return itemId ? actor.items.get(itemId) ?? null : null;
}

async function startWeaponAttack(actor, weaponType, options = {}) {
  const weapons = getEligibleAttackWeapons(actor, weaponType);
  if (!weapons.length) {
    const key = weaponType === "ranged"
      ? "PMTTRPG.ActionMenu.NoRangedWeapon"
      : "PMTTRPG.ActionMenu.NoMeleeWeapon";
    ui.notifications.warn(game.i18n.localize(key));
    return;
  }

  const weapon = weapons.length === 1
    ? weapons[0]
    : await promptWeaponChoice(actor, weapons, weaponType);
  if (!weapon) return;

  return weapon.roll({
    tokenId: options.token?.id ?? options.tokenId ?? null,
    combatant: options.combatant ?? null,
    timing: options.timing ?? null,
    consumeAction: options.consume !== false,
  });
}

function menuActionStateEntries(actor, options = {}) {
  try {
    const combat = game.combat;
    if (!combat) return { entries: [], combat };
    const combatant = resolveReactionCreditCombatant(actor, {
      combat,
      combatant: options.combatant,
      tokenId: options.token?.id ?? options.tokenId ?? actor?.token?.id ?? null,
    });
    if (!combatant) return { entries: [], combat };
    return { entries: getActionStateEntries(combatant, { combat, user: game.user }), combat };
  } catch (error) {
    console.warn("[PMTTRPG] Action Menu action state display failed", error);
    return { entries: [], combat: null };
  }
}

function customActionContext(actor, options = {}) {
  const combat = game.combat;
  const tokenId = options.token?.id ?? options.tokenId ?? actor?.token?.id ?? null;
  let combatant = options.combatant ?? null;
  if (!combatant && combat) {
    try {
      combatant = resolveReactionCreditCombatant(actor, { combat, combatant: options.combatant, tokenId });
    } catch {
      combatant = null;
    }
  }
  return {
    actor,
    combat,
    combatant,
    token: options.token ?? null,
    tokenId: tokenId ?? combatant?.tokenId ?? null,
    user: game.user,
    nightmode: PMTTRPGUtility.nightmode,
    consume: options.consume !== false,
  };
}

async function customMenuRowsByCategory(context) {
  try {
    const rows = await buildCustomActionMenuRows(await collectProvidedActions(context), context);
    const byCategory = new Map();
    for (const row of rows) {
      const list = byCategory.get(row.categoryId) ?? [];
      list.push(row);
      byCategory.set(row.categoryId, list);
    }
    return byCategory;
  } catch (error) {
    console.warn("[PMTTRPG] Action Menu custom Actions unavailable", error);
    return new Map();
  }
}

function categoryLabel(category) {
  return category.labelKey ? game.i18n.localize(category.labelKey) : (category.label ?? category.id);
}

async function promptActionMenu(actor, options = {}) {
  const { entries, combat } = menuActionStateEntries(actor, options);
  const context = customActionContext(actor, options);
  const customRows = await customMenuRowsByCategory(context);
  const builtIn = new Map(groupedActionDefinitions().map((group) => [group.id, group.actions]));
  let checkFirst = true;
  const groups = listActionMenuCategories().map((category) => {
    const rows = attachActionStatesToMenuRows(
      (builtIn.get(category.id) ?? [])
        .map((action) => {
          const owned = builtInRowState(action, context);
          return {
            id: action.id,
            label: game.i18n.localize(action.labelKey),
            costLabel: action.costKey ? game.i18n.localize(action.costKey) : null,
            ...owned,
            ...(owned.hidden || owned.disabled ? {} : builtInRowTiming(action, context, entries)),
          };
        })
        .filter((row) => !row.hidden),
      entries,
      { combat },
    ).concat(customRows.get(category.id) ?? []);
    for (const row of rows) {
      row.checked = checkFirst && !row.disabled;
      if (row.checked) checkFirst = false;
    }
    return { id: category.id, label: categoryLabel(category), actions: rows };
  }).filter((group) => group.actions.length);

  const html = await renderTemplate(TEMPLATE_MENU, {
    groups,
    i18n: {
      title: game.i18n.localize("PMTTRPG.ActionMenu.Title"),
      consume: game.i18n.localize("PMTTRPG.ActionMenu.Consume"),
      consumeHint: game.i18n.localize("PMTTRPG.ActionMenu.ConsumeHint"),
    },
  });

  return waitForWindowChoice({
    window: { title: game.i18n.localize("PMTTRPG.ActionMenu.Title") },
    classes: ["pm-action-menu"],
    content: html,
    buttons: [
      cancelButton(),
      confirmButton((_event, _button, dialog) => {
        const form = dialog.element.querySelector("form");
        const actionId = form.querySelector("[name='actionId']:checked")?.value.trim() || null;
        if (!actionId) return null;
        return { actionId, consume: form.querySelector("[name='consume']").checked };
      }),
    ],
    rejectClose: false,
  });
}

const openMenus = new Set();

function menuKey(actor) {
  return actor?.uuid ?? actor?.id ?? null;
}

/**
 * Opens the Combat Action Menu and starts the workflow you pick. Only one menu or
 * workflow runs per actor at a time.
 */
export async function openActionMenu(actor, options = {}) {
  if (!actor) return;
  const held = [];
  const hold = (target) => {
    const key = menuKey(target);
    if (!key) return true;
    if (held.includes(key)) return true;
    if (openMenus.has(key)) return false;
    openMenus.add(key);
    held.push(key);
    return true;
  };
  const busy = (target) => {
    ui.notifications.warn(game.i18n.format("PMTTRPG.ActionMenu.Busy", { name: target?.name ?? "" }));
  };
  try {
    if (!hold(actor)) return busy(actor);
    const acting = await resolveActingContext(actor, {
      sheetToken: options.token ?? null,
      combat: options.combat ?? game.combat,
      purpose: ACTING_PURPOSES.ACTION,
    });
    if (!acting) return;
    if (!hold(acting.actor)) return busy(acting.actor);
    const actingActor = acting.actor;
    const actingOptions = {
      ...options,
      token: acting.token?.object ?? acting.token ?? options.token ?? null,
      tokenId: acting.tokenId ?? options.tokenId ?? null,
      combatant: acting.combatant ?? options.combatant ?? null,
    };

    const picked = await promptActionMenu(actingActor, actingOptions);
    if (!picked?.actionId) return;
    const { actionId } = picked;
    actingOptions.consume = picked.consume !== false;

    if (isCustomActionRowId(actionId)) {
      return await runCustomActionMenuChoice(actionId, customActionContext(actingActor, actingOptions));
    }

    const def = getActionDefinition(actionId);
    if (!def?.implemented || !def.workflow) {
      ui.notifications.info(game.i18n.format("PMTTRPG.ActionMenu.NotImplemented", {
        name: def ? game.i18n.localize(def.labelKey) : actionId,
      }));
      return;
    }
    if (def.checkCostFirst && refuseIfUnaffordable(actingActor, {
      economyType: def.economyType ?? ECONOMY_TYPES.ACTION,
      kind: def.kind,
      consume: actingOptions.consume,
      combat: actingOptions.combat ?? game.combat,
      combatant: actingOptions.combatant ?? null,
      tokenId: actingOptions.tokenId ?? null,
      timing: actingOptions.timing ?? null,
    })) return;

    return await startCatalogWorkflow(actionId, actingActor, actingOptions);
  } finally {
    for (const key of held) openMenus.delete(key);
  }
}

export async function declareManualEconomy(actor, economyType, options = {}) {
  return declareActorAction({
    actor,
    economyType,
    kind: ACTION_KINDS.MANUAL,
    cost: 1,
    combatant: options.combatant ?? null,
    tokenId: options.tokenId ?? options.token?.id ?? null,
    metadata: { source: "usedActionEconomy" },
  });
}
