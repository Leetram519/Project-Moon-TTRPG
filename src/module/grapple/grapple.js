import { GRAPPLE_OPS, applyGrappleMutation, requestGrappleMutation } from "./grapple-authority.js";
import {
  activeImmunitiesFor,
  findRelationshipForTarget,
  listGrappleRelationships,
  relationshipsForGrappler,
  GRAPPLE_IMMUNITY_REASONS,
} from "./grapple-state.js";
import {
  cancelGrappleContestForRemovedChat,
  enhanceGrappleContestCard,
  onGrappleContestClick,
  postGrappleContest,
  defineGrappleRuleSubject,
  grappleRelationshipMustEnd,
  resolveGrappleAttemptProfile,
} from "./grapple-contest.js";
import { ACTION_KINDS, ECONOMY_TYPES } from "../action-economy/kinds.js";
import { checkActionTiming } from "../action-economy/timing.js";
import {
  getEffectiveReactionAvailability,
  removeReactionAvailability,
  resolveReactionCreditCombatant,
} from "../action-economy/reaction-credits.js";
import { canUserUpdateDocument } from "../acting-user.js";
import { cancelButton, confirmButton, waitForWindowChoice } from "../apps/dialog-wait.js";
import { currentTurnIdentity, sameTurnIdentity } from "../combat/turn-stamps.js";
import { combatantName, combatantOf, exactCombatantForToken } from "../combat/combatant-match.js";
import { localize, warnUser, tokenDocument } from "../shared-helpers.js";
import { getPrimaryGM } from "../easy-effects/gm-route.js";
import { getGrappleRestrictions } from "./grapple-restrictions.js";
import { registerRuleContributionProvider } from "../rules/rule-contributions.js";
import { LINKED_FAILURE_POLICIES, MOVEMENT_NATURES } from "../movement/movement-plan.js";
import { MOVEMENT_PHASES, registerMovementProcessor } from "../movement/movement-processors.js";
import {
  ACTION_STATE_CATEGORIES,
  ACTION_STATE_ROLES,
  ACTION_STATE_VISIBILITY,
  registerActionStatePresenter,
} from "../action-economy/presentation.js";

const { renderTemplate } = foundry.applications.handlebars;

const LOADOUT_TYPES = new Set(["status", "weapon", "outfit", "augment", "skill", "tool"]);

function isPrimaryGM() {
  return getPrimaryGM()?.id === game.user.id;
}

export async function postGrappleEnded(combat, relationship, { labelKey = "PMTTRPG.Grapple.Ended" } = {}) {
  const grappler = combatantOf(combat, relationship?.grapplerCombatantId);
  const target = combatantOf(combat, relationship?.targetCombatantId);
  const actor = grappler?.actor ?? null;
  if (!actor) return false;
  try {
    const { postActionFeedbackEvent } = await import("../action-economy/action-feedback.js");
    return await postActionFeedbackEvent({
      id: foundry.utils.randomID(),
      kind: ACTION_KINDS.GRAPPLE,
      economyType: null,
      actor,
      actorId: actor.id ?? null,
      tokenId: grappler?.tokenId ?? null,
      combatantId: grappler?.id ?? null,
      target: target?.actor ?? null,
      targetActorId: target?.actor?.id ?? null,
      metadata: {
        feedbackLabelKey: labelKey,
        targetCombatantId: target?.id ?? null,
        targetTokenId: target?.tokenId ?? null,
      },
    });
  } catch (error) {
    console.warn("[PMTTRPG] Grapple ended feedback failed", error);
    return false;
  }
}

function involves(actor, combatant) {
  if (!actor || !combatant?.actor) return false;
  if (combatant.actor === actor) return true;
  return !!actor.uuid && combatant.actor.uuid === actor.uuid;
}

/** Ends any live Grapple of this Actor whose profile says it has to end. Runs on the GM. */
async function revalidateGrappleForActor(actor, { combat = game.combat } = {}) {
  if (!combat || !actor) return [];
  const ended = [];
  for (const relationship of listGrappleRelationships(combat)) {
    const grappler = combatantOf(combat, relationship.grapplerCombatantId);
    const target = combatantOf(combat, relationship.targetCombatantId);
    if (!involves(actor, grappler) && !involves(actor, target)) continue;
    if (!grappleRelationshipMustEnd({ combat, grappler, target })) continue;
    const result = await applyGrappleMutation(combat, GRAPPLE_OPS.END, { relationshipId: relationship.id });
    if (!result.ok) continue;
    ended.push(relationship);
    void postGrappleEnded(combat, relationship);
  }
  return ended;
}

/** Runs on the GM. */
export async function pruneGrappleForCombat(combat) {
  if (!combat) return null;
  const result = await applyGrappleMutation(combat, GRAPPLE_OPS.PRUNE, {});
  for (const relationship of result?.removedRelationships ?? []) {
    console.warn("[PMTTRPG] Removed a Grapple whose Combatant left the combat", relationship);
  }
  return result;
}

const WARN_KEYS = {
  "no-combat": "PMTTRPG.ActionMenu.NeedsCombat",
  "no-combatant": "PMTTRPG.Grapple.NeedsToken",
  "not-active-turn": "PMTTRPG.Grapple.NotYourTurn",
  "no-gm": "PMTTRPG.Grapple.NeedsGM",
  "no-target": "PMTTRPG.Grapple.NoTarget",
  "self-target": "PMTTRPG.Grapple.SelfTarget",
  "target-gone": "PMTTRPG.Grapple.TargetGone",
  "not-adjacent": "PMTTRPG.Grapple.NotAdjacent",
  "target-grappled": "PMTTRPG.Grapple.TargetAlreadyGrappled",
  "target-immune": "PMTTRPG.Grapple.TargetImmune",
  "would-end": "PMTTRPG.Grapple.WouldEndImmediately",
  "no-relationship": "PMTTRPG.Grapple.NoRelationship",
  "no-reactions": "PMTTRPG.Grapple.TargetNoReactions",
  "reduce-failed": "PMTTRPG.Grapple.ReduceFailed",
};

export function notifyGrappleReason(reason, options = {}, data = undefined) {
  if (options.warn === false) return;
  const key = WARN_KEYS[reason];
  if (!key) return;
  if (reason === "reduce-failed") ui.notifications.error(localize(key, data));
  else warnUser(key, data);
}

export function refuseGrapple(reason, options = {}, data = undefined) {
  notifyGrappleReason(reason, options, data);
  return { ok: false, reason };
}

export function hasActiveGM() {
  return !!getPrimaryGM();
}

/**
 * Finds the exact acting Combatant and refuses an ambiguous Actor. With `requireTurn`
 * it checks the turn rule here too, before any dialog opens.
 */
export function resolveGrappleSource(actor, options = {}, { requireTurn = true, kind = ACTION_KINDS.GRAPPLE } = {}) {
  const combat = options.combat ?? game.combat;
  if (!combat?.started) return { ok: false, reason: "no-combat" };
  const tokenId = options.tokenId ?? options.token?.id ?? actor?.token?.id ?? null;
  const combatant = resolveReactionCreditCombatant(actor, { combatant: options.combatant, combat, tokenId });
  if (!combatant) return { ok: false, reason: "no-combatant" };
  if (requireTurn && !checkActionTiming({
    combat,
    combatant,
    economyType: ECONOMY_TYPES.ACTION,
    kind,
    timing: options.timing ?? null,
  }).ok) return { ok: false, reason: "not-active-turn" };
  return { ok: true, combat, combatant, tokenId: tokenId ?? combatant.tokenId ?? null };
}

async function combatantDistance(a, b) {
  const { normalizeToken, tokenDistanceSquares } = await import("../canvas/spatial.js");
  return tokenDistanceSquares(normalizeToken(a?.token ?? null), normalizeToken(b?.token ?? null));
}

async function promptGrappleTarget(actor, ctx) {
  const other = ctx.combat.combatants.find((entry) => entry.id !== ctx.combatant.id);
  return game.projectmoonttrpg.targeting.promptTargetSelection({
    actor,
    token: ctx.token ?? null,
    combat: ctx.combat,
    title: game.i18n.localize("PMTTRPG.ActionMenu.Grapple"),
    hint: game.i18n.localize("PMTTRPG.Grapple.TargetHint"),
    sourceName: actor.name,
    sourceImg: actor.img,
    weaponRange: 1,
    preferredCombatantId: other?.id ?? null,
    isTargetBlocked: (option) => (option.isSelf ? "PMTTRPG.Grapple.SelfTarget" : null),
  });
}

export async function collectRollChoices(args) {
  const { PMTTRPGRolls } = await import("../rolls.js");
  return PMTTRPGRolls.collectStatRollChoices(args);
}

export async function declareAction(args) {
  const { declareActorAction } = await import("../action-economy/declare.js");
  return declareActorAction(args);
}

export async function startGrapple(actor, options = {}) {
  if (!actor) return { ok: false, reason: "invalid-actor" };
  const ctx = resolveGrappleSource(actor, options);
  if (!ctx.ok) {
    notifyGrappleReason(ctx.reason, options);
    return ctx;
  }
  if (!hasActiveGM()) return refuseGrapple("no-gm", options);

  const picked = await promptGrappleTarget(actor, { ...ctx, token: options.token ?? null });
  if (picked == null) return { ok: false, reason: "cancelled" };
  const target = picked.combatant ?? null;
  if (!target) return refuseGrapple("no-target", options);
  if (!combatantOf(ctx.combat, target.id)) return refuseGrapple("target-gone", options);
  if (target.id === ctx.combatant.id) return refuseGrapple("self-target", options);
  const gap = await combatantDistance(ctx.combatant, target);
  if (!Number.isFinite(gap) || gap > 1) return refuseGrapple("not-adjacent", options);
  if (findRelationshipForTarget(ctx.combat, target.id)) return refuseGrapple("target-grappled", options);
  if (activeImmunitiesFor(ctx.combat, target.id).length) return refuseGrapple("target-immune", options);
  const resolved = resolveGrappleAttemptProfile({ combat: ctx.combat, grappler: ctx.combatant, target });
  if (resolved.profile.relationship?.end) return refuseGrapple("would-end", options);

  const choices = await collectRollChoices({
    actor,
    stat: "for",
    label: game.i18n.localize("PMTTRPG.Grapple.ContestRollGrappler"),
    tokenId: ctx.tokenId,
    combatant: ctx.combatant,
    rollModeSources: {
      advantage: Number(resolved.profile.attempt?.attacker?.advantage) || 0,
      disadvantage: Number(resolved.profile.attempt?.attacker?.disadvantage) || 0,
    },
  });
  if (!choices) return { ok: false, reason: "cancelled" };

  const declared = await declareAction({
    actor,
    combatant: ctx.combatant,
    tokenId: ctx.tokenId,
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.GRAPPLE,
    cost: 1,
    timing: options.timing ?? null,
    consume: options.consume,
    target: target.actor ?? null,
    metadata: {
      grappleOperation: "attempt",
      targetCombatantId: target.id,
      targetTokenId: target.tokenId ?? picked.tokenId ?? null,
      feedbackLabelKey: "PMTTRPG.ActionMenu.Grapple",
    },
  });
  if (!declared?.ok) return declared ?? { ok: false, reason: "declaration-failed" };

  const message = await postGrappleContest({
    combat: ctx.combat,
    grappler: ctx.combatant,
    target,
    declarationId: declared.declaration?.id ?? null,
    grapplerChoices: choices,
    profile: resolved.profile,
  });
  return { ok: true, declaration: declared.declaration, messageId: message?.id ?? null };
}

function relationshipRows(combat, relationships) {
  const names = relationships.flatMap((relationship) => [
    combatantName(combatantOf(combat, relationship.grapplerCombatantId)),
    combatantName(combatantOf(combat, relationship.targetCombatantId)),
  ]);
  const shared = new Set(names.filter((name, index) => names.indexOf(name) !== index));
  const label = (combatant) => {
    const name = combatantName(combatant);
    const speed = combatant?.initiative;
    return shared.has(name) && speed != null && speed !== ""
      ? game.i18n.format("PMTTRPG.Grapple.PickerNameSpeed", { name, speed })
      : name;
  };
  return relationships.map((relationship, index) => ({
    id: relationship.id,
    grappler: label(combatantOf(combat, relationship.grapplerCombatantId)),
    target: label(combatantOf(combat, relationship.targetCombatantId)),
    checked: index === 0,
  }));
}

export async function pickGrappleRelationship(combat, relationships, { title } = {}) {
  if (!relationships.length) return null;
  if (relationships.length === 1) return relationships[0];
  const content = await renderTemplate("systems/projectmoonttrpg/templates/dialog/grapple-relationship-picker.hbs", {
    rows: relationshipRows(combat, relationships),
    i18n: { hint: game.i18n.localize("PMTTRPG.Grapple.PickerHint") },
  });
  const id = await waitForWindowChoice({
    window: { title: title ?? game.i18n.localize("PMTTRPG.Grapple.PickerTitle") },
    content,
    buttons: [
      cancelButton(),
      confirmButton((_event, _button, dialog) => dialog.element.querySelector("[name='relationshipId']:checked")?.value ?? null),
    ],
    rejectClose: false,
  });
  return relationships.find((relationship) => relationship.id === id) ?? null;
}

const UPKEEP_OWNER_TIMEOUT_MS = 60_000;
const UPKEEP_NO_ANSWER = Symbol("grapple.upkeepNoAnswer");

function grappleUpkeepUser(combatant) {
  const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const owners = game.users
    .filter((user) => user.active && !user.isGM && (
      combatant.token?.testUserPermission(user, owner) || combatant.actor?.testUserPermission(user, owner)
    ))
    .sort((a, b) => a.id.localeCompare(b.id));
  return owners[0] ?? game.users.activeGM;
}

function isGrappleUpkeepUser(combatant) {
  const user = grappleUpkeepUser(combatant);
  return !!user && user.id === game.user.id;
}

/**
 * Turn Start only runs on the client that changed the turn. A GM runs upkeep for every
 * Grappler and asks the owner. A player only runs it for a Grappler they were picked for.
 */
export function runsGrappleUpkeepHere(combatant) {
  return game.user.isGM || isGrappleUpkeepUser(combatant);
}

async function upkeepRecipient(combatant) {
  const { resolvePromptUser } = await import("../easy-effects/choice-dialog.js");
  return resolvePromptUser(combatant?.actor ?? null, combatant?.tokenId ?? null);
}

async function askUpkeepOwner({ combat, relationship, combatant, noAnswer }) {
  const { promptChoiceDialog } = await import("../easy-effects/choice-dialog.js");
  const target = combatantOf(combat, relationship.targetCombatantId);
  return promptChoiceDialog({
    title: game.i18n.localize("PMTTRPG.Grapple.UpkeepTitle"),
    prompt: game.i18n.format("PMTTRPG.Grapple.UpkeepAsk", { target: combatantName(target) }),
    choices: [
      { id: "maintain", label: game.i18n.localize("PMTTRPG.Grapple.Maintain") },
      { id: "release", label: game.i18n.localize("PMTTRPG.Grapple.Release") },
    ],
    cancel: false,
    windowStyle: true,
    actor: combatant?.actor ?? null,
    tokenId: combatant?.tokenId ?? null,
    timeoutMs: UPKEEP_OWNER_TIMEOUT_MS,
    timeoutValue: noAnswer,
  });
}

/**
 * If another user owns the Grappler then they get one question per Grapple.
 */
async function promptUpkeep(combat, relationships, combatant) {
  const recipient = await upkeepRecipient(combatant);
  if (!recipient || recipient.id === game.user.id) return promptUpkeepHere(combat, relationships);
  const choices = new Map();
  for (const relationship of relationships) {
    let answer = await askUpkeepOwner({ combat, relationship, combatant, noAnswer: UPKEEP_NO_ANSWER });
    if (answer === UPKEEP_NO_ANSWER) {
      const here = await promptUpkeepHere(combat, [relationship]);
      answer = here?.get(relationship.id) ?? null;
    }
    choices.set(relationship.id, answer === "maintain" ? "maintain" : "release");
  }
  return choices;
}

async function promptUpkeepHere(combat, relationships) {
  const content = await renderTemplate("systems/projectmoonttrpg/templates/dialog/grapple-upkeep.hbs", {
    rows: relationshipRows(combat, relationships),
    i18n: {
      hint: game.i18n.localize("PMTTRPG.Grapple.UpkeepHint"),
      maintain: game.i18n.localize("PMTTRPG.Grapple.Maintain"),
      release: game.i18n.localize("PMTTRPG.Grapple.Release"),
    },
  });
  return waitForWindowChoice({
    window: { title: game.i18n.localize("PMTTRPG.Grapple.UpkeepTitle") },
    content,
    buttons: [confirmButton((_event, _button, dialog) => {
      const choices = new Map();
      for (const relationship of relationships) {
        const value = dialog.element.querySelector(`[name='upkeep-${relationship.id}']:checked`)?.value;
        choices.set(relationship.id, value === "maintain" ? "maintain" : "release");
      }
      return choices;
    })],
    // closing the dialog pays nothing and releases every Grapple
    rejectClose: false,
  });
}

async function endRelationship(combat, relationship, labelKey) {
  const result = await requestGrappleMutation(combat, GRAPPLE_OPS.END, { relationshipId: relationship.id });
  if (result?.ok) void postGrappleEnded(combat, relationship, { labelKey });
  return result;
}

export async function clearGrappleImmunity(combat, immunityId) {
  if (!combat || immunityId == null) return false;
  const result = await requestGrappleMutation(combat, GRAPPLE_OPS.CLEAR_IMMUNITY, { immunityId: String(immunityId) });
  return result?.ok === true && result.changed === true;
}

export async function releaseGrapple(combat, relationshipId) {
  const relationship = listGrappleRelationships(combat).find((entry) => String(entry.id) === String(relationshipId));
  if (!relationship) return false;
  const result = await endRelationship(combat, relationship, "PMTTRPG.Grapple.Released");
  return result?.ok === true;
}

/**
 * Runs at the Grappler's Turn Start (after Actions and Reactions refresh).
 */
export async function runGrappleTurnStartUpkeep(combat, combatant) {
  if (!combat || !combatant?.actor) return [];
  let relationships = listGrappleRelationships(combat, { grapplerCombatantId: combatant.id });
  if (!relationships.length) return [];

  const kept = [];
  for (const relationship of relationships) {
    const target = combatantOf(combat, relationship.targetCombatantId);
    if (grappleRelationshipMustEnd({ combat, grappler: combatant, target })) {
      await endRelationship(combat, relationship, "PMTTRPG.Grapple.Ended");
    } else {
      kept.push(relationship);
    }
  }
  relationships = kept;
  if (!relationships.length) return [];

  const choices = await promptUpkeep(combat, relationships, combatant);
  const outcomes = [];
  for (const relationship of relationships) {
    const choice = choices?.get(relationship.id) ?? null;
    if (choice !== "maintain") {
      await endRelationship(combat, relationship, "PMTTRPG.Grapple.Released");
      outcomes.push({ relationshipId: relationship.id, outcome: "released" });
      continue;
    }
    const target = combatantOf(combat, relationship.targetCombatantId);
    const declared = await declareAction({
      actor: combatant.actor,
      combatant,
      tokenId: combatant.tokenId ?? null,
      economyType: ECONOMY_TYPES.REACTION,
      kind: ACTION_KINDS.GRAPPLE,
      cost: 1,
      target: target?.actor ?? null,
      metadata: {
        grappleOperation: "maintain",
        relationshipId: relationship.id,
        targetCombatantId: relationship.targetCombatantId,
        feedbackSilent: true,
      },
      warn: false,
    });
    if (declared?.ok) {
      outcomes.push({ relationshipId: relationship.id, outcome: "maintained" });
      continue;
    }
    warnUser("PMTTRPG.Grapple.UpkeepUnpaid", { target: combatantName(target) });
    await endRelationship(combat, relationship, "PMTTRPG.Grapple.EndedUnpaid");
    outcomes.push({ relationshipId: relationship.id, outcome: "unpaid" });
  }
  return outcomes;
}

function reactionsLeft(target) {
  return getEffectiveReactionAvailability(target.actor, { combatant: target }).effective;
}

async function removeOneReaction(target) {
  if (canUserUpdateDocument(target) && canUserUpdateDocument(target.actor)) {
    return removeReactionAvailability(target.actor, 1, { combatant: target });
  }
  const { runOnPrimaryGM } = await import("../easy-effects/gm-route.js");
  return runOnPrimaryGM("removeCombatantReactionAvailability", { combatantUuid: target.uuid, amount: 1 });
}

export async function startGrappleReduceReactions(actor, options = {}) {
  const ctx = resolveGrappleSource(actor, options);
  if (!ctx.ok) {
    notifyGrappleReason(ctx.reason, options);
    return ctx;
  }
  const relationships = listGrappleRelationships(ctx.combat, { grapplerCombatantId: ctx.combatant.id });
  if (!relationships.length) return refuseGrapple("no-relationship", options);
  const relationship = await pickGrappleRelationship(ctx.combat, relationships, { title: game.i18n.localize("PMTTRPG.ActionMenu.GrappleReduceReactions") });
  if (!relationship) return { ok: false, reason: "cancelled" };
  const target = combatantOf(ctx.combat, relationship.targetCombatantId);
  if (!target?.actor) return refuseGrapple("target-gone", options);
  if (reactionsLeft(target) <= 0) {
    return refuseGrapple("no-reactions", options, { target: combatantName(target) });
  }
  const declared = await declareAction({
    actor,
    combatant: ctx.combatant,
    tokenId: ctx.tokenId,
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.GRAPPLE,
    cost: 1,
    timing: options.timing ?? null,
    consume: options.consume,
    target: target.actor,
    metadata: {
      grappleOperation: "reduceReactions",
      relationshipId: relationship.id,
      targetCombatantId: target.id,
      targetTokenId: target.tokenId ?? null,
      feedbackLabelKey: "PMTTRPG.ActionMenu.GrappleReduceReactions",
    },
  });
  if (!declared?.ok) return declared ?? { ok: false, reason: "declaration-failed" };
  const removed = await removeOneReaction(target);
  if (!removed?.ok || !(removed.removed > 0)) {
    notifyGrappleReason("reduce-failed", options, { target: combatantName(target) });
    return { ok: false, reason: "reduce-failed", declared: true, declaration: declared.declaration };
  }
  return { ok: true, declaration: declared.declaration, removed };
}

const FIRST_ACTION_PROCESSOR_ID = "turn-first-action";
const FREE_THROW_PROCESSOR_ID = "grapple-free-throw";

function declarationCombatant(declaration, combat) {
  if (declaration?.combatantId) return combatantOf(combat, declaration.combatantId);
  if (!declaration?.actor) return null;
  return resolveReactionCreditCombatant(declaration.actor, { combat, tokenId: declaration.tokenId ?? null });
}

/** Remembers the first Action of the Combatant's own turn for the free Throw check. */
async function writeFirstActionMarker(combatant, marker) {
  const { runAsCombatantOwnerOrGM } = await import("../easy-effects/gm-route.js");
  return runAsCombatantOwnerOrGM(combatant, "setCombatantFirstAction", { marker });
}

async function recordFirstActionDeclaration(declaration) {
  if (declaration?.economyType !== ECONOMY_TYPES.ACTION) return false;
  const combat = declaration.combat ?? game.combat;
  if (!combat?.started) return false;
  const combatant = declarationCombatant(declaration, combat);
  if (!combatant) return false;
  const turn = currentTurnIdentity(combat, combatant);
  if (!turn) return false;
  const marker = combatant.flags?.projectmoonttrpg?.actionState?.firstAction ?? null;
  if (marker && String(marker.combatId) === String(combat.id)
    && sameTurnIdentity({ combatantId: combatant.id, started: marker.started, round: marker.round }, turn)) return false;
  const next = { combatId: String(combat.id), started: turn.started, round: turn.round, declarationId: declaration.id };
  await writeFirstActionMarker(combatant, next);
  return true;
}

/**
 * Any Action other than a Throw uses up the free Throw. If the Actor has no single exact
 * Combatant then we clear it on every Grapple where that Actor is the Grappler.
 */
async function clearFreeThrowOnAction(declaration) {
  if (declaration?.economyType !== ECONOMY_TYPES.ACTION) return false;
  if (declaration.kind === ACTION_KINDS.THROW) return false;
  const combat = declaration.combat ?? game.combat;
  if (!combat?.started) return false;
  const exact = declarationCombatant(declaration, combat);
  const grapplerIds = exact
    ? [exact.id]
    : listGrappleRelationships(combat)
      .filter((relationship) => involves(declaration.actor, combatantOf(combat, relationship.grapplerCombatantId)))
      .map((relationship) => relationship.grapplerCombatantId);
  let cleared = false;
  for (const grapplerCombatantId of new Set(grapplerIds)) {
    const holds = listGrappleRelationships(combat, { grapplerCombatantId }).some((relationship) => relationship.freeThrow);
    if (!holds) continue;
    await requestGrappleMutation(combat, GRAPPLE_OPS.CLEAR_FREE_THROW, { grapplerCombatantId });
    cleared = true;
  }
  return cleared;
}

async function registerGrappleDeclarationProcessors() {
  const { registerActionDeclarationProcessor } = await import("../action-economy/declare.js");
  registerActionDeclarationProcessor({ id: FIRST_ACTION_PROCESSOR_ID, order: -100, fn: (declaration) => recordFirstActionDeclaration(declaration) });
  registerActionDeclarationProcessor({ id: FREE_THROW_PROCESSOR_ID, order: -90, fn: (declaration) => clearFreeThrowOnAction(declaration) });
}

function onOwnedContentChanged(item) {
  if (!LOADOUT_TYPES.has(item.type)) return;
  if (!isPrimaryGM()) return;
  const actor = item.parent;
  if (actor?.documentName !== "Actor") return;
  void revalidateGrappleForActor(actor).catch((error) => console.warn("[PMTTRPG] Grapple revalidation failed", error));
}

/** Call this once, from `init`. */
export function registerGrapple() {
  defineGrappleRuleSubject();
  registerGrappleDrag();
  void registerGrappleDeclarationProcessors().catch((error) => console.warn("[PMTTRPG] Grapple processor registration failed", error));
  Hooks.on("createItem", onOwnedContentChanged);
  Hooks.on("updateItem", onOwnedContentChanged);
  Hooks.on("deleteItem", onOwnedContentChanged);
  Hooks.on("deleteCombatant", (combatant) => {
    if (!isPrimaryGM()) return;
    void pruneGrappleForCombat(combatant.parent).catch((error) => console.warn("[PMTTRPG] Grapple prune failed", error));
  });
  Hooks.once("ready", () => {
    document.body.addEventListener("click", (event) => {
      void onGrappleContestClick(event).catch((error) => console.warn("[PMTTRPG] Grapple contest click failed", error));
    });
  });
  Hooks.on("renderChatMessageHTML", enhanceGrappleContestCard);
  Hooks.on("deleteChatMessage", (message) => {
    if (isPrimaryGM()) cancelGrappleContestForRemovedChat(message);
  });
}

/** Hides or disables Action Menu rows that depend on Grapple state. */


export function grappleMenuRowState(actionId, { combat = null, combatant = null, reactionsFor = null } = {}) {
  const live = combat?.started ? listGrappleRelationships(combat) : [];
  const id = combatant?.id ?? null;
  const holding = id ? live.filter((relationship) => relationship.grapplerCombatantId === id) : [];

  switch (actionId) {
    case "breakFree":
      return { hidden: !id || !live.some((relationship) => relationship.grapplerCombatantId !== id) };
    case "throw":
      return { hidden: holding.length === 0 };
    case "grappleReduceReactions": {
      if (!holding.length) return { hidden: true };
      const targets = holding.map((relationship) => combat.combatants.get(relationship.targetCombatantId)).filter(Boolean);
      const anyReactions = targets.some((target) => reactionsFor(target) > 0);
      return anyReactions ? {} : { disabled: true, disabledReason: game.i18n.localize("PMTTRPG.Grapple.TargetNoReactionsShort") };
    }
    case "dash":
    case "disengage":
    case "protect": {
      if (!combatant) return null;
      const restrictions = getGrappleRestrictions(combatant, { combat });
      if (restrictions[actionId] !== false) return null;
      return { disabled: true, disabledReason: game.i18n.localize("PMTTRPG.Grapple.RestrictedWhileGrappled") };
    }
    default:
      return null;
  }
}

/**
 * A Grappler with exactly one live Grapple drags the target along when they move on their own.
 * If the target can't follow a segment then that segment doesn't commit.
 * Each square costs 1 extra (6 squares of movement drags the target 3).
 */


const GRAPPLE_DRAG_PROCESSOR_ID = "grapple-drag";
const GRAPPLE_DRAG_COST_PROVIDER_ID = "grapple-drag-cost";

function liveGrapplesFor(tokenDoc, combat, combatant = null) {
  if (!combat?.started || !tokenDoc) return [];
  const grappler = combatant ?? exactCombatantForToken(combat, tokenDoc.id);
  if (!grappler) return [];
  return relationshipsForGrappler(combat, grappler.id);
}

function grappleDragClaims({ nature, mover, combatant = null } = {}) {
  if (nature !== MOVEMENT_NATURES.VOLUNTARY) return false;
  return liveGrapplesFor(tokenDocument(mover), game.combat, combatant).length > 0;
}

function grappleDragProcess({ view, ops }) {
  const combat = game.combat;
  if (view.nature !== MOVEMENT_NATURES.VOLUNTARY) return;
  const mover = fromUuidSync(view.plan.roles.mover.tokenUuid);
  const grapples = liveGrapplesFor(mover, combat);
  if (!grapples.length) return;
  if (grapples.length > 1) {
    ops.requireManualAdjudication("PMTTRPG.Grapple.MultipleTargetsManual");
    return;
  }
  const target = combat.combatants.get(grapples[0].targetCombatantId);
  const targetToken = tokenDocument(target?.token);
  if (!targetToken?.uuid) {
    console.warn("[PMTTRPG] Grappled target has no token, the Grappler moves alone", grapples[0]);
    ui.notifications.warn(game.i18n.localize("PMTTRPG.Grapple.DragTargetMissing"));
    return;
  }
  const moverSource = mover._source;
  const targetSource = targetToken._source;
  ops.addLinkedParticipant({
    tokenUuid: targetToken.uuid,
    actorUuid: target.actor?.uuid ?? null,
    combatantId: target.id,
    follow: {
      mode: "offset",
      dx: Number(targetSource.x) - Number(moverSource.x),
      dy: Number(targetSource.y) - Number(moverSource.y),
      dElevation: (Number(targetSource.elevation) || 0) - (Number(moverSource.elevation) || 0),
    },
    failurePolicy: LINKED_FAILURE_POLICIES.ABORT_ROOT_SEGMENT,
  });
}

function grappleDragCostContributions(context = {}) {
  if (context.subject !== "movement" || context.nature !== MOVEMENT_NATURES.VOLUNTARY) return [];
  const mover = context.roles?.mover;
  if (!mover?.token) return [];
  const grapples = liveGrapplesFor(tokenDocument(mover.token), game.combat, mover.combatant ?? null);
  if (grapples.length !== 1) return [];
  return [{ subject: "movement", role: "mover", changes: { "cost.perSpace": 1 } }];
}

function registerGrappleDrag() {
  registerMovementProcessor({
    id: GRAPPLE_DRAG_PROCESSOR_ID,
    order: 10,
    phase: MOVEMENT_PHASES.PLAN,
    claims: (context) => grappleDragClaims(context),
    process: (input) => grappleDragProcess(input),
  });
  registerRuleContributionProvider({
    id: GRAPPLE_DRAG_COST_PROVIDER_ID,
    order: 10,
    getContributions: (context) => grappleDragCostContributions(context),
  });
}

const GRAPPLE_PRESENTER_ID = "grapple";
const GRAPPLING_ICON = "systems/projectmoonttrpg/assets/icons/Statuses/PlayerState_Grappling.webp";
const GRAPPLED_ICON = "systems/projectmoonttrpg/assets/icons/Statuses/PlayerState_Grappled.webp";
const GRAPPLE_IMMUNE_ICON = "systems/projectmoonttrpg/assets/icons/Statuses/PlayerState_GrappleImmune.webp";
const ICON = "fa-hand-fist";

function grappleActionStateEntries({ combatant, combat } = {}) {
  const activeCombat = combat ?? game.combat;
  if (!combatant || !activeCombat) return [];
  const id = combatant.id;
  const entries = [];
  for (const relationship of listGrappleRelationships(activeCombat)) {
    if (relationship.grapplerCombatantId === id) {
      entries.push({
        id: `${GRAPPLE_PRESENTER_ID}:${relationship.id}:source`,
        category: ACTION_STATE_CATEGORIES.RELATIONSHIP,
        actionId: "throw",
        combatantId: id,
        role: ACTION_STATE_ROLES.SOURCE,
        counterpartCombatantId: relationship.targetCombatantId,
        labelKey: "PMTTRPG.ActionState.Grappling",
        detailKey: "PMTTRPG.ActionState.GrapplingDetail",
        icon: { img: GRAPPLING_ICON, fa: ICON },
        visibility: ACTION_STATE_VISIBILITY.PUBLIC,
        dismissible: true,
        recordId: relationship.id,
      });
    }
    if (relationship.targetCombatantId === id) {
      entries.push({
        id: `${GRAPPLE_PRESENTER_ID}:${relationship.id}:target`,
        category: ACTION_STATE_CATEGORIES.RELATIONSHIP,
        actionId: "breakFree",
        combatantId: id,
        role: ACTION_STATE_ROLES.TARGET,
        counterpartCombatantId: relationship.grapplerCombatantId,
        labelKey: "PMTTRPG.ActionState.Grappled",
        detailKey: "PMTTRPG.ActionState.GrappledDetail",
        icon: { img: GRAPPLED_ICON, fa: ICON },
        visibility: ACTION_STATE_VISIBILITY.PUBLIC,
      });
    }
  }
  for (const immunity of activeImmunitiesFor(activeCombat, id)) {
    entries.push({
      id: `${GRAPPLE_PRESENTER_ID}:${immunity.id}:immune`,
      category: ACTION_STATE_CATEGORIES.TURN,
      actionId: null,
      combatantId: id,
      role: ACTION_STATE_ROLES.SELF,
      labelKey: "PMTTRPG.ActionState.GrappleImmune",
      icon: { img: GRAPPLE_IMMUNE_ICON, fa: "fa-shield-halved" },
      expiryKey: immunity.reason === GRAPPLE_IMMUNITY_REASONS.THROW
        ? "PMTTRPG.ActionState.UntilBothNextTurnsEnd"
        : "PMTTRPG.ActionState.UntilEndOfNextTurn",
      visibility: ACTION_STATE_VISIBILITY.PUBLIC,
      dismissible: true,
      recordId: immunity.id,
    });
  }
  return entries;
}

export function registerGrapplePresentation() {
  registerActionStatePresenter({
    id: GRAPPLE_PRESENTER_ID,
    order: 25,
    getEntries: grappleActionStateEntries,
    dismiss: async (entry, { combat }) => {
      if (!entry?.recordId) return false;
      if (entry.role === ACTION_STATE_ROLES.SOURCE) return releaseGrapple(combat, entry.recordId);
      if (entry.role === ACTION_STATE_ROLES.SELF) return clearGrappleImmunity(combat, entry.recordId);
      return false;
    },
  });
}
