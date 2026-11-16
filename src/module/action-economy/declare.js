import {
  ACTION_DECLARED_HOOK,
  ACTION_KINDS,
  DECLARATION_FAILURE_REASONS as REASONS,
  ECONOMY_TYPES,
  actionEconomyApplies,
  kindTriggersActionEffects,
} from "./kinds.js";
import {
  REACTION_PAYMENT_ORDERS,
  canPayReactionForDeclaration,
  resolveReactionCreditCombatant,
  spendReactionsForDeclaration,
} from "./reaction-credits.js";
import { createKeyedQueue } from "../keyed-queue.js";
import { combatantActsFor, isUnlinkedTokenCombatantOf } from "./acting-token.js";
import { checkActionTiming } from "./timing.js";
import { optionalString } from "../shared-helpers.js";

const KNOWN_ACTION_KINDS = new Set(Object.values(ACTION_KINDS));

/** @type {{ id: string, order: number, seq: number, fn: Function }[]} */
const processors = [];
let processorSeq = 0;

const actorDeclarations = createKeyedQueue();

function actorDeclarationLockKey(actor) {
  return actor?.uuid || actor?.id || null;
}

function withActorDeclarationLock(actor, task, owner) {
  return actorDeclarations.run(actorDeclarationLockKey(actor), task, { owner });
}

/** Is some other declaration still running for the actor? (one with this owner doesn't count) */
export function isActorDeclarationBusy(actor, owner = null) {
  const key = actorDeclarationLockKey(actor);
  if (!key || !actorDeclarations.isBusy(key)) return false;
  return owner == null || actorDeclarations.holder(key) !== owner;
}

function fail(reason) {
  return { ok: false, reason };
}

function isActorDocument(value) {
  return value?.documentName === "Actor";
}

function isItemDocument(value) {
  return value?.documentName === "Item";
}

function normalizeKind(kind) {
  if (kind == null) return null;
  const value = String(kind).trim();
  return value || null;
}

function normalizeCost(cost) {
  if (cost === undefined || cost === null || cost === "") return 1;
  const value = Number(cost);
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return null;
  return value;
}

function resolveTarget(raw) {
  if (!raw) return { target: null, targetActorId: null };
  if (isActorDocument(raw)) return { target: raw, targetActorId: raw.id ?? null };
  if (isActorDocument(raw.actor)) {
    return { target: raw.actor, targetActorId: raw.actor.id ?? raw.actorId ?? null };
  }
  const targetActorId = raw.actorId ?? raw.id ?? null;
  return { target: null, targetActorId: targetActorId ? String(targetActorId) : null };
}

function tokenOnOtherScene(combat, tokenId) {
  const combatSceneId = combat?.scene?.id ?? null;
  if (!combatSceneId) return false;
  for (const scene of game.scenes) {
    if (scene.id === combatSceneId) continue;
    if (scene.tokens.get(tokenId)) return true;
  }
  return false;
}

/**
 * A token with no Combatant only declares without one if this Actor has no Combatant
 * in the combat or the token is on another scene. Otherwise it would skip that
 * Combatant's credit ledger.
 */
function resolveCombatContext(actor, options = {}) {
  const combat = options.combat ?? options.combatant?.parent ?? game.combat;
  const round = combat?.round ?? null;
  const turn = combat?.turn ?? null;
  const base = { combat, combatId: combat?.id ?? null, round, turn };
  if (options.combatant) {
    if (isUnlinkedTokenCombatantOf(options.combatant, actor)) return { ok: false, reason: REASONS.ACT_FROM_TOKEN };
    if (!combatantActsFor(options.combatant, actor)) return { ok: false, reason: REASONS.COMBATANT_MISMATCH };
    return { ok: true, ...base, combatant: options.combatant };
  }
  if (!combat) return { ok: true, ...base, combatant: null };

  const requestedToken = optionalString(options.tokenId ?? options.token?.id);
  if (requestedToken) {
    const matches = combat.combatants.filter((entry) => entry.tokenId === requestedToken);
    if (matches.length > 1) return { ok: false, reason: REASONS.AMBIGUOUS_COMBATANT };
    if (matches.length === 1) {
      if (isUnlinkedTokenCombatantOf(matches[0], actor)) return { ok: false, reason: REASONS.ACT_FROM_TOKEN };
      if (!combatantActsFor(matches[0], actor)) return { ok: false, reason: REASONS.COMBATANT_MISMATCH };
      return { ok: true, ...base, combatant: matches[0] };
    }
    if (!tokenOnOtherScene(combat, requestedToken) && combat.combatants.some((entry) => combatantActsFor(entry, actor))) {
      return { ok: false, reason: REASONS.COMBATANT_MISMATCH };
    }
    return { ok: true, ...base, combatant: null };
  }

  const ownToken = optionalString(actor?.token?.id);
  if (ownToken) {
    const matches = combat.combatants.filter((entry) => entry.tokenId === ownToken);
    if (matches.length === 1) return { ok: true, ...base, combatant: matches[0] };
    if (matches.length > 1) return { ok: false, reason: REASONS.AMBIGUOUS_COMBATANT };
    return { ok: true, ...base, combatant: null };
  }

  const byActor = combat.combatants.filter((entry) => entry.actor && combatantActsFor(entry, actor));
  if (byActor.length > 1) return { ok: false, reason: REASONS.AMBIGUOUS_COMBATANT };
  if (!byActor.length && combat.combatants.some((entry) => isUnlinkedTokenCombatantOf(entry, actor))) {
    return { ok: false, reason: REASONS.ACT_FROM_TOKEN };
  }
  return { ok: true, ...base, combatant: byActor[0] ?? null };
}

function sortedProcessors() {
  return [...processors].sort((a, b) => (a.order - b.order) || (a.seq - b.seq));
}

/**
 * Adds a processor that gets awaited after every successful declaration (cost 0 too),
 * lower `order` first. Registering the same `id` again replaces the old one. Processors
 * also run when `triggersActionEffects` is false.
 */
export function registerActionDeclarationProcessor({ id, order = 0, fn } = {}) {
  const key = String(id ?? "").trim();
  if (!key || typeof fn !== "function") {
    throw new Error("[PMTTRPG] action declaration processor requires id and fn");
  }
  unregisterActionDeclarationProcessor(key);
  processors.push({
    id: key,
    order: Number(order) || 0,
    seq: processorSeq++,
    fn,
  });
}

export function unregisterActionDeclarationProcessor(id) {
  const key = String(id ?? "");
  const index = processors.findIndex((entry) => entry.id === key);
  if (index >= 0) processors.splice(index, 1);
}

export function listActionDeclarationProcessors() {
  return sortedProcessors().map((entry) => ({ id: entry.id, order: entry.order }));
}

/** If a processor throws we just log it since the spend already happened. */
async function runActionDeclarationProcessors(declaration) {
  for (const processor of sortedProcessors()) {
    try {
      await processor.fn(declaration);
    } catch (error) {
      console.error(`[PMTTRPG] action declaration processor '${processor.id}' failed:`, error);
    }
  }
}

function canPayActionCost(actor, cost = 1) {
  const needed = normalizeCost(cost);
  if (needed == null) return false;
  if (needed === 0) return true;
  const pool = actor?.system?.attributes?.actions;
  if (!pool) return false;
  return (Number(pool.value) || 0) >= needed;
}

function resolveDeclarationPayment({ economyType, cost, asReaction = false } = {}) {
  const requested = normalizeCost(cost);
  if (requested == null) return null;
  if (asReaction === true && economyType === ECONOMY_TYPES.ACTION) {
    return { economyType: ECONOMY_TYPES.REACTION, cost: Math.min(requested, 1), asReaction: true };
  }
  return { economyType, cost: requested, asReaction: false };
}

/**
 * An Action taken as a Reaction and the sheet's Used Reaction only take Universal credits
 * and the pool. Used Reaction starts with the pool so its number drops first.
 */
function reactionPaymentRequest({ kind, itemId, cost, asReaction, acceptKinds = null, paymentOrder = null }) {
  if (kind === ACTION_KINDS.MANUAL) {
    return { kind, itemId, amount: cost, acceptKinds: [], order: REACTION_PAYMENT_ORDERS.POOL_FIRST };
  }
  if (asReaction) {
    return { kind, itemId, amount: cost, acceptKinds: [], order: REACTION_PAYMENT_ORDERS.RESTRICTED_FIRST };
  }
  return { kind, itemId, amount: cost, acceptKinds, order: paymentOrder };
}

function canPayReactionCost(actor, { combat, combatant, tokenId, ...request }) {
  return canPayReactionForDeclaration(actor, reactionPaymentRequest(request), { combat, combatant, tokenId });
}

/** Same turn rule and payment check as declareActorAction (without spending anything). */
export function canPayDeclaration(actor, {
  economyType = ECONOMY_TYPES.ACTION,
  kind,
  cost = 1,
  itemId = null,
  combat = null,
  combatant = null,
  tokenId = null,
  timing = null,
  asReaction = false,
  acceptKinds = null,
  paymentOrder = null,
} = {}) {
  return declarationPaymentCheck(actor, {
    economyType, kind, cost, itemId, combat, combatant, tokenId, timing, asReaction, acceptKinds, paymentOrder,
  }).ok;
}

function declarationPaymentCheck(actor, {
  economyType, kind, cost, itemId, combat, combatant, tokenId, timing, asReaction, acceptKinds, paymentOrder,
}) {
  if (!actor) return { ok: false, paidWith: economyType };
  // same as the spend: no combat passed means the Combatant's own, else the one on screen
  combat ??= combatant?.parent ?? game.combat;
  const acting = combatant ?? (combat?.started
    ? resolveReactionCreditCombatant(actor, { combat, tokenId: tokenId ?? actor.token?.id ?? null })
    : null);
  const check = checkActionTiming({ combat, combatant: acting, economyType, kind, timing });
  if (!check.ok) return { ok: false, paidWith: economyType };
  if (!actionEconomyApplies(combat, acting)) return { ok: true, paidWith: economyType };
  const payment = resolveDeclarationPayment({ economyType, cost, asReaction: asReaction === true || check.asReaction });
  if (!payment) return { ok: false, paidWith: economyType };
  const paidWith = payment.economyType;
  if (payment.cost === 0) return { ok: true, paidWith };
  if (paidWith === ECONOMY_TYPES.ACTION) return { ok: canPayActionCost(actor, payment.cost), paidWith };
  return {
    ok: canPayReactionCost(actor, {
      kind,
      itemId,
      cost: payment.cost,
      asReaction: payment.asReaction,
      acceptKinds,
      paymentOrder,
      combat,
      combatant: acting,
      tokenId,
    }),
    paidWith,
    offTurn: payment.asReaction === true,
  };
}

/** For workflows with dialogs, so a cost the actor can't pay gets refused before anything opens. */
export function refuseIfUnaffordable(actor, {
  economyType = ECONOMY_TYPES.ACTION,
  kind,
  cost = 1,
  consume = true,
  combat = null,
  combatant = null,
  tokenId = null,
  timing = null,
  warn = true,
  reactionMessageKey = null,
} = {}) {
  if (consume === false) return null;
  const check = declarationPaymentCheck(actor, { economyType, kind, cost, combat, combatant, tokenId, timing });
  if (check.ok) return null;
  const reaction = check.paidWith === ECONOMY_TYPES.REACTION;
  if (warn) warnCannotPay(actor, { reaction, offTurn: check.offTurn, reactionMessageKey });
  return { ok: false, reason: reaction ? REASONS.INSUFFICIENT_REACTIONS : REASONS.INSUFFICIENT_ACTIONS };
}

function warnCannotPay(actor, { reaction = false, offTurn = false, reactionMessageKey = null } = {}) {
  let key = "PMTTRPG.ActionDeclaration.NoAction";
  if (reaction) key = offTurn ? "PMTTRPG.ActionDeclaration.NoReaction" : (reactionMessageKey ?? "PMTTRPG.ActionDeclaration.NoReactionLeft");
  ui.notifications.warn(game.i18n.format(key, { name: actor?.name ?? "" }));
}

export async function applyDeclaredActorUpdate(actor, update) {
  const { runAsOwnerOrGM } = await import("../easy-effects/gm-route.js");
  return runAsOwnerOrGM(actor, "applyActorUpdate", { update });
}

export async function applyDeclaredOwnedItemUpdate(actor, item, update) {
  const { runAsOwnerOrGM } = await import("../easy-effects/gm-route.js");
  return runAsOwnerOrGM(actor, "updateOwnedItem", {
    itemUuid: item.uuid,
    update,
  });
}

/**
 * Commits one Action or Reaction: validate, turn rule, spend, processors, then the `pmttrpg.actionDeclared` hook.
 *
 * Off turn an `ownTurn` kind like Dash or Ready gets refused with `not-active-turn`.
 * Other Actions are taken as a Reaction and pay one Reaction no matter their cost, but a
 * Free Action stays free. Pass `asReaction: true` when the caller already decided that
 * (like an attack card made off turn that resolves later). `timing: { mode: "anytime", source }`
 * skips the turn rule at the normal cost. Out of combat it's always cost 0.
 *
 * Calls for the same Actor run one at a time, even at cost 0. `precheck` and `apply` run in
 * that same queue so no other declaration of this Actor can get in between. `precheck`
 * refuses on `false` or `{ ok: false, reason }`. Keep `apply` to writes. A dialog in there
 * would block every later declaration of this Actor.
 *
 * @param {object} options
 * @param {Actor} options.actor  the Actor taking it
 * @param {string} options.economyType  "action" or "reaction"
 * @param {string} options.kind  one of `game.projectmoonttrpg.actions.ACTION_KINDS`
 * @param {number} [options.cost=1]  a whole number, 0 for a free one
 * @param {boolean} [options.consume=true]  false declares at cost 0, but processors, [On Action] and the hook still run
 * @param {boolean} [options.asReaction=false]  pay an Action with a Reaction
 * @param {object} [options.timing]  `{ mode: "anytime", source }` skips the turn rule
 * @param {Item} [options.item]  the Item it was taken with
 * @param {Actor} [options.target]  the target, or `{ actor }` or `{ actorId }`
 * @param {Combat} [options.combat]  defaults to the Combatant's combat, then `game.combat`
 * @param {Combatant} [options.combatant]  the acting Combatant, whose Reaction credits get used
 * @param {TokenDocument} [options.token]  the acting token (or pass `tokenId`)
 * @param {object} [options.metadata]  copied onto the declaration for processors and hook listeners
 * @param {boolean} [options.triggersActionEffects]  overrides whether [On Action] runs, otherwise the kind decides
 * @param {boolean} [options.warn=true]  false hides the turn and pool warnings
 * @param {Function} [options.precheck]  gets `{ actor, combat, combatant }` before anything is spent
 * @param {Function} [options.apply]  gets the declaration after the processors
 * @param {string[]} [options.acceptKinds]  credit kinds a Reaction may be paid with, by default just `kind` if it's a typed Reaction
 * @param {string} [options.paymentOrder]  `restrictedFirst`, `poolFirst` or `any`: how Reaction credits and the pool get picked
 * @returns {Promise<object>}  `{ ok: true, declaration }`, or `{ ok: false, reason }` when it's refused
 */
export async function declareActorAction(options = {}) {
  const actor = options.actor;
  if (!isActorDocument(actor)) {
    return fail(REASONS.INVALID_ACTOR);
  }
  // something running inside this declaration (its [On Action] scripts) passes the same
  // owner back in, so it goes in right away instead of waiting on itself
  const owner = options.queueOwner ?? Symbol("declaration");
  return withActorDeclarationLock(actor, () => commitDeclaredAction(options, owner), owner);
}

async function commitDeclaredAction(options = {}, owner = null) {
  const actor = options.actor;
  const economyType = String(options.economyType ?? "").trim().toLowerCase();
  if (economyType !== ECONOMY_TYPES.ACTION && economyType !== ECONOMY_TYPES.REACTION) {
    return fail(REASONS.INVALID_ECONOMY_TYPE);
  }

  const kind = normalizeKind(options.kind);
  if (!kind) return fail(REASONS.INVALID_KIND);
  if (!KNOWN_ACTION_KINDS.has(kind)) {
    return fail(REASONS.UNKNOWN_KIND);
  }

  const combatCtx = resolveCombatContext(actor, options);
  if (!combatCtx.ok) {
    // this warns even with `warn: false` since callers don't report identity refusals themselves
    const key = {
      [REASONS.AMBIGUOUS_COMBATANT]: "PMTTRPG.ActionDeclaration.AmbiguousCombatant",
      [REASONS.ACT_FROM_TOKEN]: "PMTTRPG.ActionDeclaration.ActFromToken",
    }[combatCtx.reason] ?? "PMTTRPG.ActionDeclaration.CombatantMismatch";
    ui.notifications.warn(game.i18n.format(key, { name: actor.name ?? "" }));
    return fail(combatCtx.reason);
  }

  const timing = checkActionTiming({
    combat: combatCtx.combat,
    combatant: combatCtx.combatant,
    economyType,
    kind,
    timing: options.timing ?? null,
  });
  if (!timing.ok) {
    if (options.warn !== false) {
      ui.notifications.warn(game.i18n.format("PMTTRPG.ActionDeclaration.NotYourTurn", { name: actor.name ?? "" }));
    }
    return fail(timing.reason);
  }

  const payment = resolveDeclarationPayment({
    economyType,
    cost: options.cost,
    asReaction: options.asReaction === true || timing.asReaction,
  });
  if (!payment) return fail(REASONS.INVALID_COST);
  const paidEconomy = payment.economyType;
  const consumed = options.consume !== false && actionEconomyApplies(combatCtx.combat, combatCtx.combatant);
  const cost = consumed ? payment.cost : 0;

  if (typeof options.precheck === "function") {
    const checked = await options.precheck({ actor, combat: combatCtx.combat, combatant: combatCtx.combatant });
    if (checked === false || (checked && typeof checked === "object" && checked.ok === false)) {
      return fail(checked?.reason ?? REASONS.PRECHECK_FAILED);
    }
  }

  const poolKey = paidEconomy === ECONOMY_TYPES.ACTION ? "actions" : "reactions";
  const insufficientReason = paidEconomy === ECONOMY_TYPES.ACTION
    ? REASONS.INSUFFICIENT_ACTIONS
    : REASONS.INSUFFICIENT_REACTIONS;
  const item = isItemDocument(options.item) ? options.item : null;
  const itemId = item?.id ?? null;

  let paidUnits = [];
  if (cost > 0) {
    if (paidEconomy !== ECONOMY_TYPES.REACTION) {
      const spent = await actor.spendActionEconomy(poolKey, cost, { warn: false });
      if (!spent) {
        if (options.warn !== false) warnCannotPay(actor);
        return fail(insufficientReason);
      }
      paidUnits = Array.from({ length: cost }, () => ({ by: "pool" }));
    } else {
      const paid = await spendReactionsForDeclaration(actor, reactionPaymentRequest({
        kind,
        itemId,
        cost,
        asReaction: payment.asReaction,
        acceptKinds: options.acceptKinds ?? null,
        paymentOrder: options.paymentOrder ?? null,
      }), {
        combatant: options.combatant,
        tokenId: options.tokenId ?? options.token?.id ?? null,
        combat: options.combat,
        warn: false,
      });
      if (!paid.ok) {
        const reason = paid.reason === "persist-failed"
          ? REASONS.REACTION_CREDIT_PERSIST_FAILED
          : insufficientReason;
        if (paid.reason === "insufficient" && options.warn !== false) {
          warnCannotPay(actor, { reaction: true, offTurn: payment.asReaction === true });
        }
        return fail(reason);
      }
      paidUnits = Array.isArray(paid.paid) ? paid.paid : [{ by: paid.paidBy === "credit" ? "credit" : "pool", creditId: paid.creditId ?? null }];
    }
  }
  const { target, targetActorId } = resolveTarget(options.target);
  const metadata = (options.metadata && typeof options.metadata === "object" && !Array.isArray(options.metadata))
    ? { ...options.metadata }
    : {};
  // tokenId and combatantId are only what the caller passed. `combatant` can
  // still come from the match in resolveCombatContext
  const tokenId = optionalString(options.tokenId ?? options.token?.id);
  const combatantId = optionalString(options.combatant?.id);

  const declaration = {
    id: foundry.utils.randomID(),
    actor,
    actorId: actor.id ?? null,
    economyType: paidEconomy,
    kind,
    cost,
    consumed,
    skippedCost: consumed ? 0 : payment.cost,
    payment: { economyType: paidEconomy, units: paidUnits },
    timing: { mode: timing.mode, offTurn: timing.offTurn, source: timing.source, asReaction: payment.asReaction },
    triggersActionEffects: kindTriggersActionEffects(kind, options.triggersActionEffects),
    item,
    itemId: item?.id ?? null,
    target,
    targetActorId,
    tokenId,
    combatantId,
    combat: combatCtx.combat,
    combatId: combatCtx.combatId,
    combatant: combatCtx.combatant,
    round: combatCtx.round,
    turn: combatCtx.turn,
    metadata,
    queueOwner: owner,
    nestedDepth: Math.max(0, Math.trunc(Number(options.nestedDepth) || 0)),
  };

  await runActionDeclarationProcessors(declaration);
  if (typeof options.apply === "function") {
    try {
      await options.apply(declaration);
    } catch (error) {
      console.error("[PMTTRPG] action declaration apply failed after the spend", error);
    }
  }
  Hooks.callAll(ACTION_DECLARED_HOOK, declaration);

  return { ok: true, declaration };
}

const ON_ACTION_PROCESSOR_ID = "emitActorAction-from-declaration";

function declarationActionType(declaration) {
  if (declaration.economyType === ECONOMY_TYPES.REACTION) return "reaction";
  if (declaration.kind === ACTION_KINDS.TOOL) {
    return declaration.item?.system?.toolKind === "standalone" ? "standalone" : "tool";
  }
  return "action";
}

/**
 * `[On Action]` treats a truthy `item` as a scope and only runs that item's scripts.
 * A declaration is the whole actor acting so the weapon, outfit or tool goes in
 * `usedItem` and `item` stays null.
 */
function buildDeclarationActionPayload(declaration) {
  return {
    actor: declaration.actor,
    actorId: declaration.actorId,
    actionType: declarationActionType(declaration),
    kind: declaration.kind,
    item: null,
    usedItem: declaration.item ?? null,
    declarationId: declaration.id ?? null,
    action: {
      reaction: declaration.economyType === ECONOMY_TYPES.REACTION,
      kind: declaration.kind ?? "",
      consumed: declaration.consumed !== false,
      offTurn: declaration.timing?.offTurn === true,
    },
    target: declaration.target ?? null,
    clash: declaration.metadata?.clash,
    attacker: declaration.metadata?.attacker,
    defender: declaration.metadata?.defender,
    declarationOwner: declaration.queueOwner ?? null,
    declarationDepth: Number(declaration.nestedDepth) || 0,
  };
}

async function emitOnAction(payload) {
  const { emitActorAction } = await import("../easy-effects/registry.js");
  return emitActorAction(payload);
}

export function registerDeclarationOnActionEmit() {
  registerActionDeclarationProcessor({
    id: ON_ACTION_PROCESSOR_ID,
    order: 1000,
    fn: async (declaration) => {
      if (!declaration.triggersActionEffects) return;
      try {
        await emitOnAction(buildDeclarationActionPayload(declaration));
      } catch (error) {
        console.warn("[EasyEffects] actorAction hook failed", error);
      }
    },
  });
}
