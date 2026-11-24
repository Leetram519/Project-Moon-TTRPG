import { emitActorAction } from "../easy-effects/registry.js";
import { canUseTool, consumeToolUse, getToolUsesRemaining, toolConsumesByDefault } from "./tool-use.js";
import { itemPickerHost, itemPickerRows, pickRadioRow } from "../apps/dialog-wait.js";

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
    if (!type) return "";
    const key = `PMTTRPG.DamageType${type[0].toUpperCase()}${type.slice(1)}`;
    return game.i18n.localize(key);
  };

  const formula = applyTo === "weapon"
    ? hostItem.system?.offensiveDiceComputed
    : (defenseType === "evade" ? hostItem.system?.evadeDiceComputed : hostItem.system?.blockDiceComputed);
  const showConsume = tools.some(item => toolConsumesByDefault(item));
  const uses = game.i18n.localize("PMTTRPG.ToolUses");
  const rows = await itemPickerRows(tools, "", null);
  const picked = await pickRadioRow({
    title: game.i18n.localize("PMTTRPG.Dialog.chooseAppliedTool"),
    host: await itemPickerHost(hostItem, formula),
    inputName: "toolId",
    rows: [
      { id: "", name: game.i18n.localize("PMTTRPG.Dialog.noAppliedTool"), checked: true },
      ...rows.map((row, i) => ({
        ...row,
        tag: damageTypeLabel(tools[i].system?.damageType),
        meta: `${uses}: ${getToolUsesRemaining(tools[i])}`,
      })),
    ],
    toggle: showConsume ? { label: game.i18n.localize("PMTTRPG.Dialog.consumeToolUse"), checked: true } : null,
  });
  if (picked === null) return null;
  const tool = actor.items.get(showConsume ? picked.id : picked) ?? null;
  if (!tool || !canUseTool(tool)) return { tool: null, consume: false };
  return { tool, consume: showConsume && picked.checked };
}
