import { emitToolUsed } from "../easy-effects/registry.js";
import { declareToolAction } from "./tool-use.js";
import { PMTTRPGUtility } from "../utility.js";
import { PMTTRPGRolls } from "../rolls.js";
import { assistChoiceOptions, resolveAssistRecipient } from "../action-economy/assist.js";
import {
  canUseTool,
  consumeToolUse,
  getToolUsesRemaining,
  toolConsumesByDefault,
} from "./tool-use.js";
import { waitForChoice } from "../apps/dialog-wait.js";
const { renderTemplate } = foundry.applications.handlebars;

function getActorStatValue(actor, statKey) {
  return Number(actor?.system?.abilities?.[statKey]?.value ?? 0);
}

function abilityLabel(statKey) {
  const key = `PMTTRPG.Ability${statKey?.[0]?.toUpperCase() ?? ""}${statKey?.slice(1) ?? ""}`;
  return game.i18n.localize(key);
}

function effectLines(tool, mode) {
  return (tool.system?.effects ?? [])
    .filter(e => (e.mode ?? "positive") === mode)
    .map(e => e.name || e.label || "Effect");
}

export async function useStandaloneTool(tool, {
  configureDialog = true,
  target = undefined,
  alreadyDeclared = false,
  tokenId = null,
  combatant = null,
  timing = null,
  consumeAction = true,
} = {}) {
  if (tool?.type !== "tool" || tool.system?.toolKind !== "standalone") return false;

  const actor = tool.actor;
  if (!actor) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.Dialog.toolNeedsActor"));
    return false;
  }

  if (!canUseTool(tool)) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.Dialog.noToolUses"));
    return false;
  }

  const hands = tool.system?.handProperty ?? "handless";
  if (hands !== "handless" && !tool.system?.equipped) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.Dialog.toolNotHeld"));
    return false;
  }

  const statKey = tool.system?.challengeStat || "for";
  const rank = Math.max(0, Number(tool.system?.rank ?? 0));
  const statLabel = abilityLabel(statKey);

  let targetMode = "self";
  let extraModifier = 0;
  let rollMode = actor.flags?.projectmoonttrpg?.rollMode ?? "def";
  let resolvedTarget = target ?? null;
  let targetSelection = null;
  const assistRecipient = resolveAssistRecipient(actor, { tokenId, combatant });
  let assistEntryId = null;

  if (configureDialog) {
    const dlg = await promptStandaloneToolDialog(tool, {
      statKey,
      statLabel,
      rank,
      actorStat: getActorStatValue(actor, statKey),
      rollMode,
      assistOptions: assistRecipient ? assistChoiceOptions(assistRecipient) : [],
    });
    if (dlg === null) return null;

    targetMode = dlg.targetMode;
    extraModifier = dlg.modifier;
    rollMode = dlg.rollMode;
    assistEntryId = dlg.assistEntryId ?? null;
    await actor.setFlag("projectmoonttrpg", "rollMode", rollMode);

    if (targetMode !== "self") {
      const targeting = game.projectmoonttrpg?.targeting;
      if (!targeting) {
        ui.notifications.warn(game.i18n.localize("PMTTRPG.Dialog.noToolTargeting"));
        return false;
      }
      const chosen = await targeting.promptTargetSelection({
        actor,
        title: tool.name,
        sourceName: tool.name,
        sourceImg: tool.img,
        preferredCombatantId: game.combat?.combatant?.id ?? null,
      });
      if (chosen === null) return null;
      targetSelection = chosen;
      resolvedTarget = chosen?.actor ?? null;
      if (!resolvedTarget) {
        ui.notifications.warn(game.i18n.localize("PMTTRPG.Dialog.standaloneNeedsTarget"));
        return false;
      }
    }
    else {
      resolvedTarget = actor;
    }
  }
  else if (resolvedTarget == null) {
    resolvedTarget = actor;
    targetMode = "self";
  }
  else if (resolvedTarget === actor) {
    targetMode = "self";
  }

  const willing = targetMode === "self" || targetMode === "willing";
  let challengePenalty = 0;
  let penaltyLabel = "";

  if (willing) {
    challengePenalty = -rank;
    penaltyLabel = game.i18n.format("PMTTRPG.Chat.standalonePenaltyRank", { rank });
  }
  else {
    const targetStat = getActorStatValue(resolvedTarget, statKey);
    challengePenalty = -targetStat;
    penaltyLabel = game.i18n.format("PMTTRPG.Chat.standalonePenaltyStat", {
      stat: statLabel,
      value: targetStat,
      name: resolvedTarget?.name ?? "",
    });
  }

  const declared = await declareToolAction(tool, { alreadyDeclared, tokenId, combatant, timing, consumeAction, target: resolvedTarget });
  if (!declared.ok) return false;

  const templateData = {
    image: tool.img,
    title: tool.name,
    details: tool.system?.description ?? "",
    rollType: "tool",
    toolKind: "standalone",
    challengeStat: statKey,
    challengeStatLabel: statLabel,
    standaloneMode: willing ? "challenge" : "resisted",
    flavor: game.i18n.format("PMTTRPG.Chat.standaloneFlavor", {
      stat: statLabel,
      penalty: penaltyLabel,
    }),
    target: targetSelection ?? (resolvedTarget && resolvedTarget !== actor ? {
      actorId: resolvedTarget.id,
      name: resolvedTarget.name,
      img: resolvedTarget.img,
    } : null),
  };

  return PMTTRPGRolls.rollMove({
    actor,
    formula: statKey,
    templateData,
    statModifier: challengePenalty + Number(extraModifier || 0),
    assist: assistEntryId && assistRecipient
      ? { combatant: assistRecipient, entryId: assistEntryId, combat: game.combat ?? null }
      : null,
    onBeforeChat: async ({ resultType, templateData: td }) => {
      const failed = resultType === "failure";
      const mode = failed ? "negative" : "positive";
      const lines = effectLines(tool, mode);

      if (!failed) {
        const ok = await consumeToolUse(tool, { consume: toolConsumesByDefault(tool) });
        if (!ok) {
          ui.notifications.warn(game.i18n.localize("PMTTRPG.Dialog.noToolUses"));
        }
      }

      const remaining = getToolUsesRemaining(tool);
      td.resultDetails = failed
        ? game.i18n.format("PMTTRPG.Chat.standaloneFailure", {
          effects: lines.length ? lines.join(", ") : game.i18n.localize("PMTTRPG.Chat.standaloneNoEffects"),
        })
        : game.i18n.format("PMTTRPG.Chat.standaloneSuccess", {
          effects: lines.length ? lines.join(", ") : game.i18n.localize("PMTTRPG.Chat.standaloneNoEffects"),
          remaining,
        });

      await emitToolUsed({
        actor,
        item: tool,
        target: resolvedTarget ?? null,
        result: resultType,
        effectMode: mode,
      });
    },
  });
}

async function promptStandaloneToolDialog(tool, {
  statKey,
  statLabel,
  rank,
  actorStat,
  rollMode = "def",
  assistOptions = null,
} = {}) {
  const remaining = getToolUsesRemaining(tool);
  const assistRows = Array.isArray(assistOptions) && assistOptions.length ? assistOptions : null;
  const dialogData = {
    tool: {
      name: tool.name,
      img: tool.img,
      remaining,
      rank,
    },
    statKey,
    statLabel,
    actorStat,
    rankPenalty: rank,
    rollMode,
    assistOptions: assistRows,
    assistLabel: assistRows ? game.i18n.localize("PMTTRPG.Assist.ChoiceLabel") : null,
  };

  const html = await renderTemplate(
    "systems/projectmoonttrpg/templates/dialog/standalone-tool-dialog.html",
    dialogData
  );

  const dlgOptions = { classes: ["projectmoonttrpg", "PMTTRPG-dialog"] };
  if (PMTTRPGUtility.nightmode) dlgOptions.classes.push("nightmode");

  return waitForChoice({
    window: { title: game.i18n.format("PMTTRPG.Dialog.useToolTitle", { name: tool.name }) },
    classes: dlgOptions.classes,
    content: html,
    buttons: [{
      action: "use",
      label: game.i18n.localize("PMTTRPG.Dialog.roll"),
      default: true,
      callback: (event, button, dialog) => {
        const form = dialog.element.querySelector("form");
        return {
          targetMode: form.targetMode?.value || "self",
          modifier: Number(form.modifier?.value) || 0,
          rollMode: form.advantage?.value || "def",
          assistEntryId: String(form.assistEntryId?.value ?? "").trim() || null,
        };
      },
    }, {
      action: "cancel",
      label: game.i18n.localize("PMTTRPG.Dialog.cancel"),
      callback: () => null,
    }],
    rejectClose: false,
  });
}
