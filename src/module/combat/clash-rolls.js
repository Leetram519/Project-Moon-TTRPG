import { applyDiceMaxFloor, formatDiceFormula} from "../easy-effects/dice-formula.js";
import { addCombatDiceMods } from "../easy-effects/nouns.js";
import { getItemAlwaysActiveCombatMods } from "../easy-effects/registry.js";
import { normalizeWeaponProperties } from "../item/weapon-properties.js";

/**
 * All dice roll logic for the clash system.
 * Returns plain result objects — does not touch chat or Foundry documents.
 *
 * Roll anatomy (all clash rolls):
 *   Attack:  weapon offensive dice + attackModifier
 *   Evade:   1d12 (or outfit evadeDice) + evadeModifier
 *   Block:   1d10 (or outfit blockDice) + blockModifier
 *   Counter: chosen weapon offensive dice + attackModifier
 * @typedef {object} RollBreakdownRow
 * @property {string} key
 * @property {string} label
 * @property {string} detail
 * @property {boolean} [final]
 */

/**
 * @typedef {object} RollResult
 * @property {number}   total
 * @property {string}   formula
 * @property {Roll}     roll       — live Roll instance (for rendering)
 * @property {RollBreakdownRow[]} [breakdown]
 */

// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Returns the equipped outfit for an actor, or null.
 * @param {ActorPMTTRPG} actor
 * @returns {Item|null}
 */
function getEquippedOutfit(actor) {
  return actor.items.find(i => i.type === "outfit" && i.system?.equipped) ?? null;
}

function signed(n) {
  const v = Math.round(Number(n) || 0);
  if (!v) return "0";
  return v > 0 ? `+${v}` : `${v}`;
}

function pushRow(rows, key, labelKey, detail, extra = {}) {
  if (detail == null || detail === "" || detail === "0" || detail === "+0") return;
  rows.push({
    key,
    label: game.i18n.localize(labelKey),
    detail: String(detail),
    ...extra,
  });
}

function formMaxBonus(formProperty) {
  return (formProperty === "medium" || formProperty === "highCaliber") ? 2 : 0;
}

function handPowerBonus(handProperty) {
  if (handProperty === "off1h") return 1;
  if (handProperty === "off2h") return 2;
  return 0;
}

function formLabel(formProperty) {
  const map = {
    medium: "PMTTRPG.Clash.Breakdown.FormMedium",
    highCaliber: "PMTTRPG.Clash.Breakdown.FormHighCaliber",
  };
  return map[formProperty] ? game.i18n.localize(map[formProperty]) : formProperty;
}

function handLabel(handProperty) {
  const map = {
    off1h: "PMTTRPG.Clash.Breakdown.HandOff1H",
    off2h: "PMTTRPG.Clash.Breakdown.HandOff2H",
  };
  return map[handProperty] ? game.i18n.localize(map[handProperty]) : handProperty;
}

/**
 * Returns the computed evade dice string from the actor's equipped outfit,
 * falling back to the system default.
 * @param {ActorPMTTRPG} actor
 * @returns {string}
 * @returns {{ formula: string, breakdown: RollBreakdownRow[] }}
 */
export function buildOffensiveDiceParts(actor, weaponItem, clashBonuses = {}) {
  const rows = [];
  const baseSides = 10;
  const { formProperty, handProperty } = normalizeWeaponProperties(weaponItem?.system);
  const formMax = formMaxBonus(formProperty);
  const handPower = handPowerBonus(handProperty);

  const rank = Number(actor?.system?.attributes?.rank?.value ?? 0) || 0;
  const eeMods = actor?.system?.attributes?.easyEffectsMods ?? {};
  const local = weaponItem?.system?.alwaysActiveCombatMods
    ?? getItemAlwaysActiveCombatMods(weaponItem, actor);
  const always = addCombatDiceMods(eeMods, local);
  const alwaysPower = Number(always.attackPower ?? 0) || 0;
  const alwaysMax = Number(always.attackMax ?? 0) || 0;
  const clashPower = Number(clashBonuses.attackPower ?? 0) || 0;
  const clashMax = Number(clashBonuses.attackMax ?? 0) || 0;

  pushRow(rows, "base", "PMTTRPG.Clash.Breakdown.BaseDie", `1d${baseSides}`);
  if (formMax) {
    pushRow(
      rows,
      "formMax",
      "PMTTRPG.Clash.Breakdown.FormMax",
      `${signed(formMax)} ${game.i18n.localize("PMTTRPG.Clash.Breakdown.DiceMax")} (${formLabel(formProperty)})`,
    );
  }
  if (handPower) {
    pushRow(
      rows,
      "handPower",
      "PMTTRPG.Clash.Breakdown.HandPower",
      `${signed(handPower)} ${game.i18n.localize("PMTTRPG.Clash.Breakdown.DicePower")} (${handLabel(handProperty)})`,
    );
  }
  if (rank) {
    pushRow(
      rows,
      "rank",
      "PMTTRPG.Clash.Breakdown.Rank",
      `${signed(rank)} ${game.i18n.localize("PMTTRPG.Clash.Breakdown.DicePower")}`,
    );
  }
  if (alwaysPower) {
    pushRow(
      rows,
      "alwaysPower",
      "PMTTRPG.Clash.Breakdown.AlwaysActivePower",
      `${signed(alwaysPower)} ${game.i18n.localize("PMTTRPG.Clash.Breakdown.DicePower")}`,
    );
  }
  if (alwaysMax) {
    pushRow(
      rows,
      "alwaysMax",
      "PMTTRPG.Clash.Breakdown.AlwaysActiveMax",
      `${signed(alwaysMax)} ${game.i18n.localize("PMTTRPG.Clash.Breakdown.DiceMax")}`,
    );
  }
  if (clashPower) {
    pushRow(
      rows,
      "clashPower",
      "PMTTRPG.Clash.Breakdown.ClashStartPower",
      `${signed(clashPower)} ${game.i18n.localize("PMTTRPG.Clash.Breakdown.DicePower")}`,
    );
  }
  if (clashMax) {
    pushRow(
      rows,
      "clashMax",
      "PMTTRPG.Clash.Breakdown.ClashStartMax",
      `${signed(clashMax)} ${game.i18n.localize("PMTTRPG.Clash.Breakdown.DiceMax")}`,
    );
  }

  const floored = applyDiceMaxFloor(baseSides, formMax + alwaysMax + clashMax);
  if (floored.powerAdjust) {
    pushRow(
      rows,
      "maxFloor",
      "PMTTRPG.Clash.Breakdown.MaxFloor",
      `${signed(floored.powerAdjust)} ${game.i18n.localize("PMTTRPG.Clash.Breakdown.DicePower")}`,
    );
  }

  const totalPower = handPower + rank + alwaysPower + clashPower + floored.powerAdjust;
  const formula = formatDiceFormula(1, floored.sides, totalPower);
  pushRow(rows, "formula", "PMTTRPG.Clash.Breakdown.Formula", formula, { final: true });

  return { formula, breakdown: rows, sides: floored.sides, power: totalPower };
}

/**
 * Returns the computed block dice string from the actor's equipped outfit.
 * @param {ActorPMTTRPG} actor
 * @returns {string}
 * @returns {{ formula: string, breakdown: RollBreakdownRow[] }}
 */
export function buildDefenseDiceParts(actor, kind, clashBonuses = {}) {
  const rows = [];
  const isEvade = kind === "evade";
  const baseSides = isEvade ? 12 : 10;
  const outfit = getEquippedOutfit(actor);
  const prop = outfit?.system?.outfitProperty ?? null;
  const propPower = isEvade
    ? (prop === "swift" ? 1 : 0)
    : (prop === "armored" ? 1 : 0);
  const stat = isEvade
    ? Number(actor?.system?.abilities?.ins?.value ?? 0) || 0
    : Number(actor?.system?.abilities?.tem?.value ?? 0) || 0;
  const eeMods = actor?.system?.attributes?.easyEffectsMods ?? {};
  const local = outfit?.system?.alwaysActiveCombatMods
    ?? getItemAlwaysActiveCombatMods(outfit, actor);
  const always = addCombatDiceMods(eeMods, local);
  const alwaysPower = Number(isEvade ? always.evadePower : always.blockPower) || 0;
  const alwaysMax = Number(isEvade ? always.evadeMax : always.blockMax) || 0;
  const clashPower = Number(isEvade ? clashBonuses.evadePower : clashBonuses.blockPower) || 0;
  const clashMax = Number(isEvade ? clashBonuses.evadeMax : clashBonuses.blockMax) || 0;

  pushRow(rows, "base", "PMTTRPG.Clash.Breakdown.BaseDie", `1d${baseSides}`);
  if (propPower) {
    const propKey = prop === "swift" ? "PMTTRPG.OutfitPropertySwift" : "PMTTRPG.OutfitPropertyArmored";
    pushRow(
      rows,
      "outfitProp",
      "PMTTRPG.Clash.Breakdown.OutfitProperty",
      `${signed(propPower)} ${game.i18n.localize("PMTTRPG.Clash.Breakdown.DicePower")} (${game.i18n.localize(propKey)})`,
    );
  }
  if (stat) {
    pushRow(
      rows,
      "stat",
      isEvade ? "PMTTRPG.Clash.Breakdown.Insight" : "PMTTRPG.Clash.Breakdown.Temperance",
      `${signed(stat)} ${game.i18n.localize("PMTTRPG.Clash.Breakdown.DicePower")}`,
    );
  }
  if (alwaysPower) {
    pushRow(
      rows,
      "alwaysPower",
      "PMTTRPG.Clash.Breakdown.AlwaysActivePower",
      `${signed(alwaysPower)} ${game.i18n.localize("PMTTRPG.Clash.Breakdown.DicePower")}`,
    );
  }
  if (alwaysMax) {
    pushRow(
      rows,
      "alwaysMax",
      "PMTTRPG.Clash.Breakdown.AlwaysActiveMax",
      `${signed(alwaysMax)} ${game.i18n.localize("PMTTRPG.Clash.Breakdown.DiceMax")}`,
    );
  }
  if (clashPower) {
    pushRow(
      rows,
      "clashPower",
      "PMTTRPG.Clash.Breakdown.ClashStartPower",
      `${signed(clashPower)} ${game.i18n.localize("PMTTRPG.Clash.Breakdown.DicePower")}`,
    );
  }
  if (clashMax) {
    pushRow(
      rows,
      "clashMax",
      "PMTTRPG.Clash.Breakdown.ClashStartMax",
      `${signed(clashMax)} ${game.i18n.localize("PMTTRPG.Clash.Breakdown.DiceMax")}`,
    );
  }

  const floored = applyDiceMaxFloor(baseSides, alwaysMax + clashMax);
  if (floored.powerAdjust) {
    pushRow(
      rows,
      "maxFloor",
      "PMTTRPG.Clash.Breakdown.MaxFloor",
      `${signed(floored.powerAdjust)} ${game.i18n.localize("PMTTRPG.Clash.Breakdown.DicePower")}`,
    );
  }

  const totalPower = propPower + stat + alwaysPower + clashPower + floored.powerAdjust;
  const formula = formatDiceFormula(1, floored.sides, totalPower);
  pushRow(rows, "formula", "PMTTRPG.Clash.Breakdown.Formula", formula, { final: true });

  return { formula, breakdown: rows, sides: floored.sides, power: totalPower };
}
/**
 * Builds and evaluates a Roll, returning a RollResult.
 * @param {string} formula
 * @param {object} rollData
 * @param {string} rollData.visualType
 * @returns {Promise<RollResult>}
 */
async function evaluate(formula, rollData = {}, breakdown = []) {
  // TODO: Clash roll visualTypes
  console.log(rollData);

  const roll = await new Roll(formula, rollData, {type:rollData.visualType}).evaluate();
  console.log(roll);
  return {
    total:   roll.total,
    formula: roll.formula,
    terms:   roll.toJSON().terms,
    roll,
    breakdown,
    rollMode: "normal",
  };
}

/**
 * Advantage and Disadvantage cancel
 * @param {object} [bonuses]
 * @param {object} [options]
 * @param {boolean} [options.advantage]
 * @param {boolean} [options.disadvantage]
 * @returns {"normal"|"advantage"|"disadvantage"|"canceled"}
 */
export function resolveClashRollMode(bonuses = {}, options = {}) {
  let adv = Math.max(0, Math.round(Number(bonuses?.advantage) || 0));
  let dis = Math.max(0, Math.round(Number(bonuses?.disadvantage) || 0));
  if (options.advantage) adv += 1;
  if (options.disadvantage) dis += 1;
  if (adv > 0 && dis > 0) return "canceled";
  if (adv > 0) return "advantage";
  if (dis > 0) return "disadvantage";
  return "normal";
}

function wrapFormulaForRollMode(formula, mode) {
  const f = String(formula ?? "").trim();
  if (!f) return f;
  if (mode === "advantage") return `{${f}, ${f}}kh`;
  if (mode === "disadvantage") return `{${f}, ${f}}kl`;
  return f;
}

function poolSubtotals(roll) {
  const out = [];
  const walk = (terms) => {
    for (const term of terms ?? []) {
      if (Array.isArray(term?.rolls) && term.rolls.length) {
        for (const sub of term.rolls) {
          const n = Number(sub?.total);
          if (Number.isFinite(n)) out.push(n);
        }
      }
      if (term?.dice) walk(term.dice);
      if (term?.terms) walk(term.terms);
    }
  };
  walk(roll?.terms);
  return out;
}

/**
 * @param {string} formula
 * @param {object} rollData
 * @param {RollBreakdownRow[]} breakdown
 * @param {"normal"|"advantage"|"disadvantage"|"canceled"} mode
 * @param {string} visualType Visual Type for Dice So Nice integration
 */
async function evaluateWithRollMode(formula, rollData, breakdown, mode, visualType) {
  rollData.visualType = visualType;

  if (mode === "canceled") {
    const rows = [...(breakdown ?? [])];
    rows.push({
      key: "rollMode",
      label: game.i18n.localize("PMTTRPG.Clash.Breakdown.RollModeCanceled"),
      detail: "-",
    });
    const result = await evaluate(formula, rollData, rows);
    result.rollMode = "canceled";
    return result;
  }

  if (mode !== "advantage" && mode !== "disadvantage") {
    return evaluate(formula, rollData, breakdown);
  }

  const wrapped = wrapFormulaForRollMode(formula, mode);
  const result = await evaluate(wrapped, rollData, breakdown);
  const subs = poolSubtotals(result.roll);
  const detail = subs.length >= 2
    ? `${subs[0]} / ${subs[1]} → ${result.total}`
    : String(result.total);
  const rows = [...(breakdown ?? [])];
  rows.push({
    key: "rollMode",
    label: game.i18n.localize(
      mode === "advantage"
        ? "PMTTRPG.Clash.Breakdown.RollModeAdvantage"
        : "PMTTRPG.Clash.Breakdown.RollModeDisadvantage"
    ),
    detail,
  });
  result.breakdown = rows;
  result.rollMode = mode;
  return result;
}

function rollDataForActor(actor) {
  const data = actor?.getRollData?.() ?? {};
  if (actor?.id) return { ...data, actorId: actor.id };
  return data;
}

/**
 * @param {ActorPMTTRPG} actor
 * @param {Item} weaponItem
 * @param {object} [bonuses] attackPower and attackMax for one clash side
 * @param {object} [options]
 * @param {boolean} [options.advantage]
 * @param {boolean} [options.disadvantage]
 * @returns {Promise<RollResult>}
 */
export async function rollAttack(actor, weaponItem, bonuses = {}, options = {}) {
  const built = buildOffensiveDiceParts(actor, weaponItem, bonuses);
  const mode = resolveClashRollMode(bonuses, options);
  return evaluateWithRollMode(built.formula, rollDataForActor(actor), built.breakdown, mode, weaponItem.system.damageType);
}

/**
 * @param {ActorPMTTRPG} actor
 * @param {object} [bonuses]
 * @param {object} [options]
 * @returns {Promise<RollResult>}
 */
export async function rollEvade(actor, bonuses = {}, options = {}) {
  const built = buildDefenseDiceParts(actor, "evade", bonuses);
  const mode = resolveClashRollMode(bonuses, options);
  return evaluateWithRollMode(built.formula, rollDataForActor(actor), built.breakdown, mode, "evade");
}

/**
 * @param {ActorPMTTRPG} actor
 * @param {object} [bonuses]
 * @param {object} [options]
 * @returns {Promise<RollResult>}
 */
export async function rollBlock(actor, bonuses = {}, options = {}) {
  const built = buildDefenseDiceParts(actor, "block", bonuses);
  const mode = resolveClashRollMode(bonuses, options);
  return evaluateWithRollMode(built.formula, rollDataForActor(actor), built.breakdown, mode, "block");
}

/**
 * @param {ActorPMTTRPG} actor
 * @param {Item} weaponItem
 * @param {object} [bonuses]
 * @param {object} [options]
 * @returns {Promise<RollResult>}
 */
export async function rollCounter(actor, weaponItem, bonuses = {}, options = {}) {
  return rollAttack(actor, weaponItem, bonuses, options);
}

/**
 * @param {number} attackTotal
 * @param {number} defenseTotal
 * @returns {{ result: string, margin: number }}
 */
export function resolveClash(attackTotal, defenseTotal) {
  const margin = Math.abs(attackTotal - defenseTotal);
  if (attackTotal === defenseTotal) {
    return { result: "tie", margin: 0 };
  }
  if (attackTotal > defenseTotal) {
    return { result: "attackWin", margin };
  }
  return { result: "defenseWin", margin };
}
