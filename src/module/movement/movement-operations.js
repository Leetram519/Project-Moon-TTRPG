/**
 * The only way processors get to change a movement plan. Each call gets checked, logged
 * and applied later by the pipeline. A bad one just warns and gets skipped.
 */

import {
  HAZARD_POLICIES,
  LINKED_FAILURE_POLICIES,
  LINKED_FOLLOW_MODES,
  MOVEMENT_DISTANCE_MODES,
  MOVEMENT_PATH_MODES,
  OA_MOVEMENT_MODES,
  PLAN_STATUS,
  RESERVED_PATH_MODES,
  normalizeLinkedParticipant,
} from "./movement-plan.js";
import { normalizeMovementPoint, normalizeMovementReference } from "./movement-points.js";

export const PLAN_PHASE = "plan";
export const RESOLVED_PHASE = "resolved";

const PLAN_OPERATIONS = [
  "addCostPerSpace",
  "clampDistance",
  "setDistanceMode",
  "replaceDestination",
  "replaceReference",
  "setPathMode",
  "setOpportunityAttackPolicy",
  "setHazardPolicy",
  "setSpendsMovement",
  "addLinkedParticipant",
  "requireManualAdjudication",
];

const PROPOSAL_OPERATIONS = [
  "truncatePath",
  "stopAtResolvedPoint",
  "annotateConsequence",
  "abort",
  "requireManualAdjudication",
];

const ALL_OPERATIONS = new Set([...PLAN_OPERATIONS, ...PROPOSAL_OPERATIONS]);

function rejected(pending, processorId, op, reason, extra) {
  const key = `${processorId}:${op}:${reason}`;
  pending.warned ??= new Set();
  if (!pending.warned.has(key)) {
    pending.warned.add(key);
    console.warn(`[PMTTRPG] ignored movement operation ${op} from '${processorId}': ${reason}`, extra ?? "");
  }
  return { ok: false, reason };
}

function isKey(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]+$/.test(value);
}

function jsonSafe(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

function validatePlanOperation(pending, op, args) {
  const [value] = args;
  switch (op) {
    case "addCostPerSpace":
      return Number.isFinite(value) ? { value } : null;
    case "clampDistance":
      return Number.isInteger(value) && value >= 0 ? { value } : null;
    case "setDistanceMode":
      return Object.values(MOVEMENT_DISTANCE_MODES).includes(value) ? { value } : null;
    case "replaceDestination": {
      const point = normalizeMovementPoint(value);
      return point ? { value: point } : null;
    }
    case "replaceReference": {
      if (value === null) return { value: null };
      const reference = normalizeMovementReference(value);
      return reference ? { value: reference } : null;
    }
    case "setPathMode":
      if (RESERVED_PATH_MODES.includes(value)) return null;
      return Object.values(MOVEMENT_PATH_MODES).includes(value) ? { value } : null;
    case "setOpportunityAttackPolicy":
      return Object.values(OA_MOVEMENT_MODES).includes(value?.mode) ? { value: { mode: value.mode } } : null;
    case "setHazardPolicy":
      return Object.values(HAZARD_POLICIES).includes(value) ? { value } : null;
    case "setSpendsMovement":
      return typeof value === "boolean" ? { value } : null;
    case "addLinkedParticipant": {
      const linked = normalizeLinkedParticipant({
        ...(value ?? {}),
        failurePolicy: value?.failurePolicy ?? LINKED_FAILURE_POLICIES.BEST_EFFORT,
      });
      if (!linked) return null;
      if (value?.follow?.mode !== LINKED_FOLLOW_MODES.OFFSET) return null;
      if (value?.failurePolicy != null && !Object.values(LINKED_FAILURE_POLICIES).includes(value.failurePolicy)) return null;
      if (linked.tokenUuid === pending.plan.roles.mover.tokenUuid) return null;
      const already = pending.plan.roles.linked.some((entry) => entry.tokenUuid === linked.tokenUuid)
        || pending.operations.some((entry) => entry.op === "addLinkedParticipant" && entry.value.tokenUuid === linked.tokenUuid);
      return already ? null : { value: linked };
    }
    case "requireManualAdjudication":
      return isKey(value) ? { value } : null;
    default:
      return null;
  }
}

function validateProposalOperation(pending, op, args) {
  const [value] = args;
  const path = pending.plan.resolved?.path ?? [];
  switch (op) {
    case "truncatePath":
      return Number.isInteger(value) && value >= 0 && value < path.length ? { value } : null;
    case "stopAtResolvedPoint": {
      const point = normalizeMovementPoint(value);
      if (!point) return null;
      const index = path.findIndex((cell) => cell.x === point.x && cell.y === point.y
        && (cell.elevation ?? 0) === point.elevation);
      return index >= 0 ? { value: index } : null;
    }
    case "annotateConsequence": {
      if (!isKey(value?.key)) return null;
      const data = jsonSafe(value.data ?? null);
      return data === undefined ? null : { value: { key: value.key, data } };
    }
    case "abort":
    case "requireManualAdjudication":
      return isKey(value) ? { value } : null;
    default:
      return null;
  }
}

function buildOperations(pending, { processorId, phase }) {
  const allowed = new Set(phase === PLAN_PHASE ? PLAN_OPERATIONS : phase === RESOLVED_PHASE ? PROPOSAL_OPERATIONS : []);
  const log = phase === PLAN_PHASE ? pending.operations : pending.proposalOperations;
  const validate = phase === PLAN_PHASE ? validatePlanOperation : validateProposalOperation;
  const ops = {};
  for (const op of ALL_OPERATIONS) {
    ops[op] = (...args) => {
      if (!allowed.has(op)) return rejected(pending, processorId, op, "wrong-phase");
      const checked = validate(pending, op, args);
      if (!checked) return rejected(pending, processorId, op, "invalid", args[0]);
      // stopAtResolvedPoint is just a truncation, so we log it as one
      const recordedOp = op === "stopAtResolvedPoint" ? "truncatePath" : op;
      log.push({ op: recordedOp, value: checked.value, processorId });
      return { ok: true };
    };
  }
  return new Proxy(Object.freeze(ops), {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop !== "string") return undefined;
      return () => rejected(pending, processorId, prop, "unknown-operation");
    },
  });
}

export function createPlanOperations(pending, { processorId = "unknown" } = {}) {
  return buildOperations(pending, { processorId, phase: PLAN_PHASE });
}

export function createProposalOperations(pending, { processorId = "unknown" } = {}) {
  return buildOperations(pending, { processorId, phase: RESOLVED_PHASE });
}

/** Applies the plan-phase log on top of the derived rules, then clears it. */
export function applyPlanOperations(pending) {
  const rules = pending.plan.rules;
  const request = pending.request;
  for (const { op, value } of pending.operations) {
    switch (op) {
      case "addCostPerSpace":
        rules.costPerSpace = Math.max(0, (Number(rules.costPerSpace) || 0) + value);
        break;
      case "clampDistance":
        rules.distanceMax = Number.isInteger(rules.distanceMax) ? Math.min(rules.distanceMax, value) : value;
        break;
      case "setDistanceMode":
        request.distanceMode = value;
        break;
      case "replaceDestination":
        request.destination = value;
        request.waypoints = [value];
        break;
      case "replaceReference":
        pending.plan.roles.reference = value;
        break;
      case "setPathMode":
        request.pathMode = value;
        break;
      case "setOpportunityAttackPolicy":
        rules.opportunityAttack = { mode: value.mode };
        break;
      case "setHazardPolicy":
        rules.hazards = value;
        break;
      case "setSpendsMovement":
        rules.spendsMovement = value;
        break;
      case "addLinkedParticipant":
        pending.plan.roles.linked.push(value);
        break;
      case "requireManualAdjudication":
        pending.manualReason ??= value;
        pending.plan.status = PLAN_STATUS.MANUAL;
        break;
      default:
        break;
    }
  }
  pending.operations.length = 0;
}

/**
 * Applies the resolved-phase log. Gives back the smallest truncation index asked for
 * (or null) so the resolver can redo the distances up to there.
 */
export function applyProposalOperations(pending) {
  let truncateAt = null;
  for (const { op, value, processorId } of pending.proposalOperations) {
    switch (op) {
      case "truncatePath":
        truncateAt = truncateAt == null ? value : Math.min(truncateAt, value);
        break;
      case "annotateConsequence":
        pending.plan.annotations.push({ processorId, key: value.key, data: value.data });
        break;
      case "abort":
        pending.abortReason ??= value;
        pending.plan.status = PLAN_STATUS.ABORTED;
        break;
      case "requireManualAdjudication":
        pending.manualReason ??= value;
        if (pending.plan.status !== PLAN_STATUS.ABORTED) pending.plan.status = PLAN_STATUS.MANUAL;
        break;
      default:
        break;
    }
  }
  pending.proposalOperations.length = 0;
  return truncateAt;
}
