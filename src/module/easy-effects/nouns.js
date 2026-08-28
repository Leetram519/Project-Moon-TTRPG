import { clampPoolValue } from "../pool-clamp.js";

export const NOUNS = {
  // Resources
  toolSlots: {
    kind: "resource",
    path: "system.attributes.toolSlots.value",
    modKey: "toolSlots",
    label: "PMTTRPG.ToolSlots",
    alwaysActive: true,
    ops: ["gain", "lose"],
    pathShorthand: "toolSlots",
  },
  narrativeSlots: {
    kind: "resource",
    path: "system.attributes.narrativeSlots.value",
    modKey: "narrativeSlots",
    label: "PMTTRPG.NarrativeSlots",
    alwaysActive: true,
    ops: ["gain", "lose"],
    pathShorthand: "narrativeSlots",
  },
  stockSlots: {
    kind: "resource",
    path: "system.attributes.stockSlots.value",
    modKey: "stockSlots",
    label: "PMTTRPG.StockSlots",
    alwaysActive: true,
    ops: ["gain", "lose"],
    pathShorthand: "stockSlots",
  },
  maxLight: {
    kind: "resource",
    path: "system.attributes.light.max",
    modKey: "lightBonus",
    label: "PMTTRPG.Light",
    alwaysActive: true,
    absoluteSet: true,
    overrideAttr: "light",
    ops: ["gain", "lose", "set"],
  },
  maxHp: {
    kind: "resource",
    path: "system.attributes.hp.maxMisc",
    modKey: "maxHp",
    label: "PMTTRPG.TrackerHP",
    alwaysActive: true,
    absoluteSet: true,
    overrideAttr: "hp",
    ops: ["gain", "lose", "set"],
  },
  maxSt: {
    kind: "resource",
    path: "system.attributes.st.maxMisc",
    modKey: "maxSt",
    label: "PMTTRPG.Stagger",
    alwaysActive: true,
    absoluteSet: true,
    overrideAttr: "st",
    ops: ["gain", "lose", "set"],
  },
  maxSp: {
    kind: "resource",
    path: "system.attributes.sp.maxMisc",
    modKey: "maxSp",
    label: "PMTTRPG.Mentality",
    alwaysActive: true,
    absoluteSet: true,
    overrideAttr: "sp",
    ops: ["gain", "lose", "set"],
  },
  tempHp: {
    kind: "resource",
    path: "system.attributes.hp.temp",
    alwaysActive: false,
    ops: ["gain", "lose", "set"],
    pathShorthand: true,
  },
  tempSt: {
    kind: "resource",
    path: "system.attributes.st.temp",
    alwaysActive: false,
    ops: ["gain", "lose", "set"],
    pathShorthand: true,
  },
  tempSp: {
    kind: "resource",
    path: "system.attributes.sp.temp",
    alwaysActive: false,
    ops: ["gain", "lose", "set"],
    pathShorthand: true,
  },
  action: {
    kind: "resource",
    path: "system.attributes.actions.value",
    alwaysActive: false,
    alwaysActivePath: "system.attributes.actions.maxMisc",
    alwaysActiveModKey: "actionsMaxMisc",
    ops: ["gain", "lose", "set"],
    pathShorthand: true,
    aliases: ["actions"],
  },
  reaction: {
    kind: "resource",
    path: "system.attributes.reactions.value",
    alwaysActive: false,
    alwaysActivePath: "system.attributes.reactions.maxMisc",
    alwaysActiveModKey: "reactionsMaxMisc",
    ops: ["gain", "lose", "set"],
    pathShorthand: true,
    aliases: ["reactions"],
  },
  movement: {
    kind: "resource",
    path: "system.attributes.squares.value",
    readPath: "system.attributes.squares.remaining",
    alwaysActive: false,
    alwaysActivePath: "system.attributes.squares.maxMisc",
    alwaysActiveModKey: "squaresMaxMisc",
    ops: ["gain", "lose", "set"],
    pathShorthand: true,
    aliases: ["square", "squares", "sqr", "sqrs"],
  },
  speed: {
    kind: "resource",
    path: "system.attributes.speed.bonus",
    modKey: "speed",
    label: "PMTTRPG.Speed",
    alwaysActive: true,
    ops: ["gain", "lose"],
    pathShorthand: "speedBonus",
  },

  // Combat
  attack: {
    kind: "combat",
    ops: ["power up", "power down", "dice max up", "dice max down"],
    powerField: "attackPower",
    maxField: "attackMax",
    pathShorthand: ["attributes", "attackModifier"],
  },
  block: {
    kind: "combat",
    ops: ["power up", "power down", "dice max up", "dice max down"],
    powerField: "blockPower",
    maxField: "blockMax",
    pathShorthand: ["attributes", "blockModifier"],
  },
  evade: {
    kind: "combat",
    ops: ["power up", "power down", "dice max up", "dice max down"],
    powerField: "evadePower",
    maxField: "evadeMax",
    pathShorthand: ["attributes", "evadeModifier"],
  },
  defense: {
    kind: "combat",
    ops: ["power up", "power down", "dice max up", "dice max down"],
    powerFields: ["blockPower", "evadePower"],
    maxFields: ["blockMax", "evadeMax"],
    aliases: ["defensive"],
  },
  damage: {
    kind: "combat",
    ops: ["power up", "power down", "dice max up", "dice max down", "deal"],
    powerField: "damagePower",
    maxField: "damageMax",
  },
  range: {
    kind: "combat",
    ops: ["range up", "range down"],
    powerField: "rangeBonus",
  },

  hp: {
    kind: "pool",
    ops: ["regen", "set"],
    regenField: "regenHP",
    pathShorthand: "hp",
  },
  st: {
    kind: "pool",
    ops: ["regen", "set"],
    regenField: "regenST",
    pathShorthand: "st",
    aliases: ["stagger"],
  },
  sp: {
    kind: "pool",
    ops: ["regen", "set"],
    regenPath: "system.attributes.sp.value",
    regenMaxPath: "system.attributes.sp.max",
    pathShorthand: "sp",
    aliases: ["sanity"],
  },
  light: {
    kind: "pool",
    ops: ["regen", "set"],
    regenPath: "system.attributes.light.value",
    regenMaxPath: "system.attributes.light.max",
    pathShorthand: "light",
  },

  // Paths
  rank: {
    kind: "path",
    pathShorthand: ["attributes", "rank"],
  },
};

const _byId = new Map();
const _byIdLower = new Map();
for (const [id, def] of Object.entries(NOUNS)) {
  const entry = { id, def };
  _byId.set(id, entry);
  _byIdLower.set(id.toLowerCase(), entry);
  for (const alias of def.aliases ?? []) {
    _byId.set(alias, entry);
    _byIdLower.set(alias.toLowerCase(), entry);
  }
}

export function lookupNoun(name) {
  if (!name) return null;
  return _byId.get(name) ?? _byIdLower.get(String(name).toLowerCase()) ?? null;
}

export function isResourceNoun(name) {
  const hit = lookupNoun(name);
  return !!hit && hit.def.kind === "resource";
}

export function isAlwaysActiveResource(name) {
  const hit = lookupNoun(name);
  return !!hit && hit.def.kind === "resource" && !!(hit.def.alwaysActive || hit.def.alwaysActivePath);
}

export function isRuntimeResource(name) {
  const hit = lookupNoun(name);
  return !!hit && hit.def.kind === "resource" && !hit.def.alwaysActive && !!hit.def.path;
}

function readActorSystemPath(actor, path) {
  const parts = String(path).replace(/^system\./, "").split(".");
  let value = actor.system;
  for (const part of parts) value = value?.[part];
  return Number(value) || 0;
}

export async function applyRuntimeResourceLocal(actor, nounId, { mode, amount } = {}) {
  const hit = lookupNoun(nounId);
  if (!hit || hit.def.kind !== "resource" || hit.def.alwaysActive || !hit.def.path) return false;

  const path = hit.def.path;
  const current = readActorSystemPath(actor, path);
  const n = Math.max(0, Math.round(Number(amount) || 0));
  let next = current;
  if (mode === "set") next = n;
  else if (mode === "add") next = current + n;
  else if (mode === "remove") next = current - n;
  else return false;

  next = Math.max(0, next);
  if (next !== current) await actor.update({ [path]: next });
  return true;
}

export async function applyRuntimeResource(actor, nounId, { mode, amount } = {}) {
  const { runAsOwnerOrGM } = await import("./gm-route.js");
  return runAsOwnerOrGM(actor, "applyRuntimeResource", { nounId, mode, amount });
}

export function nounAllowsOp(name, op) {
  const hit = lookupNoun(name);
  if (!hit) return false;
  return (hit.def.ops ?? []).includes(op);
}

export function isReservedNoun(name) {
  const hit = lookupNoun(name);
  return !!hit && (hit.def.ops ?? []).length > 0;
}

export function isBonusNoun(name) {
  return nounAllowsOp(name, "power up") || nounAllowsOp(name, "dice max up");
}

export function isRangeNoun(name) {
  return nounAllowsOp(name, "range up");
}

export function isRegenNoun(name) {
  return nounAllowsOp(name, "regen");
}

export function isApplyPoolNoun(name) {
  const hit = lookupNoun(name);
  return !!hit && hit.def.kind === "pool" && ["hp", "st", "sp", "light"].includes(hit.id);
}

export function resolveApplyPool(name) {
  const hit = lookupNoun(name);
  if (!hit || hit.def.kind !== "pool") return null;
  if (!["hp", "st", "sp", "light"].includes(hit.id)) return null;
  return hit.id;
}

export function getPowerFields(name) {
  const def = lookupNoun(name)?.def;
  if (!def) return [];
  if (Array.isArray(def.powerFields) && def.powerFields.length) return def.powerFields;
  return def.powerField ? [def.powerField] : [];
}

export function getPowerField(name) {
  return getPowerFields(name)[0] ?? null;
}

export function getMaxFields(name) {
  const def = lookupNoun(name)?.def;
  if (!def) return [];
  if (Array.isArray(def.maxFields) && def.maxFields.length) return def.maxFields;
  return def.maxField ? [def.maxField] : [];
}

export function getMaxField(name) {
  return getMaxFields(name)[0] ?? null;
}

export function getRegenField(name) {
  return lookupNoun(name)?.def.regenField ?? null;
}

export async function recoverPoolLocal(actor, name, amount) {
  const def = lookupNoun(name)?.def;
  if (!def?.regenPath || !def.regenMaxPath) return false;

  const read = path => {
    const parts = path.replace(/^system\./, "").split(".");
    let value = actor.system;
    for (const part of parts) value = value?.[part];
    return Number(value) || 0;
  };

  const current = read(def.regenPath);
  const max = read(def.regenMaxPath);
  const pool = resolveApplyPool(name);
  const next = clampPoolValue(pool ?? name, current + amount, max);
  if (next !== current) await actor.update({ [def.regenPath]: next });
  return true;
}

export async function recoverPool(actor, name, amount) {
  const { runAsOwnerOrGM } = await import("./gm-route.js");
  return runAsOwnerOrGM(actor, "recoverPool", { noun: name, amount });
}

export function resolvePathShorthand(actor, segment) {
  const hit = lookupNoun(segment);
  if (!hit?.def) return null;
  if (hit.def.pathShorthand === true && hit.def.path) {
    return readActorSystemPath(actor, hit.def.readPath ?? hit.def.path);
  }
  const sh = hit.def.pathShorthand;
  if (!sh) return null;
  if (sh === "speedBonus") return actor.system.attributes?.speed?.bonus ?? 0;
  if (typeof sh === "string") return actor.system.attributes?.[sh]?.value ?? 0;
  if (Array.isArray(sh) && sh.length === 2) {
    const [sec, key] = sh;
    return actor.system[sec]?.[key]?.value ?? 0;
  }
  return null;
}

export function emptyAlwaysActiveMods() {
  const mods = {
    attackPower: 0, blockPower: 0, evadePower: 0, damagePower: 0,
    attackMax:   0, blockMax:   0, evadeMax:   0, damageMax:   0,
    lightBonus:  0, rangeBonus: 0,
    overrides: {},
    overrideSources: {},
    resistanceOverrides: {},
    resistanceOverrideSources: {},
  };
  for (const def of Object.values(NOUNS)) {
    if (def.kind !== "resource") continue;
    if (!def.alwaysActive && !def.alwaysActivePath) continue;
    const key = def.alwaysActiveModKey ?? def.modKey ?? null;
    if (key && mods[key] === undefined) mods[key] = 0;
  }
  return mods;
}

export function applyResourceMod(mods, nounId, signedAmount) {
  const hit = lookupNoun(nounId);
  if (!hit || hit.def.kind !== "resource") return false;
  if (!hit.def.alwaysActive && !hit.def.alwaysActivePath) return false;
  const key = hit.def.alwaysActiveModKey ?? hit.def.modKey ?? hit.id;
  mods[key] = (mods[key] ?? 0) + signedAmount;
  return true;
}

export function applyResourceOverride(mods, nounId, value) {
  const hit = lookupNoun(nounId);
  if (!hit || hit.def.kind !== "resource") return false;
  if (!hit.def.alwaysActive || !hit.def.absoluteSet) return false;
  const key = hit.def.modKey ?? hit.id;
  if (!mods.overrides) mods.overrides = {};
  mods.overrides[key] = Math.max(0, Math.round(Number(value) || 0));
  return true;
}

export function applyResourceModsToSystem(systemData, eeMods) {
  for (const [id, def] of Object.entries(NOUNS)) {
    if (def.kind !== "resource") continue;
    const path = def.alwaysActivePath || (def.alwaysActive ? def.path : null);
    if (!path) continue;
    const amount = eeMods[def.alwaysActiveModKey ?? def.modKey ?? id] ?? 0;
    if (!amount) continue;
    const rel = path.replace(/^system\./, "");
    const parts = rel.split(".");
    let cur = systemData;
    for (let i = 0; i < parts.length - 1; i++) {
      cur = cur?.[parts[i]];
      if (cur == null) break;
    }
    const leaf = parts[parts.length - 1];
    if (cur && leaf in cur) cur[leaf] = (Number(cur[leaf]) || 0) + amount;
  }
}

export function applyResourceOverridesToSystem(systemData, eeMods) {
  const overrides = eeMods?.overrides;
  if (!overrides || typeof overrides !== "object") return;

  const sources = eeMods.overrideSources ?? {};

  for (const [id, def] of Object.entries(NOUNS)) {
    if (def.kind !== "resource" || !def.absoluteSet || !def.overrideAttr) continue;
    const key = def.modKey ?? id;
    if (!(key in overrides)) continue;

    const attr = systemData.attributes?.[def.overrideAttr];
    if (!attr) continue;

    const value = Math.max(0, Math.round(Number(overrides[key]) || 0));
    attr.max = value;
    attr.eeMaxOverridden = true;
    attr.eeMaxOverrideBy = formatOverrideSourceNames(sources[key]);
    // Clamping here persists after the override is removed.
    const cur = Number(attr.value) || 0;
    attr.value = clampPoolValue(def.overrideAttr, cur, value);
  }
}

export function formatOverrideSourceNames(names) {
  const list = (Array.isArray(names) ? names : [])
    .map((n) => String(n ?? "").trim())
    .filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}
