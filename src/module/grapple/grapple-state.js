/**
 * Grapple state is one Combat flag that only the primary GM writes. A target can only
 * have one relationship but a Grappler can hold several.
 */

import { isFutureTurnObligationSatisfied } from "../combat/turn-stamps.js";
import { optionalString } from "../shared-helpers.js";

const SCOPE = "projectmoonttrpg";
const GRAPPLE_STATE_KEY = "grappleState";
export const GRAPPLE_STATE_PATH = `flags.${SCOPE}.${GRAPPLE_STATE_KEY}`;
const GRAPPLE_STATE_VERSION = 1;

export const GRAPPLE_IMMUNITY_REASONS = {
  BREAK_FREE: "breakFree",
  THROW: "throw",
};

const ATTEMPT_MEMORY = 20;

function normalizeTurn(raw) {
  if (!raw || typeof raw !== "object") return null;
  const combatantId = optionalString(raw.combatantId);
  if (!combatantId || !Number.isInteger(raw.started)) return null;
  return { combatantId, started: raw.started, round: Number.isInteger(raw.round) ? raw.round : null };
}

function normalizeRelationship(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = optionalString(raw.id);
  const grapplerCombatantId = optionalString(raw.grapplerCombatantId);
  const targetCombatantId = optionalString(raw.targetCombatantId);
  if (!id || !grapplerCombatantId || !targetCombatantId || grapplerCombatantId === targetCombatantId) return null;
  const freeThrow = raw.freeThrow && typeof raw.freeThrow === "object" && Number.isInteger(raw.freeThrow.started)
    ? { started: raw.freeThrow.started, round: Number.isInteger(raw.freeThrow.round) ? raw.freeThrow.round : null }
    : null;
  return {
    id,
    grapplerCombatantId,
    targetCombatantId,
    grapplerTokenId: optionalString(raw.grapplerTokenId),
    targetTokenId: optionalString(raw.targetTokenId),
    createdDeclarationId: optionalString(raw.createdDeclarationId),
    createdTurn: normalizeTurn(raw.createdTurn),
    failureBonus: Number.isInteger(raw.failureBonus) && raw.failureBonus > 0 ? raw.failureBonus : 0,
    appliedAttemptIds: Array.isArray(raw.appliedAttemptIds)
      ? raw.appliedAttemptIds.map(optionalString).filter(Boolean).slice(-ATTEMPT_MEMORY)
      : [],
    freeThrow,
  };
}

function normalizeImmunity(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = optionalString(raw.id);
  const targetCombatantId = optionalString(raw.targetCombatantId);
  if (!id || !targetCombatantId) return null;
  const obligations = (Array.isArray(raw.obligations) ? raw.obligations : [])
    .map((entry) => {
      const combatantId = optionalString(entry?.combatantId);
      return combatantId && Number.isInteger(entry.afterStarted) ? { combatantId, afterStarted: entry.afterStarted } : null;
    })
    .filter(Boolean);
  if (!obligations.length) return null;
  return {
    id,
    targetCombatantId,
    reason: Object.values(GRAPPLE_IMMUNITY_REASONS).includes(raw.reason) ? raw.reason : GRAPPLE_IMMUNITY_REASONS.BREAK_FREE,
    sourceRelationshipId: optionalString(raw.sourceRelationshipId),
    obligations,
  };
}

/** Drops malformed entries, repeated ids and any second relationship on the same target (the first one wins). */
function normalizeGrappleState(raw) {
  const relationships = [];
  const immunities = [];
  const ids = new Set();
  const targets = new Set();
  for (const entry of Array.isArray(raw?.relationships) ? raw.relationships : []) {
    const relationship = normalizeRelationship(entry);
    if (!relationship || ids.has(relationship.id) || targets.has(relationship.targetCombatantId)) continue;
    ids.add(relationship.id);
    targets.add(relationship.targetCombatantId);
    relationships.push(relationship);
  }
  for (const entry of Array.isArray(raw?.immunities) ? raw.immunities : []) {
    const immunity = normalizeImmunity(entry);
    if (!immunity || ids.has(immunity.id)) continue;
    ids.add(immunity.id);
    immunities.push(immunity);
  }
  return { version: GRAPPLE_STATE_VERSION, relationships, immunities };
}

export function readGrappleState(combat) {
  return normalizeGrappleState(combat?.flags?.[SCOPE]?.[GRAPPLE_STATE_KEY]);
}

function hasCombatant(combat, id) {
  return combat.combatants.has(id);
}

function isLive(relationship, combat) {
  return hasCombatant(combat, relationship.grapplerCombatantId) && hasCombatant(combat, relationship.targetCombatantId);
}

/** Only live relationships (both Combatants are still in the combat). */
export function listGrappleRelationships(combat, { grapplerCombatantId = null, targetCombatantId = null } = {}) {
  return readGrappleState(combat).relationships.filter((relationship) => {
    if (!isLive(relationship, combat)) return false;
    if (grapplerCombatantId && relationship.grapplerCombatantId !== String(grapplerCombatantId)) return false;
    if (targetCombatantId && relationship.targetCombatantId !== String(targetCombatantId)) return false;
    return true;
  });
}

export function findRelationshipForTarget(combat, targetCombatantId) {
  return listGrappleRelationships(combat, { targetCombatantId })[0] ?? null;
}

export function relationshipsForGrappler(combat, grapplerCombatantId) {
  return listGrappleRelationships(combat, { grapplerCombatantId });
}

function isImmunityLive(immunity, combat) {
  if (!immunity || !hasCombatant(combat, immunity.targetCombatantId)) return false;
  return immunity.obligations.some((obligation) => !isFutureTurnObligationSatisfied(obligation, combat));
}

export function activeImmunitiesFor(combat, targetCombatantId) {
  if (!targetCombatantId) return [];
  return readGrappleState(combat).immunities
    .filter((immunity) => immunity.targetCombatantId === String(targetCombatantId) && isImmunityLive(immunity, combat));
}

export function isGrappleImmune(combat, targetCombatantId) {
  return activeImmunitiesFor(combat, targetCombatantId).length > 0;
}

function reject(reason, state) {
  return { ok: false, reason, state, changed: false };
}

function clone(state) {
  return JSON.parse(JSON.stringify(normalizeGrappleState(state)));
}

export function applyCreateRelationship(state, input = {}, { combat = null } = {}) {
  const next = clone(state);
  const grapplerCombatantId = optionalString(input.grapplerCombatantId);
  const targetCombatantId = optionalString(input.targetCombatantId);
  if (!grapplerCombatantId || !targetCombatantId) return reject("invalid-input", next);
  if (grapplerCombatantId === targetCombatantId) return reject("self-target", next);
  if (combat && (!hasCombatant(combat, grapplerCombatantId) || !hasCombatant(combat, targetCombatantId))) {
    return reject("combatant-missing", next);
  }
  const occupied = next.relationships.some((relationship) => relationship.targetCombatantId === targetCombatantId
    && (!combat || isLive(relationship, combat)));
  if (occupied) return reject("target-grappled", next);
  if (combat && next.immunities.some((immunity) => immunity.targetCombatantId === targetCombatantId && isImmunityLive(immunity, combat))) {
    return reject("target-immune", next);
  }

  next.relationships = next.relationships.filter((relationship) => relationship.targetCombatantId !== targetCombatantId);
  const relationship = normalizeRelationship({
    id: optionalString(input.id) ?? foundry.utils.randomID(),
    grapplerCombatantId,
    targetCombatantId,
    grapplerTokenId: input.grapplerTokenId,
    targetTokenId: input.targetTokenId,
    createdDeclarationId: input.createdDeclarationId,
    createdTurn: input.createdTurn,
    failureBonus: 0,
    freeThrow: input.freeThrow ?? null,
  });
  next.relationships.push(relationship);
  return { ok: true, state: next, changed: true, relationship };
}

export function applyEndRelationship(state, relationshipId) {
  const next = clone(state);
  const before = next.relationships.length;
  next.relationships = next.relationships.filter((relationship) => relationship.id !== String(relationshipId));
  if (next.relationships.length === before) return reject("not-found", next);
  return { ok: true, state: next, changed: true };
}

/** Only counts each attempt id once */
export function applyIncrementFailureBonus(state, relationshipId, attemptId) {
  const next = clone(state);
  const relationship = next.relationships.find((entry) => entry.id === String(relationshipId));
  if (!relationship) return reject("not-found", next);
  const attempt = optionalString(attemptId);
  if (attempt && relationship.appliedAttemptIds.includes(attempt)) return { ok: true, state: next, changed: false, relationship };
  relationship.failureBonus += 1;
  if (attempt) relationship.appliedAttemptIds = [...relationship.appliedAttemptIds, attempt].slice(-ATTEMPT_MEMORY);
  return { ok: true, state: next, changed: true, relationship };
}

export function applyClearFreeThrow(state, grapplerCombatantId) {
  const next = clone(state);
  let changed = false;
  for (const relationship of next.relationships) {
    if (relationship.grapplerCombatantId !== String(grapplerCombatantId) || !relationship.freeThrow) continue;
    relationship.freeThrow = null;
    changed = true;
  }
  return { ok: true, state: next, changed };
}

function endWithImmunity(state, relationshipId, immunity) {
  const next = clone(state);
  const relationship = next.relationships.find((entry) => entry.id === String(relationshipId));
  if (!relationship) return reject("not-found", next);
  next.relationships = next.relationships.filter((entry) => entry.id !== relationship.id);
  const normalized = normalizeImmunity({
    id: optionalString(immunity?.id) ?? foundry.utils.randomID(),
    targetCombatantId: relationship.targetCombatantId,
    reason: immunity?.reason,
    sourceRelationshipId: relationship.id,
    obligations: immunity?.obligations,
  });
  if (normalized) next.immunities.push(normalized);
  return { ok: true, state: next, changed: true, relationship, immunity: normalized };
}

/** The authority hands us an obligation that keeps the target immune until its next turn ends. */
export function applyCompleteBreakFree(state, relationshipId, { obligations } = {}) {
  return endWithImmunity(state, relationshipId, { reason: GRAPPLE_IMMUNITY_REASONS.BREAK_FREE, obligations });
}

/**
 * Like Break Free, but the target stays immune until both its next turn and
 * the Grappler's next turn end.
 */
export function applyCompleteThrow(state, relationshipId, { obligations } = {}) {
  return endWithImmunity(state, relationshipId, { reason: GRAPPLE_IMMUNITY_REASONS.THROW, obligations });
}

export function applyClearImmunity(state, immunityId) {
  const next = clone(state);
  const id = optionalString(immunityId);
  const immunity = id ? next.immunities.find((entry) => entry.id === id) : null;
  if (!immunity) return reject("not-found", next);
  next.immunities = next.immunities.filter((entry) => entry.id !== immunity.id);
  return { ok: true, state: next, changed: true, removedImmunities: [immunity] };
}

export function pruneGrappleState(state, combat) {
  const next = clone(state);
  const removedRelationships = next.relationships.filter((relationship) => !isLive(relationship, combat));
  const removedImmunities = next.immunities.filter((immunity) => !isImmunityLive(immunity, combat));
  next.relationships = next.relationships.filter((relationship) => isLive(relationship, combat));
  next.immunities = next.immunities.filter((immunity) => isImmunityLive(immunity, combat));
  const changed = removedRelationships.length > 0 || removedImmunities.length > 0;
  return { ok: true, state: next, changed, removedRelationships, removedImmunities };
}
