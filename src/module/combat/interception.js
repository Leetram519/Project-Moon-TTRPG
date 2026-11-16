/*
 Finding interceptors and checking a claim (for normal attacks and Opportunity Attacks).
*/

import { canActAs } from "../acting-user.js";
import { PMTTRPGUtility } from "../utility.js";
import { canPayRetaliation } from "./clash-economy.js";
import { retaliationDefenseKind } from "./clash-state.js";
import { canTargetWithAttack } from "../action-economy/cover.js";
import { optionalString } from "../shared-helpers.js";
import { combatantOf } from "./combatant-match.js";

/** @type {{ id: string, order: number, seq: number, listCandidates: Function }[]} */
const sources = [];
let sourceSeq = 0;

export function registerInterceptorSource({ id, order = 0, listCandidates } = {}) {
  const key = optionalString(id);
  if (!key || typeof listCandidates !== "function") {
    throw new Error("[PMTTRPG] Interception source requires id and listCandidates");
  }
  unregisterInterceptorSource(key);
  sources.push({
    id: key,
    order: Number.isFinite(Number(order)) ? Number(order) : 0,
    seq: sourceSeq++,
    listCandidates,
  });
}

function unregisterInterceptorSource(id) {
  const key = String(id ?? "");
  const index = sources.findIndex((entry) => entry.id === key);
  if (index >= 0) sources.splice(index, 1);
}

function sortedSources() {
  return [...sources].sort((a, b) => (a.order - b.order) || (a.seq - b.seq));
}

export function interceptionContextFromClash(state, { combat = null, attackerItem = null } = {}) {
  if (!state || !combat || state.targetCombatantId == null) return null;
  const item = attackerItem ?? null;
  const opportunity = state.opportunityAttack === true;
  return {
    combat,
    attackerCombatantId: state.attackerCombatantId ?? state.reactorCombatantId ?? null,
    attackerTokenId: state.attackerTokenId ?? null,
    originalTargetCombatantId: state.targetCombatantId,
    originalTargetTokenId: state.targetTokenId ?? null,
    originalTargetActorId: state.targetActorId ?? null,
    attackerItem: item,
    rangedAttack: PMTTRPGUtility.isRangedWeapon(item),
    opportunity,
    protectedPosition: opportunity && state.opportunityPauseAt
      ? { cell: state.opportunityPauseAt }
      : { tokenId: state.targetTokenId ?? null },
    attackMessageId: state.attackMessageId ?? null,
    movementId: state.movementId ?? null,
    opportunityId: state.opportunityId ?? null,
    movementActionId: state.movementActionId ?? null,
  };
}

function validCandidate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const sourceId = optionalString(raw.sourceId);
  const combatantId = optionalString(raw.combatantId);
  const kind = optionalString(raw.kind) ?? "protect";
  if (!sourceId || !combatantId) return null;
  const allowed = Array.isArray(raw.allowedDefenses)
    ? raw.allowedDefenses.filter((entry) => entry === "block" || entry === "evade" || entry === "counter")
    : [];
  if (!allowed.length) return null;
  return {
    sourceId,
    kind,
    combatantId,
    tokenId: optionalString(raw.tokenId),
    actorId: optionalString(raw.actorId),
    allowedDefenses: allowed,
    protectDeclarationId: optionalString(raw.protectDeclarationId),
  };
}

export function listInterceptors(ctx) {
  if (!ctx?.combat || ctx.originalTargetCombatantId == null) return [];
  const seen = new Set();
  const out = [];
  for (const source of sortedSources()) {
    let raw;
    try {
      raw = source.listCandidates(ctx);
    } catch (error) {
      console.warn(`[PMTTRPG] Interception source '${source.id}' failed`, error);
      continue;
    }
    for (const entry of Array.isArray(raw) ? raw : []) {
      const candidate = validCandidate(entry);
      if (!candidate || candidate.sourceId !== source.id) continue;
      if (String(candidate.combatantId) === String(ctx.originalTargetCombatantId)) continue;
      if (ctx.attackerCombatantId != null && String(candidate.combatantId) === String(ctx.attackerCombatantId)) continue;
      if (seen.has(candidate.combatantId)) continue;
      if (ctx.rangedAttack && !canTargetWithAttack({
        attackerItem: ctx.attackerItem ?? null,
        targetCombatant: combatantOf(ctx.combat, candidate.combatantId),
        combat: ctx.combat,
      }).ok) continue;
      seen.add(candidate.combatantId);
      out.push(candidate);
    }
  }
  return out;
}

export function buildInterceptionMetadata(state, candidate, ctx = null) {
  if (!state || !candidate) return null;
  const context = ctx ?? {};
  const metadata = {
    version: 1,
    kind: candidate.kind ?? "protect",
    sourceId: candidate.sourceId,
    originalTargetCombatantId: optionalString(state.targetCombatantId),
    originalTargetTokenId: optionalString(state.targetTokenId),
    originalTargetActorId: optionalString(state.targetActorId),
    interceptorCombatantId: candidate.combatantId,
    interceptorTokenId: candidate.tokenId ?? null,
    interceptorActorId: candidate.actorId ?? null,
    attackerCombatantId: optionalString(state.attackerCombatantId ?? state.reactorCombatantId),
    attackerTokenId: optionalString(state.attackerTokenId),
    attackMessageId: optionalString(state.attackMessageId ?? context.attackMessageId),
    opportunityAttack: state.opportunityAttack === true,
    movementId: optionalString(state.movementId),
    opportunityId: optionalString(state.opportunityId),
    movementActionId: optionalString(state.movementActionId),
    protectDeclarationId: candidate.protectDeclarationId ?? null,
    allowedDefenses: [...candidate.allowedDefenses],
  };
  return metadata;
}

function readInterception(state) {
  const raw = state?.interception;
  if (!raw || typeof raw !== "object" || raw.version !== 1) return null;
  const interceptorCombatantId = optionalString(raw.interceptorCombatantId);
  const originalTargetCombatantId = optionalString(raw.originalTargetCombatantId);
  const sourceId = optionalString(raw.sourceId);
  if (!interceptorCombatantId || !originalTargetCombatantId || !sourceId) return null;
  return {
    version: 1,
    kind: optionalString(raw.kind) ?? "protect",
    sourceId,
    originalTargetCombatantId,
    originalTargetTokenId: optionalString(raw.originalTargetTokenId),
    originalTargetActorId: optionalString(raw.originalTargetActorId),
    interceptorCombatantId,
    interceptorTokenId: optionalString(raw.interceptorTokenId),
    interceptorActorId: optionalString(raw.interceptorActorId),
    attackerCombatantId: optionalString(raw.attackerCombatantId),
    attackerTokenId: optionalString(raw.attackerTokenId),
    attackMessageId: optionalString(raw.attackMessageId),
    opportunityAttack: raw.opportunityAttack === true,
    movementId: optionalString(raw.movementId),
    opportunityId: optionalString(raw.opportunityId),
    movementActionId: optionalString(raw.movementActionId),
    protectDeclarationId: optionalString(raw.protectDeclarationId),
    allowedDefenses: Array.isArray(raw.allowedDefenses) ? [...raw.allowedDefenses] : [],
  };
}

/**
 * Rechecks a stored interception against the live combat. Eligibility comes
 * from the registered sources (for Protect that's range around the original
 * target).
 */
export function revalidateInterception(state, {
  combat = null,
  retaliationType = null,
  actor = null,
  item = null,
  fromUser = null,
  attackerItem = null,
  requireAffordable = false,
} = {}) {
  const interception = readInterception(state);
  if (!interception) return { ok: true, interception: null, candidate: null };
  if (String(interception.originalTargetCombatantId) !== String(state.targetCombatantId ?? "")) {
    return { ok: false, reason: "target-mismatch", interception };
  }
  const ctx = interceptionContextFromClash(state, { combat, attackerItem });
  const candidate = ctx
    ? listInterceptors(ctx).find((entry) => (
      entry.combatantId === interception.interceptorCombatantId
      && String(entry.tokenId ?? "") === String(interception.interceptorTokenId ?? "")
      && entry.sourceId === interception.sourceId
    ))
    : null;
  if (!candidate) return { ok: false, reason: "not-eligible", interception };
  if (!candidate.allowedDefenses.includes(retaliationDefenseKind(retaliationType))) {
    return { ok: false, reason: "defense-not-allowed", interception, candidate };
  }
  if (fromUser && !canActAs(actor, interception.interceptorTokenId, fromUser)) {
    return { ok: false, reason: "not-owner", interception, candidate };
  }
  if (requireAffordable && !canPayRetaliation(actor, retaliationType, item, {
    tokenId: interception.interceptorTokenId,
    combat,
    combatant: combatantOf(combat, interception.interceptorCombatantId),
    state,
  })) {
    return { ok: false, reason: "cannot-pay", interception, candidate };
  }
  return { ok: true, interception, candidate };
}
