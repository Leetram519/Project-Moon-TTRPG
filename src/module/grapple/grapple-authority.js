/**
 * Only the primary GM writes the Grapple Combat flag. Each change waits in a per-Combat
 * queue and re-reads the flag first, which makes it so that  two requests (like two Break Free rolls)
 * can't both act on the same relationship. The GM works out immunity obligations from turn
 * stamps itself.
 */

import { makeFutureTurnObligation } from "../combat/turn-stamps.js";
import { combatantOf } from "../combat/combatant-match.js";
import { createKeyedQueue } from "../keyed-queue.js";
import {
  GRAPPLE_STATE_PATH,
  applyClearFreeThrow,
  applyClearImmunity,
  applyCompleteBreakFree,
  applyCompleteThrow,
  applyCreateRelationship,
  applyEndRelationship,
  applyIncrementFailureBonus,
  pruneGrappleState,
  readGrappleState,
} from "./grapple-state.js";

export const GRAPPLE_OPS = {
  CREATE: "create",
  END: "end",
  INCREMENT_FAILURE_BONUS: "incrementFailureBonus",
  CLEAR_FREE_THROW: "clearFreeThrow",
  CLEAR_IMMUNITY: "clearImmunity",
  COMPLETE_BREAK_FREE: "completeBreakFree",
  COMPLETE_THROW: "completeThrow",
  PRUNE: "prune",
};

// ops a player can ask the GM for (create only happens in the GM's contest resolution)
const CLIENT_OPS = new Set([
  GRAPPLE_OPS.END,
  GRAPPLE_OPS.INCREMENT_FAILURE_BONUS,
  GRAPPLE_OPS.CLEAR_FREE_THROW,
  GRAPPLE_OPS.CLEAR_IMMUNITY,
  GRAPPLE_OPS.COMPLETE_BREAK_FREE,
  GRAPPLE_OPS.COMPLETE_THROW,
  GRAPPLE_OPS.PRUNE,
]);

const grappleStateMutations = createKeyedQueue();

export function withGrappleStateMutation(key, task) {
  return grappleStateMutations.run(key, task);
}

function obligationsFor(combat, relationship, op) {
  const target = combatantOf(combat, relationship?.targetCombatantId);
  const grappler = combatantOf(combat, relationship?.grapplerCombatantId);
  const list = [];
  if (target) list.push(makeFutureTurnObligation(combat, target));
  if (op === GRAPPLE_OPS.COMPLETE_THROW && grappler) list.push(makeFutureTurnObligation(combat, grappler));
  return list;
}

function transition(op, state, payload, combat) {
  switch (op) {
    case GRAPPLE_OPS.CREATE:
      return applyCreateRelationship(state, payload, { combat });
    case GRAPPLE_OPS.END:
      return applyEndRelationship(state, payload.relationshipId);
    case GRAPPLE_OPS.INCREMENT_FAILURE_BONUS:
      return applyIncrementFailureBonus(state, payload.relationshipId, payload.attemptId);
    case GRAPPLE_OPS.CLEAR_FREE_THROW:
      return applyClearFreeThrow(state, payload.grapplerCombatantId);
    case GRAPPLE_OPS.CLEAR_IMMUNITY:
      return applyClearImmunity(state, payload.immunityId);
    case GRAPPLE_OPS.COMPLETE_BREAK_FREE:
    case GRAPPLE_OPS.COMPLETE_THROW: {
      const relationship = state.relationships.find((entry) => entry.id === String(payload.relationshipId));
      const obligations = obligationsFor(combat, relationship, op);
      return op === GRAPPLE_OPS.COMPLETE_THROW
        ? applyCompleteThrow(state, payload.relationshipId, { obligations })
        : applyCompleteBreakFree(state, payload.relationshipId, { obligations });
    }
    case GRAPPLE_OPS.PRUNE:
      return pruneGrappleState(state, combat);
    default:
      return { ok: false, reason: "unknown-op", state, changed: false };
  }
}

async function writeGrappleState(combat, state) {
  await combat.update({ [GRAPPLE_STATE_PATH]: state });
}

/** Runs on the GM. */
export async function applyGrappleMutation(combat, op, payload = {}) {
  if (!combat) return { ok: false, reason: "no-combat" };
  return withGrappleStateMutation(combat.uuid, async () => {
    const result = transition(op, readGrappleState(combat), payload ?? {}, combat);
    if (!result.ok) return { ok: false, reason: result.reason };
    if (result.changed) await writeGrappleState(combat, result.state);
    return {
      ok: true,
      changed: result.changed,
      relationship: result.relationship ?? null,
      immunity: result.immunity ?? null,
      removedRelationships: result.removedRelationships ?? [],
      removedImmunities: result.removedImmunities ?? [],
    };
  });
}

export async function handleGrappleMutationRequest(combat, op, payload, { fromUser = null } = {}) {
  if (!fromUser?.isGM && !CLIENT_OPS.has(op)) {
    console.warn("[PMTTRPG] Refused a Grapple op from a client", { op, user: fromUser?.id ?? null });
    return { ok: false, reason: "forbidden" };
  }
  return applyGrappleMutation(combat, op, payload);
}

/** Runs here on the primary GM, otherwise it goes through the GM route (with no GM online nothing gets written). */
export async function requestGrappleMutation(combat, op, payload = {}) {
  if (!combat) return { ok: false, reason: "no-combat" };
  const { getPrimaryGM, runOnPrimaryGM } = await import("../easy-effects/gm-route.js");
  const gm = getPrimaryGM();
  if (!gm) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.Grapple.NeedsGM"));
    return { ok: false, reason: "no-gm" };
  }
  if (gm.id === game.user.id) return applyGrappleMutation(combat, op, payload);
  const result = await runOnPrimaryGM("mutateGrappleState", { combatUuid: combat.uuid, op, payload });
  return result ?? { ok: false, reason: "gm-unavailable" };
}
