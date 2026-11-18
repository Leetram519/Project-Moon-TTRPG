/**
 * Environmental damage sources chat cards can declare. The key is what
 * EasyEffects matches on and the label is just for display.
 */

export const FALLING_DAMAGE_SOURCE = "Falling";
export const FORCE_COLLISION_DAMAGE_SOURCE = "Force Collision";

const LABEL_KEYS = {
  [FALLING_DAMAGE_SOURCE]: "PMTTRPG.DamageSource.Falling",
  [FORCE_COLLISION_DAMAGE_SOURCE]: "PMTTRPG.DamageSource.ForceCollision",
};

function isEnvironmentalDamageSource(source) {
  return typeof source === "string" && Object.hasOwn(LABEL_KEYS, source);
}

export function environmentalDamageLabel(source) {
  if (!isEnvironmentalDamageSource(source)) return null;
  return game.i18n.localize(LABEL_KEYS[source]);
}

/** The flag we write on a movement card (null for a key that isn't registered). */
export function damageSourceDeclaration(source) {
  if (!isEnvironmentalDamageSource(source)) return null;
  return { source, fromAttack: false, skipResistance: false };
}

export function readDeclaredDamageSource(flags) {
  const declared = flags?.projectmoonttrpg?.damageSource;
  if (!declared || typeof declared !== "object") return null;
  if (!isEnvironmentalDamageSource(declared.source)) return null;
  if (declared.fromAttack != null && declared.fromAttack !== false) return null;
  if (declared.skipResistance != null && declared.skipResistance !== false) return null;
  return { source: declared.source, fromAttack: false, skipResistance: false };
}

/**
 * Without a pin a chat damage strip applies to the selected tokens, and a pin that
 * doesn't resolve to an Actor applies to nobody. A registered environmental source
 * isn't an Attack, so the speaker doesn't get copied in as the attacker.
 */

export function buildChatDamageOptions({
  op,
  pools,
  damageType,
  attacker = null,
  speakerAlias = null,
  flags = null,
} = {}) {
  const list = Array.isArray(pools) ? pools : [pools ?? "hp"];
  const pool = list.length === 1 ? list[0] : list;
  const declared = op === "heal" ? null : readDeclaredDamageSource(flags);
  if (declared) {
    return {
      pool,
      op,
      damageType,
      attacker: null,
      source: declared.source,
      sourceLabel: environmentalDamageLabel(declared.source),
      fromAttack: false,
      skipResistance: false,
    };
  }
  return {
    pool,
    op,
    damageType,
    attacker: op === "heal" ? null : attacker,
    healer: op === "heal" ? attacker : undefined,
    sourceLabel: speakerAlias ?? attacker?.name ?? null,
    fromAttack: op !== "heal",
  };
}

export async function dispatchChatDamage({
  pin,
  controlled = [],
  fromUuid,
  amount,
  options,
  applyDirect,
  route,
  warn,
} = {}) {
  if (pin === undefined) {
    for (const actor of controlled) await applyDirect(actor, amount, options);
    return { mode: "selection", applied: controlled.length };
  }

  const uuid = String(pin ?? "").trim();
  if (!uuid) {
    warn();
    return { mode: "pinned", applied: 0, reason: "empty" };
  }

  let doc = null;
  try {
    doc = await fromUuid(uuid);
  } catch {
    doc = null;
  }
  if (!doc || doc.documentName !== "Actor") {
    warn();
    return { mode: "pinned", applied: 0, reason: "unresolved" };
  }

  await route(doc, amount, options);
  return { mode: "pinned", applied: 1, actor: doc };
}
