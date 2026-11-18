export const DAMAGE_TYPES = Object.freeze(["slash", "pierce", "blunt", "force"]);

export const RESISTANCE_DAMAGE_TYPES = Object.freeze(["slash", "pierce", "blunt"]);

export const WEAPON_DAMAGE_TYPE_CHOICES = Object.freeze({
  none: "PMTTRPG.DamageTypeNone",
  slash: "PMTTRPG.DamageTypeSlash",
  pierce: "PMTTRPG.DamageTypePierce",
  blunt: "PMTTRPG.DamageTypeBlunt",
  force: "PMTTRPG.DamageTypeForce",
});

export const RESISTANCE_DAMAGE_TYPE_CHOICES = Object.freeze({
  slash: "PMTTRPG.DamageTypeSlash",
  pierce: "PMTTRPG.DamageTypePierce",
  blunt: "PMTTRPG.DamageTypeBlunt",
});

export const RESISTANCE_MULTIPLIERS = Object.freeze({
  fatal: 2,
  weak: 1.5,
  normal: 1,
  endured: 0.5,
  ineffective: 0.25,
  immune: 0,
});

export const RESISTANCE_LEVELS = Object.freeze(Object.keys(RESISTANCE_MULTIPLIERS));

/** @param {string} raw */
export function normalizeResistanceLevel(raw) {
  const key = String(raw ?? "").trim().toLowerCase();
  return RESISTANCE_MULTIPLIERS[key] !== undefined ? key : null;
}

/** @param {string} raw */
export function normalizeDamageType(raw) {
  const key = String(raw ?? "").trim().toLowerCase();
  return DAMAGE_TYPES.includes(key) ? key : null;
}

export function normalizeResistanceDamageType(raw) {
  const key = normalizeDamageType(raw);
  return key && RESISTANCE_DAMAGE_TYPES.includes(key) ? key : null;
}

/** @param {string} raw */
export function isResistanceNoun(raw) {
  const key = String(raw ?? "").trim().toLowerCase();
  return key === "resistance" || key === "resistances";
}

/**
 * @returns {Record<string, string>|null}
 * @param {{ pools?: string[], damageTypes?: string[], level: string }} spec
 */
export function buildResistanceOverrideMap({ pools, damageTypes, level } = {}) {
  const lvl = normalizeResistanceLevel(level);
  if (!lvl) return null;
  const poolList = (pools?.length ? pools : ["hp", "st"]).filter((p) => p === "hp" || p === "st");
  const typeList = (damageTypes?.length ? damageTypes : [...RESISTANCE_DAMAGE_TYPES])
    .map(normalizeResistanceDamageType)
    .filter(Boolean);
  if (!poolList.length || !typeList.length) return null;
  const out = {};
  for (const pool of poolList) {
    for (const dt of typeList) out[`${pool}.${dt}`] = lvl;
  }
  return out;
}

// The highest damage multiplier wins each resistance cell.
export function mergeResistanceOverrideMaps(into, from) {
  if (!from || typeof from !== "object") return;
  if (!into || typeof into !== "object") return;
  for (const [key, level] of Object.entries(from)) {
    const next = normalizeResistanceLevel(level);
    if (!next) continue;
    const cur = normalizeResistanceLevel(into[key]);
    const nextMult = RESISTANCE_MULTIPLIERS[next] ?? 1;
    const curMult = cur != null ? (RESISTANCE_MULTIPLIERS[cur] ?? 1) : -Infinity;
    if (cur == null || nextMult > curMult) into[key] = next;
  }
}

export function formatResistanceMultiplier(multiplier) {
  const m = Number(multiplier);
  if (!Number.isFinite(m) || m === 0) return "0x";
  return `${Number.isInteger(m) ? m : m}x`;
}
