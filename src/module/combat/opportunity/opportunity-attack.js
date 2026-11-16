import { ACTION_KINDS, ECONOMY_TYPES } from "../../action-economy/kinds.js";
import { declareActorAction } from "../../action-economy/declare.js";
import {
  consumeAmmunitionCharge,
  peekFirstReadyAmmunition,
  weaponRequiresAmmunition,
} from "../../item/ammunition.js";
import { resolveTokenDocument } from "../../acting-user.js";
import { combatantOf, findCombatant } from "../combatant-match.js";
import { canPayOpportunityAttack, isOpportunityCapableWeapon } from "./opportunity-movement.js";
import { canTargetWithAttack } from "../../action-economy/cover.js";
import { getGrappleRestrictions } from "../../grapple/grapple-restrictions.js";
import { CLASH_RESULTS, RETALIATION_TYPES, retaliationDefenseKind } from "../clash-state.js";
import {
  applyOpportunityAttackOutcome,
  claimOpportunityAttackResolution,
  commitOpportunityAttackDeclaration,
  failOpportunityAttackResolution,
  getCurrentCheckpoint,
  getOpportunityDecision,
  getOpportunitySession,
  getOpportunitySessionByOpportunityId,
  OPPORTUNITY_DECISION_REASONS,
  OPPORTUNITY_DECISION_STATES,
  OPPORTUNITY_DECISIONS,
  OPPORTUNITY_FLAG_SCOPE,
  OPPORTUNITY_FLAG_KEY,
  restoreOpportunityAttackIntent,
  hydrateOpportunitySessionFromFlags,
  sessionIsTerminal,
} from "./opportunity-session.js";
import { actorItem, documentId, warnAbnormal } from "../../shared-helpers.js";

const OPPORTUNITY_RESOLUTIONS = {
  ONE_SIDED: "one-sided",
  ATTACKER_WIN: "attacker-win",
  DEFENDER_WIN: "defender-win",
  ERROR: "error",
};

const OPPORTUNITY_MOVEMENT_DIRECTIVES = {
  STOP_IN_RANGE: "stop-in-range",
  REVALIDATE: "revalidate",
};

function reject(reason, extra = {}) {
  return {
    ok: false,
    reason,
    stale: reason === OPPORTUNITY_DECISION_REASONS.ALREADY_RESOLVING
      || reason === OPPORTUNITY_DECISION_REASONS.NOT_PENDING,
    ...extra,
  };
}

/**
 * If we have a Token id then only that Token's Actor counts. A missing Token
 * gives null (no falling back to the world Actor).
 */
function resolveExactActor({ actorId, tokenId } = {}) {
  if (tokenId) return resolveTokenDocument(tokenId)?.actor ?? null;
  return actorId ? (game.actors.get(actorId) ?? null) : null;
}

/** Matches by Combatant id, or by Token id if there isn't one. Another Combatant of the same Actor doesn't count. */
function resolveExactCombatant({ combatantId, tokenId, combat } = {}) {
  if (!combat) return null;
  if (combatantId) {
    const exact = combatantOf(combat, combatantId);
    if (exact?.tokenId && tokenId && exact.tokenId !== tokenId) return null;
    return exact;
  }
  return findCombatant({ combatants: combat.combatants, tokenId });
}

function resolveIdentity({ session, decision, combat }) {
  const reactorToken = resolveTokenDocument(decision.reactorTokenId);
  const reactorActor = resolveExactActor({
    actorId: decision.reactorActorId,
    tokenId: decision.reactorTokenId,
  });
  const reactorCombatant = resolveExactCombatant({
    combatantId: decision.reactorCombatantId,
    tokenId: decision.reactorTokenId,
    combat,
  });
  const moverToken = resolveTokenDocument(session.moverTokenId);
  const moverActor = resolveExactActor({
    actorId: session.moverActorId,
    tokenId: session.moverTokenId,
  });
  const moverCombatant = resolveExactCombatant({
    combatantId: session.moverCombatantId,
    tokenId: session.moverTokenId,
    combat,
  });
  const weapon = actorItem(reactorActor, decision.chosenWeaponId);

  return {
    reactorToken,
    reactorActor,
    reactorCombatant,
    moverToken,
    moverActor,
    moverCombatant,
    weapon,
  };
}

function identitiesMatch(decision, identity) {
  if (!identity.reactorActor || !identity.reactorCombatant) return false;
  if (identity.reactorCombatant.id !== decision.reactorCombatantId) return false;
  if (decision.reactorTokenId && identity.reactorToken) {
    const tokenId = documentId(identity.reactorToken);
    if (tokenId && tokenId !== decision.reactorTokenId) return false;
  }
  return true;
}

function isWeaponStillEligible(decision, weapon) {
  if (!weapon || weapon.type !== "weapon") return false;
  if (!decision.eligibleWeaponIds.includes(String(weapon.id))) return false;
  return isOpportunityCapableWeapon(weapon);
}

function buildOpportunityAttackPayload({
  reactorActor,
  reactorToken,
  reactorTokenId,
  reactorCombatant,
  weapon,
  moverActor,
  moverToken,
  moverCombatant,
  session,
  decision,
  templateData,
}) {
  const actor = reactorActor ?? null;
  const token = reactorToken ?? null;
  const item = weapon ?? null;
  const targetActor = moverActor ?? null;
  const targetToken = moverToken ?? null;
  const targetCombatant = moverCombatant ?? null;
  const targetTokenId = session.moverTokenId ?? targetToken?.id ?? null;
  const targetCombatantId = session.moverCombatantId ?? targetCombatant?.id ?? null;
  const targetName = session.moverName ?? targetActor?.name ?? "";
  const targetImg = targetActor?.img ?? targetToken?.img ?? "";
  return {
    actor,
    actorId: actor?.id ?? null,
    token,
    tokenId: reactorTokenId ?? token?.id ?? null,
    item,
    itemId: item?.id ?? null,
    templateData: templateData ?? {},
    target: {
      actor: targetActor,
      actorId: targetActor?.id ?? null,
      token: targetToken,
      tokenId: targetTokenId,
      combatant: targetCombatant,
      combatantId: targetCombatantId,
      name: targetName,
      img: targetImg,
    },
    targetActor,
    targetActorId: targetActor?.id ?? null,
    targetCombatant,
    targetCombatantId,
    targetToken,
    targetTokenId,
    targetName,
    targetImg,
    skipAttackerEconomy: true,
    economyAlreadyDeclared: true,
    economyType: ECONOMY_TYPES.REACTION,
    kind: ACTION_KINDS.OPPORTUNITY_ATTACK,
    defensiveOnly: true,
    allowDualWield: false,
    opportunityAttack: true,
    movementRisk: true,
    movementId: session.movementId ?? null,
    opportunityId: decision.opportunityId ?? null,
    reactorCombatantId: decision.reactorCombatantId ?? reactorCombatant?.id ?? null,
    moverCombatantId: targetCombatantId,
    movementActionId: session.movementActionId ?? null,
    opportunityMessageId: decision.messageId ?? null,
    pauseAt: decision.pauseAt ?? null,
  };
}

async function initiateClashAttack(payload) {
  const { initiateAttack } = await import("../clashing.js");
  return initiateAttack(payload);
}

/**
 * The reactor is the attacker here and the mover is the defender. The mover
 * only gets stopped (and its Movement spent) if the reactor wins a defended Clash.
 */
function movementDirectiveForOpportunityResolution(resolution) {
  if (resolution === OPPORTUNITY_RESOLUTIONS.ATTACKER_WIN) {
    return OPPORTUNITY_MOVEMENT_DIRECTIVES.STOP_IN_RANGE;
  }
  return OPPORTUNITY_MOVEMENT_DIRECTIVES.REVALIDATE;
}

function defenseTypeFromClash(state) {
  const kind = retaliationDefenseKind(state?.retaliationType ?? null);
  return kind === "counter" ? null : kind;
}

function resolutionFromWinnerIdentity(state) {
  const winnerActorId = state?.winnerActorId ?? null;
  const winnerTokenId = state?.winnerTokenId ?? null;
  if (winnerActorId && winnerActorId === state.attackerActorId) return OPPORTUNITY_RESOLUTIONS.ATTACKER_WIN;
  if (winnerTokenId && winnerTokenId === state.attackerTokenId) return OPPORTUNITY_RESOLUTIONS.ATTACKER_WIN;
  if (winnerActorId && (
    winnerActorId === state.targetActorId
    || winnerActorId === state.retaliatorActorId
  )) {
    return OPPORTUNITY_RESOLUTIONS.DEFENDER_WIN;
  }
  if (winnerTokenId && (
    winnerTokenId === state.targetTokenId
    || winnerTokenId === state.retaliatorTokenId
  )) {
    return OPPORTUNITY_RESOLUTIONS.DEFENDER_WIN;
  }
  return null;
}

function buildOpportunityAttackResult(state, extras = {}) {
  const type = state?.retaliationType ?? extras.defenseType ?? null;
  const onesided = type === RETALIATION_TYPES.ONESIDED;
  let resolution = OPPORTUNITY_RESOLUTIONS.ERROR;
  let defenseType = extras.defenseType ?? defenseTypeFromClash(state);
  const movementRisk = extras.movementRisk !== false && state?.movementRisk !== false;
  const resolutionComplete = extras.resolutionComplete !== false && state?.resolutionComplete !== false;

  if (extras.resolution) {
    resolution = extras.resolution;
  } else if (onesided) {
    resolution = OPPORTUNITY_RESOLUTIONS.ONE_SIDED;
    defenseType = null;
  } else if (state?.result === CLASH_RESULTS.ATTACK_WIN) {
    resolution = OPPORTUNITY_RESOLUTIONS.ATTACKER_WIN;
  } else if (state?.result === CLASH_RESULTS.DEFENSE_WIN) {
    resolution = OPPORTUNITY_RESOLUTIONS.DEFENDER_WIN;
  } else if (state?.result === CLASH_RESULTS.TIE) {
    resolution = OPPORTUNITY_RESOLUTIONS.ERROR;
  } else {
    resolution = resolutionFromWinnerIdentity(state) ?? resolution;
  }

  const intercepted = !!state?.interception;
  return {
    opportunityId: extras.opportunityId ?? state?.opportunityId ?? null,
    movementId: extras.movementId ?? state?.movementId ?? null,
    resolution,
    movementDirective: intercepted
      ? OPPORTUNITY_MOVEMENT_DIRECTIVES.REVALIDATE
      : (extras.movementDirective ?? movementDirectiveForOpportunityResolution(resolution)),
    defenseType: resolution === OPPORTUNITY_RESOLUTIONS.DEFENDER_WIN ? defenseType : null,
    clashId: extras.clashId ?? state?.attackMessageId ?? state?.resultMessageId ?? null,
    movementRisk,
    resolutionComplete,
    ...(intercepted ? {
      intercepted: true,
      interceptorCombatantId: state.interception.interceptorCombatantId ?? null,
    } : {}),
  };
}

function errorResult(session, decision, extras = {}) {
  return buildOpportunityAttackResult(null, {
    opportunityId: decision.opportunityId,
    movementId: session.movementId,
    resolution: extras.resolution ?? OPPORTUNITY_RESOLUTIONS.ERROR,
    movementDirective: OPPORTUNITY_MOVEMENT_DIRECTIVES.REVALIDATE,
    defenseType: null,
    clashId: extras.clashId ?? decision.clashId ?? null,
  });
}

function restoreIntent(session, decision, extras, reason, extra = {}) {
  restoreOpportunityAttackIntent(session, decision.opportunityId, extras);
  return reject(reason, { session, decision, ...extra });
}

/** Once the Reaction is declared a failure doesn't refund it. We just record an error result. */
function failAfterDeclaration(session, decision, reason) {
  failOpportunityAttackResolution(session, decision.opportunityId, errorResult(session, decision));
  return reject(reason, { session, decision, declared: true });
}

/**
 * Resolves a recorded Attack intent. The decision has to be an "attack" that's
 * still "awaiting-attack-resolution" and has a chosen weapon.
 */
export async function resolveOpportunityAttackDecision(sessionOrId, opportunityId) {
  const session = (typeof sessionOrId === "object" ? sessionOrId : getOpportunitySession(sessionOrId))
    ?? getOpportunitySessionByOpportunityId(opportunityId);
  const decision = getOpportunityDecision(session, opportunityId);
  if (!session || !decision) return reject(OPPORTUNITY_DECISION_REASONS.NOT_FOUND);

  if (sessionIsTerminal(session)) {
    return reject(OPPORTUNITY_DECISION_REASONS.SESSION_INACTIVE, { session, decision });
  }

  const current = getCurrentCheckpoint(session);
  if (!current?.opportunities.some((entry) => entry.opportunityId === decision.opportunityId)) {
    return reject(OPPORTUNITY_DECISION_REASONS.NOT_CURRENT_CHECKPOINT, { session, decision });
  }

  if (
    decision.state === OPPORTUNITY_DECISION_STATES.RESOLVING_ATTACK
    || decision.state === OPPORTUNITY_DECISION_STATES.ATTACK_COMMITTED
  ) {
    return reject(OPPORTUNITY_DECISION_REASONS.ALREADY_RESOLVING, { session, decision });
  }
  if (
    decision.state === OPPORTUNITY_DECISION_STATES.RESOLVED
    || decision.state === OPPORTUNITY_DECISION_STATES.RESOLUTION_ERROR
  ) {
    return reject(OPPORTUNITY_DECISION_REASONS.NOT_PENDING, { session, decision });
  }
  if (
    decision.decision !== OPPORTUNITY_DECISIONS.ATTACK
    || decision.state !== OPPORTUNITY_DECISION_STATES.AWAITING_ATTACK_RESOLUTION
    || !decision.chosenWeaponId
  ) {
    return reject(OPPORTUNITY_DECISION_REASONS.NOT_ATTACK_INTENT, { session, decision });
  }

  const combat = game.combat ?? null;
  const identity = resolveIdentity({ session, decision, combat });
  const refresh = {
    actor: identity.reactorActor,
    combatant: identity.reactorCombatant,
    combat,
  };

  if (!identitiesMatch(decision, identity)) {
    warnAbnormal("Opportunity Attack identity is stale", {
      opportunityId: decision.opportunityId,
      reactorCombatantId: decision.reactorCombatantId,
      reactorTokenId: decision.reactorTokenId,
    });
    return restoreIntent(session, decision, refresh, OPPORTUNITY_DECISION_REASONS.REACTOR_MISMATCH);
  }

  if (!isWeaponStillEligible(decision, identity.weapon)) {
    warnAbnormal("chosen OA weapon is no longer eligible", {
      opportunityId: decision.opportunityId,
      chosenWeaponId: decision.chosenWeaponId,
    });
    return restoreIntent(session, decision, refresh, OPPORTUNITY_DECISION_REASONS.STALE_WEAPON);
  }

  let ammo = null;
  const needsAmmo = weaponRequiresAmmunition(identity.weapon);
  if (needsAmmo) ammo = peekFirstReadyAmmunition(identity.reactorActor);

  if (!canPayOpportunityAttack(identity.reactorActor, {
    combatant: identity.reactorCombatant,
    weapon: identity.weapon,
    combat,
  })) {
    warnAbnormal("reactor can no longer pay OPPORTUNITY_ATTACK", {
      opportunityId: decision.opportunityId,
    });
    return restoreIntent(session, decision, refresh, OPPORTUNITY_DECISION_REASONS.REACTION_UNAVAILABLE);
  }

  if (identity.reactorCombatant && !getGrappleRestrictions(identity.reactorCombatant, { combat }).opportunityAttack) {
    warnAbnormal("reactor became Grappled before the Opportunity Attack", {
      opportunityId: decision.opportunityId,
    });
    return restoreIntent(session, decision, refresh, OPPORTUNITY_DECISION_REASONS.REACTION_UNAVAILABLE);
  }

  if (identity.reactorCombatant?.isDefeated === true) {
    warnAbnormal("reactor was defeated before the Opportunity Attack", {
      opportunityId: decision.opportunityId,
    });
    return restoreIntent(session, decision, refresh, OPPORTUNITY_DECISION_REASONS.REACTION_UNAVAILABLE);
  }

  if (identity.moverCombatant && !canTargetWithAttack({
    attackerItem: identity.weapon,
    targetCombatant: identity.moverCombatant,
    combat,
  }).ok) {
    warnAbnormal("OA mover is in Full Cover", { opportunityId: decision.opportunityId });
    return restoreIntent(session, decision, refresh, OPPORTUNITY_DECISION_REASONS.STALE_WEAPON);
  }

  if (!identity.moverActor || (session.moverTokenId && !identity.moverToken)) {
    warnAbnormal("OA mover is gone before declaration", {
      opportunityId: decision.opportunityId,
      moverTokenId: session.moverTokenId,
    });
    return restoreIntent(session, decision, refresh, OPPORTUNITY_DECISION_REASONS.MOVER_GONE);
  }

  const claimed = claimOpportunityAttackResolution(session, decision.opportunityId);
  if (!claimed.ok) return claimed;

  let declared;
  try {
    declared = await declareActorAction({
      actor: identity.reactorActor,
      combat,
      combatant: identity.reactorCombatant,
      tokenId: decision.reactorTokenId,
      economyType: ECONOMY_TYPES.REACTION,
      kind: ACTION_KINDS.OPPORTUNITY_ATTACK,
      cost: 1,
      item: identity.weapon,
      target: identity.moverActor,
      metadata: {
        movementId: session.movementId,
        opportunityId: decision.opportunityId,
      },
    });
  } catch (error) {
    warnAbnormal("OPPORTUNITY_ATTACK declaration threw", {
      opportunityId: decision.opportunityId,
      error,
    });
    return restoreIntent(session, decision, refresh, OPPORTUNITY_DECISION_REASONS.DECLARATION_FAILED);
  }

  if (!declared?.ok) {
    warnAbnormal("OPPORTUNITY_ATTACK declaration failed", {
      opportunityId: decision.opportunityId,
      reason: declared?.reason ?? null,
    });
    return restoreIntent(session, decision, refresh, OPPORTUNITY_DECISION_REASONS.DECLARATION_FAILED);
  }

  commitOpportunityAttackDeclaration(session, decision.opportunityId, {
    declarationId: declared.declaration?.id ?? null,
  });

  if (ammo) {
    try {
      const consumed = await consumeAmmunitionCharge(ammo, { actor: identity.reactorActor });
      if (consumed === false) {
        throw new Error("ammunition consume returned false");
      }
    } catch (error) {
      warnAbnormal("OA ammunition consume failed after declaration", {
        opportunityId: decision.opportunityId,
        weaponId: identity.weapon.id,
        ammoId: ammo.id,
        error,
      });
      ui.notifications.warn(game.i18n.localize("PMTTRPG.Opportunity.AmmoAfterReaction"));
      return failAfterDeclaration(session, decision, OPPORTUNITY_DECISION_REASONS.AMMO_CONSUME_FAILED);
    }
  }

  const moverNow = resolveExactActor({
    actorId: session.moverActorId,
    tokenId: session.moverTokenId,
  });
  if (!moverNow) {
    warnAbnormal("OA mover disappeared after declaration", {
      opportunityId: decision.opportunityId,
    });
    return failAfterDeclaration(session, decision, OPPORTUNITY_DECISION_REASONS.MOVER_GONE);
  }

  const templateData = {};
  if (ammo) {
    templateData.ammoId = ammo.id ?? null;
    templateData.ammoName = ammo.name ?? null;
    templateData.ammoType = ammo.system?.ammoType ?? null;
    templateData.ammoDamageType = ammo.system?.damageType ?? null;
    templateData.dryFire = false;
  } else if (needsAmmo) {
    // no ammo is still a legal Attack, it just dry fires (the Clash gives the attacker disadvantage for that)
    templateData.dryFire = true;
  }

  const payload = buildOpportunityAttackPayload({
    reactorActor: identity.reactorActor,
    reactorToken: identity.reactorToken,
    reactorTokenId: decision.reactorTokenId,
    reactorCombatant: identity.reactorCombatant,
    weapon: identity.weapon,
    moverActor: moverNow,
    moverToken: identity.moverToken,
    moverCombatant: identity.moverCombatant,
    session,
    decision,
    templateData,
  });

  let started;
  try {
    started = await initiateClashAttack(payload);
  } catch (error) {
    warnAbnormal("initiateAttack failed after OA declaration", {
      movementId: session.movementId,
      opportunityId: decision.opportunityId,
      reactorCombatantId: decision.reactorCombatantId,
      moverCombatantId: session.moverCombatantId,
      weaponId: identity.weapon.id,
      error,
    });
    return failAfterDeclaration(session, decision, OPPORTUNITY_DECISION_REASONS.ATTACK_SETUP_FAILED);
  }

  if (started && started.ok === false) {
    warnAbnormal("initiateAttack rejected after OA declaration", {
      movementId: session.movementId,
      opportunityId: decision.opportunityId,
      reason: started.reason ?? null,
    });
    return failAfterDeclaration(session, decision, OPPORTUNITY_DECISION_REASONS.ATTACK_SETUP_FAILED);
  }

  decision.clashId = started?.state?.attackMessageId ?? started?.state?.id ?? decision.clashId ?? null;
  return {
    ok: true,
    session,
    decision,
    declared,
    attack: started ?? { ok: true },
    payload: started?.payload ?? null,
  };
}

async function mirrorResolvedOpportunity(session, decision, extras = {}) {
  if (!decision?.messageId && !extras.messageId) return;
  try {
    const { mirrorOpportunityDecision } = await import("./opportunity-prompt.js");
    await mirrorOpportunityDecision(session, decision, extras);
  } catch {
    // pass
  }
}

export async function finalizeOpportunityAttackFromClash(state) {
  if (!state?.opportunityAttack || !state.opportunityId) {
    return reject(OPPORTUNITY_DECISION_REASONS.NOT_FOUND);
  }
  let session = getOpportunitySession(state.movementId)
    ?? getOpportunitySessionByOpportunityId(state.opportunityId);
  if (!session && state.opportunityMessageId) {
    const message = game.messages.get(state.opportunityMessageId);
    const flags = message?.getFlag(OPPORTUNITY_FLAG_SCOPE, OPPORTUNITY_FLAG_KEY) ?? null;
    if (flags) session = hydrateOpportunitySessionFromFlags(flags);
  }
  const decision = getOpportunityDecision(session, state.opportunityId);
  if (!session || !decision) return reject(OPPORTUNITY_DECISION_REASONS.NOT_FOUND);

  if (
    decision.state === OPPORTUNITY_DECISION_STATES.RESOLVED
    || decision.state === OPPORTUNITY_DECISION_STATES.RESOLUTION_ERROR
  ) {
    return { ok: true, stale: true, alreadyResolved: true, session, decision };
  }

  const result = buildOpportunityAttackResult(state, {
    opportunityId: state.opportunityId,
    movementId: state.movementId ?? session.movementId,
    movementRisk: state.movementRisk,
    resolutionComplete: state.resolutionComplete,
  });
  const applied = applyOpportunityAttackOutcome(session, state.opportunityId, result);
  if (applied.ok && !applied.alreadyResolved) {
    await mirrorResolvedOpportunity(session, decision, {
      messageId: state.opportunityMessageId ?? decision.messageId ?? null,
    });
  }
  return applied;
}
