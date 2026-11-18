/**
 * Break Free is a resisted Fortitude or Justice Challenge with a penalty equal to the
 * Grappler's Fortitude. Each failure by the target gives them another +1.
 */

import { GRAPPLE_OPS, requestGrappleMutation } from "./grapple-authority.js";
import { grapplerBreakFreePenalty } from "./grapple-restrictions.js";
import { findRelationshipForTarget, listGrappleRelationships } from "./grapple-state.js";
import {
  collectRollChoices,
  declareAction,
  notifyGrappleReason,
  pickGrappleRelationship,
  postGrappleEnded,
  refuseGrapple,
  resolveGrappleSource,
} from "./grapple.js";
import { combatantName, combatantOf } from "../combat/combatant-match.js";
import { warnUser } from "../shared-helpers.js";
import { ACTION_KINDS, ECONOMY_TYPES } from "../action-economy/kinds.js";
import { combatantForReactionToken } from "../action-economy/reaction-credits.js";
import { waitForWindowChoice } from "../apps/dialog-wait.js";

const SUCCESS_RESULTS = new Set(["success", "partial"]);

const BREAK_FREE_MODES = { ACTION: "action", REACTION: "reaction" };

async function promptBreakFreeStat() {
  const hint = game.i18n.localize("PMTTRPG.Grapple.BreakFreeStatHint");
  const choice = await waitForWindowChoice({
    window: { title: game.i18n.localize("PMTTRPG.ActionMenu.BreakFree") },
    content: `<div class="action-weapon-form"><p class="action-weapon-form__hint">${hint}</p></div>`,
    buttons: [
      { action: "for", label: game.i18n.localize("PMTTRPG.AbilityFor"), default: true },
      { action: "jus", label: game.i18n.localize("PMTTRPG.AbilityJus") },
    ],
    rejectClose: false,
  });
  return choice === "for" || choice === "jus" ? choice : null;
}

async function rollStat(args) {
  const { PMTTRPGRolls } = await import("../rolls.js");
  return args.choices ? PMTTRPGRolls.rollStatWithChoices(args) : PMTTRPGRolls.doStatRoll(args);
}

/** The caller has to declare the Action or Reaction before calling this. */
async function resolveBreakFree({ combat, relationship, actor, combatant, stat, choices = null, mode = BREAK_FREE_MODES.ACTION }) {
  const isTarget = combatant?.id === relationship.targetCombatantId;
  const penalty = grapplerBreakFreePenalty(combat, relationship);
  const statModifier = -penalty + (isTarget ? relationship.failureBonus : 0);
  const result = await rollStat({
    actor,
    stat,
    choices,
    label: game.i18n.localize("PMTTRPG.ActionMenu.BreakFree"),
    templateData: { title: game.i18n.localize("PMTTRPG.ActionMenu.BreakFree") },
    statModifier,
    tokenId: combatant?.tokenId ?? null,
    combatant,
    rollModeSources: mode === BREAK_FREE_MODES.REACTION ? { disadvantage: 1 } : null,
    returnResult: true,
  });
  if (!result || typeof result !== "object") return { ok: false, reason: "roll-cancelled" };

  const success = SUCCESS_RESULTS.has(result.resultType);
  if (success) {
    const done = await requestGrappleMutation(combat, GRAPPLE_OPS.COMPLETE_BREAK_FREE, { relationshipId: relationship.id });
    if (done?.ok) void postGrappleEnded(combat, relationship, { labelKey: "PMTTRPG.Grapple.EndedBreakFree" });
  } else if (isTarget) {
    await requestGrappleMutation(combat, GRAPPLE_OPS.INCREMENT_FAILURE_BONUS, { relationshipId: relationship.id, attemptId: foundry.utils.randomID() });
  }
  return { ok: true, success, resultType: result.resultType, total: result.total, statModifier };
}

/** Break Free as an Action, by the target or anyone else. */
export async function startBreakFree(actor, options = {}) {
  if (!actor) return { ok: false, reason: "invalid-actor" };
  const ctx = resolveGrappleSource(actor, options, { kind: ACTION_KINDS.BREAK_FREE });
  if (!ctx.ok) {
    notifyGrappleReason(ctx.reason, options);
    return ctx;
  }
  const own = findRelationshipForTarget(ctx.combat, ctx.combatant.id);
  const others = listGrappleRelationships(ctx.combat)
    .filter((relationship) => relationship.grapplerCombatantId !== ctx.combatant.id && relationship.id !== own?.id);
  const candidates = own ? [own, ...others] : others;
  if (!candidates.length) return refuseGrapple("no-relationship", options);
  const relationship = await pickGrappleRelationship(ctx.combat, candidates, { title: game.i18n.localize("PMTTRPG.ActionMenu.BreakFree") });
  if (!relationship) return { ok: false, reason: "cancelled" };
  const stat = await promptBreakFreeStat();
  if (!stat) return { ok: false, reason: "cancelled" };
  const choices = await collectRollChoices({
    actor,
    stat,
    label: game.i18n.localize("PMTTRPG.ActionMenu.BreakFree"),
    tokenId: ctx.combatant?.tokenId ?? null,
    combatant: ctx.combatant,
  });
  if (!choices) return { ok: false, reason: "cancelled" };
  const live = listGrappleRelationships(ctx.combat).find((entry) => entry.id === relationship.id) ?? null;
  if (!live) {
    notifyGrappleReason("no-relationship", options);
    return { ok: false, reason: "not-grappled" };
  }

  const isTarget = live.targetCombatantId === ctx.combatant.id;
  const target = combatantOf(ctx.combat, live.targetCombatantId);
  const declared = await declareAction({
    actor,
    combatant: ctx.combatant,
    tokenId: ctx.tokenId,
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.BREAK_FREE,
    cost: 1,
    timing: options.timing ?? null,
    consume: options.consume,
    target: target?.actor ?? null,
    metadata: {
      relationshipId: live.id,
      targetCombatantId: live.targetCombatantId,
      targetTokenId: target?.tokenId ?? null,
      helper: !isTarget,
    },
  });
  if (!declared?.ok) return declared ?? { ok: false, reason: "declaration-failed" };
  const outcome = await resolveBreakFree({
    combat: ctx.combat,
    relationship: live,
    actor,
    combatant: ctx.combatant,
    stat,
    choices,
  });
  return { ...outcome, declaration: declared.declaration };
}

/** Runs once a one-sided hit has fully resolved. If the Reaction can't be paid then nothing rolls. */
export async function runPostHitBreakFree({ retaliatorActor, retaliatorTokenId, combat = game.combat } = {}) {
  if (!combat || !retaliatorActor) return { ok: false, reason: "no-combat" };
  const combatant = combatantForReactionToken(retaliatorActor, retaliatorTokenId, combat);
  const relationship = combatant ? findRelationshipForTarget(combat, combatant.id) : null;
  if (!relationship) {
    warnUser("PMTTRPG.Grapple.NoLongerGrappled");
    return { ok: false, reason: "not-grappled" };
  }
  const stat = await promptBreakFreeStat();
  if (!stat) return { ok: false, reason: "cancelled" };
  const choices = await collectRollChoices({
    actor: retaliatorActor,
    stat,
    label: game.i18n.localize("PMTTRPG.ActionMenu.BreakFree"),
    tokenId: combatant.tokenId ?? retaliatorTokenId ?? null,
    combatant,
    rollModeSources: { disadvantage: 1 },
  });
  if (!choices) return { ok: false, reason: "cancelled" };
  const live = findRelationshipForTarget(combat, combatant.id);
  if (!live || live.id !== relationship.id) {
    warnUser("PMTTRPG.Grapple.NoLongerGrappled");
    return { ok: false, reason: "not-grappled" };
  }
  const grappler = combatantOf(combat, live.grapplerCombatantId);
  const declared = await declareAction({
    actor: retaliatorActor,
    combatant,
    tokenId: combatant.tokenId ?? retaliatorTokenId ?? null,
    economyType: ECONOMY_TYPES.REACTION,
    kind: ACTION_KINDS.BREAK_FREE,
    cost: 1,
    target: grappler?.actor ?? null,
    metadata: {
      relationshipId: live.id,
      targetCombatantId: live.targetCombatantId,
      targetTokenId: combatant.tokenId ?? null,
      mode: BREAK_FREE_MODES.REACTION,
    },
  });
  if (!declared?.ok) {
    warnUser("PMTTRPG.Grapple.BreakFreeReactionUnpaid", { name: combatantName(combatant) });
    return { ok: false, reason: "unpaid" };
  }
  return resolveBreakFree({
    combat,
    relationship: live,
    actor: retaliatorActor,
    combatant,
    stat,
    choices,
    mode: BREAK_FREE_MODES.REACTION,
  });
}
