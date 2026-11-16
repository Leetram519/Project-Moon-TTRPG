/**
 * The turn rule for declarations. In a started combat `ownTurn` needs the acting
 * Combatant to have the turn. Under `reactionOffTurn` (the default for most
 * Actions) you can declare off turn but it will cost a Reaction instead.
 *
 * Content that lets you declare off turn at the normal cost has to pass
 * `timing: { mode: "anytime", source }`.
 */

import { ACTION_TIMING, DECLARATION_FAILURE_REASONS, ECONOMY_TYPES, actionEconomyApplies, defaultTimingFor } from "./kinds.js";
import { isCurrentTurnCombatant } from "./combat-flags.js";
import { resolveReactionCreditCombatant } from "./reaction-credits.js";

const MODES = new Set(Object.values(ACTION_TIMING));

function normalizeMode(mode) {
  const value = typeof mode === "string" ? mode.trim() : "";
  return MODES.has(value) ? value : null;
}

/** Uses the timing you passed if its mode is valid, otherwise the kind's default (`fallback` is always the default). */
function resolveActionTiming({ economyType, kind, timing = null } = {}) {
  const fallback = defaultTimingFor(economyType, kind);
  const mode = normalizeMode(timing?.mode) ?? fallback;
  const source = timing && typeof timing.source === "string" && timing.source.trim()
    ? timing.source.trim()
    : null;
  return { mode, source, fallback };
}

export function checkActionTiming({ combat = null, combatant = null, economyType, kind, timing = null } = {}) {
  const { mode, source, fallback } = resolveActionTiming({ economyType, kind, timing });
  const allowed = { ok: true, reason: null, offTurn: false, source: null, mode, asReaction: false };
  if (!actionEconomyApplies(combat, combatant)) return allowed;
  if (isCurrentTurnCombatant(combat, combatant)) return allowed;
  if (mode === ACTION_TIMING.OWN_TURN) {
    return { ...allowed, ok: false, reason: DECLARATION_FAILURE_REASONS.NOT_ACTIVE_TURN, offTurn: true };
  }
  if (mode === ACTION_TIMING.REACTION_OFF_TURN) {
    // only an Action can be taken as a Reaction (a Reaction off turn is just normal)
    return economyType === ECONOMY_TYPES.ACTION ? { ...allowed, offTurn: true, asReaction: true } : allowed;
  }
  // `anytime` only reports offTurn if it bypassed a default that needs the turn
  const bypassed = fallback !== ACTION_TIMING.ANYTIME;
  return { ...allowed, offTurn: bypassed, source: bypassed ? source : null };
}

/** Same check for a workflow that hasn't found its Combatant yet, no Combatant means no dialog popup */
export function checkWorkflowTiming(actor, options = {}, { economyType, kind } = {}) {
  const combat = options.combat ?? game.combat;
  const combatant = combat?.started
    ? resolveReactionCreditCombatant(actor, {
      combatant: options.combatant,
      combat,
      tokenId: options.tokenId ?? options.token?.id ?? actor?.token?.id ?? null,
    })
    : null;
  return { ...checkActionTiming({ combat, combatant, economyType, kind, timing: options.timing ?? null }), combat, combatant };
}

/** The strict version, for workflows that need a started combat and the exact acting Combatant. */
export function resolveWorkflowContext(actor, options = {}, { economyType, kind } = {}) {
  const combat = options.combat ?? game.combat;
  if (!combat?.started) return { ok: false, reason: "no-combat" };
  const tokenId = options.tokenId ?? options.token?.id ?? actor?.token?.id ?? null;
  const combatant = resolveReactionCreditCombatant(actor, { combatant: options.combatant, combat, tokenId });
  if (!combatant) return { ok: false, reason: "no-combatant" };
  const timing = checkActionTiming({ combat, combatant, economyType, kind, timing: options.timing ?? null });
  if (!timing.ok) return { ok: false, reason: timing.reason };
  return { ok: true, combat, combatant, tokenId: tokenId ?? combatant.tokenId ?? null };
}

export function warnNotYourTurn(options = {}, key = "PMTTRPG.ActionMenu.NotYourTurn") {
  if (options.warn === false) return;
  ui.notifications.warn(game.i18n.localize(key));
}
