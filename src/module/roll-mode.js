/**
 * Advantage and Disadvantage are counted by source. Any Advantage with any
 * Disadvantage just cancels out, no matter the counts. Otherwise we roll twice
 * and keep the highest or lowest (counts never add extra dice, since CR says
 * "you only ever roll two times").
 */

const ROLL_MODES = {
  NORMAL: "normal",
  ADVANTAGE: "advantage",
  DISADVANTAGE: "disadvantage",
  CANCELED: "canceled",
};

function count(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export function resolveRollMode({ advantage = 0, disadvantage = 0 } = {}) {
  const adv = count(advantage);
  const dis = count(disadvantage);
  if (adv > 0 && dis > 0) return ROLL_MODES.CANCELED;
  if (adv > 0) return ROLL_MODES.ADVANTAGE;
  if (dis > 0) return ROLL_MODES.DISADVANTAGE;
  return ROLL_MODES.NORMAL;
}

export function addRollModeSources(counts, sources) {
  if (!sources) return counts;
  counts.advantage += count(sources.advantage);
  counts.disadvantage += count(sources.disadvantage);
  return counts;
}

export function applyRollModeFormula(formula, mode) {
  const text = String(formula ?? "");
  if (mode !== ROLL_MODES.ADVANTAGE && mode !== ROLL_MODES.DISADVANTAGE) return text;
  const suffix = mode === ROLL_MODES.ADVANTAGE ? "kh" : "kl";
  if (text.includes("2d6")) return text.replace("2d6", `{2d6, 2d6}${suffix}`);
  if (text.includes("d6")) return text.replace(/(\d*)d6/, (match) => `{${match}, ${match}}${suffix}`);
  return text;
}

/** The roll dialog's note for Advantage or Disadvantage a rule adds on top of the roller's own pick. */
export function rollModeSourcesNoteKey(sources) {
  const mode = resolveRollMode(sources ?? {});
  if (mode === ROLL_MODES.ADVANTAGE) return "PMTTRPG.Dialog.alsoAdvantage";
  if (mode === ROLL_MODES.DISADVANTAGE) return "PMTTRPG.Dialog.alsoDisadvantage";
  if (mode === ROLL_MODES.CANCELED) return "PMTTRPG.Dialog.rollModeCanceled";
  return null;
}

export function rollModeCountsFromSticky(flag) {
  return {
    advantage: flag === "adv" ? 1 : 0,
    disadvantage: flag === "dis" ? 1 : 0,
  };
}
