import { declareActorAction } from "./declare.js";
import { ACTION_KINDS, ECONOMY_TYPES } from "./kinds.js";
import {
  hasDisengage,
  makeDisengageStamp,
  patchActionState,
  writeCombatantActionState,
} from "./combat-flags.js";
import { resolveWorkflowContext } from "./timing.js";
import {
  ACTION_STATE_CATEGORIES,
  ACTION_STATE_ROLES,
  ACTION_STATE_VISIBILITY,
  registerActionStatePresenter,
} from "./presentation.js";
import { getGrappleRestrictions } from "../grapple/grapple-restrictions.js";

const DISENGAGE_PRESENTER_ID = "disengage";
const DISENGAGE_ACTION_ID = "disengage";
const DISENGAGE_ACTION_STATE_ICON = "systems/projectmoonttrpg/assets/icons/Statuses/PlayerState_Disengage.webp";

const WARN_KEYS = {
  "no-combat": "PMTTRPG.ActionMenu.NeedsCombat",
  "no-combatant": "PMTTRPG.ActionMenu.DisengageNeedsToken",
  "not-active-turn": "PMTTRPG.ActionMenu.DisengageNotYourTurn",
  "already-disengaged": "PMTTRPG.ActionMenu.DisengageAlready",
  grappled: "PMTTRPG.Grapple.DisengageRestricted",
};

function warn(reason, options = {}) {
  if (options.warn === false) return;
  const key = WARN_KEYS[reason];
  if (!key) return;
  ui.notifications.warn(game.i18n.localize(key));
}

function resolveDisengageContext(actor, options = {}) {
  return resolveWorkflowContext(actor, options, { economyType: ECONOMY_TYPES.ACTION, kind: ACTION_KINDS.DISENGAGE });
}

export async function startDisengage(actor, options = {}) {
  if (!actor) return { ok: false, reason: "invalid-actor" };

  const ctx = resolveDisengageContext(actor, options);
  if (!ctx.ok) {
    warn(ctx.reason, options);
    return ctx;
  }

  if (!getGrappleRestrictions(ctx.combatant, { combat: ctx.combat }).disengage) {
    warn("grappled", options);
    return { ok: false, reason: "grappled" };
  }

  const disengaged = () => hasDisengage({
    actor,
    combatant: ctx.combatant,
    combat: ctx.combat,
    tokenId: ctx.tokenId,
  });
  if (disengaged()) {
    warn("already-disengaged", options);
    return { ok: false, reason: "already-disengaged" };
  }

  return declareActorAction({
    actor,
    combatant: ctx.combatant,
    tokenId: ctx.tokenId,
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.DISENGAGE,
    cost: 1,
    timing: options.timing ?? null,
    consume: options.consume,
    precheck: () => {
      if (!disengaged()) return true;
      warn("already-disengaged", options);
      return { ok: false, reason: "already-disengaged" };
    },
    apply: async () => {
      try {
        await patchActionState(ctx.combatant, {
          disengage: makeDisengageStamp(ctx.combatant, ctx.combat),
        });
      } catch (error) {
        console.error("[PMTTRPG] Disengage actionState write failed after declaration", error);
        ui.notifications.error(game.i18n.localize("PMTTRPG.ActionMenu.DisengageFailed"));
      }
    },
  });
}

async function clearDisengage(combatant, { combat = null } = {}) {
  const active = combat ?? combatant.combat ?? game.combat;
  if (!hasDisengage({ combatant, combat: active })) return false;
  return writeCombatantActionState(combatant, "disengage", null);
}

function disengageActionStateEntries({ combatant, combat } = {}) {
  if (!combatant) return [];
  if (!hasDisengage({ combatant, combat })) return [];
  return [{
    id: `${DISENGAGE_PRESENTER_ID}:${combatant.id}`,
    category: ACTION_STATE_CATEGORIES.TURN,
    actionId: DISENGAGE_ACTION_ID,
    combatantId: combatant.id,
    role: ACTION_STATE_ROLES.SELF,
    labelKey: "PMTTRPG.ActionState.Disengaged",
    detailKey: "PMTTRPG.ActionState.DisengagedDetail",
    icon: { img: DISENGAGE_ACTION_STATE_ICON, fa: "fa-person-running" },
    expiryKey: "PMTTRPG.ActionState.UntilEndOfTurn",
    visibility: ACTION_STATE_VISIBILITY.PUBLIC,
    dismissible: true,
  }];
}

export function registerDisengagePresentation() {
  registerActionStatePresenter({
    id: DISENGAGE_PRESENTER_ID,
    order: 10,
    getEntries: disengageActionStateEntries,
    dismiss: (_entry, { combatant, combat }) => clearDisengage(combatant, { combat }),
  });
}
