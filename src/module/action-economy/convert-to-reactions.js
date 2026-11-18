import { applyDeclaredActorUpdate, declareActorAction } from "./declare.js";
import { parseConversionAmount } from "./formulas.js";
import { ACTION_KINDS, ECONOMY_TYPES } from "./kinds.js";
import { checkWorkflowTiming, warnNotYourTurn } from "./timing.js";
import { cancelButton, confirmButton, waitForWindowChoice } from "../apps/dialog-wait.js";

const { renderTemplate } = foundry.applications.handlebars;

const TEMPLATE = "systems/projectmoonttrpg/templates/dialog/action-convert-reactions.hbs";

function availableActions(actor) {
  return Math.max(0, Number(actor?.system?.attributes?.actions?.value) || 0);
}

async function promptConversionAmount(actor, max) {
  const html = await renderTemplate(TEMPLATE, {
    max,
    i18n: {
      hint: game.i18n.format("PMTTRPG.ActionMenu.ConvertAmountHint", { max }),
      label: game.i18n.localize("PMTTRPG.Actions"),
    },
  });

  return waitForWindowChoice({
    window: { title: game.i18n.localize("PMTTRPG.ActionMenu.ConvertToReactions") },
    content: html,
    buttons: [
      cancelButton(),
      confirmButton((_event, _button, dialog) => dialog.element.querySelector("[name='amount']").value),
    ],
    render: (_event, dialog) => {
      const input = dialog.element.querySelector("[name='amount']");
      const confirm = dialog.element.querySelector("button[data-action='confirm']");
      const sync = () => { confirm.disabled = parseConversionAmount(input.value, max) == null; };
      input.addEventListener("input", sync);
      sync();
    },
    rejectClose: false,
  });
}

async function applyConvertedReactions(actor, amount) {
  const current = Number(actor.system?.attributes?.reactions?.value) || 0;
  await applyDeclaredActorUpdate(actor, {
    "system.attributes.reactions.value": current + amount,
  });
}

export async function startConvertToReactions(actor, options = {}) {
  if (!actor) return;

  const timing = checkWorkflowTiming(actor, options, {
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.CONVERT_TO_REACTIONS,
  });
  if (!timing.ok) {
    warnNotYourTurn(options);
    return { ok: false, reason: timing.reason };
  }

  const available = availableActions(actor);
  if (available <= 0) {
    ui.notifications.warn(game.i18n.format("PMTTRPG.Notifications.convertNoActions", {
      name: actor.name,
    }));
    return;
  }

  let chosen;
  if (available === 1) {
    chosen = 1;
  } else {
    chosen = await promptConversionAmount(actor, available);
    if (chosen == null) return;
  }

  const stillAvailable = availableActions(actor);
  const amount = parseConversionAmount(chosen, stillAvailable);
  if (amount == null) {
    ui.notifications.warn(game.i18n.format("PMTTRPG.ActionMenu.ConvertInvalidAmount", {
      max: stillAvailable,
    }));
    return;
  }

  return declareActorAction({
    actor,
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.CONVERT_TO_REACTIONS,
    cost: amount,
    combatant: timing.combatant ?? options.combatant ?? null,
    tokenId: options.tokenId ?? options.token?.id ?? null,
    timing: options.timing ?? null,
    consume: options.consume,
    apply: async () => {
      try {
        await applyConvertedReactions(actor, amount);
      } catch (error) {
        console.error("[PMTTRPG] Convert to Reactions grant failed after declaration", error);
        ui.notifications.error(game.i18n.localize("PMTTRPG.ActionMenu.ConvertFailed"));
      }
    },
  });
}
