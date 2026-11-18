import { emitTokenMoved } from "../easy-effects/registry.js";
import { isFreeMovementAction, recordedHistorySquares, voluntaryChunkSpaces } from "../movement/movement-cost.js";
import { compareCombatants, readTiebreak } from "./turn-order.js";
import { getInitiativeFormulaParts } from "../targeting.js";
import { findCombatant } from "./combatant-match.js";
import {
  DELAY_TRANSITION_OPTION,
  delayTurnEventView,
  requestDelayAwareAdvance,
} from "../action-economy/delay.js";

const TIEBREAK_PATH = "flags.projectmoonttrpg.turnTiebreak";

function combatantForToken(tokenDoc) {
  const combat = game.combat;
  if (!combat?.started || !tokenDoc?.id) return null;
  return findCombatant({ combatants: combat.combatants, tokenId: tokenDoc.id });
}

export function actorCombatToken(actor) {
  if (!actor) return null;
  if (actor.token) return actor.token;
  const combat = game.combat;
  if (combat?.started && !actor.isToken) {
    const combatant = findCombatant({ combatants: combat.combatants, actorId: actor.id });
    if (combatant?.token) return combatant.token;
  }
  if (actor.isToken) return null;
  const linked = actor.getActiveTokens?.(true, true) ?? [];
  return linked.length === 1 ? linked[0] : null;
}

function isMeasureGrid(grid) {
  return typeof grid?.getCenterPoint === "function" && typeof grid?.measurePath === "function";
}

function readMeasuredSpaces(measured, grid) {
  const spaces = Number(measured?.spaces);
  if (Number.isFinite(spaces) && spaces >= 0) return Math.max(0, Math.round(spaces));
  const distance = Number(measured?.distance);
  const cell = Number(grid?.distance ?? canvas?.grid?.distance) || 1;
  if (Number.isFinite(distance) && distance >= 0 && cell > 0) {
    return Math.max(0, Math.round(distance / cell));
  }
  return 0;
}

function chebyshevSpaces(waypoints, size) {
  if (!(size > 0)) return 0;
  let spaces = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const from = waypoints[i - 1];
    const to = waypoints[i];
    if (!to || to.forced || to.teleport) continue;
    const dx = Math.abs(Number(to.x) - Number(from.x)) / size;
    const dy = Math.abs(Number(to.y) - Number(from.y)) / size;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
    spaces += Math.max(0, Math.round(Math.max(dx, dy)));
  }
  return spaces;
}

function measureWaypointSpaces(tokenDoc, waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return 0;

  const accrued = Number(waypoints.at(-1)?.measurement?.spaces);
  if (Number.isFinite(accrued) && accrued >= 0) return Math.max(0, Math.round(accrued));
  const parentGrid = tokenDoc?.parent?.grid;
  try {
    if (typeof tokenDoc?.measureMovementPath === "function" && isMeasureGrid(parentGrid)) {
      return readMeasuredSpaces(tokenDoc.measureMovementPath(waypoints), parentGrid);
    }
    if (isMeasureGrid(parentGrid)) {
      return readMeasuredSpaces(parentGrid.measurePath(waypoints), parentGrid);
    }
    if (tokenDoc?.parent === canvas?.scene && isMeasureGrid(canvas?.grid)) {
      return readMeasuredSpaces(canvas.grid.measurePath(waypoints), canvas.grid);
    }
  } catch (error) {
    console.warn("[PMTTRPG] measureMovementPath failed", error);
  }

  const size = Number(parentGrid?.size) || Number(canvas?.grid?.size) || 0;
  return chebyshevSpaces(waypoints, size);
}

function paidWaypoints(waypoints) {
  if (!Array.isArray(waypoints) || !waypoints.length) return [];
  return waypoints.filter((waypoint) => !waypoint?.forced && !waypoint?.teleport && !isFreeMovementAction(waypoint?.action));
}

function chunkSpaceCost(tokenDoc, chunk) {
  if (!chunk) return 0;
  const measured = measureWaypointSpaces(tokenDoc, paidWaypoints(chunk.waypoints));
  return voluntaryChunkSpaces(chunk.waypoints, measured, chunk.spaces);
}

export function tokenHistorySquareCost(tokenDoc) {
  const history = tokenDoc?.movementHistory;
  if (!Array.isArray(history) || history.length < 2) return 0;
  const grid = tokenDoc?.parent?.grid ?? canvas.grid ?? null;
  return recordedHistorySquares(history, {
    gridSize: Number(grid?.size) || 0,
    gridDistance: Number(grid?.distance) || 1,
  });
}

export function actorHistorySquareCost(actor) {
  if (!game.combat?.started) return 0;
  return tokenHistorySquareCost(actorCombatToken(actor));
}

export function actorSquaresExhausted(actor) {
  return Boolean(game.combat?.started && actor?.getFlag("projectmoonttrpg", "squaresExhausted"));
}

export async function exhaustRemainingSquares(actor) {
  if (!actor || !game.combat?.started) return actor;
  const tokenDoc = actorCombatToken(actor);
  const tokenId = tokenDoc?.id ?? null;
  const combatant = findCombatant({
    combatants: game.combat.combatants,
    tokenId,
    actorId: tokenId || actor.isToken ? null : actor.id,
  });
  if (!combatant || game.combat.combatant?.id !== combatant.id) return actor;

  const updates = {};
  if (!actor.getFlag("projectmoonttrpg", "squaresExhausted")) {
    updates["flags.projectmoonttrpg.squaresExhausted"] = true;
  }
  const movement = actor.system.attributes?.movement;
  if (movement && (Number(movement.value) || 0) > 0) {
    updates["system.attributes.movement.value"] = 0;
  }
  if (foundry.utils.isEmpty(updates)) return actor;
  const { runAsOwnerOrGM } = await import("../easy-effects/gm-route.js");
  await runAsOwnerOrGM(actor, "applyActorUpdate", { update: updates });
  return actor;
}

function refreshActorFromToken(tokenDoc) {
  const actor = tokenDoc?.actor;
  if (!actor) return;
  actor.prepareData();
  if (actor.sheet?.rendered) actor.sheet.render(false);
  if (game.combat && ui.combat?.rendered && combatantForToken(tokenDoc)) {
    ui.combat.render();
  }
}

function isUndoMovement(movement, operation) {
  if (String(movement?.method ?? operation?.method ?? "") === "undo") return true;
  return Boolean(operation?.undo || operation?.isUndo);
}

function isFreeMovement(movement) {
  if (!movement || movement.forced) return true;
  const waypoints = [
    ...(movement.pending?.waypoints ?? []),
    ...(movement.passed?.waypoints ?? []),
  ];
  if (!waypoints.length) return false;
  return waypoints.every((waypoint) => (
    waypoint?.teleport || waypoint?.forced || isFreeMovementAction(waypoint?.action)
  ));
}

async function emitMovedIfNeeded(tokenDoc, movement, operation, user) {
  const userId = user?.id ?? user;
  if (userId && game.user.id !== userId) return;
  if (isUndoMovement(movement, operation) || isFreeMovement(movement)) return;

  const combatant = combatantForToken(tokenDoc);
  const actor = tokenDoc?.actor;
  if (!actor || !combatant || game.combat?.combatant?.id !== combatant.id) return;
  if (!actor.isOwner && !game.user.isGM) return;

  const squares = Math.max(
    chunkSpaceCost(tokenDoc, movement?.passed),
    chunkSpaceCost(tokenDoc, movement?.pending),
  );
  if (squares <= 0) return;

  try {
    await emitTokenMoved({
      actor,
      actorId: actor.id,
      token: tokenDoc,
      combat: game.combat,
      combatant,
      movement,
      moved: {
        squares,
        spaces: squares,
        movement: squares,
        forced: false,
        method: String(movement?.method ?? ""),
      },
    });
  } catch (error) {
    console.warn("[PMTTRPG] tokenMoved hook failed", error);
  }
}

function isCombatantCollection(collection) {
  const name = typeof collection === "string"
    ? collection
    : (collection?.name ?? collection?.documentName ?? "");
  return String(name).toLowerCase().startsWith("combatant");
}

function registerCombatDocument() {
  const Base = CONFIG.Combat.documentClass;

  class CombatPMTTRPG extends Base {
    #delayBypass = false;
    #delayTransition = null;

    /** @override */
    async startCombat() {
      if (this.#delayBypass) return super.startCombat();
      return requestDelayAwareAdvance(this, "start");
    }

    /** @override */
    async nextTurn() {
      if (this.#delayBypass) return super.nextTurn();
      return requestDelayAwareAdvance(this, "turn");
    }

    /** @override */
    async nextRound() {
      if (this.#delayBypass) return super.nextRound();
      return requestDelayAwareAdvance(this, "round");
    }

    _pmttrpgNaturalAdvance(mode = "turn") {
      this.#delayBypass = true;
      try {
        if (mode === "start") return super.startCombat();
        return mode === "round" ? super.nextRound() : super.nextTurn();
      } finally {
        this.#delayBypass = false;
      }
    }

    /**
     * Holds onto the Delay transition option just for the synchronous
     * `_manageTurnEvents` call inside `super._onUpdate`.
     * @override
     */
    _onUpdate(changed, options, userId) {
      this.#delayTransition = options?.[DELAY_TRANSITION_OPTION] ?? null;
      try {
        return super._onUpdate(changed, options, userId);
      } finally {
        this.#delayTransition = null;
      }
    }

    /** @override */
    async _manageTurnEvents() {
      const transition = this.#delayTransition;
      if (!transition || !this.previous) return super._manageTurnEvents();
      const realTurns = this.turns;
      const realPrevious = this.previous;
      const view = delayTurnEventView({
        turns: realTurns,
        previous: realPrevious,
        current: this.current,
        maskedIds: transition.maskedIds,
      });
      this.turns = view.turns;
      if (view.previous) this.previous = view.previous;
      let pending;
      try {
        pending = super._manageTurnEvents();
      } finally {
        this.turns = realTurns;
        this.previous = realPrevious;
      }
      return pending;
    }

    /** @override */
    async _clearMovementHistoryOnStartTurn(combatant, _context) {
      if (!combatant) return;
      return combatant.clearMovementHistory();
    }

    /**
     * Combat End scripts run here so Foundry hasn't deleted the Combat yet.
     * @override
     */
    async _preDelete(options, user) {
      const { emitCombatEndForEncounter } = await import("./combat.js");
      await emitCombatEndForEncounter(this, user?.id);
      return super._preDelete(options, user);
    }

    /**
     * Someone was added to a fight that's already started.
     * @override
     */
    async _onCreateDescendantDocuments(parent, collection, documents, data, options, user) {
      const result = await super._onCreateDescendantDocuments(
        parent, collection, documents, data, options, user
      );
      if (isCombatantCollection(collection)) {
        const { emitCombatStartForCombatant } = await import("./combat.js");
        const userId = user?.id ?? user;
        for (const combatant of documents ?? []) {
          await emitCombatStartForCombatant(this, combatant, userId);
        }
      }
      return result;
    }

    /**
     * setupTurns sorts combat.turns with this comparator.
     * @override
     */
    _sortCombatants(a, b) {
      return compareCombatants(a, b);
    }

    /**
     * Foundry writes initiative here and skips Combatant.rollInitiative.
     * @override
     */
    async rollInitiative(ids, options = {}) {
      const result = await super.rollInitiative(ids, options);
      const idList = typeof ids === "string" ? [ids] : Array.isArray(ids) ? ids : [];
      const updates = [];
      for (const id of idList) {
        const combatant = this.combatants.get(id);
        if (!combatant?.isOwner || readTiebreak(combatant) === 0) continue;
        updates.push({ _id: combatant.id, "flags.projectmoonttrpg.turnTiebreak": 0 });
      }
      if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates);
      return result;
    }

    /**
     * Someone was taken out while combat is still up.
     * @override
     */
    async _preDeleteDescendantDocuments(parent, collection, ids, options, user) {
      if (isCombatantCollection(collection)) {
        const { emitCombatEndForCombatant } = await import("./combat.js");
        const userId = user?.id ?? user;
        for (const id of ids ?? []) {
          const combatant = this.combatants.get(id);
          if (combatant) await emitCombatEndForCombatant(this, combatant, userId);
        }
      }
      return super._preDeleteDescendantDocuments(parent, collection, ids, options, user);
    }
  }

  CONFIG.Combat.documentClass = CombatPMTTRPG;
}

function registerCombatantDocument() {
  const Base = CONFIG.Combatant.documentClass;

  class CombatantPMTTRPG extends Base {
    /**
     * Roll All / Roll NPCs use this.
     * @override
     */
    _getInitiativeFormula() {
      const actor = this.actor;
      if (!actor) return super._getInitiativeFormula();
      return getInitiativeFormulaParts(actor).formula;
    }

    /**
     * super only writes initiative. A new roll resets turnTiebreak to 0.
     * @override
     */
    async rollInitiative(formula) {
      const result = await super.rollInitiative(formula);
      if (readTiebreak(this) === 0) return result;
      return this.update({ [TIEBREAK_PATH]: 0 });
    }

    /**
     * Drops a `combatTurn` equal to the current turn unless the caller set it. A flag
     * write from one turn can land after the next turn started, which would move the
     * turn back on us. We have to delete the key because the server will still apply
     * it even if it's null.
     * @override
     */
    static async _preUpdateOperation(documents, operation, user) {
      const callerPinned = operation.combatTurn !== undefined;
      const allowed = await super._preUpdateOperation(documents, operation, user);
      if (allowed === false) return false;
      if (!callerPinned && operation.combatTurn === operation.parent?.turn) delete operation.combatTurn;
      return allowed;
    }
  }

  CONFIG.Combatant.documentClass = CombatantPMTTRPG;
}

export function registerCombatMovement() {
  registerCombatDocument();
  registerCombatantDocument();

  Hooks.on("moveToken", (tokenDoc, movement, operation, user) => {
    refreshActorFromToken(tokenDoc);
    void emitMovedIfNeeded(tokenDoc, movement, operation, user);
  });

  Hooks.on("recordToken", (tokenDoc) => {
    refreshActorFromToken(tokenDoc);
  });
}
