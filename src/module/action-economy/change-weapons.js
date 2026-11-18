import {
  applyDeclaredOwnedItemUpdate,
  canPayDeclaration,
  declareActorAction,
} from "./declare.js";
import { ACTION_KINDS, ECONOMY_TYPES, actionEconomyApplies } from "./kinds.js";
import {
  DROPPED_ITEM_PATH,
  handOccupancy,
  isDroppedItem,
  isOneHandedHeldItem,
} from "./formulas.js";
import {
  applyHeldLoadoutTransition,
  heldWeaponIds,
} from "./held-weapon-reactions.js";
import { countReactionsForDeclaration, resolveReactionCreditCombatant } from "./reaction-credits.js";
import { createKeyedQueue } from "../keyed-queue.js";
import { checkActionTiming } from "./timing.js";
import { latestTurnIdentity } from "../combat/turn-stamps.js";
import { actorItems } from "../shared-helpers.js";
import { canUserUpdateDocument } from "../acting-user.js";

const SCOPE = "projectmoonttrpg";
const FREE_KEY = "freeOneHandChangeUsed";
const FREE_PATH = `flags.${SCOPE}.${FREE_KEY}`;

const WARN_KEYS = {
  "not-active-turn": "PMTTRPG.ActionMenu.ChangeWeaponsNotYourTurn",
  "no-operations": "PMTTRPG.ActionMenu.ChangeWeaponsNoOperations",
  "free-used": "PMTTRPG.ActionMenu.ChangeWeaponsFreeUsed",
  "on-ground": "PMTTRPG.ActionMenu.ChangeWeaponsOnGroundWarn",
  stale: "PMTTRPG.ActionMenu.ChangeWeaponsStale",
  noop: "PMTTRPG.ActionMenu.ChangeWeaponsNoChange",
  "not-1h": "PMTTRPG.ActionMenu.ChangeWeaponsNotOneHanded",
  "insufficient-actions": "PMTTRPG.ActionMenu.ChangeWeaponsNoAction",
  "insufficient-reactions": "PMTTRPG.ActionMenu.ChangeWeaponsNoReaction",
  "mutation-failed": "PMTTRPG.ActionMenu.ChangeWeaponsFailed",
  "transition-failed": "PMTTRPG.ActionMenu.ChangeWeaponsTransitionFailed",
};

const heldLoadoutChanges = createKeyedQueue();

function getOwnedItem(actor, id) {
  if (!actor || id == null || id === "") return null;
  return actor.items.get(id) ?? null;
}

function isHeld(item) {
  return item?.system?.equipped === true;
}

function isChangeWeaponsItem(item) {
  if (!item || (item.type !== "weapon" && item.type !== "tool")) return false;
  return handOccupancy(item) > 0;
}

export function listChangeWeaponsItems(actor) {
  return actorItems(actor)
    .filter(isChangeWeaponsItem)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "weapon" ? -1 : 1;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
}

export function listHeldLoadout(actor) {
  return listChangeWeaponsItems(actor).filter(isHeld);
}

export function occupiedHands(actorOrItems) {
  const items = Array.isArray(actorOrItems) ? actorOrItems : listHeldLoadout(actorOrItems);
  return items.reduce((sum, item) => sum + handOccupancy(item), 0);
}

function readFreeStamp(combatant) {
  return combatant?.flags?.[SCOPE]?.[FREE_KEY] ?? null;
}

/**
 * Matches the turn identity, not the turn index (editing initiative doesn't hand the
 * free change back). That makes it once per window between two of the Combatant's
 * Turn Starts.
 */
function stampMatchesTurn(stamp, combatant, combat) {
  if (!stamp || typeof stamp !== "object") return false;
  if (stamp.combatantId && combatant?.id && stamp.combatantId !== combatant.id) return false;
  if (!combat) return true;
  if (stamp.combatId != null && combat.id != null && stamp.combatId !== combat.id) return false;
  if (!Number.isInteger(stamp.started)) return false;
  const turn = latestTurnIdentity(combat, combatant);
  if (!turn) return false;
  return turn.started === stamp.started && (turn.round ?? null) === (stamp.round ?? null);
}

export function freeOneHandChangeUsed(combatant, combat = null) {
  const stamp = readFreeStamp(combatant);
  if (!stamp) return false;
  if (stamp === true) return true;
  if (typeof stamp !== "object") return Boolean(stamp);
  return stampMatchesTurn(stamp, combatant, combat);
}

function makeFreeStamp(combatant, combat = null) {
  const turn = combat && combatant ? latestTurnIdentity(combat, combatant) : null;
  return {
    combatId: combat?.id ?? null,
    combatantId: combatant?.id ?? null,
    started: turn?.started ?? null,
    round: turn ? (turn.round ?? null) : (combat?.round ?? null),
  };
}

function loadoutLockKey(actor) {
  return actor?.uuid || actor?.id || null;
}

/**
 * Free changes skip the declaration lock. This per-Actor queue keeps them in order,
 * with each other and with the paid ones.
 */
function withHeldLoadoutLock(actor, task) {
  return heldLoadoutChanges.run(loadoutLockKey(actor), task);
}

function changeWeaponsTiming(combat, combatant, timing) {
  return checkActionTiming({
    combat,
    combatant,
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.CHANGE_WEAPON,
    timing: timing ?? null,
  });
}

function changeWeaponsPayWith(options = {}) {
  const timing = changeWeaponsTiming(options.combat ?? null, options.combatant ?? null, options.timing);
  return timing.ok && timing.asReaction ? ECONOMY_TYPES.REACTION : ECONOMY_TYPES.ACTION;
}

function canPayPaidChange(actor, options = {}) {
  if (options.ignoreActionCost === true) return true;
  const poolKey = changeWeaponsPayWith(options) === ECONOMY_TYPES.REACTION ? "reactions" : "actions";
  if (actor?.system?.attributes?.[poolKey] == null) return true;
  return canPayDeclaration(actor, {
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.CHANGE_WEAPON,
    cost: 1,
    combat: options.combat ?? null,
    combatant: options.combatant ?? null,
    timing: options.timing ?? null,
  });
}

function insufficientReason(options) {
  return changeWeaponsPayWith(options) === ECONOMY_TYPES.REACTION ? "insufficient-reactions" : "insufficient-actions";
}

export function changeWeaponsPool(actor, options = {}) {
  if (changeWeaponsPayWith(options) === ECONOMY_TYPES.REACTION) {
    if (actor?.system?.attributes?.reactions == null) return null;
    return {
      labelKey: "PMTTRPG.Reactions",
      value: countReactionsForDeclaration(actor, { kind: ACTION_KINDS.CHANGE_WEAPON, itemId: null }, {
        combat: options.combat ?? null,
        combatant: options.combatant ?? null,
      }),
    };
  }
  const pool = actor?.system?.attributes?.actions;
  if (!pool) return null;
  return { labelKey: "PMTTRPG.Actions", value: Math.max(0, Number(pool.value) || 0) };
}

const ERROR_REASONS = new Set(["mutation-failed", "transition-failed"]);

function warn(reason, options = {}) {
  if (options.warn === false) return;
  const key = WARN_KEYS[reason];
  if (!key) return;
  const message = game.i18n.localize(key);
  if (ERROR_REASONS.has(reason)) ui.notifications.error(message);
  else ui.notifications.warn(message);
}

function fail(reason, extra = {}) {
  return { ok: false, reason, cost: 0, usesFree: false, declares: false, ...extra };
}

function proposedLoadout(actor, { sheatheId = null, drawId = null } = {}) {
  const next = listHeldLoadout(actor).filter((item) => item.id !== sheatheId);
  if (drawId && drawId !== sheatheId) {
    const incoming = getOwnedItem(actor, drawId);
    if (incoming && isChangeWeaponsItem(incoming) && !next.some((item) => item.id === incoming.id)) {
      next.push(incoming);
    }
  }
  return next;
}

function sameHeldIds(left, right) {
  const a = left.map((item) => item.id).sort();
  const b = right.map((item) => item.id).sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function legalSwapPair(outgoing, incoming) {
  if (!outgoing || !incoming || outgoing.id === incoming.id) return false;
  if (!isHeld(outgoing) || isHeld(incoming)) return false;
  return isChangeWeaponsItem(outgoing) && isChangeWeaponsItem(incoming);
}

function availableChangeWeaponOperations(actor, options = {}) {
  const freeUsed = options.freeUsed ?? freeOneHandChangeUsed(options.combatant, options.combat);
  const held = listHeldLoadout(actor);
  const items = listChangeWeaponsItems(actor);
  const unheld = items.filter((item) => !isHeld(item));
  const canPay = canPayPaidChange(actor, options);
  const freeChange = (item) => !freeUsed && isOneHandedHeldItem(item);
  const freeDraw = (item) => freeChange(item) && !isDroppedItem(item);

  const sheathe = held.some(freeChange);
  const paidSheathe = canPay && held.some((item) => !freeChange(item));
  const draw = unheld.some(freeDraw);
  const paidDraw = canPay && unheld.some((item) => !freeDraw(item));
  const swap = canPay && held.some((outgoing) => unheld.some((incoming) => legalSwapPair(outgoing, incoming)));
  const drop = held.length > 0;
  return { sheathe, paidSheathe, draw, paidDraw, swap, drop };
}

export function evaluateChangeWeaponsPlan(actor, plan = {}, options = {}) {
  const op = String(plan.op ?? "").trim();
  const sheatheId = plan.sheatheId ? String(plan.sheatheId) : null;
  const drawId = plan.drawId ? String(plan.drawId) : null;
  const freeUsed = options.freeUsed ?? freeOneHandChangeUsed(options.combatant, options.combat);
  const operations = availableChangeWeaponOperations(actor, { ...options, freeUsed });

  if (!actor) return fail("stale", { operations });
  if (options.requireActiveTurn && !changeWeaponsTiming(options.combat, options.combatant, options.timing).ok) {
    return fail("not-active-turn", { operations });
  }

  const outgoing = sheatheId ? getOwnedItem(actor, sheatheId) : null;
  const incoming = drawId ? getOwnedItem(actor, drawId) : null;
  const currentHeld = listHeldLoadout(actor);

  if (op === "draw" || op === "paidDraw") {
    if (!incoming || !isChangeWeaponsItem(incoming)) return fail("stale", { operations });
    if (isHeld(incoming)) return fail("noop", { operations });
    const finalHands = occupiedHands(proposedLoadout(actor, { drawId }));
    const pickUp = isDroppedItem(incoming);
    const free = isOneHandedHeldItem(incoming) && !freeUsed && !pickUp;
    if (op === "draw" || free) {
      if (!free) {
        const reason = pickUp ? "on-ground" : (isOneHandedHeldItem(incoming) ? "free-used" : "not-1h");
        return fail(reason, { operations, finalHands });
      }
      return {
        ok: true,
        op: "draw",
        cost: 0,
        usesFree: true,
        declares: false,
        sheatheId: null,
        drawId,
        finalHands,
        pickUp,
        operations,
      };
    }
    if (!canPayPaidChange(actor, options)) {
      return fail(insufficientReason(options), { operations, finalHands, pickUp });
    }
    return {
      ok: true,
      op: "paidDraw",
      cost: 1,
      payWith: changeWeaponsPayWith(options),
      usesFree: false,
      declares: true,
      sheatheId: null,
      drawId,
      finalHands,
      pickUp,
      operations,
    };
  }

  if (op === "sheathe" || op === "paidSheathe") {
    if (!outgoing || !isChangeWeaponsItem(outgoing)) return fail("stale", { operations });
    if (!isHeld(outgoing)) return fail("noop", { operations });
    const finalHands = occupiedHands(proposedLoadout(actor, { sheatheId }));
    const free = isOneHandedHeldItem(outgoing) && !freeUsed;
    if (op === "sheathe" || free) {
      if (!free) {
        return fail(isOneHandedHeldItem(outgoing) ? "free-used" : "not-1h", { operations, finalHands });
      }
      return {
        ok: true,
        op: "sheathe",
        cost: 0,
        usesFree: true,
        declares: false,
        sheatheId,
        drawId: null,
        finalHands,
        operations,
      };
    }
    if (!canPayPaidChange(actor, options)) {
      return fail(insufficientReason(options), { operations, finalHands });
    }
    return {
      ok: true,
      op: "paidSheathe",
      cost: 1,
      payWith: changeWeaponsPayWith(options),
      usesFree: false,
      declares: true,
      sheatheId,
      drawId: null,
      finalHands,
      operations,
    };
  }

  if (op === "drop") {
    if (!outgoing || !isChangeWeaponsItem(outgoing)) return fail("stale", { operations });
    if (!isHeld(outgoing)) return fail("noop", { operations });
    const finalHands = occupiedHands(proposedLoadout(actor, { sheatheId }));
    return {
      ok: true,
      op,
      cost: 0,
      usesFree: false,
      declares: false,
      sheatheId,
      drawId: null,
      finalHands,
      operations,
    };
  }

  if (op === "swap") {
    if (!outgoing || !incoming) return fail("stale", { operations });
    if (!isChangeWeaponsItem(outgoing) || !isChangeWeaponsItem(incoming)) return fail("stale", { operations });
    if (outgoing.id === incoming.id) return fail("noop", { operations });
    if (!isHeld(outgoing) || isHeld(incoming)) return fail("stale", { operations });
    const finalLoadout = proposedLoadout(actor, { sheatheId, drawId });
    const finalHands = occupiedHands(finalLoadout);
    if (sameHeldIds(currentHeld, finalLoadout)) return fail("noop", { operations, finalHands });
    if (!canPayPaidChange(actor, options)) {
      return fail(insufficientReason(options), { operations, finalHands });
    }
    return {
      ok: true,
      op,
      cost: 1,
      payWith: changeWeaponsPayWith(options),
      usesFree: false,
      declares: true,
      sheatheId,
      drawId,
      finalHands,
      operations,
    };
  }

  return fail("stale", { operations });
}

function mutationsForPlan(actor, plan) {
  const mutations = [];
  if (plan.sheatheId) {
    const item = getOwnedItem(actor, plan.sheatheId);
    const update = { "system.equipped": false };
    if (plan.op === "drop") update[DROPPED_ITEM_PATH] = true;
    if (item) mutations.push({ item, update });
  }
  if (plan.drawId) {
    const item = getOwnedItem(actor, plan.drawId);
    const update = { "system.equipped": true };
    if (isDroppedItem(item)) update[DROPPED_ITEM_PATH] = false;
    if (item) mutations.push({ item, update });
  }
  return mutations;
}

async function applyHeldMutations(actor, mutations) {
  if (!mutations.length) return;
  if (mutations.length > 1 && canUserUpdateDocument(actor)) {
    await actor.updateEmbeddedDocuments(
      "Item",
      mutations.map(({ item, update }) => ({ _id: item.id, ...update })),
    );
    return;
  }
  for (const { item, update } of mutations) {
    await applyDeclaredOwnedItemUpdate(actor, item, update);
  }
}

function changeWeaponsDetail(actor, plan) {
  const nameOf = (id) => (id ? actor.items.get(id)?.name ?? null : null);
  const label = (key) => game.i18n.localize(key);
  const outgoing = nameOf(plan.sheatheId);
  const incoming = nameOf(plan.drawId);
  if (outgoing && incoming) return `${outgoing} → ${incoming}`;
  if (incoming && plan.pickUp) return `${label("PMTTRPG.ActionMenu.ChangeWeaponsPickUp")}: ${incoming}`;
  if (incoming) return `${label("PMTTRPG.ActionMenu.ChangeWeaponsDraw")}: ${incoming}`;
  if (outgoing) return `${label("PMTTRPG.ActionMenu.ChangeWeaponsSheathe")}: ${outgoing}`;
  return null;
}

export async function executeChangeWeapons(actor, rawPlan = {}, options = {}) {
  return withHeldLoadoutLock(actor, () => commitChangeWeapons(actor, rawPlan, options));
}

async function commitChangeWeapons(actor, rawPlan, options) {
  const combatant = options.combatant
    ?? resolveReactionCreditCombatant(actor, options);
  const combat = options.combat ?? game.combat;
  const plan = evaluateChangeWeaponsPlan(actor, rawPlan, {
    combatant,
    combat,
    freeUsed: options.freeUsed,
    requireActiveTurn: options.requireActiveTurn === true,
    timing: options.timing ?? null,
    ignoreActionCost: options.consume === false || !actionEconomyApplies(combat, combatant),
  });
  if (!plan.ok) {
    warn(plan.reason, options);
    return plan;
  }

  let declarationResult = { ok: true, declaration: null };
  if (plan.declares) {
    declarationResult = await declareActorAction({
      actor,
      economyType: ECONOMY_TYPES.ACTION,
      kind: ACTION_KINDS.CHANGE_WEAPON,
      cost: 1,
      item: null,
      target: null,
      combatant,
      tokenId: options.tokenId ?? options.token?.id ?? combatant?.tokenId ?? null,
      timing: options.timing ?? null,
      consume: options.consume,
      metadata: {
        outgoingItemId: plan.sheatheId,
        incomingItemId: plan.drawId,
        feedbackDetail: changeWeaponsDetail(actor, plan),
      },
    });
    if (!declarationResult?.ok) {
      return {
        ok: false,
        reason: declarationResult?.reason ?? "insufficient-actions",
        cost: 1,
        usesFree: false,
        declares: true,
      };
    }

    const afterDeclare = evaluateChangeWeaponsPlan(actor, rawPlan, {
      combatant,
      combat,
      freeUsed: options.freeUsed,
      requireActiveTurn: options.requireActiveTurn === true,
      timing: options.timing ?? null,
      ignoreActionCost: true,
    });
    if (!afterDeclare.ok) {
      console.error("[PMTTRPG] Change Weapons loadout became illegal after declaration", afterDeclare);
      warn("stale", options);
      return {
        ok: false,
        reason: afterDeclare.reason,
        cost: 1,
        usesFree: false,
        declares: true,
        declared: true,
      };
    }
  }

  const previousHeldWeaponIds = heldWeaponIds(actor);
  const mutations = mutationsForPlan(actor, plan);
  try {
    await applyHeldMutations(actor, mutations);
  } catch (error) {
    console.error("[PMTTRPG] Change Weapons equipment update failed", error);
    warn("mutation-failed", options);
    return {
      ok: false,
      reason: "mutation-failed",
      cost: plan.cost,
      usesFree: false,
      declares: plan.declares,
      declared: plan.declares,
    };
  }

  // the free-change stamp goes after the equipment update and before the Reaction transition.
  // A failed transition then can't give the free change back for a loadout that already changed.
  if (plan.usesFree && combatant) {
    await combatant.update({ [FREE_PATH]: makeFreeStamp(combatant, combat) });
  }

  try {
    await applyHeldLoadoutTransition(actor, {
      combatant,
      combat,
      token: options.token ?? null,
      tokenId: options.tokenId ?? options.token?.id ?? combatant?.tokenId ?? null,
      previousHeldWeaponIds,
      round: combat?.round ?? options.round ?? null,
    });
  } catch (error) {
    console.error("[PMTTRPG] held-loadout Reaction transition failed after equipment change", error);
    warn("transition-failed", options);
    return {
      ok: true,
      reason: "transition-failed",
      cost: plan.cost,
      usesFree: plan.usesFree,
      declares: plan.declares,
      declared: plan.declares,
      partial: "transition",
    };
  }

  return {
    ok: true,
    cost: plan.cost,
    usesFree: plan.usesFree,
    declares: plan.declares,
    declared: plan.declares,
    declaration: declarationResult.declaration ?? null,
  };
}

function resolveChangeWeaponsContext(actor, options = {}) {
  const combat = options.combat ?? game.combat;
  const combatant = combat
    ? resolveReactionCreditCombatant(actor, {
      combatant: options.combatant,
      combat,
      token: options.token ?? null,
      tokenId: options.tokenId ?? options.token?.id ?? null,
    })
    : null;
  if (!changeWeaponsTiming(combat, combatant, options.timing).ok) {
    return { ok: false, reason: "not-active-turn" };
  }
  return { ok: true, combat, combatant };
}

export async function startChangeWeapons(actor, options = {}) {
  if (!actor) return;

  const ctx = resolveChangeWeaponsContext(actor, options);
  if (!ctx.ok) {
    warn(ctx.reason, options);
    return ctx;
  }

  const ignoreActionCost = options.consume === false || !actionEconomyApplies(ctx.combat, ctx.combatant);
  const operations = availableChangeWeaponOperations(actor, {
    ...ctx,
    timing: options.timing ?? null,
    ignoreActionCost,
  });
  if (!Object.values(operations).some(Boolean)) {
    warn("no-operations", options);
    return { ok: false, reason: "no-operations" };
  }

  const { promptChangeWeapons } = await import("./change-weapons-dialog.js");
  const picked = await promptChangeWeapons(actor, {
    combat: ctx.combat,
    combatant: ctx.combatant,
    timing: options.timing ?? null,
    requireActiveTurn: true,
    ignoreActionCost,
  });
  if (!picked?.op) return;

  return executeChangeWeapons(actor, picked, {
    combatant: ctx.combatant,
    combat: ctx.combat,
    token: options.token ?? null,
    tokenId: options.tokenId ?? options.token?.id ?? ctx.combatant?.tokenId ?? null,
    requireActiveTurn: true,
    timing: options.timing ?? null,
    consume: options.consume,
  });
}
