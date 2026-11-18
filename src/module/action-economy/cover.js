
import { PMTTRPGUtility } from "../utility.js";
import { readActionState, writeCombatantActionState } from "./combat-flags.js";
import { optionalString } from "../shared-helpers.js";
import { exactCombatantForToken } from "../combat/combatant-match.js";
import {
  ACTION_STATE_CATEGORIES,
  ACTION_STATE_ROLES,
  ACTION_STATE_VISIBILITY,
  registerActionStatePresenter,
} from "./presentation.js";

const COVER_HALF_ACTION_STATE_ICON = "systems/projectmoonttrpg/assets/icons/Statuses/PlayerState_HalfCover.webp";
const COVER_FULL_ACTION_STATE_ICON = "systems/projectmoonttrpg/assets/icons/Statuses/PlayerState_FullCover.webp";

const COVER_MODES = {
  HALF: "half",
  FULL: "full",
};

const DEFENSIVE_DICE = new Set(["block", "evade", "recycledEvade"]);

export function makeCoverState({ combat, combatant, declarationId, mode } = {}) {
  if (mode !== COVER_MODES.HALF && mode !== COVER_MODES.FULL) return null;
  const combatId = optionalString(combat?.id);
  const combatantId = optionalString(combatant?.id);
  const declaration = optionalString(declarationId);
  if (!combatId || !combatantId || !declaration) return null;
  return { version: 1, combatId, combatantId, declarationId: declaration, mode };
}

function normalizeCoverState(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (raw.version !== 1) return null;
  if (raw.mode !== COVER_MODES.HALF && raw.mode !== COVER_MODES.FULL) return null;
  const combatId = optionalString(raw.combatId);
  const combatantId = optionalString(raw.combatantId);
  const declarationId = optionalString(raw.declarationId);
  if (!combatId || !combatantId || !declarationId) return null;
  return { version: 1, combatId, combatantId, declarationId, mode: raw.mode };
}

export function getCoverState(combatant, { combat = game.combat } = {}) {
  const normalized = normalizeCoverState(readActionState(combatant).cover);
  if (!normalized || !combatant || !combat) return null;
  if (normalized.combatId !== combat.id) return null;
  if (normalized.combatantId !== combatant.id) return null;
  return { mode: normalized.mode, declarationId: normalized.declarationId };
}

export function canTargetWithAttack({ attackerItem, targetCombatant, combat = game.combat } = {}) {
  if (!PMTTRPGUtility.isRangedWeapon(attackerItem)) return { ok: true, reason: null };
  if (getCoverState(targetCombatant, { combat })?.mode === COVER_MODES.FULL) {
    return { ok: false, reason: "full-cover" };
  }
  return { ok: true, reason: null };
}

function coverDefensePower({
  defenderCombatant,
  attackerItem,
  retaliationType,
  combat = game.combat,
} = {}) {
  if (getCoverState(defenderCombatant, { combat })?.mode !== COVER_MODES.HALF) return 0;
  if (!PMTTRPGUtility.isRangedWeapon(attackerItem)) return 0;
  if (!DEFENSIVE_DICE.has(retaliationType)) return 0;
  return Math.max(0, Number(defenderCombatant?.actor?.system?.attributes?.rank?.value) || 0);
}

function addLabeledClashPower(sideBonuses, { field, value, labelKey } = {}) {
  if (!sideBonuses || !field || !labelKey) return;
  const amount = Number(value) || 0;
  if (!amount) return;
  sideBonuses[field] = (Number(sideBonuses[field]) || 0) + amount;
  if (!Array.isArray(sideBonuses.labeledPower)) sideBonuses.labeledPower = [];
  sideBonuses.labeledPower.push({ field, value: amount, labelKey });
}

export function applyCoverClashAdjustments(clashCtx, {
  state,
  choice,
  attackerItem,
  combat = game.combat,
} = {}) {
  if (!clashCtx?.bonuses?.defender || !state) return 0;
  const defender = exactCombatantForToken(combat, state.retaliatorTokenId ?? null);
  const power = coverDefensePower({
    defenderCombatant: defender,
    attackerItem,
    retaliationType: choice?.type ?? null,
    combat,
  });
  if (!power) return 0;
  const field = choice?.type === "block" ? "blockPower" : "evadePower";
  addLabeledClashPower(clashCtx.bonuses.defender, {
    field,
    value: power,
    labelKey: "PMTTRPG.Clash.Breakdown.HalfCover",
  });
  return power;
}

export async function clearCover(combatant) {
  if (!combatant) return false;
  return writeCombatantActionState(combatant, "cover", null);
}

function coverActionStateEntries({ combatant, combat } = {}) {
  const cover = getCoverState(combatant, { combat });
  if (!cover) return [];
  const half = cover.mode === COVER_MODES.HALF;
  const rank = Math.max(0, Number(combatant?.actor?.system?.attributes?.rank?.value) || 0);
  return [{
    id: `cover:${combatant.id}`,
    category: ACTION_STATE_CATEGORIES.TURN,
    actionId: "takeCover",
    combatantId: String(combatant.id),
    role: ACTION_STATE_ROLES.SELF,
    labelKey: half ? "PMTTRPG.ActionState.HalfCover" : "PMTTRPG.ActionState.FullCover",
    detailKey: half ? "PMTTRPG.ActionState.HalfCoverDetail" : "PMTTRPG.ActionState.FullCoverDetail",
    detailData: half ? { rank } : {},
    icon: {
      img: half ? COVER_HALF_ACTION_STATE_ICON : COVER_FULL_ACTION_STATE_ICON,
      fa: half ? "fa-shield-halved" : "fa-square-full",
    },
    expiryKey: "PMTTRPG.ActionState.UntilLeaveCover",
    visibility: ACTION_STATE_VISIBILITY.PUBLIC,
    dismissible: true,
  }];
}

export function registerCoverPresentation() {
  registerActionStatePresenter({
    id: "cover",
    order: 14,
    getEntries: coverActionStateEntries,
    dismiss: async (_entry, { combatant, combat }) => {
      const { leaveCover } = await import("./take-cover.js");
      return leaveCover(combatant, { combat, tokenId: combatant?.tokenId ?? null });
    },
  });
}

/** Blocks Full Cover targets in the attack dialog (ranged weapons only). */
export function rangedCoverBlock(weapon, combat = game.combat) {
  if (!PMTTRPGUtility.isRangedWeapon(weapon)) return null;
  return (option) => {
    const combatant = option?.combatant ?? null;
    if (!combatant) return null;
    return canTargetWithAttack({ attackerItem: weapon, targetCombatant: combatant, combat }).ok
      ? null
      : "PMTTRPG.Attack.TargetInFullCover";
  };
}
