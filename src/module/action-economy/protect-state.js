/**
 * Protect state on one exact Combatant. Stays until that Combatant's
 * next actual Turn Start.
 */

import { isNextTurnStarted } from "../combat/turn-stamps.js";
import { optionalString } from "../shared-helpers.js";

const warned = new Set();

export function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[PMTTRPG] ${message}`);
}

export function makeProtectState({ combat, combatant, declarationId, afterStarted } = {}) {
  const combatId = optionalString(combat?.id);
  const combatantId = optionalString(combatant?.id);
  const declaration = optionalString(declarationId);
  const started = Number(afterStarted);
  if (!combatId || !combatantId || !declaration || !Number.isInteger(started) || started < 0) return null;
  return {
    version: 1,
    combatId,
    combatantId,
    declarationId: declaration,
    afterStarted: started,
    boundary: "nextTurnStart",
  };
}

export function normalizeProtectState(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (raw.version !== 1) return null;
  const combatId = optionalString(raw.combatId);
  const combatantId = optionalString(raw.combatantId);
  const declarationId = optionalString(raw.declarationId);
  const afterStarted = Number(raw.afterStarted);
  if (!combatId || !combatantId || !declarationId || !Number.isInteger(afterStarted) || afterStarted < 0) return null;
  if (raw.boundary !== "nextTurnStart") {
    warnOnce(`boundary:${raw.boundary}`, `Ignored Protect boundary '${raw.boundary}'`);
    return null;
  }
  return {
    version: 1,
    combatId,
    combatantId,
    declarationId,
    afterStarted,
    boundary: "nextTurnStart",
  };
}

export function isProtectStateLive(state, { combatant, combat } = {}) {
  const normalized = normalizeProtectState(state);
  if (!normalized || !combatant || !combat) return false;
  if (String(normalized.combatId) !== String(combat.id)) return false;
  if (String(normalized.combatantId) !== String(combatant.id)) return false;
  return !isNextTurnStarted(
    { combatantId: normalized.combatantId, afterStarted: normalized.afterStarted },
    combat,
  );
}
