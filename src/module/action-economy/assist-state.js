/**
 * Each entry in a Combatant's Assist list is one Assist, good for one Advantage a roll they pick.
 */

import { createKeyedQueue } from "../keyed-queue.js";
import { turnsOf } from "../combat/combatant-match.js";
import { documentId, trimmedString } from "../shared-helpers.js";

const ASSIST_STATE_KEY = "assists";
export const ASSIST_STATE_PATH = `flags.projectmoonttrpg.actionState.${ASSIST_STATE_KEY}`;

const ASSIST_REASONS = {
  DUPLICATE: "duplicate",
  NOT_FOUND: "not-found",
  EXPIRED: "expired",
  INVALID_ENTRY: "invalid-entry",
};

function integerOrNull(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function normalizeAssistEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = trimmedString(raw.id);
  const combatId = trimmedString(raw.combatId);
  const expiresRound = integerOrNull(raw.expiresRound);
  if (!id || !combatId || expiresRound == null) return null;
  const createdRound = integerOrNull(raw.createdRound) ?? expiresRound;
  return {
    id,
    combatId,
    sourceCombatantId: trimmedString(raw.sourceCombatantId),
    sourceTokenId: trimmedString(raw.sourceTokenId),
    sourceActorId: trimmedString(raw.sourceActorId),
    createdRound,
    expiresRound,
  };
}

function normalizeAssistEntries(rawList) {
  if (!Array.isArray(rawList)) return [];
  const seen = new Set();
  const entries = [];
  for (const raw of rawList) {
    const entry = normalizeAssistEntry(raw);
    if (!entry) {
      if (raw != null) console.warn("[PMTTRPG] dropped malformed Assist entry", raw);
      continue;
    }
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  return entries;
}

export function rawAssistEntries(combatant) {
  return combatant?.flags?.projectmoonttrpg?.actionState?.[ASSIST_STATE_KEY] ?? [];
}

function readAssistEntries(combatant) {
  return normalizeAssistEntries(rawAssistEntries(combatant));
}

function turnIndexOf(combat, combatant) {
  const id = documentId(combatant);
  if (id == null) return -1;
  return turnsOf(combat).findIndex((entry) => documentId(entry) === id);
}

function combatContains(combat, combatant) {
  const id = documentId(combatant);
  if (id == null || !combat) return false;
  return combat.combatants.has(id);
}

/**
 * The round where the recipient's next turn ends. That's this round if they still
 * act later this round, otherwise it's the next one.
 */
function computeAssistExpiryRound(combat, targetCombatant) {
  const round = Number(combat?.round) || 0;
  const currentIndex = Number(combat?.turn);
  const targetIndex = turnIndexOf(combat, targetCombatant);
  if (targetIndex < 0 || !Number.isInteger(currentIndex)) return round + 1;
  return targetIndex > currentIndex ? round : round + 1;
}

// only the recipient has to stay in the combat (the assister can leave)
function isAssistEntryValid(entry, { targetCombatant, combat } = {}) {
  if (!entry || !combat || combat.started !== true) return false;
  if (String(entry.combatId) !== String(combat.id)) return false;
  if (!combatContains(combat, targetCombatant)) return false;

  const round = Number(combat.round) || 0;
  if (round < entry.expiresRound) return true;
  if (round > entry.expiresRound) return false;

  const targetIndex = turnIndexOf(combat, targetCombatant);
  const currentIndex = Number(combat.turn);
  if (targetIndex < 0 || !Number.isInteger(currentIndex)) return true;
  return targetIndex >= currentIndex;
}

export function listValidAssistEntries(combatant, { combat } = {}) {
  if (!combatant || !combat) return [];
  return readAssistEntries(combatant).filter((entry) => isAssistEntryValid(entry, { targetCombatant: combatant, combat }));
}

export function makeAssistEntry({ id, combat, source = {}, targetCombatant } = {}) {
  const entryId = trimmedString(id);
  const combatId = documentId(combat);
  if (!entryId || !combatId) return null;
  const round = Number(combat?.round) || 0;
  return {
    id: entryId,
    combatId,
    sourceCombatantId: documentId(source.combatant) ?? trimmedString(source.combatantId),
    sourceTokenId: trimmedString(source.tokenId) ?? documentId(source.token),
    sourceActorId: trimmedString(source.actorId) ?? documentId(source.actor),
    createdRound: round,
    expiresRound: computeAssistExpiryRound(combat, targetCombatant),
  };
}

function pruneList(entries, { combat, targetCombatant }) {
  if (!combat) return entries;
  return entries.filter((entry) => isAssistEntryValid(entry, { targetCombatant, combat }));
}

export function appendAssistEntry(rawList, rawEntry, { combat = null, targetCombatant = null } = {}) {
  const entry = normalizeAssistEntry(rawEntry);
  if (!entry) return { ok: false, reason: ASSIST_REASONS.INVALID_ENTRY, entries: normalizeAssistEntries(rawList) };
  const current = normalizeAssistEntries(rawList);
  if (current.some((existing) => existing.id === entry.id)) {
    return { ok: false, reason: ASSIST_REASONS.DUPLICATE, entries: current };
  }
  const kept = pruneList(current, { combat, targetCombatant });
  return { ok: true, reason: null, entries: [...kept, entry], entry };
}

export function consumeAssistEntry(rawList, entryId, { combat = null, targetCombatant = null } = {}) {
  const current = normalizeAssistEntries(rawList);
  const id = trimmedString(entryId);
  const found = id ? current.find((entry) => entry.id === id) : null;
  if (!found) return { ok: false, reason: ASSIST_REASONS.NOT_FOUND, entries: current, consumed: null };
  if (combat && !isAssistEntryValid(found, { targetCombatant, combat })) {
    return { ok: false, reason: ASSIST_REASONS.EXPIRED, entries: current, consumed: null };
  }
  const remaining = pruneList(current.filter((entry) => entry.id !== id), { combat, targetCombatant });
  return { ok: true, reason: null, entries: remaining, consumed: found };
}

/**
 * When the recipient Delays their offered turn into the next round, valid entries
 * that expire on the offered round get pushed back one round.
 */
export function deferAssistEntries(rawList, { offeredRound, combat = null, targetCombatant = null } = {}) {
  const current = normalizeAssistEntries(rawList);
  const round = integerOrNull(offeredRound);
  if (round == null || !combat) return { entries: current, moved: 0 };
  let moved = 0;
  const entries = current.map((entry) => {
    if (entry.expiresRound !== round) return entry;
    if (!isAssistEntryValid(entry, { targetCombatant, combat })) return entry;
    moved += 1;
    return { ...entry, expiresRound: round + 1 };
  });
  return { entries, moved };
}

export function pruneAssistEntries(rawList, { combat = null, targetCombatant = null } = {}) {
  const current = normalizeAssistEntries(rawList);
  const entries = pruneList(current, { combat, targetCombatant });
  return { entries, removed: current.length - entries.length };
}

export function resolveAssistSourceName(entry, { combat } = {}) {
  const id = entry?.sourceCombatantId;
  if (!id) return null;
  const source = combat?.combatants.get(id);
  if (!source) return null;
  return trimmedString(source.name);
}

export function buildAssistChoiceOptions(entries, { combat } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return [];
  const options = [{ value: "", label: game.i18n.localize("PMTTRPG.Assist.ChoiceNone"), selected: true }];
  for (const entry of list) {
    const name = resolveAssistSourceName(entry, { combat });
    options.push({
      value: entry.id,
      label: name ?? game.i18n.localize("PMTTRPG.Assist.UnknownSource"),
      sourceCombatantId: entry.sourceCombatantId,
      selected: false,
    });
  }
  return options;
}

const assistMutations = createKeyedQueue();

export function withCombatantAssistMutation(key, task) {
  return assistMutations.run(trimmedString(key), task);
}
