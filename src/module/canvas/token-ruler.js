import { squareTurnCap } from "../actor/progression.js";
import { findCombatant } from "../combat/combatant-match.js";

const OVER_COLOR = 0xE23D28;

function isCurrentTurn(token) {
  const combat = game.combat;
  if (!combat?.started || !token) return false;
  const doc = token.document ?? token;
  if (!doc?.id) return false;
  const combatant = findCombatant({ combatants: combat.combatants, tokenId: doc.id });
  return Boolean(combatant && combat.combatant?.id === combatant.id);
}

function accruedCost(waypoint) {
  const spaces = Number(waypoint?.measurement?.spaces);
  if (Number.isFinite(spaces) && spaces >= 0) return Math.max(0, Math.round(spaces));
  const distance = Number(waypoint?.measurement?.distance);
  const cell = Number(canvas?.grid?.distance) || 1;
  if (Number.isFinite(distance) && distance >= 0 && cell > 0) {
    return Math.max(0, Math.round(distance / cell));
  }
  const measured = Number(waypoint?.measurement?.cost);
  if (Number.isFinite(measured) && measured >= 0) return Math.max(0, Math.round(measured));
  const cost = Number(waypoint?.cost);
  if (Number.isFinite(cost) && cost >= 0) return Math.max(0, Math.round(cost));
  return 0;
}

function squareBudget(actor) {
  const squares = actor?.system?.attributes?.squares;
  if (!squares) return 0;
  if (squares.exhausted) return Math.max(0, Number(squares.used) || 0);
  return squareTurnCap(squares);
}

export class TokenRulerPMTTRPG extends foundry.canvas.placeables.tokens.TokenRuler {
  static WAYPOINT_LABEL_TEMPLATE = "systems/projectmoonttrpg/templates/hud/waypoint-label.hbs";

  #tracksBudget() {
    const token = this.token;
    return Boolean(token?.actor && isCurrentTurn(token));
  }

  #budget() {
    return squareBudget(this.token?.actor);
  }

  #overBudget(waypoint) {
    if (!this.#tracksBudget() || waypoint?.action === "displace") return false;
    return accruedCost(waypoint) > this.#budget();
  }

  #paintOver(style, waypoint) {
    if (!style || !this.#overBudget(waypoint)) return style;
    return { ...style, color: OVER_COLOR };
  }

  /** @override */
  refresh(...args) {
    const result = super.refresh(...args);
    const scale = canvas?.stage?.scale?.x;
    if (scale) {
      document.getElementById("measurement")?.style?.setProperty(
        "--pmttrpg-ruler-scale",
        (1 / scale).toFixed(4),
      );
    }
    return result;
  }

  /** @override */
  _getSegmentStyle(waypoint) {
    return this.#paintOver(super._getSegmentStyle(waypoint), waypoint);
  }

  /** @override */
  _getWaypointStyle(waypoint) {
    return this.#paintOver(super._getWaypointStyle(waypoint), waypoint);
  }

  /** @override */
  _getGridHighlightStyle(waypoint, offset) {
    return this.#paintOver(super._getGridHighlightStyle(waypoint, offset), waypoint);
  }

  /** @override */
  _shouldRenderWaypoint(waypoint) {
    const rendered = typeof super._shouldRenderWaypoint === "function"
      ? super._shouldRenderWaypoint(waypoint)
      : !waypoint?.intermediate;
    if (rendered) return true;
    if (!this.#tracksBudget() || !waypoint?.intermediate || waypoint.cost === 0) return false;
    const budget = this.#budget();
    const here = accruedCost(waypoint);
    const next = waypoint.next ? accruedCost(waypoint.next) : here;
    return here <= budget && next > budget;
  }

  /** @override */
  _getWaypointLabelContext(waypoint, state) {
    if (waypoint.action === "displace") return;
    const context = super._getWaypointLabelContext(waypoint, state);
    if (!context) return context;
    if (!this.#tracksBudget()) return context;

    const budget = this.#budget();
    const accrued = accruedCost(waypoint);
    return {
      ...context,
      tracksBudget: true,
      budget,
      accrued,
      overBudget: accrued > budget,
    };
  }
}
