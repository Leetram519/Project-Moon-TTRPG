/**
 * What being Grappled restricts for an exact Combatant. Movement, Dash, Disengage, Opportunity
 * Attacks, clash dice and the Action Menu all read it from here.
 */

import { exactCombatantForToken } from "../combat/combatant-match.js";
import { findRelationshipForTarget, relationshipsForGrappler } from "./grapple-state.js";

const BLOCK = "block";
const EVADE = "evade";
const RECYCLED_EVADE = "recycledEvade";
const COUNTER = "counter";

function fortitudeOf(combatant) {
  return Number(combatant?.actor?.system?.abilities?.for?.value) || 0;
}

export function grapplerBreakFreePenalty(combat, relationship) {
  if (!relationship) return 0;
  return Math.max(0, fortitudeOf(combat.combatants.get(relationship.grapplerCombatantId)));
}

function noRestrictions() {
  return {
    grappled: false,
    grapplerCombatantId: null,
    relationshipId: null,
    movement: true,
    dash: true,
    disengage: true,
    protect: true,
    opportunityAttack: true,
    reactionPenalty: 0,
    attackPenaltyAgainst: () => 0,
  };
}

export function getGrappleRestrictions(combatant, { combat = game.combat } = {}) {
  if (!combatant || !combat) return noRestrictions();
  const relationship = findRelationshipForTarget(combat, combatant.id);
  if (!relationship) return noRestrictions();
  const penalty = grapplerBreakFreePenalty(combat, relationship);
  return {
    grappled: true,
    grapplerCombatantId: relationship.grapplerCombatantId,
    relationshipId: relationship.id,
    movement: false,
    dash: false,
    disengage: false,
    protect: false,
    opportunityAttack: false,
    reactionPenalty: penalty,
    attackPenaltyAgainst: (targetCombatantId) => (
      targetCombatantId != null && String(targetCombatantId) === relationship.grapplerCombatantId ? 0 : penalty
    ),
  };
}

/**
 * Blocks a Grappled target from moving on their own. Planned moves (like a Throw), continuations,
 * undo, paste and Administrative Movement would still go through. Only pass movement updates to this.
 */
export function shouldBlockGrappledMovement(tokenDoc, options = {}, { combat = game.combat, isAdministrative = null } = {}) {
  if (!tokenDoc || !combat?.started) return false;
  const pmt = options?.projectmoonttrpg ?? {};
  if (pmt.movementPlanId) return false;
  if (options._resumeMovement || options._stopMovement || options._pauseMovement) return false;
  if (options._movementArguments?.continuationId) return false;
  if (options.isUndo || options.undo || options.isPaste || options._clearMovementHistory) return false;
  if (typeof isAdministrative === "function" && isAdministrative(options)) return false;
  const combatant = exactCombatantForToken(combat, tokenDoc.id);
  if (!combatant) return false;
  return getGrappleRestrictions(combatant, { combat }).movement === false;
}

export function isGrappleParticipant(tokenDoc, { combat = game.combat } = {}) {
  if (!tokenDoc || !combat?.started) return false;
  const combatant = exactCombatantForToken(combat, tokenDoc.id);
  if (!combatant) return false;
  if (findRelationshipForTarget(combat, combatant.id)) return true;
  return relationshipsForGrappler(combat, combatant.id).length > 0;
}

/** Takes the Grappled penalties off each side's power bonuses for one clash and returns what it took. */
export function applyGrappleClashAdjustments(clashCtx, { state, choice, combat = game.combat } = {}) {
  const applied = { attacker: 0, defender: 0 };
  if (!clashCtx?.bonuses || !state || !combat) return applied;
  const declaredTokenId = state.targetTokenId ?? state.retaliatorTokenId ?? null;
  const attacker = exactCombatantForToken(combat, state.attackerTokenId);
  const declaredTarget = exactCombatantForToken(combat, declaredTokenId);
  const defender = exactCombatantForToken(combat, state.retaliatorTokenId ?? state.targetTokenId);

  if (attacker) {
    const restrictions = getGrappleRestrictions(attacker, { combat });
    const penalty = restrictions.grappled ? restrictions.attackPenaltyAgainst(declaredTarget?.id ?? null) : 0;
    if (penalty > 0) {
      clashCtx.bonuses.attacker.attackPower = (Number(clashCtx.bonuses.attacker.attackPower) || 0) - penalty;
      applied.attacker = penalty;
    }
  }

  const type = choice?.type ?? null;
  if (defender && [BLOCK, EVADE, RECYCLED_EVADE, COUNTER].includes(type)) {
    const restrictions = getGrappleRestrictions(defender, { combat });
    const penalty = restrictions.grappled ? restrictions.reactionPenalty : 0;
    if (penalty > 0) {
      const field = type === BLOCK ? "blockPower" : type === COUNTER ? "attackPower" : "evadePower";
      clashCtx.bonuses.defender[field] = (Number(clashCtx.bonuses.defender[field]) || 0) - penalty;
      applied.defender = penalty;
    }
  }
  return applied;
}
