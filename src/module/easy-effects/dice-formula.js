/**
 * Max that would drop a die below d1 becomes a Power penalty instead.
 */
export function applyDiceMaxFloor(baseSides, maxDelta = 0) {
  const base = Math.max(1, Math.round(Number(baseSides) || 1));
  const delta = Math.round(Number(maxDelta) || 0);
  let sides = base + delta;
  let powerAdjust = 0;
  if (sides < 1) {
    powerAdjust = sides - 1;
    sides = 1;
  }
  return { sides, powerAdjust };
}

/** `NdX+P` only. Keep/drop and other Foundry syntax return null. */
export function parseSimpleDiceFormula(formula) {
  const raw = String(formula ?? "").trim();
  const m = raw.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!m) return null;
  return {
    count: Number(m[1] || 1) || 1,
    sides: Number(m[2]) || 1,
    power: Number(m[3] || 0) || 0,
  };
}

/**
 * `2d10+8[slash]` and `2d10[slash]+8` both parse. Two flavors return null.
 * A count or a face count below 1 also returns null.
 */
export function parseDiceFormulaOverride(formula) {
  const raw = String(formula ?? "").trim();
  // by the gods... a regex masterpiece
  const m = raw.match(/^(\d*)d(\d+)(?:\[([^\]]+)\])?([+-]\d+)?(?:\[([^\]]+)\])?$/i);
  if (!m) return null;
  const count = Number(m[1] || 1);
  const sides = Number(m[2]);
  if (!Number.isInteger(count) || count < 1) return null;
  if (!Number.isInteger(sides) || sides < 1) return null;
  const flavorA = String(m[3] ?? "").trim();
  const flavorB = String(m[5] ?? "").trim();
  if (flavorA && flavorB) return null;
  const flavor = (flavorB || flavorA).toLowerCase();
  return {
    count,
    sides,
    power: Number(m[4] || 0) || 0,
    flavor: flavor || null,
  };
}

/**
 * `basePower` is the bonus written in the formula. `power` is added to it.
 * The die count stops at 1.
 */
export function applyCombatDie({
  baseCount = 1,
  baseSides = 10,
  basePower = 0,
  amount = 0,
  max = 0,
  power = 0,
} = {}) {
  const count = Math.max(
    1,
    Math.round(Number(baseCount) || 1) + Math.round(Number(amount) || 0),
  );
  const { sides, powerAdjust } = applyDiceMaxFloor(baseSides, max);
  const totalPower = Math.round(Number(basePower) || 0) + Math.round(Number(power) || 0) + powerAdjust;
  return {
    formula: formatDiceFormula(count, sides, totalPower),
    count,
    sides,
    power: totalPower,
    powerAdjust,
  };
}

export function formatDiceFormula(count, sides, power) {
  const n = Math.max(1, Math.round(Number(count) || 1));
  const s = Math.max(1, Math.round(Number(sides) || 1));
  const p = Math.round(Number(power) || 0);
  if (!p) return `${n}d${s}`;
  return `${n}d${s}${p > 0 ? `+${p}` : `${p}`}`;
}

/**
 * `deal 1d10 per N` becomes one `Nd10` roll. Flat Power is not multiplied.
 */
export function expandSimpleDiceByMultiplier(formula, times) {
  const n = Math.max(0, Math.round(Number(times) || 0));
  if (n <= 0) return "0";
  const parsed = parseSimpleDiceFormula(formula);
  if (!parsed) return null;
  return formatDiceFormula(parsed.count * n, parsed.sides, parsed.power);
}

export function resolveDiceBonuses(baseFormula, bonuses = {}) {
  const power = Math.round(Number(bonuses.power) || 0);
  const max = Math.round(Number(bonuses.max) || 0);
  const amount = Math.round(Number(bonuses.amount) || 0);
  const parsed = parseSimpleDiceFormula(baseFormula);
  if (!parsed) {
    if (max || amount) {
      console.warn(
        `[EasyEffects] Cannot apply dice max (${max}) or dice amount (${amount}) to non-simple formula '${baseFormula}'; power only.`
      );
    }
    const formula = !power
      ? String(baseFormula ?? "")
      : `${baseFormula}${power > 0 ? `+${power}` : `${power}`}`;
    return {
      formula,
      count: 0,
      sides: parsed?.sides ?? 0,
      power: (parsed?.power ?? 0) + power,
      powerAdjust: 0,
      maxDelta: max,
    };
  }

  const applied = applyCombatDie({
    baseCount: parsed.count,
    baseSides: parsed.sides,
    basePower: parsed.power,
    amount,
    max,
    power,
  });
  return {
    formula: applied.formula,
    count: applied.count,
    sides: applied.sides,
    power: applied.power,
    powerAdjust: applied.powerAdjust,
    maxDelta: max,
  };
}

export function applyDiceBonuses(baseFormula, bonuses = {}) {
  return resolveDiceBonuses(baseFormula, bonuses).formula;
}
