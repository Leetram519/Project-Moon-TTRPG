/**
 * Two dialogs:
 *
 *   showRetaliationDialog(actor, state, { allowedTypes })
 *     Shown when a player clicks Retaliate, Intercept or Protect.
 *     Lets them pick: Evade / Recycled Evade / Block / Counter (+ weapon)
 *     Optional matching Skill or Applied Tool (mutex) on Block / Evade /
 *     Counter / Recycled Evade.
 *     Protect limits the list with allowedTypes (Recycled Evade counts as
 *     Evade, One-Sided drops out).
 *     Returns a RetaliationChoice or null if cancelled.
 *
 *   showInterceptConfirmDialog(actorName)
 *     Two-click confirmation shown when Intercept is used as the selected token.
 *     Returns true (confirmed) or false.
 *
 * @typedef {object} RetaliationChoice
 * @property {"evade"|"recycledEvade"|"block"|"counter"|"intercept"|"onesided"} type
 * @property {Item|null} item   — chosen weapon for counter; outfit for evade/block
 * @property {Item|null} [skillItem]
 * @property {boolean} [consumeSkillLight]
 * @property {Item|null} [appliedTool]
 * @property {boolean} [consumeAppliedTool]
 * @property {boolean} [recycled]
 * @property {Item|null} [ammo]
 * @property {boolean} [consumeAmmo]
 * @property {boolean} [dryFire]
 * @property {boolean} [consumeReaction]
 */

import { PMTTRPGUtility } from "../utility.js";
import { showWeaponRange, hideWeaponRange } from "../canvas/token.js";
import {
  getAppliedToolOptions,
  isAppliedToolEligible,
} from "../item/applied-tool.js";
import { getToolUsesRemaining, toolConsumesByDefault } from "../item/tool-use.js";
import { RETALIATION_TYPES, retaliationDefenseKind } from "./clash-state.js";
import { canPayRetaliation } from "./clash-economy.js";
import { getRecycledEvade } from "./recycled-evade.js";
import { assistChoiceOptions } from "../action-economy/assist.js";
import { canPayReactionForDeclaration, combatantForReactionToken } from "../action-economy/reaction-credits.js";
import { ACTION_KINDS } from "../action-economy/kinds.js";
import { findRelationshipForTarget } from "../grapple/grapple-state.js";
import { waitForChoice } from "../apps/dialog-wait.js";

function canBreakFreeAfterHit(actor, combatant, combat) {
  if (!combatant || !combat) return false;
  if (!findRelationshipForTarget(combat, combatant.id)) return false;
  return canPayReactionForDeclaration(actor, { kind: ACTION_KINDS.BREAK_FREE, itemId: null }, { combatant });
}

const { renderTemplate } = foundry.applications.handlebars;

const TEMPLATE_RETALIATION = "systems/projectmoonttrpg/templates/dialog/clash/retaliation-dialog.hbs";
const TEMPLATE_AMMO = "systems/projectmoonttrpg/templates/dialog/weapon-ammo-dialog.html";

// ── Intercept confirmation ────────────────────────────────────────────────────

/**
 * Shows a two-click "Are you sure you want to intercept?" confirmation.
 * @param {string} [actorName]
 * @returns {Promise<boolean>}
 */
export async function showInterceptConfirmDialog(actorName = "") {
  const result = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("PMTTRPG.Clash.InterceptTitle") },
    content: `<p>${game.i18n.format("PMTTRPG.Clash.InterceptConfirm", { name: actorName })}</p>`,
    classes: _dialogClasses(),
    rejectClose: false,
    yes: { label: game.i18n.localize("PMTTRPG.Clash.InterceptConfirmYes"), icon: "fa-solid fa-person-running" },
    no:  { label: game.i18n.localize("PMTTRPG.Dialog.cancel"),             icon: "fa-solid fa-xmark" },
  });
  return result === true;
}

// ── Retaliation dialog ────────────────────────────────────────────────────────

/**
 * Shows the retaliation option dialog.
 *
 * @param {ActorPMTTRPG} actor        — the actor who is retaliating
 * @param {ClashStateData} state
 * @param {object} [options]
 * @param {string|null} [options.retaliatorTokenId]
 * @param {boolean} [options.defensiveOnly=false]
 * @param {string[]|null} [options.allowedTypes]
 * @param {string|null} [options.titleKey]
 * @param {string|null} [options.protectedName]
 * @param {Combat|null} [options.combat]
 * @returns {Promise<RetaliationChoice|null>}
 */
export async function showRetaliationDialog(actor, state, {
  retaliatorTokenId = null,
  defensiveOnly = false,
  allowedTypes = null,
  titleKey = null,
  protectedName = null,
  combat: clashCombat = null,
} = {}) {
  // Counter gets checked per weapon since an item-bound Small credit only allows its own weapon
  const combat = clashCombat ?? game.combat ?? null;
  const affordable = (type, item) => canPayRetaliation(actor, type, item, { tokenId: retaliatorTokenId, combat, state });

  const equippedWeapons = actor.items
    .filter(i => i.type === "weapon" && i.system?.equipped)
    .map(i => {
      const check = PMTTRPGUtility.getWeaponRangeCheck(
        retaliatorTokenId,
        state.attackerTokenId,
        { weapon: i },
      );
      return {
        id: i.id,
        name: i.name,
        img: i.img,
        type: "weapon",
        range: check.range,
        distance: check.distance,
        inRange: check.inRange,
        affordable: affordable(RETALIATION_TYPES.COUNTER, i),
      };
    });

  const outfits = actor.items.filter(i => i.type === "outfit" && i.system?.equipped);
  const outfitEntries = (type) => outfits.map(i => ({
    id: i.id,
    name: i.name,
    img: i.img,
    type: "outfit",
    affordable: affordable(type, i),
  }));
  const equippedOutfits = outfitEntries(RETALIATION_TYPES.EVADE);

  const skills = actor.items
    .filter(i => i.type === "skill")
    .map(i => ({ id: i.id, name: i.name, img: i.img, skillType: String(i.system?.skillType ?? "attack").toLowerCase() }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const appliedTools = _appliedToolEntries(actor);

  const recycled = getRecycledEvade(actor);

  const retaliatorCombatant = combatantForReactionToken(actor, retaliatorTokenId, combat);
  const assistOptions = retaliatorCombatant ? assistChoiceOptions(retaliatorCombatant, { combat }) : [];
  const breakFree = !allowedTypes && canBreakFreeAfterHit(actor, retaliatorCombatant, combat)
    ? { label: game.i18n.localize("PMTTRPG.Grapple.BreakFreeAfterHit") }
    : null;

  const templateData = {
    actor,
    state,
    equippedWeapons,
    equippedOutfits,
    skills,
    appliedTools,
    assistOptions: assistOptions.length ? assistOptions : null,
    breakFree,
    recycledEvade: recycled,
    options: _buildRetaliationOptions({
      weapons: equippedWeapons,
      blockOutfits: outfitEntries(RETALIATION_TYPES.BLOCK),
      evadeOutfits: equippedOutfits,
      recycledOutfits: outfitEntries(RETALIATION_TYPES.RECYCLED_EVADE),
      recycled,
      defensiveOnly,
      allowedTypes,
    }),
    i18n: {
      title: game.i18n.localize(titleKey || "PMTTRPG.Clash.RetaliateTitle"),
      evade:      game.i18n.localize("PMTTRPG.Clash.Evade"),
      block:      game.i18n.localize("PMTTRPG.Clash.Block"),
      counter:    game.i18n.localize("PMTTRPG.Clash.Counter"),
      onesided:   game.i18n.localize("PMTTRPG.Clash.OneSided"),
      attackedBy: protectedName
        ? game.i18n.format("PMTTRPG.Clash.ProtectingFrom", { name: protectedName })
        : game.i18n.format("PMTTRPG.Clash.AttackedBy", { name: state.attackerName }),
      outfit:     game.i18n.localize("PMTTRPG.Clash.ChooseOutfit"),
      weapon:     game.i18n.localize("PMTTRPG.Clash.ChooseWeapon"),
      skill:      game.i18n.localize("PMTTRPG.Clash.ChooseSkill"),
      skillOptional: game.i18n.localize("PMTTRPG.Clash.OptionalSkill"),
      skillNone:  game.i18n.localize("PMTTRPG.Clash.NoSkill"),
      consumeLight: game.i18n.localize("PMTTRPG.Dialog.consumeLight"),
      toolOptional: game.i18n.localize("PMTTRPG.Clash.OptionalAppliedTool"),
      toolNone:   game.i18n.localize("PMTTRPG.Dialog.noAppliedTool"),
      consumeTool: game.i18n.localize("PMTTRPG.Dialog.consumeToolUse"),
      consumeReaction: game.i18n.localize("PMTTRPG.Dialog.consumeReaction"),
      assist:     game.i18n.localize("PMTTRPG.Assist.ChoiceLabel"),
      confirm:    game.i18n.localize("PMTTRPG.Clash.Confirm"),
      cancel:     game.i18n.localize("PMTTRPG.Dialog.cancel"),
    },
  };

  const html = await renderTemplate(TEMPLATE_RETALIATION, templateData);
  const hideRange = () => {
    if (retaliatorTokenId) hideWeaponRange(retaliatorTokenId);
  };

  return waitForChoice({
    window: { title: templateData.i18n.title },
    classes: _dialogClasses(),
    position: { width: 320 },
    content: html,
    buttons: [
      {
        action: "confirm",
        label: templateData.i18n.confirm,
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button, dialog) => {
          hideRange();
          return _readRetaliationForm(dialog, actor);
        },
      },
      {
        action: "cancel",
        label: templateData.i18n.cancel,
        icon: "fa-solid fa-xmark",
        callback: () => {
          hideRange();
          return null;
        },
      },
    ],
    rejectClose: false,
    render: (event, dialog) => _bindRetaliationDialogListeners(dialog, { retaliatorTokenId }),
    close: hideRange,
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Builds the ordered list of retaliation options for the template.
 */
function _buildRetaliationOptions({
  weapons = [],
  blockOutfits = [],
  evadeOutfits = [],
  recycledOutfits = [],
  recycled = null,
  defensiveOnly = false,
  allowedTypes = null,
} = {}) {
  const options = [];

  if (recycled && recycledOutfits.length) {
    options.push({
      type: RETALIATION_TYPES.RECYCLED_EVADE,
      labelText: game.i18n.format("PMTTRPG.Clash.RecycledEvade", { penalty: recycled.penalty }),
      icon: "systems/projectmoonttrpg/assets/icons/sheet/01_evade",
      requiresItem: true,
      items: recycledOutfits,
      recycled: true,
    });
  }

  if (evadeOutfits.length) {
    options.push({
      type: RETALIATION_TYPES.EVADE,
      label: "PMTTRPG.Clash.Evade",
      icon: "systems/projectmoonttrpg/assets/icons/sheet/01_evade",
      requiresItem: true,
      items: evadeOutfits,
    });
  }
  if (blockOutfits.length) {
    options.push({
      type: RETALIATION_TYPES.BLOCK,
      label: "PMTTRPG.Clash.Block",
      icon: "systems/projectmoonttrpg/assets/icons/sheet/01_defense",
      requiresItem: true,
      items: blockOutfits,
    });
  }

  if (weapons.length && !defensiveOnly) {
    options.push({
      type: RETALIATION_TYPES.COUNTER,
      label: "PMTTRPG.Clash.Counter",
      icon: "systems/projectmoonttrpg/assets/icons/sheet/00_slash",
      requiresItem: true,
      items: weapons,
    });
  }

  options.push({
    type: RETALIATION_TYPES.ONESIDED,
    label: "PMTTRPG.Clash.OneSided",
    icon: "systems/projectmoonttrpg/assets/icons/sheet/03_danger1",
    requiresItem: false,
  });

  const allowed = Array.isArray(allowedTypes) ? new Set(allowedTypes) : null;
  const visible = allowed
    ? options.filter((option) => allowed.has(retaliationDefenseKind(option.type)))
    : options;

  for (const option of visible) {
    option.unavailable = option.requiresItem
      && !(option.items ?? []).some((item) => item.affordable !== false);
  }
  const first = visible.find((option) => !option.unavailable) ?? visible[0];
  for (const option of visible) option.checked = option === first;

  return visible;
}

function _skillTypeForRetaliation(type) {
  if (type === RETALIATION_TYPES.BLOCK) return "block";
  if (type === RETALIATION_TYPES.EVADE || type === RETALIATION_TYPES.RECYCLED_EVADE) return "evade";
  if (type === RETALIATION_TYPES.COUNTER) return "attack";
  return null;
}

/**
 * Weapon Applied Tools declare on Attack/Counter.
 * Outfit Applied Tools declare on Block/Evade.
 */
function _applyToForRetaliation(type) {
  if (type === RETALIATION_TYPES.COUNTER) return "weapon";
  if (
    type === RETALIATION_TYPES.BLOCK
    || type === RETALIATION_TYPES.EVADE
    || type === RETALIATION_TYPES.RECYCLED_EVADE
  ) return "outfit";
  return null;
}

function _appliedToolEntries(actor) {
  const map = (applyTo) => getAppliedToolOptions(actor, applyTo).map(item => ({
    id: item.id,
    name: item.name,
    remaining: getToolUsesRemaining(item),
    applyTo,
    consumes: toolConsumesByDefault(item),
  }));
  return [...map("weapon"), ...map("outfit")];
}

/**
 * Reads and validates the submitted retaliation form.
 * Returns a RetaliationChoice or null.
 */
function _readRetaliationForm(dialog, actor) {
  const form = dialog.element?.querySelector("form");
  if (!form) return null;

  const type   = form.querySelector("[name='retaliationType']:checked")?.value ?? null;
  const itemId = form.querySelector("[name='retaliationItemId']")?.value?.trim() ?? null;
  const skillId = form.querySelector("[name='declaredSkillId']")?.value?.trim() ?? "";
  const consumeSkillLight = form.querySelector("[name='consumeSkillLight']")?.checked !== false;
  const toolId = form.querySelector("[name='appliedToolId']")?.value?.trim() ?? "";
  const consumeAppliedTool = form.querySelector("[name='consumeAppliedTool']")?.checked !== false;
  const assistEntryId = form.querySelector("[name='assistEntryId']")?.value.trim() || null;
  const breakFreeAfterHit = form.querySelector("[name='breakFreeAfterHit']")?.checked === true;
  const consumeReaction = form.querySelector("[name='consumeReaction']")?.checked !== false;

  if (!type) return null;

  // Disabled options and unaffordable items still show up, they just get
  // rejected here (unless Consume Reaction is unticked).
  const optionInput = form.querySelector(`.clash-option[data-type="${type}"] input[name='retaliationType']`);
  if (optionInput?.disabled) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.Clash.OptionUnavailable"));
    return null;
  }

  let item = null;
  if (itemId) {
    item = actor.items.get(itemId) ?? null;
    const itemEntry = form.querySelector(`.clash-item-option[data-type="${type}"][data-item-id="${itemId}"]`);
    if (consumeReaction && itemEntry?.dataset.affordable === "0") {
      ui.notifications.warn(game.i18n.localize("PMTTRPG.Clash.OptionUnavailable"));
      return null;
    }
  }
  // For counter, require an item selection.
  if (type === RETALIATION_TYPES.COUNTER && !item) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.Clash.NoItemSelected"));
    return null;
  }

  const wantType = _skillTypeForRetaliation(type);
  let skillItem = null;
  if (wantType && skillId) {
    const picked = actor.items.get(skillId) ?? null;
    if (picked?.type === "skill" && String(picked.system?.skillType ?? "attack").toLowerCase() === wantType) {
      skillItem = picked;
    }
  }

  const applyTo = _applyToForRetaliation(type);
  let appliedTool = null;
  if (!skillItem && applyTo && toolId) {
    const picked = actor.items.get(toolId) ?? null;
    if (isAppliedToolEligible(picked, applyTo)) appliedTool = picked;
  }

  return {
    type,
    item,
    skillItem,
    consumeSkillLight: !!skillItem && consumeSkillLight,
    appliedTool,
    consumeAppliedTool: !!appliedTool && consumeAppliedTool,
    recycled: type === RETALIATION_TYPES.RECYCLED_EVADE,
    // One-Sided has no roll for the grant to help (it stays unspent)
    assistEntryId: type === RETALIATION_TYPES.ONESIDED ? null : assistEntryId,
    breakFreeAfterHit: type === RETALIATION_TYPES.ONESIDED && breakFreeAfterHit,
    consumeReaction,
  };
}

/**
 * Prompt ammo and dry-fire for ranged attacks.
 *
 * @param {ActorPMTTRPG} actor
 * @param {Item} weapon
 * @param {{ shootLabel?: string }} [options]
 * @returns {Promise<{ ammo: Item|null, consumeAmmo: boolean, dryFire: boolean }|null>}
 */
export async function promptRangedAmmo(actor, weapon, { shootLabel } = {}) {
  const ammoOptions = (actor.items ?? [])
    .filter(i => i.type === "ammunition" && Number(i.system?.quantity ?? 0) > 0)
    .map((item, index) => ({
      id: item.id,
      name: item.name,
      img: item.img,
      quantity: Number(item.system?.quantity ?? 0),
      ammoType: item.system?.ammoType ?? null,
      damageType: item.system?.damageType ?? null,
      isDefault: index === 0,
      ammoTypeLabel: item.system?.ammoType
        ? game.i18n.localize(`PMTTRPG.Ammo${item.system.ammoType[0].toUpperCase()}${item.system.ammoType.slice(1)}`)
        : null,
      damageTypeLabel: item.system?.damageType
        ? game.i18n.localize(`PMTTRPG.DamageType${item.system.damageType[0].toUpperCase()}${item.system.damageType.slice(1)}`)
        : null,
    }));

  const html = await renderTemplate(TEMPLATE_AMMO, {
    weapon: {
      name: weapon.name,
      img: weapon.img,
      offensiveDiceComputed: weapon.system?.offensiveDiceComputed,
      system: { damageType: weapon.system?.damageType },
    },
    ammoOptions,
  });

  const buttons = [];
  if (ammoOptions.length) {
    buttons.push({
      action: "shoot",
      label: shootLabel || game.i18n.localize("PMTTRPG.Dialog.roll"),
      icon: "fa-solid fa-bullseye",
      default: true,
      callback: (event, button, dialog) => {
        const form = dialog.element?.querySelector("form");
        const ammoId = form?.ammoId?.value;
        const ammo = ammoId ? actor.items.get(ammoId) ?? null : null;
        if (!ammo) {
          ui.notifications.warn(game.i18n.localize("PMTTRPG.Clash.NoAmmoSelected"));
          return null;
        }
        return {
          ammo,
          consumeAmmo: form?.consumeAmmo?.checked !== false,
          dryFire: false,
        };
      },
    });
  }
  buttons.push({
    action: "dryfire",
    label: game.i18n.localize("PMTTRPG.Clash.DryFire"),
    icon: "fa-solid fa-triangle-exclamation",
    default: !ammoOptions.length,
    callback: () => ({ ammo: null, consumeAmmo: false, dryFire: true }),
  });
  buttons.push({
    action: "cancel",
    label: game.i18n.localize("PMTTRPG.Dialog.cancel"),
    icon: "fa-solid fa-xmark",
    callback: () => null,
  });

  return waitForChoice({
    window: { title: game.i18n.localize("PMTTRPG.Dialog.chooseAmmunition") },
    classes: _dialogClasses(),
    content: html,
    buttons,
    rejectClose: false,
  });
}

function _counterRangeFromOption(src) {
  if (!src) return null;
  const rangeRaw = src.dataset.range;
  const distanceRaw = src.dataset.distance;
  const range = rangeRaw === "" || rangeRaw == null ? null : Number(rangeRaw);
  const distance = distanceRaw === "" || distanceRaw == null ? null : Number(distanceRaw);
  return {
    inRange: src.dataset.inRange !== "0",
    range: Number.isFinite(range) ? range : null,
    distance: Number.isFinite(distance) ? distance : null,
  };
}

function _counterOutOfRangeNotice(check) {
  if (!check || check.inRange) return "";
  if (check.distance != null && check.range != null) {
    return game.i18n.format("PMTTRPG.Clash.CounterOutOfRangeHintMeasured", {
      distance: check.distance,
      range: check.range,
    });
  }
  return game.i18n.localize("PMTTRPG.Clash.CounterOutOfRangeHint");
}

function _bindRetaliationDialogListeners(dialog, { retaliatorTokenId = null } = {}) {
  const el = dialog.element;
  if (!el) return;

  const radios    = el.querySelectorAll("[name='retaliationType']");
  const itemPicker = el.querySelector(".clash-item-picker");
  const itemKind = el.querySelector(".clash-item-picker__kind");
  const skillPicker = el.querySelector(".clash-skill-picker");
  const skillSelect = el.querySelector("[name='declaredSkillId']");
  const consumeWrap = el.querySelector(".clash-skill-consume");
  const toolPicker = el.querySelector(".clash-tool-picker");
  const toolSelect = el.querySelector("[name='appliedToolId']");
  const toolConsumeWrap = el.querySelector(".clash-tool-consume");
  const itemSelect = el.querySelector("[name='retaliationItemId']");
  const rangeTag = el.querySelector(".clash-option__range-tag");
  const rangeNotice = el.querySelector(".clash-range-notice");
  const rangeNoticeText = el.querySelector(".clash-range-notice__text");
  const assistPicker = el.querySelector(".clash-assist-picker");

  // if Consume Reaction is unticked then the options that only lacked a Reaction become selectable
  const consumeReaction = el.querySelector("[name='consumeReaction']");
  const consuming = () => consumeReaction?.checked !== false;
  const refreshAffordability = () => {
    for (const label of el.querySelectorAll(".clash-option--unavailable")) {
      const input = label.querySelector("input[name='retaliationType']");
      if (input) input.disabled = consuming();
    }
  };

  const refreshAssist = () => {
    if (!assistPicker) return;
    const selected = el.querySelector("[name='retaliationType']:checked")?.value;
    assistPicker.style.display = selected === RETALIATION_TYPES.ONESIDED ? "none" : "";
  };

  // Break Free after the hit only shows up for One-Sided
  const breakFreeToggle = el.querySelector(".clash-break-free");
  const refreshBreakFree = () => {
    if (!breakFreeToggle) return;
    const selected = el.querySelector("[name='retaliationType']:checked")?.value;
    breakFreeToggle.style.display = selected === RETALIATION_TYPES.ONESIDED ? "" : "none";
  };

  const fillNoneOption = (select, label) => {
    if (!select) return;
    select.innerHTML = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = label;
    select.appendChild(none);
  };

  const refreshToolConsume = () => {
    const consumes = toolSelect?.selectedOptions?.[0]?.dataset?.consumes === "1";
    if (toolConsumeWrap) toolConsumeWrap.style.display = consumes ? "" : "none";
  };

  const refreshConsume = () => {
    const hasSkill = !!skillSelect?.value;
    if (consumeWrap) consumeWrap.style.display = hasSkill ? "" : "none";
  };

  const refreshTools = () => {
    const selected = el.querySelector("[name='retaliationType']:checked")?.value;
    const applyTo = _applyToForRetaliation(selected);
    const hasSkill = !!skillSelect?.value;
    const noneLabel = toolPicker?.dataset?.noneLabel
      ?? game.i18n.localize("PMTTRPG.Dialog.noAppliedTool");

    fillNoneOption(toolSelect, noneLabel);
    if (applyTo && !hasSkill && toolSelect) {
      const toolOpts = el.querySelectorAll(`.clash-tool-option[data-apply-to="${applyTo}"]`);
      for (const item of toolOpts) {
        const opt = document.createElement("option");
        opt.value = item.dataset.itemId;
        const remaining = item.dataset.remaining;
        opt.textContent = remaining != null && remaining !== ""
          ? `${item.dataset.itemName} (${remaining})`
          : item.dataset.itemName;
        opt.dataset.consumes = item.dataset.consumes ?? "0";
        toolSelect.appendChild(opt);
      }
    }

    const hasTools = applyTo && !hasSkill
      && el.querySelector(`.clash-tool-option[data-apply-to="${applyTo}"]`);
    if (toolPicker) toolPicker.style.display = hasTools ? "" : "none";
    refreshToolConsume();
  };

  const refreshCounterRange = () => {
    const selected = el.querySelector("[name='retaliationType']:checked")?.value;
    const isCounter = selected === RETALIATION_TYPES.COUNTER;
    let src = null;
    if (isCounter && itemSelect?.value) {
      src = el.querySelector(`.clash-item-option[data-type="counter"][data-item-id="${itemSelect.value}"]`);
    } else {
      src = el.querySelector('.clash-item-option[data-type="counter"]');
    }
    const check = _counterRangeFromOption(src);
    const text = _counterOutOfRangeNotice(check);
    if (rangeTag) rangeTag.hidden = !text;
    if (rangeNotice) rangeNotice.hidden = !(isCounter && text);
    if (rangeNoticeText) rangeNoticeText.textContent = isCounter ? text : "";

    if (isCounter && retaliatorTokenId && check?.range != null) {
      showWeaponRange(retaliatorTokenId, check.range);
    } else if (retaliatorTokenId) {
      hideWeaponRange(retaliatorTokenId);
    }
  };

  const refreshPicker = () => {
    const selected = el.querySelector("[name='retaliationType']:checked")?.value;
    const needsItem = [
      RETALIATION_TYPES.BLOCK,
      RETALIATION_TYPES.EVADE,
      RETALIATION_TYPES.RECYCLED_EVADE,
      RETALIATION_TYPES.COUNTER,
    ].includes(selected);
    if (itemPicker) itemPicker.style.display = needsItem ? "" : "none";

    const applyTo = _applyToForRetaliation(selected);
    if (itemKind) {
      itemKind.textContent = applyTo === "outfit"
        ? (itemKind.dataset.outfit || itemKind.textContent)
        : (itemKind.dataset.weapon || itemKind.textContent);
    }

    if (itemSelect && needsItem) {
      const items = el.querySelectorAll(`.clash-item-option[data-type="${selected}"]`);
      itemSelect.innerHTML = "";
      for (const item of items) {
        const opt = document.createElement("option");
        opt.value   = item.dataset.itemId;
        opt.textContent = item.dataset.itemName;
        opt.disabled = consuming() && item.dataset.affordable === "0";
        itemSelect.appendChild(opt);
      }
      const current = itemSelect.selectedOptions[0];
      if (!current || current.disabled) {
        const enabled = [...itemSelect.options].find((option) => !option.disabled);
        if (enabled) itemSelect.value = enabled.value;
      }
    }

    const wantType = _skillTypeForRetaliation(selected);
    const skillNoneLabel = skillPicker?.dataset?.noneLabel
      ?? game.i18n.localize("PMTTRPG.Clash.NoSkill");
    fillNoneOption(skillSelect, skillNoneLabel);
    if (wantType && skillSelect) {
      const skillOpts = el.querySelectorAll(`.clash-skill-option[data-skill-type="${wantType}"]`);
      for (const item of skillOpts) {
        const opt = document.createElement("option");
        opt.value = item.dataset.itemId;
        opt.textContent = item.dataset.itemName;
        skillSelect.appendChild(opt);
      }
    }

    const hasSkills = wantType && el.querySelector(`.clash-skill-option[data-skill-type="${wantType}"]`);
    if (skillPicker) skillPicker.style.display = hasSkills ? "" : "none";
    refreshConsume();
    refreshTools();
    refreshCounterRange();
    refreshAssist();
    refreshBreakFree();
  };

  for (const radio of radios) {
    radio.addEventListener("change", refreshPicker);
  }
  skillSelect?.addEventListener("change", () => {
    refreshConsume();
    refreshTools();
  });
  toolSelect?.addEventListener("change", refreshToolConsume);
  itemSelect?.addEventListener("change", refreshCounterRange);
  consumeReaction?.addEventListener("change", () => {
    refreshAffordability();
    refreshPicker();
  });

  refreshAffordability();
  refreshPicker();
}

function _dialogClasses() {
  const classes = ["projectmoonttrpg", "PMTTRPG-dialog"];
  if (PMTTRPGUtility.nightmode) classes.push("nightmode");
  return classes;
}
