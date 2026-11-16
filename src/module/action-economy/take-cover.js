
import { declareActorAction, canPayDeclaration } from "./declare.js";
import { ACTION_KINDS, ECONOMY_TYPES } from "./kinds.js";
import { writeCombatantActionState } from "./combat-flags.js";
import { checkActionTiming } from "./timing.js";
import { resolveReactionCreditCombatant } from "./reaction-credits.js";
import { clearCover, getCoverState, makeCoverState } from "./cover.js";
import { cancelButton, confirmButton, waitForWindowChoice } from "../apps/dialog-wait.js";

const TEMPLATE = "systems/projectmoonttrpg/templates/dialog/action-take-cover.hbs";

function resolveCoverContext(actor, options = {}) {
  const combat = options.combat ?? game.combat;
  if (!combat?.started) return { ok: false, reason: "no-combat" };
  const tokenId = options.tokenId ?? options.token?.id ?? actor?.token?.id ?? null;
  const combatant = resolveReactionCreditCombatant(actor, {
    combatant: options.combatant,
    combat,
    token: options.token ?? null,
    tokenId,
  });
  if (!combatant) return { ok: false, reason: "no-combatant" };
  return {
    ok: true,
    combat,
    combatant,
    tokenId: tokenId ?? combatant.tokenId ?? null,
    timing: checkActionTiming({
      combat,
      combatant,
      economyType: ECONOMY_TYPES.ACTION,
      kind: ACTION_KINDS.TAKE_COVER,
      timing: options.timing ?? null,
    }),
  };
}

async function promptCover({ leaveOnly = false, canLeave = false } = {}) {
  const html = await foundry.applications.handlebars.renderTemplate(TEMPLATE, {
    leaveOnly,
    i18n: {
      hint: game.i18n.localize("PMTTRPG.ActionMenu.TakeCoverHint"),
      half: game.i18n.localize("PMTTRPG.ActionMenu.TakeCoverHalf"),
      full: game.i18n.localize("PMTTRPG.ActionMenu.TakeCoverFull"),
    },
  });
  return waitForWindowChoice({
    window: { title: game.i18n.localize("PMTTRPG.ActionMenu.TakeCover") },
    content: html,
    buttons: [
      cancelButton(),
      ...(canLeave ? [{
        action: "leave",
        label: game.i18n.localize("PMTTRPG.ActionMenu.LeaveCover"),
        icon: "fa-solid fa-person-walking-arrow-right",
        default: leaveOnly,
        callback: () => "leave",
      }] : []),
      ...(!leaveOnly ? [confirmButton((_event, _button, dialog) => {
        const value = dialog.element.querySelector("[name='cover']:checked")?.value;
        return value === "full" ? "full" : value === "half" ? "half" : null;
      })] : []),
    ],
    rejectClose: false,
  });
}

function acceptedCoverChoice(value) {
  if (value === "half" || value === "full" || value === "leave") return value;
  return null;
}

export async function leaveCover(combatant, { tokenId = null, combat = null } = {}) {
  if (!combatant) return false;
  const active = combat ?? combatant.combat ?? game.combat;
  if (!getCoverState(combatant, { combat: active })) return false;
  const result = await commitLeave(combatant, tokenId ?? combatant.tokenId ?? null);
  return result?.ok === true;
}

async function commitLeave(combatant, tokenId) {
  const wrote = await clearCover(combatant);
  if (!wrote) return { ok: false, reason: "write-failed" };
  try {
    await postLeave(combatant, tokenId);
  } catch (error) {
    console.warn("[PMTTRPG] Take Cover leave feedback failed", error);
  }
  return { ok: true, cleared: true };
}

async function postLeave(combatant, tokenId) {
  const { combatantFeedbackEvent, postActionFeedbackEvent } = await import("./action-feedback.js");
  await postActionFeedbackEvent(combatantFeedbackEvent(combatant, {
    id: foundry.utils.randomID(),
    kind: ACTION_KINDS.TAKE_COVER,
    tokenId,
    metadata: { feedbackLabelKey: "PMTTRPG.ActionMenu.LeaveCover" },
  }));
}

export async function startTakeCover(actor, options = {}) {
  if (!actor) return { ok: false, reason: "invalid-actor" };
  const ctx = resolveCoverContext(actor, options);
  if (!ctx.ok) {
    if (options.warn !== false) {
      const key = ctx.reason === "no-combatant" ? "PMTTRPG.ActionMenu.TakeCoverNeedsToken" : "PMTTRPG.ActionMenu.NeedsCombat";
      ui.notifications.warn(game.i18n.localize(key));
    }
    return ctx;
  }
  const active = getCoverState(ctx.combatant, { combat: ctx.combat });
  if (!ctx.timing.ok) {
    if (!active) {
      if (options.warn !== false) {
        ui.notifications.warn(game.i18n.localize("PMTTRPG.ActionMenu.TakeCoverNotYourTurn"));
      }
      return { ok: false, reason: "not-active-turn" };
    }
    const offTurnRaw = await promptCover({ leaveOnly: true, canLeave: true });
    if (acceptedCoverChoice(offTurnRaw) !== "leave") return { ok: false, reason: "cancelled" };
    return commitLeave(ctx.combatant, ctx.tokenId);
  }

  const canPay = canPayDeclaration(actor, {
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.TAKE_COVER,
    cost: 1,
    combat: ctx.combat,
    combatant: ctx.combatant,
    tokenId: ctx.tokenId,
    timing: options.timing ?? null,
  });
  if (options.consume !== false && !canPay) {
    if (!active) {
      const asReaction = ctx.timing.asReaction === true;
      const key = asReaction ? "PMTTRPG.ActionDeclaration.NoReaction" : "PMTTRPG.ActionDeclaration.NoAction";
      if (options.warn !== false) {
        ui.notifications.warn(game.i18n.format(key, { name: actor.name ?? "" }));
      }
      return { ok: false, reason: asReaction ? "insufficient-reactions" : "insufficient-actions" };
    }
    const dropRaw = await promptCover({ leaveOnly: true, canLeave: true });
    if (acceptedCoverChoice(dropRaw) !== "leave") return { ok: false, reason: "cancelled" };
    return commitLeave(ctx.combatant, ctx.tokenId);
  }
  const coverRaw = await promptCover({ leaveOnly: false, canLeave: !!active });
  const cover = acceptedCoverChoice(coverRaw);
  if (!cover) return { ok: false, reason: "cancelled" };
  if (cover === "leave") return commitLeave(ctx.combatant, ctx.tokenId);
  const modeLabel = cover === "full"
    ? game.i18n.localize("PMTTRPG.ActionMenu.TakeCoverFull")
    : game.i18n.localize("PMTTRPG.ActionMenu.TakeCoverHalf");
  const seenDeclarationId = active?.declarationId ?? null;
  return declareActorAction({
    actor,
    combatant: ctx.combatant,
    tokenId: ctx.tokenId,
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.TAKE_COVER,
    cost: 1,
    timing: options.timing ?? null,
    consume: options.consume,
    metadata: { cover, feedbackDetail: modeLabel },
    precheck: () => {
      const now = getCoverState(ctx.combatant, { combat: ctx.combat })?.declarationId ?? null;
      if (now === seenDeclarationId) return true;
      if (options.warn !== false) {
        ui.notifications.warn(game.i18n.localize("PMTTRPG.ActionMenu.StateChanged"));
      }
      return { ok: false, reason: "cover-changed" };
    },
    apply: async (declaration) => {
      const state = makeCoverState({
        combat: ctx.combat,
        combatant: ctx.combatant,
        declarationId: declaration?.id,
        mode: cover,
      });
      if (!state) return;
      try {
        await writeCombatantActionState(ctx.combatant, "cover", state);
      } catch (error) {
        console.error("[PMTTRPG] Take Cover actionState write failed after declaration", error);
      }
    },
  });
}
