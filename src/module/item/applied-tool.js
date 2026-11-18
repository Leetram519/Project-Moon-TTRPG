import { PMTTRPGUtility } from "../utility.js";
import { emitActorAction } from "../easy-effects/registry.js";
import { canUseTool, consumeToolUse, getToolUsesRemaining, toolConsumesByDefault } from "./tool-use.js";
import { waitForChoice } from "../apps/dialog-wait.js";
const { renderTemplate } = foundry.applications.handlebars;

export function isAppliedToolEligible(tool, applyTo) {
  if (tool?.type !== "tool") return false;
  if (tool.system?.toolKind !== "applied") return false;
  if ((tool.system?.applyTo ?? "") !== applyTo) return false;
  if (!canUseTool(tool)) return false;

  const hands = tool.system?.handProperty ?? "handless";
  if (hands !== "handless" && !tool.system?.equipped) return false;
  return true;
}

export function getAppliedToolOptions(actor, applyTo) {
  if (!actor) return [];
  return actor.items
    .filter(item => isAppliedToolEligible(item, applyTo))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildAppliedToolTemplateData(tool) {
  if (!tool) return {};

  const damageType = tool.system?.damageType || null;
  const fields = {
    appliedToolId: tool.id,
    appliedToolName: tool.name,
    appliedToolImg: tool.img,
    appliedToolDamageType: damageType,
  };

  if (damageType) fields.damageType = damageType;
  return fields;
}

export async function maybeConsumeAppliedTool(tool, { consume = true } = {}) {
  if (!tool) return true;
  return consumeToolUse(tool, { consume });
}

export function canConsumeAppliedTool(tool, consume = true) {
  if (!tool || !consume) return true;
  return canUseTool(tool);
}

export function buildAppliedToolOnBeforeChat({
  actor,
  tool,
  hostItem = null,
  target = null,
  actionType = "applied",
  consume = true,
} = {}) {
  if (!tool) return null;

  return async () => {
    const ok = await maybeConsumeAppliedTool(tool, { consume });
    if (!ok) {
      ui.notifications.warn(game.i18n.localize("PMTTRPG.Dialog.noToolUses"));
    }

    await emitAppliedToolHooks({
      actor,
      tool,
      hostItem,
      target,
      actionType,
    });
  };
}

export async function emitAppliedToolHooks({
  actor,
  tool,
  hostItem = null,
  target = null,
  actionType = "applied",
} = {}) {
  if (!actor || !tool) return;

  await emitActorAction({
    actor,
    item: tool,
    hostItem,
    actionType,
    action: { reaction: false, kind: "tool", consumed: true, offTurn: false },
    target: target ?? null,
  });
}

export async function promptAppliedToolDialog(actor, {
  applyTo,
  hostItem,
  defenseType = null,
} = {}) {
  if (!actor || !hostItem) return { tool: null, consume: false };

  const tools = getAppliedToolOptions(actor, applyTo);
  if (!tools.length) return { tool: null, consume: false };

  const damageTypeLabel = (type) => {
    if (!type) return null;
    const key = `PMTTRPG.DamageType${type[0].toUpperCase()}${type.slice(1)}`;
    return game.i18n.localize(key);
  };

  const dialogData = {
    host: {
      name: hostItem.name,
      img: hostItem.img,
      formula: applyTo === "weapon"
        ? (hostItem.system?.offensiveDiceComputed ?? "")
        : (defenseType === "evade"
          ? (hostItem.system?.evadeDiceComputed ?? "")
          : (hostItem.system?.blockDiceComputed ?? "")),
      damageType: hostItem.system?.damageType ?? null,
    },
    applyTo,
    defenseType,
    toolOptions: tools.map((item) => ({
      id: item.id,
      name: item.name,
      img: item.img,
      remaining: getToolUsesRemaining(item),
      damageType: item.system?.damageType ?? null,
      damageTypeLabel: damageTypeLabel(item.system?.damageType),
      isDefault: false,
    })),
    consume: tools.some(item => toolConsumesByDefault(item)),
    showConsume: tools.some(item => toolConsumesByDefault(item)),
  };

  const html = await renderTemplate(
    "systems/projectmoonttrpg/templates/dialog/applied-tool-dialog.html",
    dialogData
  );

  const dlgOptions = { classes: ["projectmoonttrpg", "PMTTRPG-dialog"] };
  if (PMTTRPGUtility.nightmode) dlgOptions.classes.push("nightmode");

  return waitForChoice({
    window: { title: game.i18n.localize("PMTTRPG.Dialog.chooseAppliedTool") },
    classes: dlgOptions.classes,
    content: html,
    buttons: [{
      action: "confirm",
      label: game.i18n.localize("PMTTRPG.Dialog.roll"),
      default: true,
      callback: (event, button, dialog) => {
        const form = dialog.element.querySelector("form");
        const toolId = form.toolId?.value ?? "";
        const consume = !!form.consumeTool?.checked;
        if (!toolId) return { tool: null, consume: false };
        const tool = actor.items.get(toolId);
        if (!tool || !canUseTool(tool)) return { tool: null, consume: false };
        return { tool, consume };
      },
    }, {
      action: "cancel",
      label: game.i18n.localize("PMTTRPG.Dialog.cancel"),
      callback: () => null,
    }],
    rejectClose: false,
  });
}
