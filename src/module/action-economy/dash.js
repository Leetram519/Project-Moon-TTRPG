import { applyDeclaredActorUpdate, declareActorAction } from "./declare.js";
import { dashMovementGain, movementActionExpended } from "./formulas.js";
import { ACTION_KINDS, ECONOMY_TYPES } from "./kinds.js";
import { actorSquaresExhausted } from "../combat/movement.js";
import { resolveReactionCreditCombatant } from "./reaction-credits.js";
import { getGrappleRestrictions } from "../grapple/grapple-restrictions.js";
import { checkWorkflowTiming, warnNotYourTurn } from "./timing.js";

function getDashMovementGain(actor) {
  const justice = Number(actor?.system?.abilities?.jus?.value) || 0;
  const dashMisc = Number(actor?.system?.attributes?.dash?.misc) || 0;
  return dashMovementGain(justice, dashMisc);
}

/** Only the movement pool and the squaresExhausted flag decide this (leftover SQRs don't count). */
function isMovementActionExpended(actor) {
  if (!actor) return true;
  return movementActionExpended({
    squaresExhausted: actorSquaresExhausted(actor),
    movementValue: actor.system?.attributes?.movement?.value,
  });
}

export async function startDash(actor, options = {}) {
  if (!actor) return;

  const timing = checkWorkflowTiming(actor, options, { economyType: ECONOMY_TYPES.ACTION, kind: ACTION_KINDS.DASH });
  if (!timing.ok) {
    warnNotYourTurn(options);
    return { ok: false, reason: timing.reason };
  }
  const combat = options.combat ?? game.combat;
  const combatant = combat?.started
    ? resolveReactionCreditCombatant(actor, { combatant: options.combatant, combat, tokenId: options.tokenId ?? options.token?.id ?? null })
    : null;
  if (combatant && !getGrappleRestrictions(combatant, { combat }).dash) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.Grapple.DashRestricted"));
    return { ok: false, reason: "grappled" };
  }

  const warnExpended = () => ui.notifications.warn(game.i18n.format("PMTTRPG.ActionMenu.DashMovementExpended", {
    name: actor.name,
  }));
  if (isMovementActionExpended(actor)) {
    warnExpended();
    return;
  }

  return declareActorAction({
    actor,
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.DASH,
    cost: 1,
    combatant: combatant ?? options.combatant ?? null,
    tokenId: options.tokenId ?? options.token?.id ?? null,
    timing: options.timing ?? null,
    consume: options.consume,
    precheck: () => {
      if (!isMovementActionExpended(actor)) return true;
      warnExpended();
      return { ok: false, reason: "movement-expended" };
    },
    apply: async () => {
      const currentSquares = Math.max(0, Number(actor.system?.attributes?.squares?.value) || 0);
      try {
        await applyDeclaredActorUpdate(actor, {
          "system.attributes.squares.value": currentSquares + getDashMovementGain(actor),
        });
      } catch (error) {
        console.error("[PMTTRPG] Dash squares update failed after declaration", error);
        ui.notifications.error(game.i18n.localize("PMTTRPG.ActionMenu.DashFailed"));
      }
    },
  });
}
