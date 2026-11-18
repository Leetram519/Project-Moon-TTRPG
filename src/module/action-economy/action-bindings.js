/**
 * Target bindings stored on a source document (usually an owned Item). The source
 * gives N slots in a namespace and each slot holds one target. They live on the
 * source itself so deleting it deletes its bindings and nothing ends up on the Actor.
 */

import { createKeyedQueue } from "../keyed-queue.js";
import { optionalString as text } from "../shared-helpers.js";

const SCOPE = "projectmoonttrpg";

const ACTION_BINDINGS_KEY = "actionBindings";
export const ACTION_BINDINGS_PATH = `flags.${SCOPE}.${ACTION_BINDINGS_KEY}`;

function normalizeCapacity(capacity) {
  const n = Number(capacity);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function normalizeRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const namespace = text(raw.namespace);
  const slotId = text(raw.slotId);
  const targetUuid = text(raw.targetUuid);
  if (!namespace || slotId == null || !targetUuid) return null;
  return { namespace, slotId, targetUuid, combatId: text(raw.combatId) };
}

// only well-formed binding records get through so a pesky routed item update can't use this flag as a general write
export function bindingListForStorage(value) {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const raw of value) {
    const record = normalizeRecord(raw);
    if (record) out.push(record);
  }
  return out;
}

function readSourceBindings(source) {
  const raw = source?.flags?.[SCOPE]?.[ACTION_BINDINGS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeRecord).filter(Boolean);
}

function bindingSlotIds(capacity) {
  const n = normalizeCapacity(capacity) ?? 0;
  return Array.from({ length: n }, (_, index) => String(index));
}

function isBindingActive(record, { combat = null } = {}) {
  if (!record) return false;
  if (record.combatId == null) return true;
  const combatId = text(combat?.id);
  return combatId != null && combatId === record.combatId;
}

const warnedExcess = new Set();

function withinCapacity(record, capacity) {
  if (capacity == null) return true;
  const index = Number(record.slotId);
  return Number.isInteger(index) && index >= 0 && index < capacity;
}

export function listSourceBindings(source, namespace, { capacity, combat = null, includeInactive = false } = {}) {
  const ns = text(namespace);
  if (!source || !ns) return [];
  const cap = capacity === undefined ? null : normalizeCapacity(capacity);
  const out = [];
  for (const record of readSourceBindings(source)) {
    if (record.namespace !== ns) continue;
    if (!withinCapacity(record, cap)) {
      const key = `${source.uuid ?? source.id}|${ns}|${record.slotId}`;
      if (!warnedExcess.has(key)) {
        warnedExcess.add(key);
        console.warn("[PMTTRPG] ignoring action binding slot beyond capacity", { source: source.uuid ?? source.id, namespace: ns, slotId: record.slotId, capacity: cap });
      }
      continue;
    }
    if (!includeInactive && !isBindingActive(record, { combat })) continue;
    out.push(record);
  }
  return out;
}

export function listAvailableBindingSlots(source, namespace, capacity, { combat = null } = {}) {
  const taken = new Set(listSourceBindings(source, namespace, { capacity, combat }).map((record) => record.slotId));
  return bindingSlotIds(capacity).filter((slotId) => !taken.has(slotId));
}

export function findBindingForTarget({ sources = [], namespace, targetUuid, combat = null } = {}) {
  const uuid = text(targetUuid);
  if (!uuid) return [];
  const out = [];
  for (const source of sources ?? []) {
    for (const record of listSourceBindings(source, namespace, { combat })) {
      if (record.targetUuid === uuid) out.push({ source, ...record });
    }
  }
  return out;
}

const sourceWrites = createKeyedQueue();

function withSourceLock(source, task) {
  return sourceWrites.run(text(source?.uuid ?? source?.id), task);
}

async function writeSourceBindings(source, records) {
  const update = { [ACTION_BINDINGS_PATH]: records };
  const parent = source?.parent ?? null;
  if (source?.documentName === "Item" && parent?.documentName === "Actor") {
    const { applyDeclaredOwnedItemUpdate } = await import("./declare.js");
    return applyDeclaredOwnedItemUpdate(parent, source, update);
  }
  return source.update(update);
}

export async function bindSourceSlot({ source, namespace, slotId, targetUuid, combatId = null, capacity } = {}) {
  const ns = text(namespace);
  const slot = text(slotId);
  const target = text(targetUuid);
  if (!source || !ns || slot == null || !target) return { ok: false, reason: "invalid-binding" };
  if (capacity !== undefined && !bindingSlotIds(capacity).includes(slot)) {
    return { ok: false, reason: "slot-out-of-range" };
  }
  return withSourceLock(source, async () => {
    const record = { namespace: ns, slotId: slot, targetUuid: target, combatId: text(combatId) };
    const next = readSourceBindings(source).filter((entry) => !(entry.namespace === ns && entry.slotId === slot));
    next.push(record);
    try {
      // false means the route dropped the update and null means no GM answered (undefined is fine)
      const wrote = await writeSourceBindings(source, next);
      if (wrote === false || wrote === null) return { ok: false, reason: "write-failed" };
    } catch (error) {
      console.warn("[PMTTRPG] action binding failed", error);
      return { ok: false, reason: "write-failed" };
    }
    return { ok: true, binding: record };
  });
}

export async function unbindSourceSlot({ source, namespace, slotId } = {}) {
  const ns = text(namespace);
  const slot = text(slotId);
  if (!source || !ns || slot == null) return { ok: false, reason: "invalid-binding" };
  return withSourceLock(source, async () => {
    const current = readSourceBindings(source);
    const next = current.filter((entry) => !(entry.namespace === ns && entry.slotId === slot));
    if (next.length === current.length) return { ok: true, changed: false };
    try {
      const wrote = await writeSourceBindings(source, next);
      if (wrote === false || wrote === null) return { ok: false, reason: "write-failed" };
    } catch (error) {
      console.warn("[PMTTRPG] action unbinding failed", error);
      return { ok: false, reason: "write-failed" };
    }
    return { ok: true, changed: true };
  });
}
