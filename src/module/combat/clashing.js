/**
 * Public API for the clash system. Orchestrates all phases:
 *
 *   1. initiateAttack()         — attack card posted, waiting for a retaliator
 *   2. handleRetaliateClick()   — retaliator chosen, dialog shown
 *   3. _executeClash()          — both rolls made, result computed
 *
 * EasyEffects hooks fired here:
 *   pmttrpg.actorAction         [On Action] for Attack / Block / Counter / Evade
 *   pmttrpg.clashStarted       { attacker, defender, attackerItem, defenderItem, clash }
 *   pmttrpg.clashResolved      { winner, loser, attackerItem, defenderItem,
 *                                attackerRoll, defenderRoll, clash }
 *   pmttrpg.clashBeforeResults [On Clash Win Before Results] (winner kit)
 *   pmttrpg.clashEnded         [After Clash Win] / [After Clash Lose], after both sides' Clash Win/Lose
 *   pmttrpg.hitBeforeResults   [On Hit Before Results] / [On Being Hit Before Results]
 *   pmttrpg.attackConnected    { attacker, defender, item, clash } after Clash Win/Lose
 *   pmttrpg.damageCalc         { attacker, defender, attackerItem, clash }
 *   pmttrpg.skillUseStart      { actor, skillItem }
 *   pmttrpg.skillUseEnd        { actor, skillItem }
 */

import {
  createClashState,
  CLASH_PHASES,
  CLASH_RESULTS,
  RETALIATION_TYPES,
  CLASH_FLAG_SCOPE,
  CLASH_FLAG_KEY,
  serialiseClashState,
  deserialiseClashState,
  retaliationDefenseKind,
} from "./clash-state.js";

import {
  rollEvade,
  rollAttack,
  rollCounter,
  rollBlock,
  resolveClash,
  resolveBlockWinStDamage,
} from "./clash-rolls.js";

import {
  getClashStateFromMessage,
  postAttackCard,
  updateAttackCard,
  postResultCard,
  resolveClashCombatant,
} from "./clash-chat.js";
import {
  applyClashAssist,
  canPayRetaliation,
  claimClashRetaliation,
  clashCombat,
  clashEconomyAbortKey,
  commitAttackerResources,
  commitClashClaimAsGM,
  declareClashAttackerEconomy,
  declareClashDefenderEconomy,
  markAttackerEconomyCommitted,
  markDefenderEconomyCommitted,
  preflightAttackerResources,
  preflightDefenderResources,
  resolveClashAttackerCombatant,
  unlockClashState,
} from "./clash-economy.js";
import { claimAssistForRoll } from "../action-economy/assist.js";
import { combatantForReactionToken } from "../action-economy/reaction-credits.js";

import {
  showRetaliationDialog,
  showInterceptConfirmDialog,
  promptRangedAmmo,
} from "./clash-dialog.js";

import { createClashContext, emitAttackConnected, emitClashStarted, emitClashOutcome, emitDamageCalc } from "../easy-effects/registry.js";
import { getEquippedOutfit, normalizeDamageType, resolveRangedDamageType } from "../damage-application.js";
import {
  canConsumeAppliedTool,
  emitAppliedToolHooks,
  maybeConsumeAppliedTool,
} from "../item/applied-tool.js";
import { exhaustRemainingSquares } from "./movement.js";
import { normalizeWeaponProperties } from "../item/weapon-properties.js";
import {
  bumpRecycledEvade,
  clearRecycledEvade,
  getRecycledEvade,
  grantRecycledEvade,
  recycledPowerPenalty,
} from "./recycled-evade.js";
import { applyGrappleClashAdjustments } from "../grapple/grapple-restrictions.js";
import { applyCoverClashAdjustments, canTargetWithAttack } from "../action-economy/cover.js";
import { interceptionContextFromClash, listInterceptors, revalidateInterception } from "./interception.js";

import {PMTTRPGUtility} from '../utility.js';
import { canActAs, resolveTokenDocument, resolveTokenOrWorldActor } from "../acting-user.js";
import { canPayDeclaration, declareActorAction } from "../action-economy/declare.js";
import { ACTION_KINDS, ECONOMY_TYPES } from "../action-economy/kinds.js";
import { checkActionTiming } from "../action-economy/timing.js";
import { rejectUnheldWeaponAttack } from "../action-economy/attack-eligibility.js";
import { consumeAmmunitionCharge } from "../item/ammunition.js";
import { cancelButton, confirmButton, waitForWindowChoice } from "../apps/dialog-wait.js";

const REACTIONS_THAT_CLEAR_RECYCLED = new Set([
  RETALIATION_TYPES.EVADE,
  RETALIATION_TYPES.BLOCK,
  RETALIATION_TYPES.COUNTER,
]);

// How long a non-author retaliator waits for the GM to relay the ROLLING claim
const CLAIM_CONFIRM_TIMEOUT_MS = 4_000;

// ── Phase 1: Initiate Attack ──────────────────────────────────────────────────

/**
 * Called when an actor makes an attack with a weapon.
 * Posts the attack card and waits for a retaliator (rolls happen in _executeClash).
 * Nothing gets paid until the clash runs.
 *
 * @param {AttackPayload} attackPayload
 * @returns {Promise<{ ok: boolean, state?: ClashStateData, reason?: string }>}
 */
export async function initiateAttack(attackPayload) {
  const eligibility = rejectUnheldWeaponAttack(attackPayload?.actor, attackPayload?.item, {
    path: "initiateAttack",
  });
  if (!eligibility.ok) return { ok: false, reason: "unheld" };
  if (!attackPayload?.item) {
    console.warn("[PMTTRPG] Attack eligibility found no item on initiateAttack, so the held-weapon check is skipped", {
      actorId: attackPayload?.actorId ?? null,
    });
  }

  const skipAttackerEconomy = attackPayload.skipAttackerEconomy === true;
  const targetCombatant = attackPayload.targetCombatant
    ?? attackPayload.target?.combatant
    ?? null;
  if (targetCombatant) {
    const cover = canTargetWithAttack({
      attackerItem: attackPayload.item,
      targetCombatant,
      combat: game.combat ?? null,
    });
    if (!cover.ok) {
      ui.notifications.warn(game.i18n.localize("PMTTRPG.Attack.TargetInFullCover"));
      return { ok: false, reason: "full-cover" };
    }
  }
  const attackerConsume = attackPayload.templateData?.attackerConsume !== false;
  const attackerEconomyType = attackPayload.economyType === "reaction" ? ECONOMY_TYPES.REACTION : ECONOMY_TYPES.ACTION;
  const attackerKind = attackPayload.kind || ACTION_KINDS.ATTACK;
  let attackerTiming = { offTurn: false, source: null, asReaction: false };
  if (!skipAttackerEconomy) {
    const combat = game.combat ?? null;
    const attackerCombatant = attackPayload.attackerCombatantId
      ? (combat?.combatants.get(attackPayload.attackerCombatantId) ?? null)
      : combatantForReactionToken(attackPayload.actor, attackPayload.tokenId ?? null, combat);
    const requestedTiming = attackPayload.templateData?.attackerTiming ?? null;
    const timing = checkActionTiming({
      combat,
      combatant: attackerCombatant,
      economyType: attackerEconomyType,
      kind: attackerKind,
      timing: requestedTiming,
    });
    if (!timing.ok) {
      ui.notifications.warn(game.i18n.format("PMTTRPG.Attack.NotYourTurn", { name: attackPayload.actor?.name ?? "" }));
      return { ok: false, reason: timing.reason };
    }
    attackerTiming = { offTurn: timing.offTurn, source: timing.source, asReaction: timing.asReaction === true };
    if (attackerConsume && !canPayDeclaration(attackPayload.actor, {
      economyType: attackerEconomyType,
      kind: attackerKind,
      cost: 1,
      itemId: attackPayload.item?.id ?? attackPayload.itemId ?? null,
      combat,
      combatant: attackerCombatant,
      tokenId: attackPayload.tokenId ?? null,
      timing: requestedTiming,
    })) {
      const asReaction = attackerTiming.asReaction;
      ui.notifications.warn(game.i18n.format(asReaction ? "PMTTRPG.Attack.NoReaction" : "PMTTRPG.Attack.NoAction", {
        name: attackPayload.actor?.name ?? "",
      }));
      return { ok: false, reason: asReaction ? "insufficient-reactions" : "insufficient-actions" };
    }
  }

  // Create a temporary message to get an ID, then use that ID in the state.
  // This way the buttons have data-message-id when they render.
  const tempMessage = await ChatMessage.create({
    author: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: attackPayload.actor }),
    content: "<!-- temp -->",
    flags: { [CLASH_FLAG_SCOPE]: { [CLASH_FLAG_KEY]: null } },
  });

  const dryFireShort = game.i18n.localize("PMTTRPG.Clash.DryFireShort");
  let attackerItemName = attackPayload.templateData?.dryFire
    ? `${attackPayload.item.name} · ${dryFireShort}`
    : (attackPayload.templateData?.ammoName
      ? `${attackPayload.item.name} · ${attackPayload.templateData.ammoName}`
      : attackPayload.item.name);
  const skillName = attackPayload.templateData?.skillName;
  const toolName = attackPayload.templateData?.appliedToolName;
  if (skillName) attackerItemName = `${attackerItemName} · ${skillName}`;
  else if (toolName) attackerItemName = `${attackerItemName} · ${toolName}`;

  const attackerSkillId = attackPayload.templateData?.skillId ?? null;
  const consumeSkillLight = !!attackerSkillId && attackPayload.templateData?.consumeSkillLight !== false;
  const attackerDryFire = attackPayload.templateData?.dryFire === true;
  const attackerAmmoId = attackerDryFire ? null : (attackPayload.templateData?.ammoId ?? null);
  const attackerAmmoPending = !skipAttackerEconomy
    && !!attackerAmmoId
    && attackPayload.templateData?.consumeAmmo === true;
  const attackerMovementPending = !skipAttackerEconomy
    && _rangedAttackConsumesMovement(attackPayload.item);

  const state = createClashState({
    attackerActorId:   attackPayload.actorId,
    attackerTokenId:   attackTokenId(attackPayload.actor, attackPayload.tokenId),
    attackerCombatantId: attackPayload.attackerCombatantId ?? null,
    attackerAssistEntryId: attackPayload.attackerAssistEntryId
      ?? attackPayload.templateData?.attackerAssistEntryId
      ?? null,
    attackerName:      attackPayload.actor.name,
    attackerImg:       attackPayload.actor.img,
    attackerItemId:    attackPayload.itemId,
    attackerItemName,
    targetActorId:     attackPayload.targetActorId   ?? null,
    targetTokenId:     attackPayload.targetTokenId   ?? null,
    targetCombatantId: attackPayload.targetCombatantId
      ?? attackPayload.target?.combatantId
      ?? attackPayload.targetCombatant?.id
      ?? null,
    targetName:        attackPayload.targetName      ?? null,
    targetImg:         attackPayload.targetImg       ?? null,
    attackRollTotal:   null,
    attackRollFormula: null,
    attackRollTerms:   null,
    damageType:        attackPayload.templateData?.damageType
      ?? attackPayload.item.system?.damageType
      ?? "none",
    attackMessageId:   tempMessage.id,
    clashBonuses:      null,
    attackRollBreakdown: null,
    appliedToolId:     attackPayload.templateData?.appliedToolId ?? null,
    attackerSkillId,
    attackerAmmoId,
    consumeSkillLight,
    attackerAmmoPending,
    attackerMovementPending,
    attackerDryFire,
    skipAttackerEconomy,
    attackerConsume,
    attackerOffTurn: attackerTiming.offTurn,
    attackerAsReaction: attackerTiming.asReaction,
    attackerTimingSource: attackerTiming.source,
    attackerEconomyType,
    attackerKind,
    opportunityAttack: attackPayload.opportunityAttack === true,
    movementId: attackPayload.movementId ?? null,
    opportunityId: attackPayload.opportunityId ?? null,
    reactorCombatantId: attackPayload.reactorCombatantId ?? null,
    moverCombatantId: attackPayload.moverCombatantId ?? null,
    opportunityPauseAt: attackPayload.pauseAt ?? attackPayload.opportunityPauseAt ?? null,
    opportunityMessageId: attackPayload.opportunityMessageId ?? null,
    movementActionId: attackPayload.movementActionId ?? null,
    defensiveOnly: attackPayload.defensiveOnly === true,
    movementRisk: attackPayload.movementRisk !== false,
    resolutionComplete: attackPayload.resolutionComplete !== false,
  });

  await postAttackCard(state, null, tempMessage.id);
  return { ok: true, state };
}

// ── Phase 2: Retaliate Button Clicked ────────────────────────────────────────

/**
 * Handles a click on "Retaliate" or "Intercept" buttons on the attack card.
 * Retaliate always answers as the clash target. Intercept answers as the
 * currently selected token.
 *
 * @param {ClashStateData} state
 * @param {object} [options]
 * @param {boolean} [options.isIntercept=false]
 * @returns {Promise<void>}
 */
export async function handleRetaliateClick(state, { isIntercept = false } = {}) {
  const { actor, tokenId } = isIntercept ? _getSelectedRetaliator() : _getClashTargetRetaliator(state);
  if (isIntercept) {
    // Block if the clash is already in progress or resolved.
    if (state.phase !== CLASH_PHASES.PENDING) {
      ui.notifications.warn(game.i18n.localize("PMTTRPG.Clash.AlreadyRetaliating"));
      return;
    }
    if (!actor || !canActAs(actor, tokenId)) {
      ui.notifications.warn(game.i18n.localize("PMTTRPG.Clash.NoOwnedActor"));
      return;
    }
    if (!await showInterceptConfirmDialog(actor.name)) return;
  }
  return _retaliate(state, {
    actor,
    tokenId,
    titleKey: isIntercept ? "PMTTRPG.Clash.InterceptTitle" : null,
    intercept: isIntercept,
    interceptionRequest: null,
  });
}

export async function handleProtectClick(state) {
  if (state?.phase !== CLASH_PHASES.PENDING) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.Clash.AlreadyRetaliating"));
    return;
  }
  const combat = clashCombat(state);
  const attacker = resolveTokenOrWorldActor(state.attackerActorId, state.attackerTokenId);
  const attackerItem = state.attackerItemId ? (attacker?.items.get(state.attackerItemId) ?? null) : null;
  const ctx = interceptionContextFromClash(state, { combat, attackerItem });
  const candidates = ctx ? listInterceptors(ctx) : [];
  const mine = candidates.filter((candidate) => {
    const actor = resolveTokenOrWorldActor(candidate.actorId, candidate.tokenId);
    return actor && canActAs(actor, candidate.tokenId, game.user);
  });
  if (!mine.length) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.Clash.ProtectUnavailable"));
    return;
  }
  const chosen = mine.length === 1 ? mine[0] : await _pickProtector(mine);
  if (!chosen) return;
  const actor = resolveTokenOrWorldActor(chosen.actorId, chosen.tokenId);
  return _retaliate(state, {
    actor,
    tokenId: chosen.tokenId,
    allowedTypes: chosen.allowedDefenses,
    titleKey: "PMTTRPG.Clash.ProtectTitle",
    interceptionRequest: {
      sourceId: chosen.sourceId,
      combatantId: chosen.combatantId,
      tokenId: chosen.tokenId,
      actorId: chosen.actorId,
      itemId: null,
    },
  });
}

async function _retaliate(state, {
  actor,
  tokenId,
  allowedTypes = null,
  titleKey = null,
  intercept = false,
  interceptionRequest = null,
} = {}) {
  if (state.phase !== CLASH_PHASES.PENDING) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.Clash.AlreadyRetaliating"));
    return;
  }
  if (!actor) {
    ui.notifications.warn(game.i18n.localize(interceptionRequest ? "PMTTRPG.Clash.ProtectUnavailable" : "PMTTRPG.Clash.NoClashTarget"));
    return;
  }
  if (!canActAs(actor, tokenId)) {
    ui.notifications.warn(game.i18n.localize(interceptionRequest ? "PMTTRPG.Clash.ProtectUnavailable" : "PMTTRPG.Clash.NotTargetOwner"));
    return;
  }
  if (_retaliationInFlight.has(state.attackMessageId)) return;
  _retaliationInFlight.add(state.attackMessageId);
  try {
    const retaliationCombat = clashCombat(state);
    const choice = await showRetaliationDialog(actor, state, {
      retaliatorTokenId: tokenId,
      defensiveOnly: state.defensiveOnly === true,
      allowedTypes,
      titleKey,
      protectedName: interceptionRequest ? state.targetName : null,
      combat: retaliationCombat,
    });
    if (!choice) return;
    if (allowedTypes && !allowedTypes.includes(retaliationDefenseKind(choice.type))) {
      ui.notifications.warn(game.i18n.localize("PMTTRPG.Clash.ProtectUnavailable"));
      return;
    }
    if (choice.type === RETALIATION_TYPES.RECYCLED_EVADE && !getRecycledEvade(actor)) {
      ui.notifications.warn(game.i18n.localize("PMTTRPG.Clash.RecycledEvadeGone"));
      return;
    }
    if (choice.type === RETALIATION_TYPES.COUNTER && PMTTRPGUtility.isRangedWeapon(choice.item)) {
      const ammoPick = await promptRangedAmmo(actor, choice.item, {
        shootLabel: game.i18n.localize("PMTTRPG.Clash.Counter"),
      });
      if (!ammoPick) return;
      choice.ammo = ammoPick.ammo;
      choice.consumeAmmo = ammoPick.consumeAmmo;
      choice.dryFire = ammoPick.dryFire;
    }
    if (!canConsumeAppliedTool(choice.appliedTool, choice.consumeAppliedTool !== false)) {
      ui.notifications.warn(game.i18n.localize("PMTTRPG.Dialog.noToolUses"));
      return;
    }
    if (choice.consumeReaction !== false && !canPayRetaliation(actor, choice.type, choice.item, { tokenId, state, combat: retaliationCombat })) {
      ui.notifications.warn(game.i18n.localize("PMTTRPG.Clash.OptionUnavailable"));
      return;
    }
    // Lock the card immediately so no one else retaliates.
    const claim = await _claimRetaliation(state.attackMessageId, {
      retaliatorActor: actor,
      retaliatorTokenId: tokenId,
      choice,
      intercept,
      interceptionRequest: interceptionRequest
        ? { ...interceptionRequest, itemId: choice.item?.id ?? null }
        : null,
    });
    if (!claim.ok) {
      let key = "PMTTRPG.Clash.AlreadyRetaliating";
      if (interceptionRequest && (claim.reason === "interception-invalid" || claim.reason === "not-owner")) key = "PMTTRPG.Clash.ProtectUnavailable";
      else if (intercept && claim.reason === "not-owner") key = "PMTTRPG.Clash.NoOwnedActor";
      else if (!interceptionRequest && claim.reason === "not-owner") key = "PMTTRPG.Clash.NotTargetOwner";
      ui.notifications.warn(game.i18n.localize(key));
      return;
    }
    try {
      await _executeClash(claim.state, actor, choice);
    } catch (error) {
      console.error("[PMTTRPG] Clash execution failed", error);
      unlockClashState(claim.state);
      const saved = await persistClashState(claim.state);
      // The ATTACK gets marked on the state before any other cost is paid. These tell us
      // if anything was paid.
      const paid = claim.state.skipAttackerEconomy === true
        || claim.state.attackerEconomyCommitted === true
        || (claim.state.defenderEconomyCommitments?.length ?? 0) > 0;
      if (saved) {
        ui.notifications.error(game.i18n.localize(paid ? "PMTTRPG.Clash.ExecutionFailed" : "PMTTRPG.Clash.ExecutionFailedUnpaid"));
      }
    }
  } finally {
    _retaliationInFlight.delete(state.attackMessageId);
  }
}

const _retaliationInFlight = new Set();

async function _pickProtector(candidates) {
  const rows = candidates.map((candidate) => {
    const actor = resolveTokenOrWorldActor(candidate.actorId, candidate.tokenId);
    return { id: candidate.combatantId, name: actor?.name ?? candidate.combatantId };
  });
  const html = await foundry.applications.handlebars.renderTemplate(
    "systems/projectmoonttrpg/templates/dialog/protect-interceptor-picker.hbs",
    { rows, i18n: { hint: game.i18n.localize("PMTTRPG.Clash.ProtectPick") } },
  );
  const id = await waitForWindowChoice({
    window: { title: game.i18n.localize("PMTTRPG.Clash.ProtectTitle") },
    content: html,
    buttons: [
      cancelButton(),
      confirmButton((_event, _button, dialog) => dialog.element.querySelector("[name='combatantId']:checked")?.value ?? null),
    ],
    rejectClose: false,
  });
  return candidates.find((candidate) => candidate.combatantId === id) ?? null;
}

async function _claimRetaliation(messageId, { retaliatorActor, retaliatorTokenId, choice, intercept = false, interceptionRequest = null }) {
  const patch = {
    retaliatorActorId: retaliatorActor.id,
    retaliatorTokenId,
    retaliatorName: retaliatorActor.name,
    retaliatorImg: retaliatorActor.img,
    retaliationItemId: choice.item?.id ?? null,
    retaliatorItemName: _retaliatorItemLabel(choice),
    retaliationType: choice.type,
    retaliatorAmmoId: choice.dryFire ? null : (choice.ammo?.id ?? null),
    retaliatorSkillId: choice.skillItem?.id ?? null,
    retaliatorAppliedToolId: choice.skillItem ? null : (choice.appliedTool?.id ?? null),
    defenderConsume: choice.consumeReaction !== false,
    interceptionRequest,
  };
  const { getPrimaryGM, runOnPrimaryGM } = await import("../easy-effects/gm-route.js");
  const gm = getPrimaryGM();
  if (!gm) _warnClaimWithoutGM();
  return claimClashRetaliation({
    readState: () => getClashStateFromMessage(messageId),
    confirmClaim: (claimId) => _confirmClaim(messageId, claimId),
    randomId: () => foundry.utils.randomID(),
    commitClaim: async (claimId) => {
      const payload = { messageId, claimId, patch, intercept };
      if (gm && game.user.id !== gm.id) return runOnPrimaryGM("claimClashCard", payload);
      return commitClashClaimAsGM(payload, { fromUserId: game.user.id });
    },
  });
}

let _claimWithoutGMWarned = false;
function _warnClaimWithoutGM() {
  if (_claimWithoutGMWarned) return;
  _claimWithoutGMWarned = true;
  const text = game.i18n.localize("PMTTRPG.Clash.NoPrimaryGM");
  ui.notifications.warn(text);
  console.warn(`[PMTTRPG] ${text}`);
}

/**
 * Authors and GMs will update the message directly while everyone else relays
 * through the GM. Unfortunately two claims relayed at the same time can still
 * race (last write wins).
 */
function _confirmClaim(messageId, claimId) {
  const message = game.messages.get(messageId);
  if (!message) return "unconfirmed";

  const judge = () => {
    const current = getClashStateFromMessage(messageId);
    if (current?.phase !== CLASH_PHASES.ROLLING || !current.claimId) return null;
    return current.claimId === claimId ? "won" : "lost";
  };

  if (message.isAuthor || game.user.isGM) return judge() ?? "unconfirmed";

  return new Promise((resolve) => {
    let settled = false;
    let hookId = null;
    let timer = null;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (hookId != null) Hooks.off("updateChatMessage", hookId);
      resolve(outcome);
    };
    hookId = Hooks.on("updateChatMessage", (updated) => {
      if (updated?.id !== messageId) return;
      const outcome = judge();
      if (outcome) finish(outcome);
    });
    timer = setTimeout(() => finish("unconfirmed"), CLAIM_CONFIRM_TIMEOUT_MS);
    const immediate = judge();
    if (immediate) finish(immediate);
  });
}

// ── Phase 3: Execute Clash ────────────────────────────────────────────────────

/**
 * Executes both sides of the clash, resolves the result, fires EasyEffects
 * hooks, and posts the result card.
 *
 * The order is resource preflight, ATTACK declaration, the attacker's secondary
 * resources, defender Reactions, the defender's secondary resources,
 * [On Clash Start], then the dice. If something fails here then nothing will roll.
 *
 * @param {ClashStateData} state
 * @param {ActorPMTTRPG}   retaliatorActor
 * @param {RetaliationChoice} choice
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function _executeClash(state, retaliatorActor, choice) {
  const combat = clashCombat(state);
  const attackerActor = resolveClashCombatant(state.attackerActorId, state.attackerTokenId);
  let attackerItem   = attackerActor?.items.get(state.attackerItemId) ?? null;
  const appliedTool  = state.appliedToolId
    ? (attackerActor?.items.get(state.appliedToolId) ?? null)
    : null;
  const attackerSkill = state.attackerSkillId
    ? (attackerActor?.items.get(state.attackerSkillId) ?? null)
    : null;
  const attackerAmmo = (!state.attackerDryFire && state.attackerAmmoId)
    ? (attackerActor?.items.get(state.attackerAmmoId) ?? null)
    : null;

  if(choice.type === RETALIATION_TYPES.ONESIDED) {
    choice.item = null;
    choice.skillItem = null;
    choice.appliedTool = null;
    choice.ammo = null;
    choice.dryFire = false;
    state.retaliationItemId = null;
    state.retaliatorItemName = null;
    state.retaliatorAmmoId = null;
    state.retaliatorSkillId = null;
    state.retaliatorAppliedToolId = null;
  }

  let isRecycled = choice.type === RETALIATION_TYPES.RECYCLED_EVADE || choice.recycled === true;
  if (isRecycled && !getRecycledEvade(retaliatorActor)) {
    isRecycled = false;
    choice.type = RETALIATION_TYPES.EVADE;
    choice.recycled = false;
    state.retaliationType = RETALIATION_TYPES.EVADE;
    ui.notifications.warn(game.i18n.localize("PMTTRPG.Clash.RecycledEvadeGone"));
  }

  const defenderSkill = choice.skillItem ?? null;
  let defenderAppliedTool = choice.skillItem ? null : (choice.appliedTool ?? null);
  const defenderAmmo = (choice.dryFire || !choice.ammo) ? null : choice.ammo;

  const attackerPreflight = preflightAttackerResources(state, { attackerAmmo });
  if (!attackerPreflight.ok) {
    return _abortClash(state, { key: "PMTTRPG.Clash.AmmoUnavailable", reason: attackerPreflight.reason });
  }
  const defenderPreflight = preflightDefenderResources(choice);
  if (!defenderPreflight.ok) {
    return _abortClash(state, { key: "PMTTRPG.Clash.AmmoUnavailable", reason: defenderPreflight.reason });
  }
  if (defenderAppliedTool && !canConsumeAppliedTool(defenderAppliedTool, choice.consumeAppliedTool !== false)) {
    return _abortClash(state, { key: "PMTTRPG.Dialog.noToolUses", reason: "tool-unavailable" });
  }

  const counterDryFire = choice.type === RETALIATION_TYPES.COUNTER
    && (PMTTRPGUtility.isRangedWeapon(choice.item) && (choice.dryFire === true || !choice.ammo));

  // Rebuild clash context so EasyEffects On Clash can add bonuses before the roll.
  // Built before the declarations, so the processors and [On Action] get the live clash too.
  const clashCtx = createClashContext();
  clashCtx.isRecycledEvade = isRecycled;
  clashCtx.attackerReaction = state.attackerEconomyType === ECONOMY_TYPES.REACTION
    || state.attackerAsReaction === true
    || state.opportunityAttack === true;
  clashCtx.defenderReaction = choice.type !== RETALIATION_TYPES.ONESIDED;
  clashCtx.attackerSkill = attackerSkill;
  clashCtx.defenderSkill = defenderSkill;
  clashCtx.appliedTool = appliedTool;
  clashCtx.defenderAppliedTool = defenderAppliedTool;
  const defenderItem = choice.item ?? null;

  const liveInterception = revalidateInterception(state, {
    combat,
    retaliationType: choice.type,
    actor: retaliatorActor,
    item: choice.item ?? null,
    fromUser: game.user,
    attackerItem,
    requireAffordable: !!state.interception && choice.consumeReaction !== false,
  });
  if (state.interception && !liveInterception.ok) {
    return _abortClash(state, { key: "PMTTRPG.Clash.ProtectUnavailable", reason: liveInterception.reason });
  }
  if (state.interception && String(retaliatorActor?.id ?? "") !== String(liveInterception.interception?.interceptorActorId ?? "")) {
    return _abortClash(state, { key: "PMTTRPG.Clash.ProtectUnavailable", reason: "interceptor-mismatch" });
  }
  const defenderCombatant = combatantForReactionToken(retaliatorActor, state.retaliatorTokenId, combat);
  const coverCheck = canTargetWithAttack({
    attackerItem,
    targetCombatant: defenderCombatant,
    combat,
  });
  if (!coverCheck.ok) {
    return _abortClash(state, { key: "PMTTRPG.Attack.TargetInFullCover", reason: "full-cover" });
  }
  clashCtx.interception = liveInterception.interception
    ? { ...liveInterception.interception }
    : null;

  const attackerEconomy = await declareClashAttackerEconomy({
    state,
    attackerActor,
    attackerItem,
    retaliatorActor,
    clash: clashCtx,
    declare: declareActorAction,
    combat,
  });
  if (attackerEconomy.required && !attackerEconomy.ok) {
    return _abortClash(state, {
      key: clashEconomyAbortKey(attackerEconomy.reason, "PMTTRPG.Clash.AttackerCannotPay"),
      data: { name: attackerActor?.name ?? state.attackerName ?? "" },
      reason: "attacker-economy",
    });
  }
  if (attackerEconomy.ok && attackerEconomy.declaration) {
    markAttackerEconomyCommitted(state, attackerEconomy.declaration);
    if (!(await persistClashState(state))) {
      return { ok: false, reason: "economy-persist-failed" };
    }
  }

  // Attacker resources get paid right after the ATTACK. If the defender's declaration
  // fails, the retry only redoes the defense.
  const attackerResources = await commitAttackerResources(state, {
    attackerActor,
    attackerSkill,
    attackerAmmo,
    consumeAmmunition: consumeAmmunitionCharge,
    spendSkillLight: _spendSkillLight,
    exhaustMovement: exhaustRemainingSquares,
  });
  if (!attackerResources.ok) {
    console.error("[PMTTRPG] attacker resources failed after ATTACK declaration", attackerResources.error);
    return _abortClash(state, { key: "PMTTRPG.Clash.ResourceCommitFailed", reason: "attacker-resources", error: true });
  }

  const defenderEconomy = await declareClashDefenderEconomy({
    state,
    retaliatorActor,
    attackerActor,
    choice,
    isRecycled,
    clash: clashCtx,
    declare: declareActorAction,
    combat,
  });
  if (defenderEconomy.required && !defenderEconomy.ok) {
    return _abortClash(state, {
      key: clashEconomyAbortKey(defenderEconomy.reason, "PMTTRPG.Clash.DefenderCannotPay"),
      data: { name: retaliatorActor?.name ?? "" },
      reason: "defender-economy",
    });
  }
  if (defenderEconomy.declaration) {
    markDefenderEconomyCommitted(state, {
      ...defenderEconomy.identity,
      declaration: defenderEconomy.declaration,
    });
    if (!(await persistClashState(state))) {
      return { ok: false, reason: "economy-persist-failed" };
    }
  }

  // An Opportunity Attack still gets its grant even though its economy was paid somewhere else.
  await applyClashAssist({
    state,
    choice,
    attackerCombatant: resolveClashAttackerCombatant(state, attackerActor, combat),
    retaliatorCombatant: combatantForReactionToken(retaliatorActor, state.retaliatorTokenId, combat),
    clash: clashCtx,
    combat,
    consume: claimAssistForRoll,
    warn: () => ui.notifications.warn(game.i18n.localize("PMTTRPG.Assist.Unavailable")),
  });

  if (!isRecycled && REACTIONS_THAT_CLEAR_RECYCLED.has(choice.type)) {
    await clearRecycledEvade(retaliatorActor);
  }
  if (attackerSkill) {
    Hooks.callAll("pmttrpg.skillUseStart", { actor: attackerActor, skillItem: attackerSkill });
  }
  if (defenderSkill) {
    Hooks.callAll("pmttrpg.skillUseStart", { actor: retaliatorActor, skillItem: defenderSkill });
  }
  if (defenderSkill && choice.consumeSkillLight !== false) {
    await _spendSkillLight(retaliatorActor, defenderSkill);
  }

  // Consume ammo once for the Counter Reaction.
  if (choice.ammo && choice.consumeAmmo) {
    await consumeAmmunitionCharge(choice.ammo, { actor: retaliatorActor });
  }

  if (defenderAppliedTool) {
    const ok = await maybeConsumeAppliedTool(defenderAppliedTool, {
      consume: choice.consumeAppliedTool !== false,
    });
    if (!ok) {
      ui.notifications.warn(game.i18n.localize("PMTTRPG.Dialog.noToolUses"));
      defenderAppliedTool = null;
      clashCtx.defenderAppliedTool = null;
    } else {
      await emitAppliedToolHooks({
        actor: retaliatorActor,
        tool: defenderAppliedTool,
        hostItem: choice.item ?? null,
        target: attackerActor,
        actionType: _reactionAppliedToolActionType(choice.type),
      });
    }
  }

  const clashPayloadBase = {
    attacker:     attackerActor,
    defender:     retaliatorActor,
    attackerItem,
    defenderItem,
    appliedTool,
    defenderAppliedTool,
    attackerSkill,
    defenderSkill,
    attackerAmmo,
    defenderAmmo,
    retaliationType: choice.type,
    isRecycledEvade: isRecycled,
    clash:        clashCtx,
  };

  await emitClashStarted({ ...clashPayloadBase, side: "attacker" });
  await emitClashStarted({ ...clashPayloadBase, side: "defender" });

  if (state.attackerDryFire) {
    clashCtx.bonuses.attacker.disadvantage =
      (Number(clashCtx.bonuses.attacker.disadvantage) || 0) + 1;
  }
  if (counterDryFire) {
    clashCtx.bonuses.defender.disadvantage =
      (Number(clashCtx.bonuses.defender.disadvantage) || 0) + 1;
  }
  if (isRecycled) {
    clashCtx.bonuses.defender.evadePower =
      (Number(clashCtx.bonuses.defender.evadePower) || 0) + recycledPowerPenalty(retaliatorActor);
  }
  applyGrappleClashAdjustments(clashCtx, { state, choice, combat });
  applyCoverClashAdjustments(clashCtx, { state, choice, attackerItem, combat });

  state.clashBonuses = foundry.utils.deepClone(clashCtx.bonuses);

  let [attackResult, defenseResult] = await Promise.all([
    rollAttack(attackerActor, attackerItem, clashCtx.bonuses.attacker, { skillItem: attackerSkill }),
    _rollDefense(
      retaliatorActor,
      choice,
      attackerItem,
      clashCtx.bonuses.defender,
      { skillItem: defenderSkill },
    ),
  ]);

  let attackTotal = attackResult.total;
  state.attackRollTotal = attackTotal;
  state.attackRollFormula = attackResult.formula;
  state.attackRollTerms = attackResult.terms;
  state.attackRollBreakdown = attackResult.breakdown ?? null;

  try {
    await game.projectmoonttrpg?.statusMacros?.emitAttackRoll({
      actor: attackerActor,
      actorId: attackerActor?.id ?? null,
      item: attackerItem,
      itemId: attackerItem?.id ?? null,
      roll: attackResult.roll,
      clash: clashCtx,
      clashBonuses: clashCtx.bonuses,
      rollBreakdown: attackResult.breakdown ?? [],
      targetActorId: retaliatorActor?.id ?? state.targetActorId,
      targetTokenId: state.retaliatorTokenId ?? state.targetTokenId,
      targetName: retaliatorActor?.name ?? state.targetName,
    });
  } catch (error) {
    console.warn("[PMTTRPG] Attack roll hook failed", error);
  }

  let { result, margin } = resolveClash(attackTotal, defenseResult.total);

  if (choice.type === RETALIATION_TYPES.ONESIDED) {
    result = CLASH_RESULTS.ATTACK_WIN;
    margin = Math.max(0, attackTotal);
  }

  while (result === CLASH_RESULTS.TIE && choice.type !== RETALIATION_TYPES.ONESIDED) {
    const [attackReroll, defenseReroll] = await Promise.all([
      rollAttack(attackerActor, attackerItem, clashCtx.bonuses.attacker, { skillItem: attackerSkill }),
      _rollDefense(
        retaliatorActor,
        choice,
        attackerItem,
        clashCtx.bonuses.defender,
        { skillItem: defenderSkill },
      ),
    ]);
    attackResult = attackReroll;
    defenseResult = defenseReroll;
    attackTotal = attackReroll.total;
    state.attackRollTotal = attackTotal;
    state.attackRollFormula = attackReroll.formula;
    state.attackRollTerms = attackReroll.terms;
    state.attackRollBreakdown = attackReroll.breakdown ?? state.attackRollBreakdown;
    ({ result, margin } = resolveClash(attackTotal, defenseResult.total));
  }

  // Update clash context with final rolls.
  clashCtx.attackerRoll = attackTotal;
  clashCtx.defenderRoll = defenseResult.total;
  clashCtx.margin       = margin;

  state.defenseRollTotal   = defenseResult.total;
  state.defenseRollFormula = defenseResult.formula;
  state.defenseRollTerms   = defenseResult.terms;
  state.defenseRollBreakdown = defenseResult.breakdown ?? null;
  state.result             = result;
  state.margin             = margin;

  await emitDamageCalc({
    attacker:     attackerActor,
    defender:     retaliatorActor,
    attackerItem,
    appliedTool,
    defenderAppliedTool,
    attackerSkill,
    defenderSkill,
    attackerAmmo,
    clash:        clashCtx,
  });

  // Compute damage using accumulated bonuses.
  // - Attack win: Block Lose reduces by margin; Counter/Evade/one-sided keep full attack.
  // - Counter win: attacker takes the counter.
  // - Block win: ST rebound to attacker, except ranged attackers.
  const counterItem = choice.type === RETALIATION_TYPES.COUNTER ? (choice.item ?? null) : null;
  let counterConnects = false;

  if (result === CLASH_RESULTS.ATTACK_WIN) {
    const finalResult = state.retaliationType === RETALIATION_TYPES.BLOCK ? margin : attackTotal;
    state.hpDamage = finalResult;
    state.stDamage = finalResult;
  } else if (result === CLASH_RESULTS.DEFENSE_WIN && state.retaliationType === RETALIATION_TYPES.BLOCK) {
    state.blockWinStExempt = PMTTRPGUtility.isRangedWeapon(attackerItem);
    if (!state.blockWinStExempt) {
      const outfit = getEquippedOutfit(retaliatorActor);
      state.stDamage = resolveBlockWinStDamage(
        defenseResult.total,
        margin,
        outfit?.system?.outfitProperty,
      );
    }
  } else if (result === CLASH_RESULTS.DEFENSE_WIN && counterItem) {
    const range = PMTTRPGUtility.getWeaponRangeSquares(counterItem)
      + (Number(clashCtx.bonuses?.defender?.rangeBonus) || 0);
    const inRange = PMTTRPGUtility.getWeaponRangeCheck(
      state.retaliatorTokenId,
      state.attackerTokenId,
      { weaponRange: range },
    ).inRange;
    state.counterInRange = inRange;
    counterConnects = true;
    state.hpDamage = defenseResult.total;
    state.stDamage = defenseResult.total;
    state.damageType = _counterDamageType(counterItem, choice, defenderAppliedTool);
  }

  state.phase    = CLASH_PHASES.RESOLVED;

  // Effective DMG type for this resolution (ammo, unless the weapon has a fixed type).
  clashCtx.damageType = state.damageType;

  // Post result card on the attack message
  state.resultMessageId = state.attackMessageId;
  await postResultCard(
    state,
    defenseResult.roll ?? null,
    state.attackMessageId,
    attackResult.roll ?? null,
  );

  // Fire clash resolution hooks for EasyEffects.
  const winner = result === CLASH_RESULTS.ATTACK_WIN ? attackerActor  : retaliatorActor;
  const loser  = result === CLASH_RESULTS.ATTACK_WIN ? retaliatorActor : attackerActor;

  const resolvedPayload = {
    winner,
    loser,
    attacker:      attackerActor,
    defender:      retaliatorActor,
    attackerItem:  attackerItem,
    defenderItem,
    appliedTool,
    defenderAppliedTool,
    attackerSkill,
    defenderSkill,
    attackerAmmo,
    defenderAmmo,
    retaliationType: choice.type,
    isRecycledEvade: isRecycled,
    attackerRoll:  state.attackRollTotal,
    defenderRoll:  defenseResult.total,
    clash:         clashCtx,
  };

  const attackConnects = result === CLASH_RESULTS.ATTACK_WIN;
  const hitPayload = attackConnects
    ? {
      attacker: attackerActor,
      defender: retaliatorActor,
      item:     attackerItem,
      appliedTool,
      attackerSkill,
      ammo:     attackerAmmo,
      damageType: state.damageType,
      clash:    clashCtx,
    }
    : counterConnects
      ? {
        attacker: retaliatorActor,
        defender: attackerActor,
        item:     counterItem,
        appliedTool: defenderAppliedTool,
        attackerSkill: defenderSkill,
        ammo:     defenderAmmo,
        damageType: state.damageType,
        clash:    clashCtx,
      }
      : null;

  await emitClashOutcome(resolvedPayload, hitPayload);

  if (state.opportunityAttack) {
    try {
      const { finalizeOpportunityAttackFromClash } = await import("./opportunity/opportunity-attack.js");
      await finalizeOpportunityAttackFromClash(state);
    } catch (error) {
      console.warn("[PMTTRPG] Opportunity Attack finalize failed", error);
    }
  }

  if (attackerSkill) {
    Hooks.callAll("pmttrpg.skillUseEnd", { actor: attackerActor, skillItem: attackerSkill });
  }
  if (defenderSkill) {
    Hooks.callAll("pmttrpg.skillUseEnd", { actor: retaliatorActor, skillItem: defenderSkill });
  }

  if (isRecycled && result === CLASH_RESULTS.ATTACK_WIN) {
    await clearRecycledEvade(retaliatorActor);
  } else if (result === CLASH_RESULTS.DEFENSE_WIN && _isEvadeLike(choice)) {
    if (isRecycled) await bumpRecycledEvade(retaliatorActor, choice.item);
    else await grantRecycledEvade(retaliatorActor, choice.item);
  }

  if (hitPayload) {
    await emitAttackConnected(hitPayload);
  }

  if (choice.breakFreeAfterHit && choice.type === RETALIATION_TYPES.ONESIDED) {
    try {
      const { runPostHitBreakFree } = await import("../grapple/break-free.js");
      await runPostHitBreakFree({ retaliatorActor, retaliatorTokenId: state.retaliatorTokenId });
    } catch (error) {
      console.warn("[PMTTRPG] Break Free after the hit failed", error);
    }
  }
  return { ok: true };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _isRangedWeapon(weapon) {
  return weapon?.system?.weaponType === "ranged";
}

async function persistClashState(state) {
  try {
    await updateAttackCard(state.attackMessageId, state);
    return true;
  } catch (error) {
    console.error("[PMTTRPG] clash economy could not be saved", error);
    ui.notifications.error(game.i18n.localize("PMTTRPG.Clash.EconomyPersistFailed"));
    return false;
  }
}

async function _abortClash(state, { key, data = {}, reason, error = false }) {
  unlockClashState(state);
  const saved = await persistClashState(state);
  if (saved && key) {
    const text = game.i18n.format(key, data);
    if (error) ui.notifications.error(text);
    else ui.notifications.warn(text);
  }
  console.warn("[PMTTRPG] Clash aborted before dice", {
    messageId: state.attackMessageId,
    reason: saved ? reason : "economy-persist-failed",
    attackerEconomyCommitted: state.attackerEconomyCommitted === true,
    defenderDeclarationIds: (state.defenderEconomyCommitments ?? []).map((entry) => entry?.declarationId ?? null),
  });
  return { ok: false, reason: saved ? reason : "economy-persist-failed" };
}

function _reactionAppliedToolActionType(type) {
  if (type === RETALIATION_TYPES.COUNTER) return "attack";
  if (type === RETALIATION_TYPES.BLOCK) return "block";
  if (type === RETALIATION_TYPES.EVADE || type === RETALIATION_TYPES.RECYCLED_EVADE) return "evade";
  return "applied";
}

function _counterDamageType(counterItem, choice, appliedTool) {
  if (_isRangedWeapon(counterItem)) {
    return resolveRangedDamageType({
      weapon: counterItem,
      ammo: choice.ammo,
      appliedTool,
      dryFire: choice.dryFire === true || !choice.ammo,
    }) || "none";
  }

  const toolType = normalizeDamageType(appliedTool?.system?.damageType);
  if (toolType) return toolType;
  return normalizeDamageType(counterItem?.system?.damageType) ?? "none";
}

function _rangedAttackConsumesMovement(weapon) {
  if(!PMTTRPGUtility.isRangedWeapon(weapon)) return false;
  const { formProperty } = normalizeWeaponProperties(weapon.system);
  return weapon.system?.formProperty !== "lowCaliber";
}

/**
 * Rolls the defender's side of a clash for the chosen retaliation type.
 * @param {ActorPMTTRPG} retaliatorActor
 * @param {RetaliationChoice} choice
 * @param {Item|null} attackerItem
 * @param {object} bonuses
 * @param {object} [rollOptions]
 * @param {Item|null} [rollOptions.skillItem]
 * @returns {Promise<object>}
 */
async function _rollDefense(retaliatorActor, choice, attackerItem, bonuses, rollOptions = {}) {
  switch (choice.type) {
    case RETALIATION_TYPES.EVADE:
    case RETALIATION_TYPES.RECYCLED_EVADE:
      return rollEvade(retaliatorActor, bonuses, rollOptions);
    case RETALIATION_TYPES.BLOCK:
      return rollBlock(retaliatorActor, bonuses, rollOptions);
    case RETALIATION_TYPES.COUNTER:
      return rollCounter(retaliatorActor, choice.item ?? attackerItem, bonuses, rollOptions);
    case RETALIATION_TYPES.ONESIDED:
      return {
        total:   0,
        formula: "1d1-1",
        terms:   [],
        breakdown: [],
        rollMode: "normal",
      };
    default:
      return rollEvade(retaliatorActor, bonuses, rollOptions);
  }
}

function _isEvadeLike(choice) {
  if (!choice) return false;
  return choice.type === RETALIATION_TYPES.EVADE || choice.type === RETALIATION_TYPES.RECYCLED_EVADE;
}

function _retaliatorItemLabel(choice) {
  const extraName = choice?.skillItem?.name || choice?.appliedTool?.name;
  if (choice?.ammo) {
    const base = `${choice.item?.name ?? ""} · ${choice.ammo.name}`;
    return extraName ? `${base} · ${extraName}` : base;
  }
  if (choice?.dryFire && choice.item) {
    const base = `${choice.item.name} · ${game.i18n.localize("PMTTRPG.Clash.DryFireShort")}`;
    return extraName ? `${base} · ${extraName}` : base;
  }
  if (choice?.type === RETALIATION_TYPES.RECYCLED_EVADE) {
    const recycledTag = game.i18n.localize("PMTTRPG.Clash.RecycledEvadeShort");
    const outfitName = choice.item?.name?.trim();
    const base = outfitName
      ? game.i18n.format("PMTTRPG.Clash.RecycledEvadeItem", { item: outfitName, tag: recycledTag })
      : recycledTag;
    return extraName ? `${base} · ${extraName}` : base;
  }
  const itemName = choice?.item?.name ?? null;
  if (itemName && extraName) return `${itemName} · ${extraName}`;
  return itemName;
}

async function _spendSkillLight(actor, skill) {
  const lightCost = Math.max(0, Number(skill?.system?.lightCost ?? 0));
  if (!actor || lightCost <= 0) return;
  const currentLight = Number(actor.system?.attributes?.light?.value ?? 0);
  const { runAsOwnerOrGM } = await import("../easy-effects/gm-route.js");
  await runAsOwnerOrGM(actor, "applyActorUpdate", {
    update: {
      "system.attributes.light.value": Math.max(0, currentLight - lightCost),
    },
  });
}

function attackTokenId(actor, explicitTokenId = null) {
  if (explicitTokenId) return explicitTokenId;
  if (actor?.isToken) return actor.token?.id ?? null;
  return actor?.getActiveTokens?.(true)?.[0]?.id ?? null;
}

/** Retaliate answers as the clash target. */
function _getClashTargetRetaliator(state) {
  if (state.targetTokenId) {
    const tokenDoc = resolveTokenDocument(state.targetTokenId);
    return { actor: tokenDoc?.actor ?? null, tokenId: tokenDoc?.id ?? null };
  }
  const actor = state.targetActorId ? game.actors.get(state.targetActorId) : null;
  return {
    actor: actor ?? null,
    tokenId: actor?.isToken ? (actor.token?.id ?? null) : null,
  };
}

/**
 * Intercept answers as the currently selected token.
 * @returns {{ actor: Actor|null, tokenId: string|null }}
 */
function _getSelectedRetaliator() {
  const token = canvas.tokens?.controlled?.[0] ?? null;
  if (!token) return { actor: null, tokenId: null };
  return { actor: token.actor ?? null, tokenId: token.id ?? null };
}

// ── Public exports ────────────────────────────────────────────────────────────

export const PMTTRPGClashAPI = {
  initiateAttack,
  handleRetaliateClick,
};