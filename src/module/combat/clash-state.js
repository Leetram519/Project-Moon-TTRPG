/**
 * ClashState is the canonical data object for a single clash lifecycle.
 * It is created when an attack is initiated, passed through every phase,
 * serialised into chat message flags for persistence, and rehydrated when
 * a player clicks a chat button.
 *
 * Nothing in this file touches Foundry documents directly — it only
 * describes shape and serialisation. All mutation happens in clash.js.
 *
 * Phases:
 *   "pending"   — attack roll posted, waiting for a retaliator
 *   "rolling"   — retaliator chosen, rolls pending
 *   "resolved"  — clash winner determined, result card posted
 *   "closed"    — damage taken / action completed
 */

export const CLASH_PHASES = Object.freeze({
  PENDING:  "pending",
  ROLLING:  "rolling",
  RESOLVED: "resolved",
  CLOSED:   "closed",
});

export const RETALIATION_TYPES = Object.freeze({
  EVADE:          "evade",
  RECYCLED_EVADE: "recycledEvade",
  BLOCK:          "block",
  COUNTER:        "counter",
  ONESIDED:       "onesided"
});

const RETALIATION_DEFENSE_KINDS = Object.freeze({
  [RETALIATION_TYPES.EVADE]:          "evade",
  [RETALIATION_TYPES.RECYCLED_EVADE]: "evade",
  [RETALIATION_TYPES.BLOCK]:          "block",
  [RETALIATION_TYPES.COUNTER]:        "counter",
});

export function retaliationDefenseKind(type) {
  return RETALIATION_DEFENSE_KINDS[type] ?? null;
}

export const CLASH_RESULTS = Object.freeze({
  ATTACK_WIN: "attackWin",
  DEFENSE_WIN: "defenseWin",
  TIE: "tie",
});

/**
 * Creates a fresh ClashState for a new incoming attack.
 *
 * @param {object} params
 * @param {string} params.attackerActorId
 * @param {string} params.attackerTokenId
 * @param {string} params.attackerName
 * @param {string} params.attackerImg
 * @param {string} params.attackerItemId       — weapon/skill used to attack
 * @param {string} params.attackerItemName
 * @param {string|null} params.targetActorId   — null if no target was set
 * @param {string|null} params.targetTokenId
 * @param {string|null} params.targetName
 * @param {string|null} params.targetImg
 * @param {number|null} [params.attackRollTotal]
 * @param {string|null} [params.attackRollFormula]
 * @param {object[]|null} [params.attackRollTerms]
 * @param {"slash"|"pierce"|"blunt"|"none"} params.damageType
 * @param {string} params.attackMessageId
 * @param {object|null} [params.clashBonuses]
 * @param {object[]} [params.attackRollBreakdown]
 * @param {string|null} [params.appliedToolId]
 * @param {string|null} [params.attackerSkillId]
 * @param {string|null} [params.attackerAmmoId]
 * @param {boolean} [params.consumeSkillLight]
 * @param {boolean} [params.attackerDryFire]
 * @param {boolean} [params.attackerAmmoPending]
 * @param {boolean} [params.attackerMovementPending]
 * @param {boolean} [params.skipAttackerEconomy]
 * @param {boolean} [params.attackerConsume]
 * @param {boolean} [params.attackerOffTurn]
 * @param {boolean} [params.attackerAsReaction]
 * @param {string|null} [params.attackerTimingSource]
 * @param {"action"|"reaction"} [params.attackerEconomyType]
 * @param {string} [params.attackerKind]
 * @param {boolean} [params.opportunityAttack]
 * @param {string|null} [params.movementId]
 * @param {string|null} [params.opportunityId]
 * @param {string|null} [params.reactorCombatantId]
 * @param {string|null} [params.moverCombatantId]
 * @param {boolean} [params.defensiveOnly]
 * @param {boolean} [params.movementRisk]
 * @param {boolean} [params.resolutionComplete]
 * @param {string|null} [params.attackerCombatantId]
 * @param {string|null} [params.attackerAssistEntryId]
 * @param {string|null} [params.targetCombatantId]
 * @param {object|null} [params.opportunityPauseAt]
 * @param {string|null} [params.opportunityMessageId]
 * @param {string|null} [params.movementActionId]
 * @returns {ClashStateData}
 */
export function createClashState({
  attackerActorId,
  attackerTokenId,
  attackerName,
  attackerImg,
  attackerItemId,
  attackerItemName,
  targetActorId   = null,
  targetTokenId   = null,
  targetName      = null,
  targetImg       = null,
  attackRollTotal = null,
  attackRollFormula = null,
  attackRollTerms = null,
  damageType      = "none",
  attackMessageId,
  clashBonuses    = null,
  attackRollBreakdown = null,
  appliedToolId   = null,
  attackerSkillId = null,
  attackerAmmoId  = null,
  consumeSkillLight = false,
  attackerDryFire = false,
  attackerAmmoPending = false,
  attackerMovementPending = false,
  skipAttackerEconomy = false,
  attackerConsume = true,
  attackerOffTurn = false,
  attackerAsReaction = false,
  attackerTimingSource = null,
  attackerEconomyType = "action",
  attackerKind = "attack",
  opportunityAttack = false,
  movementId = null,
  opportunityId = null,
  reactorCombatantId = null,
  moverCombatantId = null,
  defensiveOnly = false,
  movementRisk,
  resolutionComplete,
  attackerCombatantId = null,
  attackerAssistEntryId = null,
  targetCombatantId = null,
  opportunityPauseAt = null,
  opportunityMessageId = null,
  movementActionId = null,
}) {
  return {
    phase: CLASH_PHASES.PENDING,

    // Attacker
    attackerActorId,
    attackerTokenId,
    attackerCombatantId: attackerCombatantId ?? null,
    attackerAssistEntryId: attackerAssistEntryId ?? null,
    attackerName,
    attackerImg,
    attackerItemId,
    attackerItemName,
    appliedToolId: appliedToolId ?? null,
    attackerSkillId: attackerSkillId ?? null,
    attackerAmmoId: attackerAmmoId ?? null,
    consumeSkillLight: !!consumeSkillLight,
    attackerAmmoPending: !!attackerAmmoPending,
    attackerMovementPending: !!attackerMovementPending,
    attackerDryFire: !!attackerDryFire,
    skipAttackerEconomy: !!skipAttackerEconomy,
    attackerEconomyCommitted: false,
    attackerDeclarationId: null,
    attackerConsume: attackerConsume !== false,
    attackerOffTurn: attackerOffTurn === true,
    attackerAsReaction: attackerAsReaction === true,
    attackerTimingSource: typeof attackerTimingSource === "string" && attackerTimingSource ? attackerTimingSource : null,
    defenderEconomyCommitments: [],
    attackerEconomyType: attackerEconomyType === "reaction" ? "reaction" : "action",
    attackerKind: String(attackerKind || "attack"),
    opportunityAttack: !!opportunityAttack,
    movementId: movementId ?? null,
    opportunityId: opportunityId ?? null,
    reactorCombatantId: reactorCombatantId ?? null,
    moverCombatantId: moverCombatantId ?? null,
    opportunityPauseAt: opportunityPauseAt ?? null,
    opportunityMessageId: opportunityMessageId ?? null,
    movementActionId: movementActionId ?? null,
    interception: null,
    defensiveOnly: !!defensiveOnly,
    movementRisk: movementRisk !== false,
    resolutionComplete: resolutionComplete !== false,

    // Primary target (may be overridden by an interceptor)
    targetActorId,
    targetTokenId,
    targetCombatantId: targetCombatantId ?? null,
    targetName,
    targetImg,

    // The actual retaliator (set when someone clicks Retaliate)
    // `claimId` is the attempt whose claim to ROLLING won
    claimId:             null,
    retaliatorActorId:   null,
    retaliatorTokenId:   null,
    retaliatorName:      null,
    retaliatorImg:       null,
    retaliatorItemId:    null,
    retaliatorItemName:  null,
    retaliatorSkillId:   null,
    retaliatorAppliedToolId: null,
    retaliatorAmmoId:    null,
    retaliationType:     null,   // RETALIATION_TYPES value

    // Rolls
    attackRollTotal,
    attackRollFormula,
    attackRollTerms,
    defenseRollTotal:    null,
    defenseRollFormula:  null,
    defenseRollTerms:    null,
    attackRollBreakdown: attackRollBreakdown ?? null,
    defenseRollBreakdown: null,

    clashBonuses: clashBonuses ?? null,

    // Result
    result:   null,   // CLASH_RESULTS value
    margin:   null,   // Math.abs(attacker - defender)
    damageType,

    // Damage calc (populated after result, read by Take the Damage)
    hpDamage:  null,
    stDamage:  null,

    counterInRange: null,

    // Ranged attackers take no Block Win ST rebound
    blockWinStExempt: null,

    // Linked chat messages
    attackMessageId,
    resultMessageId: null,
  };
}

/**
 * Combatant who caused the HP/ST on the result card, if any.
 * Evade regen and ranged Block exemption have no source.
 *
 * @param {object|null|undefined} state
 * @returns {{
 *   actorId: string|null,
 *   tokenId: string|null,
 *   itemId: string|null,
 *   skillId: string|null,
 *   appliedToolId: string|null,
 *   ammoId: string|null,
 * }|null}
 */
export function getClashDamageSourceRef(state) {
  if (!state) return null;

  const attackerWon = state.result === "attackWin";
  const defenderWon = state.result === "defenseWin";
  const type = state.retaliationType;
  const counterHit = defenderWon && type === "counter";
  const blockWinSt = defenderWon && type === "block" && !state.blockWinStExempt;

  if (attackerWon) {
    if (!state.attackerActorId && !state.attackerTokenId) return null;
    return {
      actorId: state.attackerActorId ?? null,
      tokenId: state.attackerTokenId ?? null,
      itemId: state.attackerItemId ?? null,
      skillId: state.attackerSkillId ?? null,
      appliedToolId: state.appliedToolId ?? null,
      ammoId: state.attackerDryFire ? null : (state.attackerAmmoId ?? null),
    };
  }

  if (counterHit || blockWinSt) {
    const actorId = state.retaliatorActorId ?? state.targetActorId ?? null;
    const tokenId = state.retaliatorTokenId ?? state.targetTokenId ?? null;
    if (!actorId && !tokenId) return null;
    return {
      actorId,
      tokenId,
      itemId: state.retaliationItemId ?? state.retaliatorItemId ?? null,
      skillId: state.retaliatorSkillId ?? null,
      appliedToolId: state.retaliatorAppliedToolId ?? null,
      ammoId: state.retaliatorAmmoId ?? null,
    };
  }

  return null;
}

/**
 * Serialises a ClashState to a plain object safe to store in message flags.
 * Currently a no-op (state is already plain) but provides an extension point.
 *
 * @param {ClashStateData} state
 * @returns {object}
 */
export function serialiseClashState(state) {
  return foundry.utils.deepClone(state);
}

/**
 * Deserialises a ClashState from message flags.
 *
 * @param {object} raw
 * @returns {ClashStateData}
 */
export function deserialiseClashState(raw) {
  return foundry.utils.deepClone(raw);
}

/** Flag namespace used on ChatMessage documents. */
export const CLASH_FLAG_SCOPE = "projectmoonttrpg";
export const CLASH_FLAG_KEY   = "clashState";