/**
 * The Protect Action and its coverage checks. Being Grappled stops you from
 * declaring Protect, but if its active then it stays active.
 */

import { declareActorAction } from "./declare.js";
import { ACTION_KINDS, ECONOMY_TYPES } from "./kinds.js";
import { readActionState, writeCombatantActionState } from "./combat-flags.js";
import { resolveWorkflowContext } from "./timing.js";
import { getGrappleRestrictions } from "../grapple/grapple-restrictions.js";
import { latestTurnIdentity } from "../combat/turn-stamps.js";
import { gridBoxAt, gridBoxGap, tokenGridBox } from "../canvas/spatial.js";
import { isProtectStateLive, makeProtectState, normalizeProtectState, warnOnce } from "./protect-state.js";
import { canTargetWithAttack } from "./cover.js";
import {
  ACTION_STATE_CATEGORIES,
  ACTION_STATE_ROLES,
  ACTION_STATE_VISIBILITY,
  registerActionStatePresenter,
} from "./presentation.js";
import { registerInterceptorSource } from "../combat/interception.js";
import { combatantOf, exactCombatantForToken } from "../combat/combatant-match.js";
import { RULE_MERGES, defineRuleSubject, getRuleSubject, resolveRuleProfile } from "../rules/rule-contributions.js";

const PROTECT_ACTION_STATE_ICON = "systems/projectmoonttrpg/assets/icons/Statuses/PlayerState_Protect.webp";
const PROTECT_PRESENTER_ID = "protect";
const PROTECT_ACTION_ID = "protect";

const WARN_KEYS = {
  "no-combat": "PMTTRPG.ActionMenu.NeedsCombat",
  "no-combatant": "PMTTRPG.ActionMenu.ProtectNeedsToken",
  "not-active-turn": "PMTTRPG.ActionMenu.ProtectNotYourTurn",
  "already-protecting": "PMTTRPG.ActionMenu.ProtectAlready",
  grappled: "PMTTRPG.Grapple.ProtectRestricted",
};

function warn(reason, options = {}) {
  if (options.warn === false) return;
  const key = WARN_KEYS[reason];
  if (!key) return;
  ui.notifications.warn(game.i18n.localize(key));
}

function resolveProtectContext(actor, options = {}) {
  return resolveWorkflowContext(actor, options, { economyType: ECONOMY_TYPES.ACTION, kind: ACTION_KINDS.PROTECT });
}

export function readProtectState(combatant, { combat = game.combat } = {}) {
  const normalized = normalizeProtectState(readActionState(combatant).protect);
  if (!normalized || !isProtectStateLive(normalized, { combatant, combat })) {
    return { live: false, declarationId: null, afterStarted: null, boundary: null };
  }
  return {
    live: true,
    declarationId: normalized.declarationId,
    afterStarted: normalized.afterStarted,
    boundary: normalized.boundary,
  };
}

/** A live declared Protect counts, and so does a profile that marks them as Protecting. */
function isProtectActive(combatant, { combat = game.combat } = {}) {
  if (!combatant) return false;
  if (readProtectState(combatant, { combat }).live) return true;
  try {
    return getProtectProfile(combatant, { combat }).active === true;
  } catch (error) {
    warnOnce("profile", "Protect profile failed, so it is treated as inactive");
    console.warn("[PMTTRPG] Protect profile check failed", error);
    return false;
  }
}

/**
 * Waypoint i/j aren't Grid#getOffset (they count x then y). A pause cell with pixels
 * gets rebuilt from its top-left pixel, sized like the mover at the pause.
 */
function pauseCellBox(protector, cell) {
  const scene = protector?.token?.parent ?? null;
  const grid = scene?.grid ?? canvas.grid;
  return gridBoxAt(grid, { x: cell?.x, y: cell?.y, width: cell?.width, height: cell?.height });
}

function protectDistanceSquares(protector, position, { combat = game.combat } = {}) {
  const from = tokenGridBox(protector?.token ?? null);
  if (!from) return null;
  const pauseBox = pauseCellBox(protector, position?.cell);
  if (pauseBox) return gridBoxGap(from, pauseBox);
  if (position?.cell && Number.isFinite(position.cell.i) && Number.isFinite(position.cell.j)) {
    return gridBoxGap(from, { row: position.cell.i, col: position.cell.j, rows: 1, cols: 1 });
  }
  const tokenId = position?.tokenId ?? null;
  if (!tokenId || !combat) return null;
  const token = exactCombatantForToken(combat, tokenId)?.token ?? null;
  return gridBoxGap(from, tokenGridBox(token));
}

function isProtectingTarget(protector, target, {
  combat = game.combat,
  position = null,
} = {}) {
  if (!protector || !target) return false;
  if (String(protector.id) === String(target.id)) return false;
  if (!isProtectActive(protector, { combat })) return false;
  const range = Number(getProtectProfile(protector, { combat }).rangeSquares);
  if (!Number.isFinite(range)) return false;
  const distance = protectDistanceSquares(protector, position ?? { tokenId: target.tokenId ?? target.token?.id ?? null }, { combat });
  if (distance == null) {
    warnOnce(`distance:${protector.id}`, "Protect distance could not be measured, so there is no coverage");
    return false;
  }
  return distance <= range;
}

async function activateProtect(combatant, { combat, declarationId } = {}) {
  const turn = latestTurnIdentity(combat, combatant);
  const state = makeProtectState({
    combat,
    combatant,
    declarationId,
    afterStarted: turn?.started,
  });
  if (!state) return false;
  return writeCombatantActionState(combatant, "protect", state);
}

async function clearProtect(combatant, { tokenId = null, notify = true } = {}) {
  if (!combatant) return false;
  const wrote = await writeCombatantActionState(combatant, "protect", null);
  if (wrote && notify) {
    try {
      const { combatantFeedbackEvent, postActionFeedbackEvent } = await import("./action-feedback.js");
      await postActionFeedbackEvent(combatantFeedbackEvent(combatant, {
        id: foundry.utils.randomID(),
        kind: ACTION_KINDS.PROTECT,
        tokenId,
        metadata: { feedbackLabelKey: "PMTTRPG.ActionMenu.StopProtecting" },
      }));
    } catch (error) {
      console.warn("[PMTTRPG] Protect clear feedback failed", error);
    }
  }
  return wrote;
}

export async function startProtect(actor, options = {}) {
  if (!actor) return { ok: false, reason: "invalid-actor" };
  const ctx = resolveProtectContext(actor, options);
  if (!ctx.ok) {
    warn(ctx.reason, options);
    return ctx;
  }
  if (!getGrappleRestrictions(ctx.combatant, { combat: ctx.combat }).protect) {
    warn("grappled", options);
    return { ok: false, reason: "grappled" };
  }
  const protecting = () => readProtectState(ctx.combatant, { combat: ctx.combat }).live;
  if (protecting()) {
    warn("already-protecting", options);
    return { ok: false, reason: "already-protecting" };
  }
  return declareActorAction({
    actor,
    combatant: ctx.combatant,
    tokenId: ctx.tokenId,
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.PROTECT,
    cost: 1,
    timing: options.timing ?? null,
    consume: options.consume,
    precheck: () => {
      if (!protecting()) return true;
      warn("already-protecting", options);
      return { ok: false, reason: "already-protecting" };
    },
    apply: async (declaration) => {
      try {
        await activateProtect(ctx.combatant, { combat: ctx.combat, declarationId: declaration?.id ?? null });
      } catch (error) {
        console.error("[PMTTRPG] Protect actionState write failed after declaration", error);
        ui.notifications.error(game.i18n.localize("PMTTRPG.ActionMenu.ProtectFailed"));
      }
    },
  });
}

export function listProtectInterceptors(ctx = {}) {
  const combat = ctx.combat ?? null;
  if (!combat || ctx.originalTargetCombatantId == null) return [];
  const target = combatantOf(combat, ctx.originalTargetCombatantId);
  if (!target) return [];
  const position = ctx.protectedPosition ?? { tokenId: ctx.originalTargetTokenId ?? target.tokenId ?? null };
  const out = [];
  for (const protector of combat.combatants) {
    if (!protector?.id || String(protector.id) === String(target.id)) continue;
    if (ctx.attackerCombatantId != null && String(protector.id) === String(ctx.attackerCombatantId)) continue;
    let covers = false;
    try {
      covers = isProtectingTarget(protector, target, { combat, position });
    } catch (error) {
      warnOnce(`cover:${protector.id}`, "Protect coverage check failed");
      console.warn("[PMTTRPG] Protect coverage check failed", error);
      continue;
    }
    if (!covers) continue;
    if (ctx.rangedAttack && !canTargetWithAttack({
      attackerItem: ctx.attackerItem ?? null,
      targetCombatant: protector,
      combat,
    }).ok) continue;
    const profile = getProtectProfile(protector, { combat });
    out.push({
      sourceId: "protect",
      kind: "protect",
      combatantId: String(protector.id),
      tokenId: protector.tokenId ?? protector.token?.id ?? null,
      actorId: protector.actorId ?? protector.actor?.id ?? null,
      allowedDefenses: [...(profile.allowedDefenses ?? [])],
      protectDeclarationId: readProtectState(protector, { combat }).declarationId,
    });
  }
  return out;
}

function protectActionStateEntries({ combatant, combat } = {}) {
  if (!combatant || !isProtectActive(combatant, { combat })) return [];
  const declared = readProtectState(combatant, { combat }).live;
  const range = getProtectProfile(combatant, { combat }).rangeSquares;
  return [{
    id: `${PROTECT_PRESENTER_ID}:${combatant.id}`,
    category: ACTION_STATE_CATEGORIES.TURN,
    actionId: PROTECT_ACTION_ID,
    combatantId: String(combatant.id),
    role: ACTION_STATE_ROLES.SELF,
    labelKey: "PMTTRPG.ActionState.Protecting",
    detailKey: "PMTTRPG.ActionState.ProtectingDetail",
    detailData: { range },
    icon: { img: PROTECT_ACTION_STATE_ICON, fa: "fa-shield" },
    ...(declared ? { expiryKey: "PMTTRPG.ActionState.UntilNextTurnStarts" } : {}),
    visibility: ACTION_STATE_VISIBILITY.PUBLIC,
    dismissible: true,
  }];
}

export function registerProtect() {
  defineProtectRuleSubject();
  registerInterceptorSource({
    id: "protect",
    order: 10,
    listCandidates: (ctx) => listProtectInterceptors(ctx),
  });
  registerActionStatePresenter({
    id: PROTECT_PRESENTER_ID,
    order: 12,
    getEntries: protectActionStateEntries,
    dismiss: (_entry, { combatant }) => clearProtect(combatant, { tokenId: combatant?.tokenId ?? null }),
  });
}

/**
 * Protect starts at 1 square of range with Block and Evade allowed. Homebrew can
 * add range, narrow the defenses down or mark a Combatant as Protecting.
 */


const PROTECT_RULE_SUBJECT = "protect";

const PROTECT_ROLES = { PROTECTOR: "protector" };

const PROTECT_DEFENSES = ["block", "evade"];

const PROTECT_BASELINE_PROFILE = {
  active: false,
  rangeSquares: 1,
  allowedDefenses: PROTECT_DEFENSES,
};

function defineProtectRuleSubject() {
  defineRuleSubject(PROTECT_RULE_SUBJECT, {
    roles: Object.values(PROTECT_ROLES),
    fields: {
      active: { type: "boolean", merge: RULE_MERGES.ANY },
      rangeSquares: { type: "integer", merge: RULE_MERGES.SUM, min: 0 },
      allowedDefenses: { type: "subset", merge: RULE_MERGES.INTERSECT, values: [...PROTECT_DEFENSES] },
    },
  });
}

function getProtectProfile(combatant, { combat = null } = {}) {
  if (!getRuleSubject(PROTECT_RULE_SUBJECT)) defineProtectRuleSubject();
  const { profile } = resolveRuleProfile(PROTECT_RULE_SUBJECT, PROTECT_BASELINE_PROFILE, {
    combat,
    roles: {
      [PROTECT_ROLES.PROTECTOR]: combatant
        ? { actor: combatant.actor ?? null, combatant, token: combatant.token ?? null }
        : null,
    },
  });
  return profile;
}
