import { applyDeclaredActorUpdate, declareActorAction } from "./declare.js";
import { ACTION_KINDS, ECONOMY_TYPES } from "./kinds.js";
import { resolveWorkflowContext } from "./timing.js";
import {
  buildAssistChoiceOptions,
  listValidAssistEntries,
  makeAssistEntry,
  resolveAssistSourceName,
} from "./assist-state.js";
import {
  ACTION_STATE_CATEGORIES,
  ACTION_STATE_ROLES,
  ACTION_STATE_VISIBILITY,
  registerActionStatePresenter,
} from "./presentation.js";
import { resolveReactionCreditCombatant } from "./reaction-credits.js";

/**
 * Assist: the assister pays 1 Action and 1 Light and the recipient gets one Advantage
 * for any roll before the end of their next turn. The grants live on the recipient
 * Combatant and go through the owner-or-GM route.
 */

const ASSIST_LIGHT_COST = 1;
const ASSIST_PRESENTER_ID = "assist";
const ASSIST_ACTION_STATE_ICON = "systems/projectmoonttrpg/assets/icons/Statuses/PlayerState_Assist.webp";

const WARN_KEYS = {
  "no-combat": "PMTTRPG.ActionMenu.NeedsCombat",
  "no-combatant": "PMTTRPG.Assist.NeedsToken",
  "not-active-turn": "PMTTRPG.Assist.NotYourTurn",
  "no-light": "PMTTRPG.ActionMenu.AssistNoLight",
  "no-target": "PMTTRPG.ActionMenu.AssistNoTarget",
  "self-target": "PMTTRPG.Assist.SelfTarget",
  "target-gone": "PMTTRPG.Assist.TargetGone",
  "light-failed": "PMTTRPG.Assist.FailedAfterAction",
  "append-failed": "PMTTRPG.Assist.StateWriteFailed",
};

const ERROR_REASONS = new Set(["light-failed", "append-failed"]);

function notifyWarn(reason, options = {}, data = undefined) {
  if (options.warn === false) return;
  const key = WARN_KEYS[reason];
  if (!key) return;
  const text = game.i18n.format(key, data);
  if (ERROR_REASONS.has(reason)) ui.notifications.error(text);
  else ui.notifications.warn(text);
}

function currentLight(actor) {
  return Math.max(0, Number(actor?.system?.attributes?.light?.value) || 0);
}

export function getAssistEntries(combatant, { combat } = {}) {
  const activeCombat = combat ?? game.combat;
  return listValidAssistEntries(combatant, { combat: activeCombat });
}

export function assistChoiceOptions(combatant, { combat } = {}) {
  const activeCombat = combat ?? game.combat;
  const entries = getAssistEntries(combatant, { combat: activeCombat });
  return buildAssistChoiceOptions(entries, { combat: activeCombat });
}

/**
 * The recipient Combatant for a roll. If the Actor has several Combatants and we
 * can't tell which one it is, this just gives null and no Assist is offered.
 */
export function resolveAssistRecipient(actor, { combat, combatant, tokenId, token } = {}) {
  const activeCombat = combat ?? game.combat;
  if (!actor || !activeCombat) return null;
  return resolveReactionCreditCombatant(actor, {
    combat: activeCombat,
    combatant,
    tokenId: tokenId ?? token?.id ?? actor.token?.id ?? null,
  });
}

async function requestAssistChange(combatant, op, payload) {
  const { runAsCombatantOwnerOrGM } = await import("../easy-effects/gm-route.js");
  return runAsCombatantOwnerOrGM(combatant, op, payload);
}

async function appendAssistToCombatant(targetCombatant, entry) {
  if (!targetCombatant || !entry) return false;
  const result = await requestAssistChange(targetCombatant, "appendCombatantAssist", {
    combatId: entry.combatId,
    entry,
  });
  return result === true;
}

/**
 * If this returns false the grant is already gone. Roll without Advantage then, and
 * don't pick a different one for the player.
 */
export async function claimAssistForRoll({ combatant, entryId, combat } = {}) {
  if (!combatant || !entryId) return false;
  const activeCombat = combat ?? game.combat;
  const result = await requestAssistChange(combatant, "consumeCombatantAssist", {
    combatId: activeCombat?.id ?? null,
    entryId: String(entryId),
  });
  return result === true;
}

// just cleanup after the recipient's turn, validity doesn't depend on it
export async function pruneExpiredAssists(combatant, { combat } = {}) {
  if (!combatant) return false;
  const raw = combatant.flags?.projectmoonttrpg?.actionState?.assists;
  if (!Array.isArray(raw) || !raw.length) return true;
  const activeCombat = combat ?? game.combat;
  const result = await requestAssistChange(combatant, "pruneCombatantAssists", { combatId: activeCombat?.id ?? null });
  return result === true;
}

function resolveAssistSource(actor, options = {}) {
  return resolveWorkflowContext(actor, options, { economyType: ECONOMY_TYPES.ACTION, kind: ACTION_KINDS.ASSIST });
}

async function promptAssistTarget(actor, ctx) {
  const others = ctx.combat.combatants.filter((entry) => entry.id !== ctx.combatant.id);
  return game.projectmoonttrpg.targeting.promptTargetSelection({
    actor,
    token: ctx.token ?? null,
    combat: ctx.combat,
    title: game.i18n.localize("PMTTRPG.ActionMenu.Assist"),
    hint: game.i18n.localize("PMTTRPG.ActionMenu.AssistHint"),
    sourceName: actor.name,
    sourceImg: actor.img,
    weaponRange: null,
    preferredCombatantId: others[0]?.id ?? null,
    isTargetBlocked: (option) => (option.isSelf ? "PMTTRPG.Assist.SelfTarget" : null),
    allowTargetShortcut: false,
  });
}

// disposition, willingness and distance are up to the GM
function validateAssistTarget(target, ctx) {
  const combatant = target?.combatant ?? null;
  if (!combatant) return { ok: false, reason: "no-target" };
  if (!ctx.combat.combatants.has(combatant.id)) return { ok: false, reason: "target-gone" };
  if (combatant.id === ctx.combatant.id) return { ok: false, reason: "self-target" };
  const actor = target.actor ?? combatant.actor ?? null;
  if (!actor) return { ok: false, reason: "target-gone" };
  return { ok: true, combatant, actor, tokenId: target.tokenId ?? combatant.tokenId ?? null };
}

async function spendAssistLight(actor) {
  const light = currentLight(actor);
  if (light < ASSIST_LIGHT_COST) return false;
  const ok = await applyDeclaredActorUpdate(actor, {
    "system.attributes.light.value": light - ASSIST_LIGHT_COST,
  });
  return ok !== false && ok != null;
}

export async function startAssist(actor, options = {}) {
  if (!actor) return { ok: false, reason: "invalid-actor" };

  const ctx = resolveAssistSource(actor, options);
  if (!ctx.ok) {
    notifyWarn(ctx.reason, options);
    return ctx;
  }

  const consume = options.consume !== false;
  if (consume && currentLight(actor) < ASSIST_LIGHT_COST) {
    notifyWarn("no-light", options, { name: actor.name });
    return { ok: false, reason: "no-light" };
  }

  const picked = await promptAssistTarget(actor, { ...ctx, token: options.token ?? null });
  if (picked === null) return { ok: false, reason: "cancelled" };
  const target = validateAssistTarget(picked, ctx);
  if (!target.ok) {
    notifyWarn(target.reason, options);
    return target;
  }

  let lightSpent = !consume;
  const declared = await declareActorAction({
    actor,
    combatant: ctx.combatant,
    tokenId: ctx.tokenId,
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.ASSIST,
    cost: 1,
    timing: options.timing ?? null,
    consume,
    target: target.actor,
    metadata: {
      targetCombatantId: target.combatant.id,
      targetTokenId: target.tokenId,
    },
    precheck: () => {
      if (!consume || currentLight(actor) >= ASSIST_LIGHT_COST) return true;
      notifyWarn("no-light", options, { name: actor.name });
      return { ok: false, reason: "no-light" };
    },
    apply: async () => {
      if (!consume) return;
      try {
        lightSpent = await spendAssistLight(actor);
      } catch (error) {
        console.error("[PMTTRPG] Assist Light spend threw after declaration", error);
        lightSpent = false;
      }
    },
  });
  if (!declared?.ok) return declared ?? { ok: false, reason: "declaration-failed" };

  if (!lightSpent) {
    notifyWarn("light-failed", options, { name: actor.name });
    return { ok: false, reason: "light-failed", declared: true, declaration: declared.declaration };
  }

  const entry = makeAssistEntry({
    id: foundry.utils.randomID(),
    combat: ctx.combat,
    source: { combatant: ctx.combatant, tokenId: ctx.tokenId, actor },
    targetCombatant: target.combatant,
  });
  let appended = false;
  try {
    appended = await appendAssistToCombatant(target.combatant, entry);
  } catch (error) {
    console.error("[PMTTRPG] Assist target state write threw after declaration", error);
    appended = false;
  }
  if (!appended) {
    notifyWarn("append-failed", options, { name: target.actor.name });
    return { ok: false, reason: "append-failed", declared: true, lightSpent: true, declaration: declared.declaration };
  }

  return {
    ok: true,
    declaration: declared.declaration,
    entry,
    targetCombatantId: target.combatant.id,
  };
}

// one badge per grant so you can tell several assisters apart
function assistActionStateEntries({ combatant, combat } = {}) {
  if (!combatant) return [];
  const activeCombat = combat ?? game.combat;
  return getAssistEntries(combatant, { combat: activeCombat }).map((entry) => {
    // if the assister left the combat we just leave their name out of the detail
    const sourceKnown = !!resolveAssistSourceName(entry, { combat: activeCombat });
    return {
      id: `${ASSIST_PRESENTER_ID}:${entry.id}`,
      category: ACTION_STATE_CATEGORIES.RELATIONSHIP,
      actionId: null,
      combatantId: combatant.id,
      role: ACTION_STATE_ROLES.TARGET,
      counterpartCombatantId: entry.sourceCombatantId,
      labelKey: "PMTTRPG.ActionState.Assisted",
      detailKey: sourceKnown ? "PMTTRPG.ActionState.AssistedDetail" : "PMTTRPG.ActionState.AssistedDetailUnknown",
      icon: { img: ASSIST_ACTION_STATE_ICON, fa: "fa-handshake-angle" },
      expiryKey: "PMTTRPG.ActionState.UntilEndOfNextTurn",
      visibility: ACTION_STATE_VISIBILITY.PUBLIC,
      dismissible: true,
      recordId: entry.id,
    };
  });
}

async function postAssistDeclined(combatant) {
  const { combatantFeedbackEvent, postActionFeedbackEvent } = await import("./action-feedback.js");
  await postActionFeedbackEvent(combatantFeedbackEvent(combatant, {
    id: foundry.utils.randomID(),
    kind: ACTION_KINDS.ASSIST,
    metadata: { feedbackLabelKey: "PMTTRPG.ActionState.AssistDeclined" },
  }));
}

export function registerAssistPresentation() {
  registerActionStatePresenter({
    id: ASSIST_PRESENTER_ID,
    order: 20,
    getEntries: assistActionStateEntries,
    dismiss: async (entry, { combatant, combat }) => {
      if (!entry?.recordId) return false;
      const removed = await claimAssistForRoll({ combatant, entryId: entry.recordId, combat });
      if (!removed) return false;
      try {
        await postAssistDeclined(combatant);
      } catch (error) {
        console.warn("[PMTTRPG] Assist decline feedback failed", error);
      }
      return true;
    },
  });
}
