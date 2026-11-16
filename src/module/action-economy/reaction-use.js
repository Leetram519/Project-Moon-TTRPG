import { registerActionDeclarationProcessor } from "./declare.js";
import { ECONOMY_TYPES } from "./kinds.js";
import { resolveReactionCreditCombatant } from "./reaction-credits.js";
import { latestTurnIdentity } from "../combat/turn-stamps.js";

const SCOPE = "projectmoonttrpg";
const USE_KEY = "reactionUse";
export const REACTION_USE_PATH = `flags.${SCOPE}.${USE_KEY}`;
const PROCESSOR_ID = "reaction-use-count";

export function normalizeReactionUseStamp(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const combatId = typeof raw.combatId === "string" && raw.combatId ? raw.combatId : null;
  const combatantId = typeof raw.combatantId === "string" && raw.combatantId ? raw.combatantId : null;
  if (!combatId || !combatantId || !Number.isInteger(raw.started) || raw.started < 0) return null;
  if (!Number.isInteger(raw.count) || raw.count < 0) return null;
  return {
    combatId,
    combatantId,
    started: raw.started,
    round: Number.isInteger(raw.round) ? raw.round : null,
    count: raw.count,
  };
}

/** Reactions this Combatant took since its last Turn Start (consumed or not). */
export function reactionsUsedThisTurn(combatant, combat = combatant?.parent ?? game.combat) {
  const stamp = normalizeReactionUseStamp(combatant?.flags?.[SCOPE]?.[USE_KEY]);
  if (!stamp || !combatant || !combat) return 0;
  if (stamp.combatId !== String(combat.id) || stamp.combatantId !== String(combatant.id)) return 0;
  const turn = latestTurnIdentity(combat, combatant);
  if (!turn || turn.started !== stamp.started || (turn.round ?? null) !== stamp.round) return 0;
  return stamp.count;
}

function nextReactionUseStamp(combatant, combat) {
  if (!combatant || !combat?.started) return null;
  const turn = latestTurnIdentity(combat, combatant);
  if (!turn) return null;
  return {
    combatId: String(combat.id),
    combatantId: String(combatant.id),
    started: turn.started,
    round: turn.round ?? null,
    count: reactionsUsedThisTurn(combatant, combat) + 1,
  };
}

async function writeReactionUseStamp(combatant, stamp) {
  const { runAsCombatantOwnerOrGM } = await import("../easy-effects/gm-route.js");
  return runAsCombatantOwnerOrGM(combatant, "setCombatantReactionUse", { stamp });
}

async function recordReactionUse(declaration) {
  if (declaration?.economyType !== ECONOMY_TYPES.REACTION) return false;
  const combat = declaration.combat ?? game.combat;
  if (!combat?.started) return false;
  const combatant = declaration.combatant
    ?? resolveReactionCreditCombatant(declaration.actor, { combat, tokenId: declaration.tokenId ?? null });
  const stamp = nextReactionUseStamp(combatant, combat);
  if (!stamp) return false;
  await writeReactionUseStamp(combatant, stamp);
  return true;
}

export function registerReactionUseCounter() {
  registerActionDeclarationProcessor({
    id: PROCESSOR_ID,
    // before [On Action] so its scripts see this Reaction counted
    order: 900,
    fn: async (declaration) => {
      try {
        await recordReactionUse(declaration);
      } catch (error) {
        console.warn("[PMTTRPG] Reaction use count failed", error);
      }
    },
  });
}
