import { canUserUpdateDocument } from "../acting-user.js";
import { flagKeyDeletion } from "../action-economy/combat-flags.js";

const EE_FLAG_SCOPE = "projectmoonttrpg";
const EE_FLAG_BLOB = "eeMeta";
const APPROVED_EE_META_HOSTS = new Set(["Actor", "Item", "Combat", "Combatant"]);

/*
 * Foundry treats dots in update paths as nesting. Author-defined keys are
 * stored as UTF-8 hex so they remain safe inside `doc.update` paths.
 */
export function encodeFlagKey(key) {
  const bytes = new TextEncoder().encode(String(key ?? ""));
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `h${hex}`;
}

/* Throws if the value is not one of our encoded keys. */
export function decodeFlagKey(encoded) {
  const raw = String(encoded ?? "");
  if (!raw.startsWith("h") || raw.length % 2 !== 1) {
    throw new Error(`[EasyEffects] Invalid encoded flag key '${raw}'`);
  }
  const hex = raw.slice(1);
  if (!/^[0-9a-f]*$/.test(hex)) {
    throw new Error(`[EasyEffects] Invalid encoded flag key '${raw}'`);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

// Keep finite numbers as-is. Flags are not limited to integers.
export function isValidFlagValue(value) {
  if (typeof value === "boolean" || typeof value === "string") return true;
  return typeof value === "number" && Number.isFinite(value);
}

export function isApprovedEEMetaHost(doc) {
  return APPROVED_EE_META_HOSTS.has(doc?.documentName);
}

/*
 * Combat metadata is GM-only. Other supported documents follow their normal
 * ownership rules, including embedded Items whose owning Actor is writable.
 */
export function canMutateEEMetaHost(doc) {
  if (!doc || !isApprovedEEMetaHost(doc)) return false;
  if (globalThis.game?.user?.isGM) return true;
  if (doc.documentName === "Actor") return canUserUpdateDocument(doc);
  if (doc.documentName === "Item") return !!(canUserUpdateDocument(doc) || canUserUpdateDocument(doc.actor));
  if (doc.documentName === "Combatant") return !!doc.isOwner;
  return false;
}

/*
 * Event flags and staged persistent writes live for one logical emission.
 * Every script participating in that emission shares this state.
 */
export function createEEEmission() {
  return {
    event: { flags: Object.create(null) },
    overlay: new Map(),
  };
}

export function attachEmitState(context, emission) {
  if (!context || !emission) return context;
  context.event = emission.event;
  context._eeEmission = emission;
  return context;
}

/*
 * Persistent changes flush when the logical emission ends, even if execution
 * exits through an exception.
 */
export async function runLogicalEmission(fn) {
  const emission = createEEEmission();
  try {
    return await fn(emission);
  } finally {
    await flushEEEmission(emission);
  }
}

function overlayRow(emission, doc) {
  const uuid = String(doc?.uuid ?? "").trim();
  if (!emission || !doc || !uuid) return null;

  let row = emission.overlay.get(uuid);
  if (!row) {
    row = { doc, set: Object.create(null), unset: new Set() };
    emission.overlay.set(uuid, row);
  } else {
    row.doc = doc;
  }

  return row;
}

// Missing event flags stay `undefined` and we let the DSL decide whether to substitute 0.
export function getEventFlag(emission, key) {
  const flags = emission?.event?.flags;
  if (!flags || !Object.prototype.hasOwnProperty.call(flags, key)) return undefined;
  return flags[key];
}

export function setEventFlag(emission, key, value) {
  if (!emission?.event?.flags) return false;
  if (!isValidFlagValue(value)) return false;
  emission.event.flags[key] = value;
  return true;
}

export function clearEventFlag(emission, key) {
  if (!emission?.event?.flags) return false;
  delete emission.event.flags[key];
  return true;
}

function storedFlagMap(doc) {
  return doc?.flags?.[EE_FLAG_SCOPE]?.[EE_FLAG_BLOB]?.flags ?? {};
}

/**
 * Persisted EE flags only.
 */
export function listPersistentFlags(doc) {
  const stored = storedFlagMap(doc);
  const rows = [];

  for (const [encoded, value] of Object.entries(stored)) {
    let key;
    try {
      key = decodeFlagKey(encoded);
    } catch (err) {
      console.warn(`[EasyEffects] Skipped invalid encoded flag key '${encoded}'`, err);
      continue;
    }

    if (!isValidFlagValue(value)) {
      console.warn(`[EasyEffects] Skipped invalid flag value for '${key}'`);
      continue;
    }

    rows.push({ key, value });
  }

  rows.sort((a, b) => a.key.localeCompare(b.key));
  return rows;
}

/*
 * The emission overlay wins over persisted metadata. That makes staged writes
 * visible immediately and staged clears behave as missing before Foundry is
 * updated. A stored value of `0` is still present.
 */
export function getPersistentFlag(emission, doc, key) {
  const uuid = String(doc?.uuid ?? "").trim();
  const row = uuid && emission ? emission.overlay.get(uuid) : null;

  if (row) {
    if (row.unset.has(key)) return undefined;
    if (Object.prototype.hasOwnProperty.call(row.set, key)) return row.set[key];
  }

  if (!doc) return undefined;

  const encoded = encodeFlagKey(key);
  const stored = storedFlagMap(doc);

  if (!Object.prototype.hasOwnProperty.call(stored, encoded)) return undefined;
  return stored[encoded];
}

export function hasPersistentFlag(emission, doc, key) {
  return getPersistentFlag(emission, doc, key) !== undefined;
}

// Stage the value now so later scripts can see it before the document flush.
export function stagePersistentFlag(emission, doc, key, value) {
  if (!isValidFlagValue(value)) return false;

  const row = overlayRow(emission, doc);
  if (!row) return false;

  row.unset.delete(key);
  row.set[key] = value;
  return true;
}

// A staged clear hides both staged and persisted values until flush.
export function stageClearPersistentFlag(emission, doc, key) {
  const row = overlayRow(emission, doc);
  if (!row) return false;

  delete row.set[key];
  row.unset.add(key);
  return true;
}

/*
 * Clear the overlay before applying patches so nested execution cannot flush
 * the same staged rows twice.
 */
export async function flushEEEmission(emission) {
  if (!emission?.overlay?.size) return;

  const rows = [...emission.overlay.values()];
  emission.overlay.clear();

  const { runEEMetaPatch } = await import("./gm-route.js");

  for (const row of rows) {
    const set = { ...row.set };
    const unset = [...row.unset];

    if (!row.doc || (!Object.keys(set).length && !unset.length)) continue;
    await runEEMetaPatch(row.doc, { set, unset });
  }
}

export function eeMetaUpdatePath(encodedKey) {
  return `flags.${EE_FLAG_SCOPE}.${EE_FLAG_BLOB}.flags.${encodedKey}`;
}

/*
 * Applies an EE metadata patch directly to the document. This is the low-level
 * write path and does not perform permission checks or GM routing.
 *
 * Updates are sent as per-key diffs so the surrounding metadata blob is left
 * intact.
 */
export async function applyEEMetaPatch(doc, { set = {}, unset = [] } = {}) {
  if (!isApprovedEEMetaHost(doc)) {
    console.warn(
      `[EasyEffects] patchEEMeta rejected document type '${doc?.documentName ?? "unknown"}'`
    );
    return false;
  }

  const updates = {};

  for (const [key, value] of Object.entries(set ?? {})) {
    if (!isValidFlagValue(value)) {
      console.warn(`[EasyEffects] Ignored invalid flag value for '${key}'`);
      continue;
    }

    updates[eeMetaUpdatePath(encodeFlagKey(key))] = value;
  }

  for (const key of unset ?? []) {
    Object.assign(updates, flagKeyDeletion(eeMetaUpdatePath(encodeFlagKey(key))));
  }

  if (!Object.keys(updates).length) return true;

  await doc.update(updates);
  return true;
}