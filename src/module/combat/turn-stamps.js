/**
 * Counters for each Combatant's actual turns. `started` goes up once per Turn
 * Start, and Delay's pointer moves and rewinds never bump it.
 *
 * An obligation `{ combatantId, afterStarted }` is done once the turn after
 * `afterStarted` has ended, so a state made during the Combatant's own turn
 * lasts until the end of their next one.
 */

import { isCurrentTurnCombatant } from "../action-economy/combat-flags.js";
import { combatantOf } from "./combatant-match.js";
import { createKeyedQueue } from "../keyed-queue.js";

const SCOPE = "projectmoonttrpg";
const TURN_STAMP_KEY = "turnStamp";
const TURN_STAMP_PATH = `flags.${SCOPE}.${TURN_STAMP_KEY}`;

const warned = new Set();

/** `endedStarted` is the `started` count of the last turn whose End of Turn ran. */
export function readTurnStamp(combatant, combat) {
  const raw = combatant?.flags?.[SCOPE]?.[TURN_STAMP_KEY];
  const combatId = combat?.id ?? null;
  if (!raw || typeof raw !== "object" || (combatId && String(raw.combatId) !== combatId)) {
    return { combatId, started: 0, round: null, endedStarted: 0 };
  }
  const started = Number.isInteger(raw.started) && raw.started >= 0 ? raw.started : 0;
  const endedStarted = Number.isInteger(raw.endedStarted) && raw.endedStarted >= 0 ? raw.endedStarted : 0;
  return { combatId, started, round: Number.isInteger(raw.round) ? raw.round : null, endedStarted };
}

function nextTurnStamp(combatant, combat, round = combat?.round) {
  const current = readTurnStamp(combatant, combat);
  return {
    combatId: combat?.id ?? null,
    started: current.started + 1,
    round: Number.isInteger(round) ? round : null,
    endedStarted: current.endedStarted,
  };
}

/** Only the GM running the turn lifecycle should call this. */
export async function recordTurnStart(combat, combatant, round = combat?.round) {
  if (!combat || !combatant) return null;
  const stamp = nextTurnStamp(combatant, combat, round);
  await combatant.update({ [TURN_STAMP_PATH]: stamp });
  return stamp;
}

/**
 * Due if the incoming Combatant's stamp is missing or from an earlier round.
 * One from this round or later means their Turn Start already ran, like when a
 * rewind replays the turn.
 */
export function isTurnStartDue(combatant, combat, round = combat?.round) {
  if (!combatant) return false;
  const stamp = readTurnStamp(combatant, combat);
  if (stamp.round == null || !Number.isInteger(round)) return true;
  return stamp.round < round;
}

/** Due unless the stamped turn already ended. Unstamped Combatants are always due. */
export function isTurnEndDue(combatant, combat) {
  if (!combatant) return false;
  const { started, endedStarted } = readTurnStamp(combatant, combat);
  return !(started > 0 && endedStarted >= started);
}

export async function recordTurnEnd(combat, combatant) {
  if (!combat || !combatant) return null;
  const current = readTurnStamp(combatant, combat);
  if (current.started <= 0 || current.endedStarted >= current.started) return null;
  const stamp = {
    combatId: combat.id,
    started: current.started,
    round: current.round,
    endedStarted: current.started,
  };
  await combatant.update({ [TURN_STAMP_PATH]: stamp });
  return stamp;
}

const ROUND_STAMP_KEY = "roundStamp";
const ROUND_STAMP_PATH = `flags.${SCOPE}.${ROUND_STAMP_KEY}`;

/** `reached` is the highest round whose start already ran in this combat (0 if there's none). */
function readRoundStamp(combat) {
  const raw = combat?.flags?.[SCOPE]?.[ROUND_STAMP_KEY];
  const reached = Number.isInteger(raw?.reached) && raw.reached > 0 ? raw.reached : 0;
  return { reached };
}

/** End of Round, Combat Start and Start of Round are only due for a round we haven't reached before. */
export function isRoundWorkDue(combat, round) {
  if (!Number.isInteger(round)) return true;
  return round > readRoundStamp(combat).reached;
}

/** Only the GM running the turn lifecycle should call this. */
export async function recordRoundReached(combat, round) {
  if (!combat || !Number.isInteger(round)) return null;
  const { reached } = readRoundStamp(combat);
  if (round <= reached) return null;
  await combat.update({ [ROUND_STAMP_PATH]: { reached: round } });
  return { reached: round };
}

/**
 * Null if it isn't their turn. A missing stamp or one from an earlier round means
 * the Turn Start write is still in flight, so we count this turn as `started + 1`.
 */
export function currentTurnIdentity(combat, combatant) {
  if (!combat || !combatant || !isCurrentTurnCombatant(combat, combatant)) return null;
  const stamp = readTurnStamp(combatant, combat);
  const round = Number.isInteger(combat.round) ? combat.round : null;
  const inFlight = stamp.round == null || (round != null && stamp.round < round);
  return {
    combatantId: String(combatant.id),
    started: inFlight ? stamp.started + 1 : stamp.started,
    round,
  };
}

/**
 * The Combatant's current turn, or the last one they started if it's off turn.
 * Before their first turn `started` is 0 and `round` is null.
 */
export function latestTurnIdentity(combat, combatant) {
  if (!combat?.started || !combatant) return null;
  const current = currentTurnIdentity(combat, combatant);
  if (current) return current;
  const stamp = readTurnStamp(combatant, combat);
  return { combatantId: String(combatant.id), started: stamp.started, round: stamp.round };
}

export function sameTurnIdentity(a, b) {
  if (!a || !b) return false;
  return String(a.combatantId) === String(b.combatantId)
    && a.started === b.started
    && (a.round ?? null) === (b.round ?? null);
}

/** Obligation that lasts until the end of this Combatant's next actual turn. */
export function makeFutureTurnObligation(combat, combatant) {
  const current = currentTurnIdentity(combat, combatant);
  const started = current ? current.started : readTurnStamp(combatant, combat).started;
  return { combatantId: String(combatant.id), afterStarted: started };
}

/** A Turn Start still in flight counts as started, and so does a missing Combatant. */
export function isNextTurnStarted(obligation, combat) {
  if (!obligation?.combatantId) return true;
  const combatant = combatantOf(combat, obligation.combatantId);
  if (!combatant) {
    const key = `next:${combat?.id}:${obligation.combatantId}`;
    if (!warned.has(key)) {
      warned.add(key);
      console.warn("[PMTTRPG] Next-turn Combatant is gone, so the turn is treated as started", obligation);
    }
    return true;
  }
  const live = currentTurnIdentity(combat, combatant);
  const started = live ? live.started : readTurnStamp(combatant, combat).started;
  return started > Number(obligation.afterStarted);
}

export function isFutureTurnObligationSatisfied(obligation, combat) {
  if (!obligation?.combatantId) return true;
  const combatant = combatantOf(combat, obligation.combatantId);
  if (!combatant) {
    const key = `${combat?.id}:${obligation.combatantId}`;
    if (!warned.has(key)) {
      warned.add(key);
      console.warn("[PMTTRPG] Turn obligation Combatant is gone, so the obligation is treated as satisfied", obligation);
    }
    return true;
  }
  const { started, endedStarted, round } = readTurnStamp(combatant, combat);
  const next = Number(obligation.afterStarted) + 1;
  if (endedStarted >= next) return true;
  return started > next || (started === next && Number.isInteger(round) && Number(combat.round) > round);
}

const turnLifecycles = createKeyedQueue();

/** Turn changes for one combat run one at a time on this client, in the order that they happened. */
export function queueTurnLifecycle(combat, task) {
  return turnLifecycles.run(combat?.uuid, task);
}

/** Resolves once the turn changes already queued for this combat are done here. Never await it from inside one, it would wait on itself. */
export function turnLifecyclesSettled(combat) {
  return turnLifecycles.run(combat?.uuid, () => undefined);
}
