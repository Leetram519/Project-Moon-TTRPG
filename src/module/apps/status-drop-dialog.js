import { pmttrpgDialogClasses, pmttrpgDialogPosition } from "./dialog-classes.js";
import { waitForChoice } from "./dialog-wait.js";

const TEMPLATE = "systems/projectmoonttrpg/templates/dialog/status-drop-dialog.hbs";

function readResult(button, dialog) {
  const form = button.form ?? dialog?.element;
  const stacks = Math.max(1, Math.trunc(Number(
    form?.elements?.quantity?.value
    ?? dialog?.element?.querySelector?.("[name='quantity']")?.value
  ) || 1));
  const timingRaw = form?.elements?.timing?.value
    ?? dialog?.element?.querySelector?.("[name='timing']:checked")?.value
    ?? "now";
  const timing = timingRaw === "round" || timingRaw === "turn" ? timingRaw : "now";
  return { stacks, timing };
}

/**
 * @returns {Promise<{ stacks: number, timing: "now"|"round"|"turn" }|null>}
 */
export async function promptStatusDropDialog({ name, stacks = 1 } = {}) {
  const quantity = Math.max(1, Math.trunc(Number(stacks) || 1));
  const html = await foundry.applications.handlebars.renderTemplate(TEMPLATE, {
    name,
    stacks: quantity,
  });

  return waitForChoice({
    window: { title: game.i18n.format("PMTTRPG.StatusDropDialog.Title", { name }) },
    classes: pmttrpgDialogClasses(),
    position: pmttrpgDialogPosition({ width: 320 }),
    content: html,
    buttons: [
      {
        action: "apply",
        label: game.i18n.localize("PMTTRPG.StatusDropDialog.Apply"),
        default: true,
        callback: (_event, button, dialog) => readResult(button, dialog),
      },
      {
        action: "cancel",
        label: game.i18n.localize("PMTTRPG.Dialog.cancel"),
        callback: () => null,
      },
    ],
    rejectClose: false,
    render: (_event, dialog) => {
      dialog.element.querySelector("[name='quantity']")?.select();
    },
  });
}

function isAltHeld(event) {
  if (event?.altKey) return true;
  // Drop handlers may omit the event; keyboard state still has Alt while the drop resolves.
  const KeyboardManager = foundry.helpers?.interaction?.KeyboardManager;
  const alt = KeyboardManager?.MODIFIER_KEYS?.ALT ?? "Alt";
  return !!game.keyboard?.isModifierActive?.(alt);
}

async function applyDroppedStatus(actor, item, { stacks, timing = "now" } = {}) {
  const amount = Math.max(0, Math.trunc(Number(stacks) || 0));
  if (amount <= 0) return null;
  const originUuid = game.user.character?.uuid ?? null;
  if (timing === "round" || timing === "turn") {
    return actor.addPendingStatusStacks(item.name, amount, {
      arrival: timing,
      source: item,
      originUuid,
    });
  }
  return actor.addStatusStacks(item.name, amount, item, { originUuid });
}

export async function applyStatusFromDrop(actor, item, event) {
  if (!actor || item?.type !== "status") return null;
  const defaultStacks = Math.max(0, Math.trunc(Number(item.system?.stacks ?? 1) || 0));
  if (isAltHeld(event)) {
    const result = await promptStatusDropDialog({
      name: item.name,
      stacks: defaultStacks || 1,
    });
    if (!result) return null;
    return applyDroppedStatus(actor, item, result);
  }
  if (defaultStacks <= 0) return null;
  return applyDroppedStatus(actor, item, { stacks: defaultStacks, timing: "now" });
}
