import { ACTION_KINDS, ACTION_TIMING, DECLARATION_FAILURE_REASONS, ECONOMY_TYPES } from "../action-economy/kinds.js";
import {
  canPayReactionForDeclaration,
  combatantForReactionToken,
} from "../action-economy/reaction-credits.js";
import { CLASH_PHASES, RETALIATION_TYPES } from "./clash-state.js";
import { findCombatant } from "./combatant-match.js";
import { createKeyedQueue } from "../keyed-queue.js";
import { canActAs, resolveTokenOrWorldActor } from "../acting-user.js";
import { optionalString } from "../shared-helpers.js";

const REACTION_KIND_BY_RETALIATION = {
  [RETALIATION_TYPES.BLOCK]: ACTION_KINDS.BLOCK,
  [RETALIATION_TYPES.EVADE]: ACTION_KINDS.EVADE,
  [RETALIATION_TYPES.COUNTER]: ACTION_KINDS.COUNTER,
};

const CLASH_ECONOMY_REASONS = {
  NO_ACTOR: "no-actor",
  EXTERNAL_OWNER: "external-owner",
  ALREADY_COMMITTED: "already-committed",
  RECYCLED_EVADE: "recycled-evade",
  NO_REACTION_KIND: "no-reaction-kind",
  DECLARATION_FAILED: "declaration-failed",
  AMMO_UNAVAILABLE: "ammo-unavailable",
  MESSAGE_MISSING: "message-missing",
  NOT_PENDING: "not-pending",
  LOST_CLAIM: "lost-claim",
};

function reactionKindForRetaliation(type) {
  return REACTION_KIND_BY_RETALIATION[type] ?? null;
}

function itemIdOf(item) {
  return item?.id ?? null;
}

function currentCombat(options = {}) {
  return options.combat ?? game.combat ?? null;
}

/** The combat holding this clash's tokens, which isn't always the one this client's tracker is showing. */
export function clashCombat(state) {
  const tokenIds = [state?.attackerTokenId, state?.retaliatorTokenId].filter(Boolean);
  const holds = (combat) => tokenIds.some((tokenId) => findCombatant({ combatants: combat?.combatants, tokenId }));
  if (!tokenIds.length || holds(game.combat)) return game.combat ?? null;
  return game.combats.find((combat) => combat.active && holds(combat))
    ?? game.combats.find(holds)
    ?? game.combat
    ?? null;
}

/** If you pass `options.state` then a defense this card already paid for counts as affordable. */
export function canPayRetaliation(actor, type, item, options = {}) {
  const kind = reactionKindForRetaliation(type);
  if (!kind) return true;
  const combat = currentCombat(options);
  const tokenId = options.tokenId ?? null;
  if (options.state && findDefenderCommitment(options.state, defenderIdentityFor(actor, { tokenId, kind, item, combat }))) {
    return true;
  }
  return canPayReactionForDeclaration(actor, { kind, itemId: itemIdOf(item) }, {
    tokenId,
    combat,
    combatant: options.combatant,
  });
}

function defenderIdentityFor(actor, { tokenId = null, kind = null, item = null, combat = null } = {}) {
  const combatant = combatantForReactionToken(actor, tokenId, combat);
  return defenderCommitmentIdentity({ combatantId: combatant?.id ?? null, tokenId, kind, itemId: itemIdOf(item) });
}

function economyResult(extra) {
  return {
    required: false,
    ok: true,
    declaration: null,
    reason: null,
    alreadyCommitted: false,
    ...extra,
  };
}

function declaredEconomyResult(result, success = {}) {
  if (!result?.ok) {
    return economyResult({
      required: true,
      ok: false,
      reason: result?.reason ?? CLASH_ECONOMY_REASONS.DECLARATION_FAILED,
    });
  }
  return economyResult({ required: true, declaration: result.declaration ?? null, ...success });
}

const EXPLAINED_REFUSALS = new Set([
  DECLARATION_FAILURE_REASONS.AMBIGUOUS_COMBATANT,
  DECLARATION_FAILURE_REASONS.ACT_FROM_TOKEN,
  DECLARATION_FAILURE_REASONS.COMBATANT_MISMATCH,
]);

export function clashEconomyAbortKey(reason, cannotPayKey) {
  if (EXPLAINED_REFUSALS.has(reason)) return null;
  if (reason === DECLARATION_FAILURE_REASONS.NOT_ACTIVE_TURN) return "PMTTRPG.ActionDeclaration.NotYourTurn";
  return cannotPayKey;
}

/** The caller is the one that marks and saves the state. */
export async function declareClashAttackerEconomy({
  state,
  attackerActor,
  attackerItem = null,
  retaliatorActor = null,
  clash = null,
  declare,
  combat,
} = {}) {
  if (!attackerActor) return economyResult({ reason: CLASH_ECONOMY_REASONS.NO_ACTOR });
  if (state?.skipAttackerEconomy === true) {
    return economyResult({ reason: CLASH_ECONOMY_REASONS.EXTERNAL_OWNER });
  }
  if (state?.attackerEconomyCommitted === true) {
    return economyResult({
      reason: CLASH_ECONOMY_REASONS.ALREADY_COMMITTED,
      alreadyCommitted: true,
      declarationId: state.attackerDeclarationId ?? null,
    });
  }

  const tokenId = state?.attackerTokenId ?? null;
  const result = await declare({
    actor: attackerActor,
    economyType: state?.attackerEconomyType === "reaction" ? ECONOMY_TYPES.REACTION : ECONOMY_TYPES.ACTION,
    kind: state?.attackerKind || ACTION_KINDS.ATTACK,
    cost: 1,
    consume: state?.attackerConsume !== false,
    asReaction: state?.attackerAsReaction === true,
    timing: {
      mode: ACTION_TIMING.ANYTIME,
      source: state?.attackerTimingSource ?? game.i18n.localize("PMTTRPG.ActionTiming.AttackCard"),
    },
    item: attackerItem,
    target: retaliatorActor,
    combatant: combatantForReactionToken(attackerActor, tokenId, currentCombat({ combat })),
    tokenId,
    warn: false,
    metadata: {
      attacker: attackerActor,
      defender: retaliatorActor,
      clash,
      source: "clash",
    },
  });
  return declaredEconomyResult(result);
}

function clashEconomyNote(declaration) {
  if (!declaration) return null;
  return {
    consumed: declaration.consumed !== false,
    offTurn: declaration.timing?.offTurn === true,
    source: declaration.timing?.source ?? null,
    asReaction: declaration.timing?.asReaction === true,
  };
}

export function markAttackerEconomyCommitted(state, declaration = null) {
  if (!state) return state;
  state.attackerEconomyCommitted = true;
  state.attackerDeclarationId = declaration?.id ?? state.attackerDeclarationId ?? null;
  if (declaration) state.attackerEconomyNote = clashEconomyNote(declaration);
  return state;
}

function sameId(left, right) {
  return optionalString(left) === optionalString(right);
}

function defenderCommitmentIdentity({ combatantId = null, tokenId = null, kind = null, itemId = null } = {}) {
  return {
    combatantId: optionalString(combatantId),
    tokenId: optionalString(tokenId),
    kind: kind ?? null,
    itemId: optionalString(itemId),
  };
}

function defenderCommitments(state) {
  const list = state?.defenderEconomyCommitments;
  return Array.isArray(list) ? list.filter((entry) => entry && typeof entry === "object") : [];
}

function commitmentMatches(saved, identity) {
  return sameId(saved.combatantId, identity.combatantId)
    && sameId(saved.tokenId, identity.tokenId)
    && saved.kind === identity.kind
    && sameId(saved.itemId, identity.itemId);
}

function findDefenderCommitment(state, identity = {}) {
  const next = defenderCommitmentIdentity(identity);
  return defenderCommitments(state).find((saved) => commitmentMatches(saved, next)) ?? null;
}

export function markDefenderEconomyCommitted(state, { declaration = null, combatantId = null, tokenId = null, kind = null, itemId = null } = {}) {
  if (!state) return state;
  const identity = defenderCommitmentIdentity({ combatantId, tokenId, kind, itemId });
  const list = defenderCommitments(state);
  if (!list.some((saved) => commitmentMatches(saved, identity))) {
    list.push({ ...identity, declarationId: declaration?.id ?? null });
  }
  state.defenderEconomyCommitments = list;
  if (declaration) state.defenderEconomyNote = clashEconomyNote(declaration);
  return state;
}

/**
 * A retry with the same Combatant, kind and item reuses the Reaction this card
 * already paid. Recycled Evade and One-Sided don't spend one at all.
 */
export async function declareClashDefenderEconomy({
  state,
  retaliatorActor,
  attackerActor = null,
  choice,
  isRecycled = false,
  clash = null,
  declare,
  combat,
} = {}) {
  if (!retaliatorActor) return economyResult({ reason: CLASH_ECONOMY_REASONS.NO_ACTOR });
  if (isRecycled) return economyResult({ reason: CLASH_ECONOMY_REASONS.RECYCLED_EVADE });
  const kind = reactionKindForRetaliation(choice?.type);
  if (!kind) return economyResult({ reason: CLASH_ECONOMY_REASONS.NO_REACTION_KIND });

  const tokenId = state?.retaliatorTokenId ?? null;
  const resolvedCombat = currentCombat({ combat });
  const combatant = combatantForReactionToken(retaliatorActor, tokenId, resolvedCombat);
  const identity = defenderIdentityFor(retaliatorActor, { tokenId, kind, item: choice?.item ?? null, combat: resolvedCombat });
  const saved = findDefenderCommitment(state, identity);
  if (saved) {
    return economyResult({
      reason: CLASH_ECONOMY_REASONS.ALREADY_COMMITTED,
      alreadyCommitted: true,
      declarationId: saved.declarationId ?? null,
      identity,
    });
  }
  const result = await declare({
    actor: retaliatorActor,
    economyType: ECONOMY_TYPES.REACTION,
    kind,
    cost: 1,
    consume: choice?.consumeReaction !== false,
    item: choice?.item ?? null,
    target: attackerActor,
    combatant,
    tokenId,
    warn: false,
    metadata: {
      attacker: attackerActor,
      defender: retaliatorActor,
      clash,
      source: "clash",
      reactionType: choice?.type ?? null,
      interception: state?.interception ?? null,
    },
  });
  return declaredEconomyResult(result, { identity });
}

export function preflightAttackerResources(state, { attackerAmmo = null } = {}) {
  if (state?.attackerAmmoPending === true) {
    const quantity = Number(attackerAmmo?.system?.quantity ?? 0);
    if (!attackerAmmo || quantity <= 0) {
      return { ok: false, reason: CLASH_ECONOMY_REASONS.AMMO_UNAVAILABLE };
    }
  }
  return { ok: true, reason: null };
}

export function preflightDefenderResources(choice = {}) {
  if (choice?.ammo && choice.consumeAmmo) {
    const quantity = Number(choice.ammo.system?.quantity ?? 0);
    if (quantity <= 0) return { ok: false, reason: CLASH_ECONOMY_REASONS.AMMO_UNAVAILABLE };
  }
  return { ok: true, reason: null };
}

// Pays the attacker's deferred ammo, skill Light and ranged movement costs.
export async function commitAttackerResources(state, {
  attackerActor,
  attackerSkill = null,
  attackerAmmo = null,
  consumeAmmunition,
  spendSkillLight,
  exhaustMovement,
} = {}) {
  const steps = [];
  try {
    if (state.attackerAmmoPending === true) {
      if (!attackerAmmo) throw new Error("selected ammunition is no longer available");
      const consumed = await consumeAmmunition(attackerAmmo, { actor: attackerActor });
      if (consumed === false) throw new Error("ammunition consume returned false");
      state.attackerAmmoPending = false;
      steps.push("ammo");
    }
    if (state.consumeSkillLight === true && attackerSkill) {
      await spendSkillLight(attackerActor, attackerSkill);
      state.consumeSkillLight = false;
      steps.push("light");
    }
    if (state.attackerMovementPending === true) {
      await exhaustMovement(attackerActor);
      state.attackerMovementPending = false;
      steps.push("movement");
    }
  } catch (error) {
    return { ok: false, steps, error };
  }
  return { ok: true, steps, error: null };
}

/**
 * Call it after every declaration went through and before [On Clash Start] and
 * the dice (so a failed clash never eats a grant). If the picked grant can't be
 * claimed anymore we warn and the clash goes on without it.
 */
export async function applyClashAssist({
  state,
  choice = null,
  attackerCombatant = null,
  retaliatorCombatant = null,
  clash,
  combat = null,
  consume,
  warn = null,
} = {}) {
  const result = {
    attacker: { selected: null, claimed: false },
    defender: { selected: null, claimed: false },
  };
  if (!clash?.bonuses || typeof consume !== "function") return result;

  const claimSide = async (side, entryId, combatant) => {
    result[side].selected = entryId;
    let claimed = false;
    if (combatant) {
      try {
        claimed = (await consume({ combatant, entryId, combat })) === true;
      } catch (error) {
        console.warn(`[PMTTRPG] Assist ${side} claim threw`, error);
      }
    }
    result[side].claimed = claimed;
    if (claimed) clash.bonuses[side].advantage = (Number(clash.bonuses[side].advantage) || 0) + 1;
    else if (typeof warn === "function") warn(side);
  };

  const attackerId = state?.attackerAssistEntryId ? String(state.attackerAssistEntryId) : null;
  if (attackerId) await claimSide("attacker", attackerId, attackerCombatant);

  const defenderId = choice?.type !== RETALIATION_TYPES.ONESIDED && choice?.assistEntryId
    ? String(choice.assistEntryId)
    : null;
  if (defenderId) await claimSide("defender", defenderId, retaliatorCombatant);

  return result;
}

/**
 * If combatantForReactionToken has to pick and it's ambiguous we get null and
 * there's no Assist.
 */
export function resolveClashAttackerCombatant(state, attackerActor, combat) {
  if (!attackerActor) return null;
  const activeCombat = currentCombat({ combat });
  const list = activeCombat?.combatants;
  if (state?.attackerCombatantId && list) {
    const exact = list.get(state.attackerCombatantId);
    const exactActorId = exact?.actorId ?? exact?.actor?.id ?? null;
    if (exact && (exact.actor === attackerActor || String(exactActorId) === String(attackerActor.id))) return exact;
  }
  return combatantForReactionToken(attackerActor, state?.attackerTokenId ?? null, activeCombat);
}

const clashClaims = createKeyedQueue();

function withClashClaimLock(messageId, task) {
  return clashClaims.run(String(messageId ?? ""), task);
}

/**
 * The fields a claim writes and an unlock clears. The GM only copies these and
 * `defenderConsume` from a claimant's patch.
 */
const RETALIATOR_CLAIM_FIELDS = [
  "retaliatorActorId",
  "retaliatorTokenId",
  "retaliatorName",
  "retaliatorImg",
  "retaliationItemId",
  "retaliatorItemName",
  "retaliationType",
  "retaliatorAmmoId",
  "retaliatorSkillId",
  "retaliatorAppliedToolId",
];

function plainPatch(patch) {
  const source = patch && typeof patch === "object" ? patch : {};
  const next = {};
  for (const key of RETALIATOR_CLAIM_FIELDS) {
    if (source[key] !== undefined) next[key] = source[key];
  }
  if (source.defenderConsume !== undefined) next.defenderConsume = source.defenderConsume !== false;
  return next;
}

async function readClashState(messageId) {
  const { getClashStateFromMessage } = await import("./clash-chat.js");
  return getClashStateFromMessage(messageId);
}

async function writeClashState(messageId, state) {
  const { updateAttackCard } = await import("./clash-chat.js");
  await updateAttackCard(messageId, state);
}

function claimingUser(meta) {
  return game.users.get(meta.fromUserId ?? "") ?? null;
}

/**
 * Moves the card from PENDING to ROLLING if the claimant can act for the target, a
 * valid protector or the token they intercept with (Runs on the Primary GM).
 */
export async function commitClashClaimAsGM(data = {}, meta = {}) {
  return withClashClaimLock(data.messageId, async () => {
    const current = await readClashState(data.messageId);
    if (!current || current.phase !== CLASH_PHASES.PENDING) return "not-pending";
    const patch = plainPatch(data.patch);
    const fromUser = claimingUser(meta);
    const combat = clashCombat({ ...current, ...patch });
    let interception = null;
    const request = data.patch?.interceptionRequest ?? null;
    if (request) {
      const { revalidateInterception, buildInterceptionMetadata, interceptionContextFromClash } = await import("./interception.js");
      const actor = resolveTokenOrWorldActor(request.actorId, request.tokenId);
      const item = request.itemId ? (actor?.items.get(request.itemId) ?? null) : null;
      const attacker = resolveTokenOrWorldActor(current.attackerActorId, current.attackerTokenId);
      const attackerItem = current.attackerItemId ? (attacker?.items.get(current.attackerItemId) ?? null) : null;
      const probe = {
        ...current,
        interception: {
          version: 1,
          kind: "protect",
          sourceId: request.sourceId,
          interceptorCombatantId: request.combatantId,
          interceptorTokenId: request.tokenId,
          originalTargetCombatantId: current.targetCombatantId,
          allowedDefenses: [],
        },
      };
      const check = revalidateInterception(probe, {
        combat,
        retaliationType: patch.retaliationType,
        actor,
        item,
        fromUser,
        attackerItem,
        requireAffordable: patch.defenderConsume !== false,
      });
      if (!check.ok) return check.reason === "not-owner" ? "not-owner" : "interception-invalid";
      interception = buildInterceptionMetadata(current, check.candidate, interceptionContextFromClash(current, { combat, attackerItem }));
    } else if (data.intercept) {
      const actor = resolveTokenOrWorldActor(patch.retaliatorActorId, patch.retaliatorTokenId);
      if (!canActAs(actor, patch.retaliatorTokenId, fromUser)) return "not-owner";
    } else {
      if (String(patch.retaliatorTokenId ?? "") !== String(current.targetTokenId ?? "")) return "not-owner";
      const actor = resolveTokenOrWorldActor(current.targetActorId, current.targetTokenId);
      if (!canActAs(actor, current.targetTokenId, fromUser)) return "not-owner";
    }
    const next = {
      ...current,
      ...patch,
      interception,
      phase: CLASH_PHASES.ROLLING,
      claimId: data.claimId,
    };
    await writeClashState(data.messageId, next);
    return "won";
  });
}

/** Anything already paid stays marked as paid. */
export function unlockClashState(state) {
  if (!state) return state;
  state.phase = CLASH_PHASES.PENDING;
  state.claimId = null;
  for (const key of RETALIATOR_CLAIM_FIELDS) state[key] = null;
  return state;
}

/**
 * Rereads the card after claiming. If the reread shows our claim we go ahead even
 * when the confirm came back "unconfirmed".
 */
export async function claimClashRetaliation({
  readState,
  confirmClaim = null,
  randomId,
  commitClaim,
} = {}) {
  const claimId = randomId();
  const outcome = await commitClaim(claimId);
  if (outcome !== "won") {
    return { ok: false, reason: outcome || CLASH_ECONOMY_REASONS.LOST_CLAIM, state: null, claimId };
  }
  const confirmation = typeof confirmClaim === "function" ? await confirmClaim(claimId) : "won";
  if (confirmation === "lost") {
    return { ok: false, reason: CLASH_ECONOMY_REASONS.LOST_CLAIM, state: null, claimId };
  }
  const current = await readState();
  if (!current || current.claimId !== claimId || current.phase !== CLASH_PHASES.ROLLING) {
    return { ok: false, reason: CLASH_ECONOMY_REASONS.LOST_CLAIM, state: current, claimId };
  }
  return { ok: true, reason: null, state: current, claimId, confirmation };
}
