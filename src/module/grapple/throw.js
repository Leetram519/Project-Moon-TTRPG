/**
 * The Grappler throws the target up to floor((Fortitude + Rank) / 2) + 1 squares and the
 * Grapple ends. As forced movement it provokes no OA and spends no movement, but hazards
 * still apply.
 *
 * Once the THROW declaration goes through, the Grapple ends and Throw immunity applies.
 */

import { gridSpacesBetween, pickCanvasPoint, snapPointToCell } from "../canvas/point-picker.js";
import { snapshotFromScene } from "../canvas/floor-snapshot.js";
import { currentTurnIdentity } from "../combat/turn-stamps.js";
import { fallingEnabled } from "../falling/fall-descent.js";
import { executeMovementPlan, preparePendingMovement, previewPendingMovement, movementOutcomeSignature } from "../movement/movement-commit.js";
import { MOVEMENT_DISTANCE_MODES, MOVEMENT_NATURES, beginPendingMovement, createMovementPlan, endPendingMovement } from "../movement/movement-plan.js";
import { clampElevationToBudget, snapshotTokenOrigin } from "../movement/movement-points.js";
import { planSquaresBetween, elevationSquares } from "../movement/movement-resolve.js";
import { GRAPPLE_OPS, requestGrappleMutation } from "./grapple-authority.js";
import { listGrappleRelationships } from "./grapple-state.js";
import {
  declareAction,
  hasActiveGM,
  notifyGrappleReason,
  pickGrappleRelationship,
  postGrappleEnded,
  refuseGrapple,
  resolveGrappleSource,
} from "./grapple.js";
import { combatantName, combatantOf } from "../combat/combatant-match.js";
import { warnUser, localize } from "../shared-helpers.js";
import { ACTION_KINDS, ECONOMY_TYPES } from "../action-economy/kinds.js";
import { fallingDamageDice, forceDamageDice } from "../falling/damage.js";

const THROW_DISTANCE_MODE = MOVEMENT_DISTANCE_MODES.UP_TO;

const REFUSAL_KEYS = {
  "no-movement": "PMTTRPG.Grapple.ThrowNoMovement",
};

function refusalKey(reason) {
  return REFUSAL_KEYS[reason] ?? "PMTTRPG.Grapple.ThrowOutOfRange";
}

function throwDistanceSquares(actor) {
  const fortitude = Number(actor?.system?.abilities?.for?.value) || 0;
  const rank = Number(actor?.system?.attributes?.rank?.value) || 0;
  return Math.max(1, Math.floor((fortitude + rank) / 2) + 1);
}

function throwDestinationCheck({ grappler, target, destination, grid } = {}) {
  const budget = throwDistanceSquares(grappler?.actor);
  const origin = snapshotTokenOrigin(target?.token);
  const elevation = Number(destination?.elevation);
  const finitePoint = !!destination
    && Number.isFinite(destination.x)
    && Number.isFinite(destination.y)
    && Number.isFinite(elevation);
  if (!origin || !finitePoint) {
    return { ok: false, squares: 0, budget, maxHeightSquares: 0, reason: "invalid-destination" };
  }
  const cell = snapPointToCell(destination, grid, elevation);
  if (cell.x !== destination.x || cell.y !== destination.y) {
    return { ok: false, squares: 0, budget, maxHeightSquares: 0, reason: "invalid-destination" };
  }
  const point = { x: destination.x, y: destination.y, elevation };
  const flat = gridSpacesBetween(origin, point, grid);
  const squares = planSquaresBetween(origin, point, grid);
  const maxHeightSquares = Math.max(0, budget - flat);
  const height = Math.max(0, squares - flat);
  if (squares === 0) {
    return { ok: false, squares, budget, maxHeightSquares, reason: "no-movement" };
  }
  if (squares > budget || height > maxHeightSquares) {
    return { ok: false, squares, budget, maxHeightSquares, reason: "out-of-range" };
  }
  return { ok: true, squares, budget, maxHeightSquares, reason: null };
}

/** The Throw is only free in the same turn that made the Grapple, and only before any other Action. */
function freeThrowAvailable(relationship, combat) {
  if (!relationship?.freeThrow) return false;
  const grappler = combatantOf(combat, relationship.grapplerCombatantId);
  const turn = currentTurnIdentity(combat, grappler);
  return !!turn && turn.started === relationship.freeThrow.started
    && (turn.round ?? null) === (relationship.freeThrow.round ?? null);
}

function buildThrowPlan({ grappler, target, destination, declarationId = null, movementActionId }) {
  const targetToken = target?.token ?? null;
  const grapplerToken = grappler?.token ?? null;
  const origin = targetToken ? snapshotTokenOrigin(targetToken) : null;
  const vertical = (Number(destination?.elevation) || 0) !== (Number(origin?.elevation) || 0);
  const falling = fallingEnabled();
  return createMovementPlan({
    nature: MOVEMENT_NATURES.FORCED,
    vertical,
    movementActionId,
    source: {
      kind: ACTION_KINDS.THROW,
      declarationId,
      actorUuid: grappler?.actor?.uuid ?? null,
      combatantId: grappler?.id ?? null,
      tokenUuid: grapplerToken?.uuid ?? null,
    },
    mover: { tokenUuid: targetToken?.uuid, actorUuid: target?.actor?.uuid ?? null, combatantId: target?.id ?? null },
    reference: grapplerToken?.uuid ? { type: "document", uuid: grapplerToken.uuid } : null,
    pathMode: "direct",
    distanceMode: THROW_DISTANCE_MODE,
    distance: throwDistanceSquares(grappler?.actor),
    landing: falling ? "settle" : "none",
    report: { force: true, falling },
    collision: { surfaces: "stop", transitions: "stop" },
    animation: "straight",
    destination,
    expectedOrigins: targetToken?.uuid ? { [targetToken.uuid]: snapshotTokenOrigin(targetToken) } : {},
  });
}

function createThrowPointSource({ grappler, target, grid, user }) {
  const token = target?.token ?? null;
  const origin = snapshotTokenOrigin(token) ?? { x: 0, y: 0, elevation: 0 };
  let snapshot = null;
  let snapshotted = false;
  const cache = new Map();

  const floorSnapshot = () => {
    if (snapshotted) return snapshot;
    snapshotted = true;
    const sceneDoc = token?.parent ?? null;
    if (!sceneDoc) return null;
    try {
      snapshot = snapshotFromScene(sceneDoc);
    } catch (error) {
      console.warn("[PMTTRPG] Throw floor snapshot failed", error);
      snapshot = null;
    }
    return snapshot;
  };

  const movementEnv = () => ({
    floorSnapshot: floorSnapshot(),
    grid,
    resolveUuid: (uuid) => {
      if (uuid && uuid === token?.uuid) return token;
      if (uuid && uuid === grappler?.token?.uuid) return grappler.token;
      return null;
    },
  });

  const context = (point) => ({
    revealFallingDice: revealFallingDice(token, user),
    rank: Number(target?.actor?.system?.attributes?.rank?.value) || 0,
    origin,
    point,
    grid,
  });

  const describe = (point) => {
    const key = `${point.x}:${point.y}:${point.elevation}`;
    if (cache.has(key)) return cache.get(key);
    const pending = beginPendingMovement(buildThrowPlan({
      grappler,
      target,
      destination: point,
      movementActionId: `preview-${foundry.utils.randomID()}`,
    }));
    try {
      previewPendingMovement(pending, movementEnv());
      const view = describeThrowPoint(pending.plan.resolved, context(point));
      cache.set(key, view);
      return view;
    } finally {
      endPendingMovement(pending.plan.id);
    }
  };

  const preparePoint = async (point) => {
    const pending = beginPendingMovement(buildThrowPlan({
      grappler,
      target,
      destination: point,
      movementActionId: `throw-${foundry.utils.randomID()}`,
    }));
    try {
      await preparePendingMovement(pending, movementEnv());
      return describeThrowPoint(pending.plan.resolved, context(point));
    } finally {
      endPendingMovement(pending.plan.id);
    }
  };

  return {
    anchorTokenId: target?.tokenId ?? token?.id ?? null,
    origin,
    maxSpaces: throwDistanceSquares(grappler?.actor),
    measure: (from, to) => planSquaresBetween(from, to, grid),
    describe,
    prepare: preparePoint,
  };
}

export async function startThrow(actor, options = {}) {
  if (!actor) return { ok: false, reason: "invalid-actor" };
  const ctx = resolveGrappleSource(actor, options, { kind: ACTION_KINDS.THROW });
  if (!ctx.ok) {
    notifyGrappleReason(ctx.reason, options);
    return ctx;
  }
  if (!hasActiveGM()) return refuseGrapple("no-gm", options);
  const relationships = listGrappleRelationships(ctx.combat, { grapplerCombatantId: ctx.combatant.id });
  if (!relationships.length) return refuseGrapple("no-relationship", options);
  const relationship = await pickGrappleRelationship(ctx.combat, relationships, { title: game.i18n.localize("PMTTRPG.ActionMenu.Throw") });
  if (!relationship) return { ok: false, reason: "cancelled" };
  const target = combatantOf(ctx.combat, relationship.targetCombatantId);
  const targetToken = target?.token ?? null;
  if (!targetToken) return refuseGrapple("target-gone", options);

  const grid = canvas.grid ?? targetToken.parent.grid;
  const source = createThrowPointSource({
    grappler: ctx.combatant,
    target,
    user: game.user,
    grid,
  });
  const checkPoint = (point) => throwDestinationCheck({
    grappler: ctx.combatant,
    target,
    destination: point,
    grid,
  });
  const destination = await pickCanvasPoint({
    ...source,
    validate: (point) => {
      const verdict = checkPoint(point);
      return { ok: verdict.ok, reasonKey: verdict.ok ? null : refusalKey(verdict.reason) };
    },
    clampHeight: (point, next) => clampElevationToBudget(source.origin, point, next, source.maxSpaces, grid, source.measure),
    title: game.i18n.localize("PMTTRPG.ActionMenu.Throw"),
  });
  if (!destination) return { ok: false, reason: "cancelled" };
  const verdict = checkPoint(destination);
  if (!verdict.ok) {
    warnUser(refusalKey(verdict.reason));
    return { ok: false, reason: verdict.reason };
  }

  const free = freeThrowAvailable(relationship, ctx.combat);
  const declared = await declareAction({
    actor,
    combatant: ctx.combatant,
    tokenId: ctx.tokenId,
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.THROW,
    cost: free ? 0 : 1,
    timing: options.timing ?? null,
    consume: options.consume,
    target: target.actor ?? null,
    metadata: {
      grappleOperation: "throw",
      relationshipId: relationship.id,
      targetCombatantId: target.id,
      targetTokenId: target.tokenId ?? null,
      freeThrow: free,
    },
  });
  if (!declared?.ok) return declared ?? { ok: false, reason: "declaration-failed" };

  const pending = beginPendingMovement(buildThrowPlan({
    grappler: ctx.combatant,
    target,
    destination,
    declarationId: declared.declaration?.id ?? null,
    movementActionId: foundry.utils.randomID(),
  }));
  let moved = null;
  try {
    moved = await executeMovementPlan(pending);
  } catch (error) {
    moved = { ok: false, reason: "threw", error };
  }
  if (!moved?.ok) warnUser("PMTTRPG.Grapple.ThrowMoveFailed", { name: combatantName(target) }, moved);

  const completed = await requestGrappleMutation(ctx.combat, GRAPPLE_OPS.COMPLETE_THROW, { relationshipId: relationship.id });
  if (completed?.ok) void postGrappleEnded(ctx.combat, relationship, { labelKey: "PMTTRPG.Grapple.EndedThrow" });
  return {
    ok: true,
    free,
    declaration: declared.declaration,
    moved: moved?.ok === true,
    resolved: moved?.resolved ?? null,
  };
}

const CONTACT = new Set(["wall", "floor", "ceiling"]);

function signedHeightSquares(from, to, grid) {
  const delta = (Number(to?.elevation) || 0) - (Number(from?.elevation) || 0);
  if (Math.abs(delta) <= 1e-6) return 0;
  const unit = Number(grid?.distance) > 0 ? Number(grid.distance) : 1;
  const squares = elevationSquares(delta, unit) || 1;
  return delta > 0 ? squares : -squares;
}

function titleFor(squares, height) {
  if (height > 0) return localize("PMTTRPG.PlannedMovement.PickTitleUp", { squares, height });
  if (height < 0) return localize("PMTTRPG.PlannedMovement.PickTitleDown", { squares, height: Math.abs(height) });
  return localize("PMTTRPG.PlannedMovement.PickTitle", { squares });
}

function throwOutcomeKey(resolved) {
  const collided = resolved?.collided?.kind ?? null;
  const basis = resolved?.rest?.basis ?? null;
  if (resolved?.stopReason === "transition" || collided === "transition") return "transition";
  if (collided === "ceiling") return "ceiling";
  if (collided === "floor") return "floor";
  if (resolved?.stopReason === "wall" || collided === "wall") return "wall";
  if (basis === "trajectory") return "trajectory";
  if (basis === "unsupported") return "unsupported";
  if (basis === "known-floor") {
    const origin = Number(resolved.origin?.elevation);
    const rest = Number(resolved.rest?.elevation);
    const apex = Number(resolved.apexElevation);
    if (Number.isFinite(apex) && Number.isFinite(origin) && apex > origin + 1e-6 && Number.isFinite(rest) && rest <= origin + 1e-6) {
      return "upward";
    }
    if (Number.isFinite(origin) && Number.isFinite(rest)) {
      if (rest > origin + 1e-6) return "higher";
      if (rest > origin - 1e-6) return null;
    }
    return "landing";
  }
  return null;
}

function previewPath(resolved) {
  const path = (resolved?.path ?? []).map((point) => ({
    x: point.x,
    y: point.y,
    elevation: point.elevation ?? 0,
  }));
  const landing = resolved?.landing?.path ?? [];
  if (landing.length > 1) {
    for (const point of landing.slice(1)) {
      path.push({ x: point.x, y: point.y, elevation: point.elevation ?? 0 });
    }
    return path;
  }
  const end = resolved?.destination;
  const rest = resolved?.rest;
  if (end && rest && Math.abs((Number(rest.elevation) || 0) - (Number(end.elevation) || 0)) > 1e-6) {
    path.push({ x: end.x, y: end.y, elevation: rest.elevation });
  }
  return path;
}

function ghostPoint(resolved) {
  const end = resolved?.destination;
  if (!end) return null;
  return {
    x: end.x,
    y: end.y,
    elevation: resolved.rest?.elevation ?? end.elevation ?? 0,
  };
}

function previewMarks(resolved) {
  const path = previewPath(resolved);
  const marks = [];
  if (path.length && Number.isFinite(Number(resolved.apexElevation))) {
    let highest = path[0];
    for (const point of path) {
      if ((point.elevation ?? 0) >= (highest.elevation ?? 0)) highest = point;
    }
    marks.push({ x: highest.x, y: highest.y, elevation: highest.elevation ?? 0, kind: "apex" });
  }
  const kind = resolved?.collided?.kind;
  if (CONTACT.has(kind)) {
    const index = Number.isInteger(resolved.collided.pathIndex) ? resolved.collided.pathIndex : -1;
    const point = (resolved.path ?? [])[index] ?? path.at(-1);
    if (point) {
      marks.push({
        x: point.x,
        y: point.y,
        elevation: resolved.collided.elevation ?? point.elevation ?? 0,
        kind: "contact",
      });
    }
  }
  const ghost = ghostPoint(resolved);
  if (ghost) marks.push({ ...ghost, kind: "rest" });
  return marks;
}

function damageChips(resolved, { reveal, rank }) {
  const chips = [];
  const force = forceDamageDice(resolved);
  if (force > 0) {
    chips.push({
      text: localize("PMTTRPG.PlannedMovement.ChipForce", { formula: `${force}d8` }),
      tone: "force",
    });
  }
  const squares = Math.floor(Number(resolved?.fall?.squares) || 0);
  if (squares > 0) {
    const dice = fallingDamageDice(squares, rank);
    if (reveal && dice > 0) {
      chips.push({
        text: localize("PMTTRPG.PlannedMovement.ChipFallingDice", { squares, formula: `${dice}d8` }),
        tone: "falling",
      });
    } else {
      chips.push({
        text: localize("PMTTRPG.PlannedMovement.ChipFalling", { squares }),
        tone: "falling",
      });
    }
  }
  return chips;
}

function revealFallingDice(tokenDoc, user = game.user) {
  if (!user) return false;
  if (user.isGM) return true;
  if (tokenDoc?.testUserPermission(user, "OWNER")) return true;
  if (tokenDoc?.actor?.testUserPermission(user, "OWNER")) return true;
  return false;
}

function describeThrowPoint(resolved, {
  revealFallingDice: reveal = false,
  rank = 0,
  origin = null,
  point = null,
  grid = null,
} = {}) {
  const aimed = point ?? resolved?.destination ?? origin ?? { x: 0, y: 0, elevation: 0 };
  const from = origin ?? resolved?.origin ?? aimed;
  const squares = planSquaresBetween(from, aimed, grid);
  const height = signedHeightSquares(from, aimed, grid);
  const title = titleFor(squares, height);
  if (!resolved || resolved.failure) {
    return {
      valid: false,
      reasonKey: "PMTTRPG.PlannedMovement.PickOutOfRange",
      path: [],
      marks: [],
      ghost: null,
      label: {
        title,
        lines: [localize("PMTTRPG.PlannedMovement.PickOutOfRange")],
        chips: [],
      },
      signature: null,
    };
  }
  const outcomeKey = throwOutcomeKey(resolved);
  const lines = outcomeKey ? [localize(`PMTTRPG.PlannedMovement.Outcome.${outcomeKey}`)] : [];
  return {
    valid: true,
    reasonKey: null,
    path: previewPath(resolved),
    marks: previewMarks(resolved),
    ghost: ghostPoint(resolved),
    label: {
      title,
      lines,
      chips: damageChips(resolved, { reveal, rank }),
    },
    signature: movementOutcomeSignature(resolved),
  };
}
