import { PMTTRPGUtility } from "../utility.js";

const CLASH_PROC_TYPES = new Set(["onClash", "onClashResult", "onEitherClashResult"]);
const CHOICE_PROC_TYPES = new Set(["onClash", "onClashResult", "onEitherClashResult", "onCondition"]);

export function effectShowsProcChoice(procOn = "alwaysActive") {
  return CHOICE_PROC_TYPES.has(procOn);
}

function toCssToken(value = "") {
  return `${value}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getGroupSort(effect = {}) {
  const procOn = effect?.procOn ?? "alwaysActive";
  const procResult = effect?.procResult ?? "none";

  if (procOn === "alwaysActive") return 0;
  if (procOn === "onCondition") return 10;
  if (procOn === "onClash") {
    if (procResult === "win") return 21;
    if (procResult === "lose") return 22;
    return 20;
  }
  if (procOn === "onClashResult") {
    if (procResult === "win") return 31;
    if (procResult === "lose") return 32;
    return 30;
  }
  if (procOn === "onEitherClashResult") {
    if (procResult === "win") return 41;
    if (procResult === "lose") return 42;
    return 40;
  }
  if (procOn === "onUse") return 50;
  if (procOn === "onBurst") return 60;
  if (procOn === "onCritical") return 70;
  if (procOn === "onDevastating") return 80;
  if (procOn === "onAction") return 90;

  return 999;
}

export function getEffectStack(effect = {}) {
  const stackRaw = Number(effect?.stack ?? effect?.count ?? 1);
  const stackMaxRaw = Number(effect?.stackMax ?? 5);
  const stackMax = Math.max(1, Number.isFinite(stackMaxRaw) ? stackMaxRaw : 5);
  return Math.max(1, Math.min(stackMax, Number.isFinite(stackRaw) ? stackRaw : 1));
}

export function buildEffectSummaryGroups(effects = []) {
  const topGroups = new Map();

  const addLine = (groupKey, groupLabel, groupSort, subKey, subLabel, lineText) => {
    if (!topGroups.has(groupKey)) {
      topGroups.set(groupKey, {
        key: groupKey,
        heading: groupLabel,
        sort: groupSort,
        lines: [],
        subgroups: new Map(),
        subgroupOrder: []
      });
    }

    const group = topGroups.get(groupKey);
    group.sort = Math.min(group.sort ?? groupSort, groupSort);

    if (subKey) {
      if (!group.subgroups.has(subKey)) {
        group.subgroups.set(subKey, {
          key: subKey,
          heading: subLabel,
          lines: []
        });
        group.subgroupOrder.push(subKey);
      }

      group.subgroups.get(subKey).lines.push(lineText);
      return;
    }

    group.lines.push(lineText);
  };

  for (const effect of effects ?? []) {
    const stack = getEffectStack(effect);
    const textSource = effect.mode === "negative"
      ? (effect.negative || effect.positive || "")
      : (effect.positive || effect.negative || "");
    const text = PMTTRPGUtility.expandEffectText(textSource, stack).trim();
    const lineText = foundry.utils.escapeHTML(text || game.i18n.localize("PMTTRPG.EffectNoSummaryText"));
    const procOn = effect?.procOn ?? "alwaysActive";
    const procCondition = `${effect?.procCondition ?? ""}`.trim();

    if (procOn === "alwaysActive") {
      const groupLabel = game.i18n.localize("PMTTRPG.EffectProcAlwaysActive");
      const groupSort = getGroupSort({ procOn: "alwaysActive" });

      if (procCondition) {
        addLine("alwaysActive", groupLabel, groupSort, `condition:${procCondition.toLowerCase()}`, procCondition, lineText);
      }
      else {
        addLine("alwaysActive", groupLabel, groupSort, "", "", lineText);
      }
      continue;
    }

    const procResult = effect?.procResult ?? "none";
    const procChoice = effect?.procChoice ?? "none";
    const groupKey = CLASH_PROC_TYPES.has(procOn)
      ? `${procOn}:${procResult}:${procChoice}`
      : (CHOICE_PROC_TYPES.has(procOn) ? `${procOn}:${procChoice}` : procOn);
    const groupLabel = PMTTRPGUtility.formatEffectProcLabel(effect);
    const groupSort = getGroupSort(effect);
    addLine(groupKey, groupLabel, groupSort, "", "", lineText);
  }

  const renderLines = (lines = []) => lines.map(line => `<span class="effect-summary-line">${foundry.utils.unescapeHTML(line)}</span>`);
  const renderGroup = (group) => {
    const groupClass = toCssToken(group.key || group.heading || "group");
    const parts = [`<span class="effect-summary-tag effect-summary-tag--${groupClass}">${foundry.utils.escapeHTML(group.heading)}</span>`];

    if (group.lines.length) {
      parts.push(renderLines(group.lines).join("<br/>"));
    }

    for (const subKey of group.subgroupOrder) {
      const subgroup = group.subgroups.get(subKey);
      const subgroupClass = toCssToken(subgroup.key || subgroup.heading || "subgroup");
      parts.push(`
        <div class="effect-summary-subgroup">
          <span class="effect-summary-tag effect-summary-tag--sub effect-summary-tag--${subgroupClass}">${foundry.utils.escapeHTML(subgroup.heading).trim()}</span>
          ${renderLines(subgroup.lines)}
        </div>`);
    }

    return `<div class="effect-summary-block">${parts.join("<br/>")}</div>`;
  };

  const orderedKeys = Array.from(topGroups.values())
    .sort((left, right) => {
      if ((left.sort ?? 999) !== (right.sort ?? 999)) {
        return (left.sort ?? 999) - (right.sort ?? 999);
      }

      return (left.heading ?? "").localeCompare(right.heading ?? "");
    })
    .map(group => group.key);

  return [{
    key: "combined",
    heading: game.i18n.localize("PMTTRPG.Effects"),
    summaryText: orderedKeys.map(key => renderGroup(topGroups.get(key))).join("<br><br>")
  }];
}

function getEffectTriggerClass(effect = {}) {
  const triggerClasses = {
    alwaysActive: "trigger-always-active",
    onClash: "trigger-on-clash",
    onClashLose: "trigger-on-clash-lose",
    onClashWin: "trigger-on-clash-win",
    onHit: "trigger-on-hit",
    onBeingHit: "trigger-on-being-hit",
    onUse: "trigger-on-use",
    onBurst: "trigger-on-burst",
    onKill: "trigger-on-kill",
    onTurnStart: "trigger-on-turn-start",
    onRoundStart: "trigger-on-round-start",
    onMovement: "trigger-on-movement",
    onCombatStart: "trigger-on-combat-start",
    onAction: "trigger-on-action"
  };

  return triggerClasses[effect.procOn] ?? "trigger-default";
}

function stripOuterBlockTags(html = "") {
  let result = String(html).trim();

  // Remove leading and trailing paragraph tags, including attributes.
  result = result
    .replace(/^<p\b[^>]*>/i, "")
    .replace(/<\/p>\s*$/i, "")
    .trim();

  // Also remove a single outer div if present.
  result = result
    .replace(/^<div\b[^>]*>/i, "")
    .replace(/<\/div>\s*$/i, "")
    .trim();

  return result;
}

export async function buildInlineEffectSummary(effect = {}) {
  const stack = getEffectStack(effect);

  const textSource = effect.mode === "negative"
    ? (effect.negative || effect.positive || "")
    : (effect.positive || effect.negative || "");

  const text = PMTTRPGUtility.expandEffectText(textSource, stack).trim();
  const trigger = PMTTRPGUtility.formatEffectProcLabel(effect);
  const triggerClass = getEffectTriggerClass(effect);
  const fallback = game.i18n.localize("PMTTRPG.EffectNoSummaryText");

  const enrichedText = await TextEditor.enrichHTML(text || fallback);
  const cleanText = stripOuterBlockTags(enrichedText);

  const triggerHtml = trigger
    ? `<span class="effect-summary-trigger ${triggerClass}">[${foundry.utils.escapeHTML(trigger)}]</span> `
    : "";

  return `<span class="effect-summary-line">${triggerHtml}${cleanText}</span>`;
}

export function computeEffectSummary(entries = [], epMax = 0) {
  let positiveSpent = 0;
  let negativeSpent = 0;
  const signatureCounts = new Map();

  for (const entry of entries ?? []) {
    const cost = Math.abs(Number(entry?.cost ?? 0));
    const stack = Math.max(1, Number(entry?.stack ?? entry?.count ?? 1));
    const signature = [
      entry?.effectUuid ?? '',
      entry?.procOn ?? '',
      entry?.procResult ?? '',
      entry?.procChoice ?? '',
      entry?.procStat ?? '',
      entry?.procDice ?? '',
      entry?.procAction ?? '',
      entry?.procCondition ?? '',
      entry?.mode ?? ''
    ].join('|').toLowerCase();

    signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);

    if (entry?.mode === 'negative') {
      negativeSpent += cost * stack;
    }
    else {
      positiveSpent += cost * stack;
    }
  }

  const cap = Number.isFinite(Number(epMax)) ? Number(epMax) : 0;
  const remaining = (cap + negativeSpent) - positiveSpent;
  const overPositive = positiveSpent > (cap + negativeSpent);
  const overNegative = negativeSpent > cap;
  const hasDuplicates = Array.from(signatureCounts.values()).some(count => count > 1);

  return {
    epMax: cap,
    positiveSpent,
    negativeSpent,
    remaining,
    overPositive,
    overNegative,
    hasDuplicates,
    hasWarnings: overPositive || overNegative || hasDuplicates
  };
}

export function normalizeEffectEntries(rawEffects = []) {
  if (!Array.isArray(rawEffects)) return [];

  return rawEffects.map((entry) => {
    const stackRaw = Number(entry?.stack ?? entry?.count ?? 1);
    const stackMaxRaw = Number(entry?.stackMax ?? (entry?.allowMultiple === false ? 1 : 5));
    const stackMax = Math.max(1, Number.isFinite(stackMaxRaw) ? stackMaxRaw : 5);
    const stack = Math.max(1, Math.min(stackMax, Number.isFinite(stackRaw) ? stackRaw : 1));
    const costRaw = Number(entry?.cost ?? 0);
    const cost = Number.isFinite(costRaw) ? costRaw : 0;
    const mode = entry?.mode === 'negative' ? 'negative' : 'positive';

    return {
      effectUuid: entry?.effectUuid ?? entry?.uuid ?? '',
      easyEffectsTemplate: String(entry?.easyEffectsTemplate ?? ''),
      name: entry?.name ?? '',
      cost,
      stackMax,
      stack,
      count: stack,
      mode,
      appliesTo: entry?.appliesTo ?? '',
      canPositive: entry?.canPositive !== false,
      canNegative: entry?.canNegative !== false,
      procOn: entry?.procOn ?? 'alwaysActive',
      procResult: entry?.procResult ?? 'none',
      procResultLocked: entry?.procResultLocked ?? false,
      procChoice: entry?.procChoice ?? 'none',
      procChoiceLocked: entry?.procChoiceLocked ?? false,
      procStat: entry?.procStat ?? 'any',
      procDice: entry?.procDice ?? 'any',
      procAction: entry?.procAction ?? 'any',
      procCondition: entry?.procCondition ?? '',
      positive: entry?.positive ?? '',
      negative: entry?.negative ?? '',
      macro: foundry.utils.mergeObject({ uuid: '' }, entry?.macro ?? {}, { inplace: false })
    };
  });
}