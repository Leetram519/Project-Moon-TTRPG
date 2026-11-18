/**
 * Ready spends one Reaction and keeps a note on the Combatant.
 */

import { declareActorAction } from "./declare.js";
import { ACTION_KINDS, ECONOMY_TYPES } from "./kinds.js";
import { readActionState, writeCombatantActionState } from "./combat-flags.js";
import { resolveWorkflowContext } from "./timing.js";
import { canPayReactionForDeclaration } from "./reaction-credits.js";
import { currentTurnIdentity } from "../combat/turn-stamps.js";
import { isProtectStateLive, makeProtectState } from "./protect-state.js";
import {
  ACTION_STATE_CATEGORIES,
  ACTION_STATE_ROLES,
  ACTION_STATE_VISIBILITY,
  registerActionStatePresenter,
} from "./presentation.js";
import { cancelButton, confirmButton, waitForWindowChoice } from "../apps/dialog-wait.js";

const TEMPLATE = "systems/projectmoonttrpg/templates/dialog/action-ready.hbs";
const NOTE_LIMIT = 200;
const PRESENTER_ID = "ready";
const READY_ACTION_STATE_ICON = "systems/projectmoonttrpg/assets/icons/Statuses/PlayerState_Ready.webp";

const remindedKeys = new Set();

function sanitizeReadyNote(raw) {
  const text = String(raw ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, NOTE_LIMIT);
}

function readyRecord(combatant, combat) {
  const raw = readActionState(combatant).ready;
  if (!raw || typeof raw !== "object" || raw.version !== 1) return null;
  if (String(raw.combatId) !== String(combat?.id)) return null;
  if (String(raw.combatantId) !== String(combatant?.id)) return null;
  if (raw.boundary !== "nextTurnStart") return null;
  const note = sanitizeReadyNote(raw.note);
  if (!note || !Number.isInteger(raw.afterStarted)) return null;
  return { ...raw, note };
}

export function readReadyState(combatant, { combat = game.combat } = {}) {
  const record = readyRecord(combatant, combat);
  if (!record) return { live: false, note: null, declarationId: null, afterStarted: null };
  if (!isProtectStateLive(record, { combatant, combat })) return { live: false, note: null, declarationId: null, afterStarted: null };
  return {
    live: true,
    note: record.note,
    declarationId: record.declarationId,
    afterStarted: record.afterStarted,
  };
}

function resolveReadyContext(actor, options = {}) {
  return resolveWorkflowContext(actor, options, { economyType: ECONOMY_TYPES.REACTION, kind: ACTION_KINDS.READY });
}

async function promptReadyNote({ clearing = false } = {}) {
  const html = await foundry.applications.handlebars.renderTemplate(TEMPLATE, {
    clearing,
    i18n: {
      hint: game.i18n.localize("PMTTRPG.ActionMenu.ReadyHint"),
      reminder: game.i18n.localize("PMTTRPG.ActionMenu.ReadyAttackReminder"),
      note: game.i18n.localize("PMTTRPG.ActionMenu.ReadyNote"),
      placeholder: game.i18n.localize("PMTTRPG.ActionMenu.ReadyPlaceholder"),
    },
  });
  // unfortunately DialogV2 runs string content through cleanHTML, which drops the
  // textarea's placeholder and maxlength (an element doesn't get cleaned, so we hand it a nice little <div>)
  const content = document.createElement("div");
  content.innerHTML = html;
  return waitForWindowChoice({
    window: { title: game.i18n.localize("PMTTRPG.ActionMenu.Ready") },
    content,
    buttons: [
      cancelButton(),
      clearing ? {
        action: "clear",
        label: game.i18n.localize("PMTTRPG.ActionMenu.ClearReady"),
        icon: "fa-solid fa-eraser",
        default: true,
        callback: () => ({ clear: true }),
      } : confirmButton((_event, _button, dialog) => {
        const note = sanitizeReadyNote(dialog.element.querySelector("[name='note']")?.value);
        return note ? { note } : { empty: true };
      }),
    ],
    render: (_event, dialog) => {
      if (clearing) return;
      const note = dialog.element.querySelector("[name='note']");
      const confirm = dialog.element.querySelector("button[data-action='confirm']");
      if (!note || !confirm) return;
      const sync = () => { confirm.disabled = !sanitizeReadyNote(note.value); };
      note.addEventListener("input", sync);
      sync();
    },
    rejectClose: false,
  });
}

async function postReadyEvent(combatant, labelKey, note, tokenId) {
  const { combatantFeedbackEvent, postActionFeedbackEvent } = await import("./action-feedback.js");
  await postActionFeedbackEvent(combatantFeedbackEvent(combatant, {
    id: foundry.utils.randomID(),
    kind: ACTION_KINDS.READY,
    tokenId,
    metadata: {
      feedbackLabelKey: labelKey,
      feedbackDetail: note ?? null,
    },
  }));
}

async function clearReady(combatant, { tokenId = null, notify = true } = {}) {
  if (!combatant) return false;
  const note = readActionState(combatant).ready?.note ?? null;
  const wrote = await writeCombatantActionState(combatant, "ready", null);
  if (wrote && notify) {
    try {
      await postReadyEvent(combatant, "PMTTRPG.ActionMenu.ClearReady", sanitizeReadyNote(note), tokenId);
    } catch (error) {
      console.warn("[PMTTRPG] Ready clear feedback failed", error);
    }
  }
  return wrote;
}

export async function startReady(actor, options = {}) {
  if (!actor) return { ok: false, reason: "invalid-actor" };
  const ctx = resolveReadyContext(actor, options);
  if (!ctx.ok) {
    const key = ctx.reason === "not-active-turn"
      ? "PMTTRPG.ActionMenu.ReadyNotYourTurn"
      : ctx.reason === "no-combatant"
        ? "PMTTRPG.ActionMenu.ReadyNeedsToken"
        : "PMTTRPG.ActionMenu.NeedsCombat";
    if (options.warn !== false) {
      ui.notifications.warn(game.i18n.localize(key));
    }
    return ctx;
  }
  const existing = readReadyState(ctx.combatant, { combat: ctx.combat });
  if (existing.live) {
    const choice = await promptReadyNote({ clearing: true });
    if (choice?.clear) {
      await clearReady(ctx.combatant, { tokenId: ctx.tokenId });
      return { ok: true, cleared: true };
    }
    return { ok: false, reason: "cancelled" };
  }
  if (options.consume !== false
    && !canPayReactionForDeclaration(actor, { kind: ACTION_KINDS.READY, itemId: null }, { combatant: ctx.combatant, combat: ctx.combat })) {
    if (options.warn !== false) {
      ui.notifications.warn(game.i18n.localize("PMTTRPG.ActionMenu.ReadyNoReaction"));
    }
    return { ok: false, reason: "insufficient-reactions" };
  }
  const setup = await promptReadyNote();
  if (!setup) return { ok: false, reason: "cancelled" };
  if (setup.empty || !setup.note) {
    if (options.warn !== false) {
      ui.notifications.warn(game.i18n.localize("PMTTRPG.ActionMenu.ReadyNoteRequired"));
    }
    return { ok: false, reason: "empty-note" };
  }
  
  return declareActorAction({
    actor,
    combatant: ctx.combatant,
    tokenId: ctx.tokenId,
    economyType: ECONOMY_TYPES.REACTION,
    kind: ACTION_KINDS.READY,
    cost: 1,
    timing: options.timing ?? null,
    consume: options.consume,
    metadata: { readyNote: setup.note, feedbackDetail: setup.note },
    precheck: () => {
      if (!readReadyState(ctx.combatant, { combat: ctx.combat }).live) return true;
      if (options.warn !== false) {
        ui.notifications.warn(game.i18n.localize("PMTTRPG.ActionMenu.StateChanged"));
      }
      return { ok: false, reason: "already-ready" };
    },
    apply: async (declaration) => {
      const turn = currentTurnIdentity(ctx.combat, ctx.combatant);
      const state = makeProtectState({
        combat: ctx.combat,
        combatant: ctx.combatant,
        declarationId: declaration?.id,
        afterStarted: turn?.started,
      });
      if (!state) return;
      try {
        await writeCombatantActionState(ctx.combatant, "ready", { ...state, note: setup.note });
      } catch (error) {
        console.error("[PMTTRPG] Ready actionState write failed after declaration", error);
      }
    },
  });
}

function readyActionStateEntries({ combatant, combat } = {}) {
  const ready = readReadyState(combatant, { combat });
  if (!ready.live) return [];
  return [{
    id: `${PRESENTER_ID}:${combatant.id}`,
    category: ACTION_STATE_CATEGORIES.DEFERRED,
    actionId: "ready",
    combatantId: String(combatant.id),
    role: ACTION_STATE_ROLES.SELF,
    labelKey: "PMTTRPG.ActionState.Ready",
    detailKey: "PMTTRPG.ActionState.ReadyDetail",
    detailData: { note: ready.note },
    icon: { img: READY_ACTION_STATE_ICON, fa: "fa-hourglass" },
    expiryKey: "PMTTRPG.ActionState.UntilNextTurnStarts",
    visibility: ACTION_STATE_VISIBILITY.PUBLIC,
    dismissible: true,
  }];
}

async function postReadyReminder(event) {
  const { postActionFeedbackEvent } = await import("./action-feedback.js");
  return postActionFeedbackEvent(event);
}

/**
 * Posts one chat reminder when the Combatant's next turn starts.
 */
export async function maybeRemindReadyExpiry(combat, combatant, stamp) {
  if (!combat || !combatant || !stamp || !Number.isInteger(stamp.started)) return false;
  const raw = readActionState(combatant).ready;
  if (!raw || raw.boundary !== "nextTurnStart") return false;
  if (String(raw.combatId) !== String(combat.id) || String(raw.combatantId) !== String(combatant.id)) return false;
  if (stamp.started !== Number(raw.afterStarted) + 1) return false;
  const note = sanitizeReadyNote(raw.note);
  if (!note) return false;
  const id = `ready-reminder:${combatant.id}:${stamp.started}`;
  if (remindedKeys.has(id)) return false;
  remindedKeys.add(id);
  try {
    const posted = await postReadyReminder({
      id,
      kind: ACTION_KINDS.READY,
      economyType: null,
      actor: combatant.actor ?? null,
      actorId: combatant.actorId ?? combatant.actor?.id ?? null,
      tokenId: combatant.tokenId ?? null,
      combatantId: String(combatant.id),
      metadata: {
        feedbackLabelKey: "PMTTRPG.ActionMenu.ReadyExpired",
        feedbackDetail: note,
      },
    });
    if (posted === false) remindedKeys.delete(id);
    return posted === true;
  } catch (error) {
    remindedKeys.delete(id);
    console.warn("[PMTTRPG] Ready expiry reminder failed", error);
    return false;
  }
}

export function registerReadyPresentation() {
  registerActionStatePresenter({
    id: PRESENTER_ID,
    order: 16,
    getEntries: readyActionStateEntries,
    dismiss: (_entry, { combatant }) => clearReady(combatant, { tokenId: combatant?.tokenId ?? null }),
  });
}
