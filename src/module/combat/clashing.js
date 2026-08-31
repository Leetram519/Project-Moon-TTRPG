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
} from "./clash-state.js";

import {
  rollEvade,
  rollAttack,
  rollCounter,
  rollBlock,
  resolveClash,
} from "./clash-rolls.js";

import {
  postAttackCard,
  updateAttackCard,
  postResultCard,
} from "./clash-chat.js";

import {
  showRetaliationDialog,
  showInterceptConfirmDialog,
  promptRangedCounterAmmo,
} from "./clash-dialog.js";

import { createClashContext, emitAttackConnected, emitClashStarted, emitClashOutcome } from "../easy-effects/registry.js";
import { normalizeDamageType, resolveRangedDamageType } from "../damage-application.js";
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

import {PMTTRPGUtility} from '../utility.js';

const REACTIONS_THAT_CLEAR_RECYCLED = new Set([
  RETALIATION_TYPES.EVADE,
  RETALIATION_TYPES.BLOCK,
  RETALIATION_TYPES.COUNTER,
]);

const REACTIONS_THAT_SPEND = new Set([
  RETALIATION_TYPES.BLOCK,
  RETALIATION_TYPES.COUNTER,
  RETALIATION_TYPES.EVADE,
]);

// ── Phase 1: Initiate Attack ──────────────────────────────────────────────────

/**
 * Called when an actor makes an attack with a weapon.
 * Posts the attack card and waits for a retaliator (rolls happen in _executeClash).
 *
 * @param {AttackPayload} attackPayload
 * @returns {Promise<void>}
 */
export async function initiateAttack(attackPayload) {
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

  if (consumeSkillLight) {
    const skill = attackPayload.actor?.items.get(attackerSkillId) ?? null;
    await _spendSkillLight(attackPayload.actor, skill);
  }

  if (_rangedAttackConsumesMovement(attackPayload.item)) {
    try {
      await exhaustRemainingSquares(attackPayload.actor);
    } catch (error) {
      console.warn("[PMTTRPG] exhaust remaining squares failed", error);
    }
  }

  const state = createClashState({
    attackerActorId:   attackPayload.actorId,
    attackerTokenId:   attackPayload.actor.getActiveTokens(true)[0]?.id ?? null,
    attackerName:      attackPayload.actor.name,
    attackerImg:       attackPayload.actor.img,
    attackerItemId:    attackPayload.itemId,
    attackerItemName,
    targetActorId:     attackPayload.targetActorId   ?? null,
    targetTokenId:     attackPayload.targetTokenId   ?? null,
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
    attackerAmmoId:    attackPayload.templateData?.dryFire
      ? null
      : (attackPayload.templateData?.ammoId ?? null),
    consumeSkillLight,
    attackerDryFire:   attackPayload.templateData?.dryFire === true,
  });

  await postAttackCard(state, null, tempMessage.id);
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
  // Block if the clash is already in progress or resolved.
  if (state.phase !== CLASH_PHASES.PENDING) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.Clash.AlreadyRetaliating"));
    return;
  }

  const { actor: retaliatorActor, tokenId: retaliatorTokenId } = isIntercept
    ? _getSelectedRetaliator()
    : _getClashTargetRetaliator(state);

  if (!retaliatorActor) {
    ui.notifications.warn(game.i18n.localize(
      isIntercept ? "PMTTRPG.Clash.NoOwnedActor" : "PMTTRPG.Clash.NoClashTarget"
    ));
    return;
  }

  if (!retaliatorActor.isOwner) {
    ui.notifications.warn(game.i18n.localize(
      isIntercept ? "PMTTRPG.Clash.NoOwnedActor" : "PMTTRPG.Clash.NotTargetOwner"
    ));
    return;
  }

  if (isIntercept) {
    const confirmed = await showInterceptConfirmDialog(retaliatorActor.name);
    if (!confirmed) return;
  }

  const choice = await showRetaliationDialog(retaliatorActor, state, { isIntercept });
  if (!choice) return;
  if (choice.type === RETALIATION_TYPES.RECYCLED_EVADE && !getRecycledEvade(retaliatorActor)) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.Clash.RecycledEvadeGone"));
    return;
  }

  if (choice.type === RETALIATION_TYPES.COUNTER && PMTTRPGUtility.isRangedWeapon(choice.item)) {
    const ammoPick = await promptRangedCounterAmmo(retaliatorActor, choice.item);
    if (!ammoPick) return;
    choice.ammo = ammoPick.ammo;
    choice.consumeAmmo = ammoPick.consumeAmmo;
    choice.dryFire = ammoPick.dryFire;
  }

  if (!canConsumeAppliedTool(choice.appliedTool, choice.consumeAppliedTool !== false)) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.Dialog.noToolUses"));
    return;
  }

  // Lock the card immediately so no one else retaliates.
  state.phase               = CLASH_PHASES.ROLLING;
  state.retaliatorActorId   = retaliatorActor.id;
  state.retaliatorTokenId   = retaliatorTokenId;
  state.retaliatorName      = retaliatorActor.name;
  state.retaliatorImg       = retaliatorActor.img;
  state.retaliationItemId   = choice.item?.id ?? null;
  state.retaliatorItemName  = _retaliatorItemLabel(choice);
  state.retaliationType     = choice.type;
  state.retaliatorAmmoId    = choice.dryFire ? null : (choice.ammo?.id ?? null);

  await updateAttackCard(state.attackMessageId, state);
  await _executeClash(state, retaliatorActor, choice);
}

// ── Phase 3: Execute Clash ────────────────────────────────────────────────────

/**
 * Executes both sides of the clash, resolves the result, fires EasyEffects
 * hooks, and posts the result card.
 *
 * @param {ClashStateData} state
 * @param {ActorPMTTRPG}   retaliatorActor
 * @param {RetaliationChoice} choice
 * @returns {Promise<void>}
 */
async function _executeClash(state, retaliatorActor, choice) {
  const attackerActor = canvas.tokens.get(state?.attackerTokenId ?? null)?.actor ?? game.actors.get(state.attackerActorId) ?? null;
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
  }

  let isRecycled = choice.type === RETALIATION_TYPES.RECYCLED_EVADE || choice.recycled === true;
  if (isRecycled && !getRecycledEvade(retaliatorActor)) {
    isRecycled = false;
    choice.type = RETALIATION_TYPES.EVADE;
    choice.recycled = false;
    state.retaliationType = RETALIATION_TYPES.EVADE;
    ui.notifications.warn(game.i18n.localize("PMTTRPG.Clash.RecycledEvadeGone"));
  }
  if (!isRecycled && REACTIONS_THAT_CLEAR_RECYCLED.has(choice.type)) {
    await clearRecycledEvade(retaliatorActor);
  }

  const defenderSkill = choice.skillItem ?? null;
  let defenderAppliedTool = choice.skillItem ? null : (choice.appliedTool ?? null);
  const defenderAmmo = (choice.dryFire || !choice.ammo) ? null : choice.ammo;
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
    const qty = Number(choice.ammo.system?.quantity ?? 0);
    if (qty > 0) {
      await choice.ammo.update({ "system.quantity": Math.max(0, qty - 1) });
    }
  }

  if (defenderAppliedTool) {
    const ok = await maybeConsumeAppliedTool(defenderAppliedTool, {
      consume: choice.consumeAppliedTool !== false,
    });
    if (!ok) {
      ui.notifications.warn(game.i18n.localize("PMTTRPG.Dialog.noToolUses"));
      defenderAppliedTool = null;
    } else {
      emitAppliedToolHooks({
        actor: retaliatorActor,
        tool: defenderAppliedTool,
        hostItem: choice.item ?? null,
        target: attackerActor,
        actionType: _reactionAppliedToolActionType(choice.type),
      });
    }
  }

  const counterDryFire = choice.type === RETALIATION_TYPES.COUNTER
    && (PMTTRPGUtility.isRangedWeapon(choice.item) && (choice.dryFire === true || !choice.ammo));

  // Rebuild clash context so EasyEffects On Clash can add bonuses before the roll.
  const clashCtx = createClashContext();
  clashCtx.isRecycledEvade = isRecycled;
  clashCtx.attackerSkill = attackerSkill;
  clashCtx.defenderSkill = defenderSkill;
  clashCtx.appliedTool = appliedTool;
  clashCtx.defenderAppliedTool = defenderAppliedTool;
  const defenderItem = choice.item ?? null;
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

  await _spendClashActionEconomy({
    attackerActor,
    retaliatorActor,
    choice,
    isRecycled,
    clash: clashCtx,
  });

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

  state.clashBonuses = foundry.utils.deepClone(clashCtx.bonuses);

  let [attackResult, defenseResult] = await Promise.all([
    rollAttack(attackerActor, attackerItem, clashCtx.bonuses.attacker),
    _rollDefense(
      retaliatorActor,
      choice,
      attackerItem,
      clashCtx.bonuses.defender,
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
      rollAttack(attackerActor, attackerItem, clashCtx.bonuses.attacker),
      _rollDefense(
        retaliatorActor,
        choice,
        attackerItem,
        clashCtx.bonuses.defender,
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

  // Fire EasyEffects On Damage Calc before computing damage so bonuses accumulate.
  Hooks.callAll("pmttrpg.damageCalc", {
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
  // - Counter win: if original attacker is in counter weapon range, they take the counter.
  // - Block win: ST rebound to attacker, except ranged attackers.
  const counterItem = choice.type === RETALIATION_TYPES.COUNTER ? (choice.item ?? null) : null;
  let counterConnects = false;

  if (result === CLASH_RESULTS.ATTACK_WIN) {
    const finalResult = state.retaliationType === RETALIATION_TYPES.BLOCK ? margin : attackTotal;
    state.hpDamage = finalResult;
    state.stDamage = finalResult;
  } else if (result === CLASH_RESULTS.DEFENSE_WIN && state.retaliationType === RETALIATION_TYPES.BLOCK) {
    state.blockWinStExempt = PMTTRPGUtility.isRangedWeapon(attackerItem);
  } else if (result === CLASH_RESULTS.DEFENSE_WIN && counterItem) {
    const inRange = PMTTRPGUtility.isTargetInWeaponRange(
      state.retaliatorTokenId,
      state.attackerTokenId,
      {weapon: counterItem},
    );
    state.counterInRange = inRange;
    if (inRange) {
      counterConnects = true;
      state.hpDamage = defenseResult.total;
      state.stDamage = defenseResult.total;
      state.damageType = _counterDamageType(counterItem, choice, defenderAppliedTool);
    }
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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _isRangedWeapon(weapon) {
  return weapon?.system?.weaponType === "ranged";
}

/**
 * Spend Action (attacker) or Reaction (block / counter / evade) and run [On Action].
 */
async function _spendClashActionEconomy({
  attackerActor,
  retaliatorActor,
  choice,
  isRecycled,
  clash,
}) {
  const payload = {
    attacker: attackerActor,
    defender: retaliatorActor,
    clash,
  };
  const silent = { warn: false };
  if (attackerActor) {
    await attackerActor.useActionEconomy("action", {
      ...payload,
      target: retaliatorActor,
    }, silent);
  }
  if (isRecycled || !retaliatorActor) return;
  if (!REACTIONS_THAT_SPEND.has(choice?.type)) return;
  await retaliatorActor.useActionEconomy("reaction", {
    ...payload,
    target: attackerActor,
    reactionType: choice.type,
  }, silent);
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
  await actor.update({
    "system.attributes.light.value": Math.max(0, currentLight - lightCost),
  });
}

/**
 * Retaliate answers as the clash target.
 * @param {ClashStateData} state
 * @returns {{ actor: Actor|null, tokenId: string|null }}
 */
function _getClashTargetRetaliator(state) {
  const token = state.targetTokenId ? canvas.tokens?.get(state.targetTokenId) : null;
  if (token?.actor) return { actor: token.actor, tokenId: token.id };

  const actor = state.targetActorId ? game.actors.get(state.targetActorId) : null;
  return {
    actor: actor ?? null,
    tokenId: state.targetTokenId ?? actor?.getActiveTokens(true)[0]?.id ?? null,
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