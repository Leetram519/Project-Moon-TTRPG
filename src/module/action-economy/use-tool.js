import { canUseTool } from "../item/tool-use.js";
import { ACTION_KINDS, ECONOMY_TYPES } from "./kinds.js";
import { checkWorkflowTiming, warnNotYourTurn } from "./timing.js";
import { itemPickerRows, pickRadioRow } from "../apps/dialog-wait.js";

function isStandaloneReady(tool) {
  if (tool.system?.toolKind !== "standalone") return true;
  const hands = tool.system?.handProperty ?? "handless";
  return hands === "handless" || !!tool.system?.equipped;
}

export function getEligibleUseTools(actor) {
  if (!actor) return [];
  return actor.items
    .filter((item) => {
      if (item.type !== "tool") return false;
      if (item.system?.toolKind === "applied") return false;
      if (!canUseTool(item)) return false;
      return isStandaloneReady(item);
    })
    .sort((a, b) => {
      const eq = Number(!!b.system?.equipped) - Number(!!a.system?.equipped);
      if (eq) return eq;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
}

async function promptToolChoice(actor, tools) {
  const itemId = await pickRadioRow({
    title: game.i18n.localize("PMTTRPG.ActionMenu.UseTool"),
    hint: game.i18n.localize("PMTTRPG.ActionMenu.ChooseTool"),
    inputName: "toolId",
    rows: itemPickerRows(tools, game.i18n.localize("PMTTRPG.ToolHeld")),
  });
  return itemId ? actor.items.get(itemId) ?? null : null;
}

export async function startUseTool(actor, options = {}) {
  if (!actor) return;

  const timing = checkWorkflowTiming(actor, options, { economyType: ECONOMY_TYPES.ACTION, kind: ACTION_KINDS.TOOL });
  if (!timing.ok) {
    warnNotYourTurn(options);
    return { ok: false, reason: timing.reason };
  }

  const tools = getEligibleUseTools(actor);
  if (!tools.length) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.ActionMenu.NoTool"));
    return;
  }

  const tool = tools.length === 1
    ? tools[0]
    : await promptToolChoice(actor, tools);
  if (!tool) return;

  return tool.roll({
    tokenId: options.tokenId ?? options.token?.id ?? null,
    combatant: timing.combatant ?? options.combatant ?? null,
    timing: options.timing ?? null,
    consumeAction: options.consume !== false,
  });
}
