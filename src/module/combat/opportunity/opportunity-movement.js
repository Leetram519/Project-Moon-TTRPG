import { isWeaponHeldForAttack } from "../../action-economy/attack-eligibility.js";
import { ACTION_KINDS } from "../../action-economy/kinds.js";
import { canPayReactionForDeclaration } from "../../action-economy/reaction-credits.js";
import { compareCombatants } from "../turn-order.js";
import { PMTTRPGUtility } from "../../utility.js";
import { FORCED_MOVEMENT_ACTION } from "../../movement/movement-plan.js";
import { getGrappleRestrictions } from "../../grapple/grapple-restrictions.js";
import { elevationSquares } from "../../movement/movement-resolve.js";
import { canTargetWithAttack } from "../../action-economy/cover.js";
import { gridSpan, gridSpanGap } from "../../canvas/spatial.js";
import { wasMovementActionProcessed } from "../../movement/movement-actions.js";
import { actorItems, documentId, tokenDocument, warnAbnormal } from "../../shared-helpers.js";
import { currentTurnCombatant } from "../combatant-match.js";

const OPPORTUNITY_MOVEMENT_REASONS = {
  NO_COMBAT: "no-combat",
  COMBAT_NOT_STARTED: "combat-not-started",
  NO_MOVER_COMBATANT: "no-mover-combatant",
  NOT_CURRENT_TURN: "not-current-turn",
  FORCED: "forced",
  TELEPORT: "teleport",
  ADMINISTRATIVE: "administrative",
  DISENGAGE: "disengage",
  NOT_VOLUNTARY: "not-voluntary",
  HIDDEN: "hidden",
  INVISIBLE: "invisible",
};

export const OPPORTUNITY_PATH_WARNINGS = {
  PATH_NOT_STEPPED: "path-not-stepped",
  MISSING_GRID: "missing-grid",
  MISSING_TOKEN: "missing-token",
};

// TODO: Preferrably Form fuction won't be hardcoded.

/**
 * Opportunity Attack reach for Low Caliber weapons, in squares (their
 * `system.range` is their ranged Attack range so it doesn't count here).
 */

const LOW_CALIBER_OPPORTUNITY_REACH = 2;

const TELEPORT_ACTIONS = new Set(["blink", "displace", "teleport"]);

function sameDocument(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const idA = documentId(a);
  const idB = documentId(b);
  return idA != null && idA === idB;
}

function combatantToken(combatant) {
  return tokenDocument(combatant?.token ?? null);
}

function tokenDisposition(token) {
  const raw = tokenDocument(token)?.disposition;
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function tokenIsHidden(token) {
  return tokenDocument(token)?.hidden === true;
}

function tokenIsInvisible(token) {
  return tokenDocument(token)?.hasStatusEffect(CONFIG.specialStatusEffects.INVISIBLE) === true;
}

function waypointList(waypoints) {
  return Array.isArray(waypoints) ? waypoints : [];
}

function waypointAction(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isTeleportAction(value) {
  return TELEPORT_ACTIONS.has(waypointAction(value));
}

function movementIsForced({ forced, waypoints } = {}) {
  if (forced === true) return true;
  return waypointList(waypoints).some((waypoint) => waypoint?.forced === true || waypoint?.action === FORCED_MOVEMENT_ACTION);
}

function movementIsTeleport({ teleport, action, waypoints } = {}) {
  if (teleport === true) return true;
  if (isTeleportAction(action)) return true;
  return waypointList(waypoints).some((waypoint) => (
    waypoint?.teleport === true || isTeleportAction(waypoint?.action)
  ));
}

function movementIsVoluntary({ method, voluntary } = {}) {
  if (voluntary === false) return false;
  return String(method ?? "").trim().toLowerCase() !== "undo";
}

function irrelevant(reason, extra = {}) {
  return {
    relevant: false,
    reason,
    voluntary: extra.voluntary ?? false,
    combatMovement: extra.combatMovement ?? false,
    ignoreOpportunityAttacks: true,
  };
}

function classifyOpportunityMovement(input = {}) {
  const combat = input.combat ?? null;
  if (!combat) return irrelevant(OPPORTUNITY_MOVEMENT_REASONS.NO_COMBAT);

  if (combat.started !== true) {
    return irrelevant(OPPORTUNITY_MOVEMENT_REASONS.COMBAT_NOT_STARTED);
  }

  const moverCombatant = input.moverCombatant ?? null;
  if (!moverCombatant) {
    return irrelevant(OPPORTUNITY_MOVEMENT_REASONS.NO_MOVER_COMBATANT, { combatMovement: true });
  }

  const current = currentTurnCombatant(combat);
  if (!sameDocument(current, moverCombatant)) {
    return irrelevant(OPPORTUNITY_MOVEMENT_REASONS.NOT_CURRENT_TURN, { combatMovement: true });
  }

  if (input.adminSuppressed === true) {
    return irrelevant(OPPORTUNITY_MOVEMENT_REASONS.ADMINISTRATIVE, {
      voluntary: true,
      combatMovement: true,
    });
  }

  if (input.disengageSuppressed === true) {
    return irrelevant(OPPORTUNITY_MOVEMENT_REASONS.DISENGAGE, {
      voluntary: true,
      combatMovement: true,
    });
  }

  if (movementIsForced(input)) {
    return irrelevant(OPPORTUNITY_MOVEMENT_REASONS.FORCED, { combatMovement: true });
  }

  if (movementIsTeleport(input)) {
    return irrelevant(OPPORTUNITY_MOVEMENT_REASONS.TELEPORT, { combatMovement: true });
  }

  if (!movementIsVoluntary(input)) {
    return irrelevant(OPPORTUNITY_MOVEMENT_REASONS.NOT_VOLUNTARY, { combatMovement: true });
  }

  const moverToken = input.moverToken ?? combatantToken(moverCombatant);
  if (tokenIsHidden(moverToken)) {
    return irrelevant(OPPORTUNITY_MOVEMENT_REASONS.HIDDEN, { voluntary: true, combatMovement: true });
  }
  if (tokenIsInvisible(moverToken)) {
    return irrelevant(OPPORTUNITY_MOVEMENT_REASONS.INVISIBLE, { voluntary: true, combatMovement: true });
  }

  return {
    relevant: true,
    reason: null,
    voluntary: true,
    combatMovement: true,
    ignoreOpportunityAttacks: false,
  };
}

export function isOpportunityCapableWeapon(weapon) {
  if (!isWeaponHeldForAttack(weapon)) return false;
  const weaponType = String(weapon.system?.weaponType ?? "").toLowerCase();
  if (weaponType === "melee") return true;
  if (weaponType === "ranged") {
    return String(weapon.system?.formProperty ?? "") === "lowCaliber";
  }
  return false;
}

function getOpportunityWeaponReach(weapon) {
  if (!isOpportunityCapableWeapon(weapon)) return null;
  const weaponType = String(weapon.system?.weaponType ?? "").toLowerCase();
  if (weaponType === "ranged") return LOW_CALIBER_OPPORTUNITY_REACH;
  const range = PMTTRPGUtility.getWeaponRangeSquares(weapon);
  return Number.isFinite(range) ? range : null;
}

function listOpportunityWeapons(actor) {
  return actorItems(actor)
    .filter((item) => isOpportunityCapableWeapon(item))
    .sort((a, b) => documentId(a).localeCompare(documentId(b)));
}

export function canPayOpportunityAttack(actor, { combatant, weapon, combat } = {}) {
  if (!actor || !combatant) return false;
  return canPayReactionForDeclaration(actor, {
    kind: ACTION_KINDS.OPPORTUNITY_ATTACK,
    item: weapon ?? null,
    itemId: documentId(weapon),
  }, { combatant, combat });
}

function listOpportunityReactors({ combat, moverToken, moverCombatant } = {}) {
  const moverId = documentId(moverCombatant);
  const moverTokenId = documentId(moverToken) ?? documentId(combatantToken(moverCombatant));
  const moverDisposition = tokenDisposition(moverToken);
  if (moverDisposition == null) {
    warnAbnormal("mover Token disposition missing", { moverTokenId });
    return [];
  }

  const reactors = [];

  for (const combatant of combat.combatants) {
    const combatantId = combatant.id;
    if (combatantId === moverId) continue;
    if (combatant.isDefeated === true) continue;
    if (combatant.hidden === true) continue;

    const token = combatantToken(combatant);
    if (!token) {
      warnAbnormal("combatant has no exact Token", { combatantId });
      continue;
    }
    const tokenId = documentId(token);
    if (tokenId != null && tokenId === moverTokenId) continue;
    if (tokenIsHidden(token)) continue;

    const actor = combatant.actor;
    if (!actor) continue;
    if (!getGrappleRestrictions(combatant, { combat }).opportunityAttack) continue;

    const disposition = tokenDisposition(token);
    if (disposition == null) {
      warnAbnormal("token disposition missing", { combatantId, tokenId });
      continue;
    }
    if (disposition === moverDisposition) continue;

    const weapons = [];
    for (const weapon of listOpportunityWeapons(actor)) {
      const reach = getOpportunityWeaponReach(weapon);
      if (reach == null) {
        warnAbnormal("malformed OA weapon reach", {
          combatantId,
          weaponId: documentId(weapon),
        });
        continue;
      }
      if (!canPayOpportunityAttack(actor, { combatant, weapon, combat })) continue;
      if (!canTargetWithAttack({ attackerItem: weapon, targetCombatant: moverCombatant, combat }).ok) continue;
      weapons.push({ weapon, reach, weaponId: documentId(weapon) });
    }
    if (!weapons.length) continue;

    reactors.push({ combatant, token, actor, weapons });
  }

  return reactors;
}

export function readGridSize(options = {}) {
  const raw = options.gridSize ?? options.grid?.size;
  const size = Number(raw);
  return Number.isFinite(size) && size > 0 ? size : null;
}

function gridDistanceOf(options = {}) {
  const unit = Number(options.grid?.distance ?? options.distance);
  return unit > 0 ? unit : 1;
}

function toElevationSquare(elevation, options = {}) {
  const value = Number(elevation);
  const height = Number.isFinite(value) ? value : 0;
  const squares = elevationSquares(height, gridDistanceOf(options));
  return height < 0 ? -squares : squares;
}

function finiteCoord(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function tokenFootprintSource(token) {
  if (!token || typeof token !== "object") return null;
  const doc = token.document ?? token;
  return doc._source ?? doc;
}

export function opportunityPointWithTokenSize(point, token) {
  if (!point || typeof point !== "object") return point;
  const source = tokenFootprintSource(token);
  if (!source) return point;
  const next = { ...point };
  if (next.width == null || next.width === "") next.width = source.width;
  if (next.height == null || next.height === "") next.height = source.height;
  if (next.depth == null || next.depth === "") next.depth = source.depth;
  return next;
}

function copyCellMeta(point, i, j, options = {}) {
  return {
    i,
    j,
    elevationSquare: toElevationSquare(point?.elevation, options),
    x: Number.isFinite(Number(point?.x)) ? Number(point.x) : undefined,
    y: Number.isFinite(Number(point?.y)) ? Number(point.y) : undefined,
    elevation: point?.elevation,
    width: gridSpan(point?.width),
    height: gridSpan(point?.height),
    depth: gridSpan(point?.depth),
  };
}

/**
 * Returns the point's top-left cell. Careful, here `i` goes along x and `j`
 * along y (the reverse of Foundry grid offsets).
 */
export function normalizeOpportunityCell(point, options = {}) {
  if (!point || typeof point !== "object") return null;
  if (Number.isFinite(Number(point.i)) && Number.isFinite(Number(point.j))) {
    return copyCellMeta(point, Number(point.i), Number(point.j), options);
  }

  const gridSize = readGridSize(options);
  const x = Number(point.x ?? point.center?.x);
  const y = Number(point.y ?? point.center?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (gridSize == null) return null;

  return copyCellMeta(point, Math.floor(x / gridSize), Math.floor(y / gridSize), options);
}

function elevationSquareOf(cell) {
  const square = finiteCoord(cell?.elevationSquare);
  if (square != null) return square;
  return toElevationSquare(cell?.elevation);
}

/**
 * How many squares the top-left cell moved (elevation included). A big Token
 * moving one square is still a step of 1 even though its old and new spots overlap.
 */
export function opportunityStepSquares(fromCell, toCell) {
  const fromI = finiteCoord(fromCell?.i);
  const fromJ = finiteCoord(fromCell?.j);
  const toI = finiteCoord(toCell?.i);
  const toJ = finiteCoord(toCell?.j);
  if (fromI == null || fromJ == null || toI == null || toJ == null) return null;
  return Math.max(
    Math.abs(fromI - toI),
    Math.abs(fromJ - toJ),
    Math.abs(elevationSquareOf(fromCell) - elevationSquareOf(toCell)),
  );
}

/** Chebyshev gap between the two occupied volumes (0 if they overlap). */
function opportunityReachSquares(fromCell, toCell) {
  const fromI = finiteCoord(fromCell?.i);
  const fromJ = finiteCoord(fromCell?.j);
  const toI = finiteCoord(toCell?.i);
  const toJ = finiteCoord(toCell?.j);
  if (fromI == null || fromJ == null || toI == null || toJ == null) return null;
  return Math.max(
    gridSpanGap(fromI, fromCell.width, toI, toCell.width),
    gridSpanGap(fromJ, fromCell.height, toJ, toCell.height),
    gridSpanGap(elevationSquareOf(fromCell), fromCell.depth, elevationSquareOf(toCell), toCell.depth),
  );
}

export function opportunityCrossingKey({ reactorCombatantId, pauseAt } = {}) {
  if (reactorCombatantId == null || !pauseAt) return null;
  const i = Number(pauseAt.i);
  const j = Number(pauseAt.j);
  if (!Number.isFinite(i) || !Number.isFinite(j)) return null;
  const elevation = Number(pauseAt.elevation ?? 0);
  return `oa:${reactorCombatantId}:${i}:${j}:${Number.isFinite(elevation) ? elevation : 0}`;
}

export function filterConsumedOpportunityCrossings(checkpoints, movementActionId) {
  if (!movementActionId) return Array.isArray(checkpoints) ? checkpoints : [];
  return (Array.isArray(checkpoints) ? checkpoints : []).map((checkpoint) => ({
    ...checkpoint,
    opportunities: (checkpoint.opportunities ?? []).filter((opportunity) => {
      const key = opportunityCrossingKey({
        reactorCombatantId: opportunity.reactorCombatantId,
        pauseAt: opportunity.pauseAt ?? checkpoint.pauseAt,
      });
      return !key || wasMovementActionProcessed(movementActionId, key) !== true;
    }),
  })).filter((checkpoint) => checkpoint.opportunities.length);
}

function normalizePathCells(path, options, warnings, mover = null) {
  if (!Array.isArray(path) || path.length < 2) return [];
  const cells = [];
  let missing = false;
  for (const point of path) {
    const cell = normalizeOpportunityCell(opportunityPointWithTokenSize(point, mover), options);
    if (!cell) {
      missing = true;
      break;
    }
    cells.push(cell);
  }
  if (missing) {
    warnings.push(OPPORTUNITY_PATH_WARNINGS.MISSING_GRID);
    warnAbnormal("path cell could not be normalized", {
      length: path.length,
      gridSize: readGridSize(options),
    });
    return [];
  }

  for (let index = 1; index < cells.length; index++) {
    const step = opportunityStepSquares(cells[index - 1], cells[index]);
    if (step != null && step > 1) {
      warnings.push(OPPORTUNITY_PATH_WARNINGS.PATH_NOT_STEPPED);
      warnAbnormal("path is not cell-stepped", {
        pathIndex: index - 1,
        step,
      });
      break;
    }
  }
  return cells;
}

function reactorCell(token, options, warnings, combatantId) {
  const cell = normalizeOpportunityCell(token, options);
  if (cell) return cell;
  warnings.push(OPPORTUNITY_PATH_WARNINGS.MISSING_TOKEN);
  warnAbnormal("reactor Token has no usable cell", {
    combatantId,
    tokenId: documentId(token),
  });
  return null;
}

function pathMayReach(pathCells, origin, maxReach) {
  for (const cell of pathCells) {
    const distance = opportunityReachSquares(cell, origin);
    if (distance != null && distance <= maxReach) return true;
  }
  return false;
}

function collectWeaponExits(pathCells, origin, weapons) {
  const exits = [];
  for (const entry of weapons) {
    const reach = Number(entry.reach);
    if (!Number.isFinite(reach)) continue;
    for (let index = 0; index < pathCells.length - 1; index++) {
      const step = opportunityStepSquares(pathCells[index], pathCells[index + 1]);
      if (step == null || step > 1) continue;
      const previous = opportunityReachSquares(pathCells[index], origin);
      const next = opportunityReachSquares(pathCells[index + 1], origin);
      if (previous == null || next == null) continue;
      if (previous <= reach && next > reach) {
        exits.push({
          weaponId: entry.weaponId ?? documentId(entry.weapon),
          reach,
          pathIndex: index,
          pauseAt: pathCells[index],
          exitTo: pathCells[index + 1],
        });
      }
    }
  }
  return exits;
}

function sortWeaponIds(ids) {
  return [...new Set(ids.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function reactorOrder(a, b) {
  const byInitiative = compareCombatants(a.combatant, b.combatant);
  if (byInitiative) return byInitiative;
  return documentId(a.combatant).localeCompare(documentId(b.combatant));
}

function descriptorFor(reactor, exit, weaponIds) {
  return {
    reactorActorId: documentId(reactor.actor),
    reactorTokenId: documentId(reactor.token),
    reactorCombatantId: documentId(reactor.combatant),
    eligibleWeaponIds: sortWeaponIds(weaponIds),
    pauseAt: exit.pauseAt,
    exitTo: exit.exitTo,
    pathIndex: exit.pathIndex,
  };
}

function buildOpportunityCheckpoints({
  combat,
  moverToken,
  moverCombatant,
  path,
  reactors,
  gridSize,
  grid,
} = {}) {
  const warnings = [];
  const options = { gridSize, grid };
  const pathCells = normalizePathCells(path, options, warnings, moverToken);
  const rawExits = [];
  if (pathCells.length < 2) {
    return { checkpoints: [], rawExits, warnings };
  }

  const candidates = Array.isArray(reactors)
    ? reactors
    : listOpportunityReactors({ combat, moverToken, moverCombatant });

  const grouped = new Map();
  for (const reactor of candidates) {
    const origin = reactorCell(reactor.token, options, warnings, documentId(reactor.combatant));
    if (!origin) continue;

    const maxReach = reactor.weapons.reduce((max, entry) => Math.max(max, Number(entry.reach) || 0), 0);
    if (!pathMayReach(pathCells, origin, maxReach)) continue;

    const exits = collectWeaponExits(pathCells, origin, reactor.weapons);
    for (const exit of exits) {
      rawExits.push({
        reactorCombatantId: documentId(reactor.combatant),
        weaponId: exit.weaponId,
        reach: exit.reach,
        pathIndex: exit.pathIndex,
        pauseAt: exit.pauseAt,
        exitTo: exit.exitTo,
      });
      const key = `${exit.pathIndex}:${documentId(reactor.combatant)}`;
      let group = grouped.get(key);
      if (!group) {
        group = {
          pathIndex: exit.pathIndex,
          pauseAt: exit.pauseAt,
          exitTo: exit.exitTo,
          reactor,
          weaponIds: [],
        };
        grouped.set(key, group);
      }
      group.weaponIds.push(exit.weaponId);
    }
  }

  const byPathIndex = new Map();
  for (const group of grouped.values()) {
    let checkpoint = byPathIndex.get(group.pathIndex);
    if (!checkpoint) {
      checkpoint = {
        pathIndex: group.pathIndex,
        pauseAt: group.pauseAt,
        exitTo: group.exitTo,
        opportunities: [],
      };
      byPathIndex.set(group.pathIndex, checkpoint);
    }
    checkpoint.opportunities.push(descriptorFor(group.reactor, group, group.weaponIds));
  }

  const checkpoints = [...byPathIndex.values()].sort((a, b) => a.pathIndex - b.pathIndex);
  const reactorById = new Map(candidates.map((entry) => [documentId(entry.combatant), entry]));
  for (const checkpoint of checkpoints) {
    checkpoint.opportunities.sort((a, b) => {
      const left = reactorById.get(a.reactorCombatantId);
      const right = reactorById.get(b.reactorCombatantId);
      if (left && right) return reactorOrder(left, right);
      return String(a.reactorCombatantId).localeCompare(String(b.reactorCombatantId));
    });
  }

  return { checkpoints, rawExits, warnings };
}

/**
 * A reactor only gets one automatic Opportunity per continuous movement. This
 * only limits the prompts (`rawExits` still has every exit).
 */
function limitAutomaticOpportunitiesToFirstExitPerReactor(checkpoints) {
  const seen = new Set();
  const limited = [];
  for (const checkpoint of Array.isArray(checkpoints) ? checkpoints : []) {
    const opportunities = [];
    for (const opportunity of checkpoint.opportunities ?? []) {
      const id = opportunity.reactorCombatantId;
      if (id == null || seen.has(id)) continue;
      seen.add(id);
      opportunities.push(opportunity);
    }
    if (!opportunities.length) continue;
    limited.push({ ...checkpoint, opportunities });
  }
  return limited;
}

/** `input.moverToken` is a Token or TokenDocument. */
export function analyzeOpportunityMovement(input = {}) {
  const context = classifyOpportunityMovement(input);
  if (!context.relevant) {
    return {
      context,
      reactors: [],
      checkpoints: [],
      automaticCheckpoints: [],
      rawExits: [],
      warnings: [],
    };
  }

  const reactors = listOpportunityReactors(input);
  const built = buildOpportunityCheckpoints({
    ...input,
    reactors,
  });
  return {
    context,
    reactors,
    checkpoints: built.checkpoints,
    automaticCheckpoints: limitAutomaticOpportunitiesToFirstExitPerReactor(built.checkpoints),
    rawExits: built.rawExits,
    warnings: built.warnings,
  };
}
