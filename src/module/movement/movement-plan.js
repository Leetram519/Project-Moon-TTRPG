/**
 * A MovementPlan is one requested movement of one token, worked out before it commits.
 * `request.nature` (voluntary, forced or administrative) is set when the plan is made and
 * cannot be changed. Plans only live on this client.
 */

import { RULE_MERGES, defineRuleSubject, resolveRuleProfile } from "../rules/rule-contributions.js";
import { normalizeMovementPoint, normalizeMovementReference } from "./movement-points.js";
import { cloneData, optionalString } from "../shared-helpers.js";

const MOVEMENT_RULE_SUBJECT = "movement";

const MOVEMENT_ROLES = {
  SOURCE: "source",
  MOVER: "mover",
  REFERENCE: "reference",
  LINKED: "linked",
};

export const MOVEMENT_NATURES = {
  VOLUNTARY: "voluntary",
  FORCED: "forced",
  ADMINISTRATIVE: "administrative",
};

export const MOVEMENT_DISTANCE_MODES = { EXACT: "exact", UP_TO: "upTo" };
export const MOVEMENT_PATH_MODES = { FREE: "free", DIRECT: "direct" };
export const RESERVED_PATH_MODES = ["straight", "toward", "away"];
export const OA_MOVEMENT_MODES = { NORMAL: "normal", NONE: "none" };
export const HAZARD_POLICIES = { INTERACT: "interact", IGNORE: "ignore" };

export const LINKED_FAILURE_POLICIES = {
  ABORT_ROOT_SEGMENT: "abortRootSegment",
  BEST_EFFORT: "bestEffort",
};

export const LINKED_FOLLOW_MODES = { OFFSET: "offset" };

export const PLAN_STATUS = {
  PLANNED: "planned",
  RESOLVED: "resolved",
  COMMITTING: "committing",
  COMMITTED: "committed",
  ABORTED: "aborted",
  MANUAL: "manual",
};

/** The movement action we register for forced transport (costs 0 and isn't a teleport). */
export const FORCED_MOVEMENT_ACTION = "pmttrpgForced";

const NATURE_SET = new Set(Object.values(MOVEMENT_NATURES));
const DISTANCE_MODE_SET = new Set(Object.values(MOVEMENT_DISTANCE_MODES));
const PATH_MODE_SET = new Set(Object.values(MOVEMENT_PATH_MODES));
const FAILURE_POLICY_SET = new Set(Object.values(LINKED_FAILURE_POLICIES));
const SURFACE_POLICIES = new Set(["stop", "ignore"]);
const TRANSITION_POLICIES = new Set(["stop", "allow"]);
const LANDING_POLICIES = new Set(["settle", "none"]);
const FORCE_POLICIES = new Set(["post", "suppress"]);
const STALE_ORIGIN_POLICIES = new Set(["reresolve", "abort"]);

/** @type {Map<string, object>} */
const pending = new Map();

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
}

/** CR Forced Movement: it spends no movement, provokes no OA and still interacts with Hazards. */
function defaultRulesForNature(nature) {
  const forced = nature === MOVEMENT_NATURES.FORCED;
  const administrative = nature === MOVEMENT_NATURES.ADMINISTRATIVE;
  return {
    spendsMovement: !forced && !administrative,
    costPerSpace: 0,
    distanceMax: null,
    opportunityAttack: { mode: forced || administrative ? OA_MOVEMENT_MODES.NONE : OA_MOVEMENT_MODES.NORMAL },
    hazards: HAZARD_POLICIES.INTERACT,
    collision: {
      walls: "stop",
      bounds: "stop",
      surfaces: forced ? "stop" : "ignore",
      transitions: forced ? "stop" : "allow",
    },
    landing: "none",
    report: { force: forced ? "post" : "suppress", falling: false },
    vertical: { allowed: false },
  };
}

export function defineMovementRuleSubject() {
  defineRuleSubject(MOVEMENT_RULE_SUBJECT, {
    roles: Object.values(MOVEMENT_ROLES),
    fields: {
      "cost.perSpace": { type: "number", merge: RULE_MERGES.SUM, min: 0 },
      "opportunityAttack.mode": {
        type: "enum",
        merge: RULE_MERGES.PREFER,
        values: Object.values(OA_MOVEMENT_MODES),
        prefer: OA_MOVEMENT_MODES.NONE,
      },
      "distance.max": { type: "integer", merge: RULE_MERGES.MIN, min: 0 },
      "report.force": {
        type: "enum",
        merge: RULE_MERGES.PREFER,
        values: [...FORCE_POLICIES],
        prefer: "suppress",
      },
    },
  });
}

function movementProfileBaseline(rules) {
  return {
    cost: { perSpace: Number(rules?.costPerSpace) || 0 },
    opportunityAttack: { mode: rules?.opportunityAttack?.mode ?? OA_MOVEMENT_MODES.NORMAL },
    distance: { max: Number.isInteger(rules?.distanceMax) ? rules.distanceMax : null },
    report: { force: rules?.report?.force === "suppress" ? "suppress" : "post" },
  };
}

function applyMovementProfile(rules, profile) {
  const next = cloneData(rules);
  next.costPerSpace = Math.max(0, Number(profile?.cost?.perSpace) || 0);
  next.opportunityAttack = { mode: profile?.opportunityAttack?.mode ?? next.opportunityAttack.mode };
  next.distanceMax = Number.isInteger(profile?.distance?.max) ? profile.distance.max : null;
  if (FORCE_POLICIES.has(profile?.report?.force)) {
    next.report = { ...(next.report ?? {}), force: profile.report.force };
  }
  return next;
}

function movementRoleContext(plan, { resolveUuid, resolveCombatant } = {}) {
  const participant = (role) => {
    if (!role) return null;
    const token = role.tokenUuid ? resolveUuid(role.tokenUuid) : null;
    const actor = role.actorUuid ? resolveUuid(role.actorUuid) : (token?.actor ?? null);
    return {
      actor: actor ?? token?.actor ?? null,
      combatant: role.combatantId ? resolveCombatant(role.combatantId) : null,
      token,
      item: role.itemUuid ? resolveUuid(role.itemUuid) : null,
    };
  };
  const reference = plan.roles.reference;
  let referenceRole = null;
  if (reference?.type === "document") {
    const doc = resolveUuid(reference.uuid);
    referenceRole = doc ? { actor: doc.actor ?? (doc.documentName === "Actor" ? doc : null), token: doc.documentName === "Token" ? doc : null, combatant: null } : null;
  } else if (reference?.type === "point") {
    referenceRole = { point: { x: reference.x, y: reference.y, elevation: reference.elevation } };
  }
  return {
    source: participant(plan.roles.source),
    mover: participant(plan.roles.mover),
    reference: referenceRole,
    linked: (plan.roles.linked ?? []).map((entry) => participant(entry)).filter(Boolean),
  };
}

/** Nature defaults and request policies first, then the role-aware contributions. */
export function deriveMovementRules(pending, env = {}) {
  const plan = pending.plan;
  const nature = plan.request.nature;
  const base = defaultRulesForNature(nature);
  applyRequestPolicies(base, plan.request);
  const result = resolveRuleProfile(MOVEMENT_RULE_SUBJECT, movementProfileBaseline(base), {
    nature,
    plan: pendingMovementView(pending),
    roles: movementRoleContext(plan, env),
  });
  plan.rules = applyMovementProfile(base, result.profile);
  pending.ruleSources = result.sources;
  return result;
}

/** Movement profile for a token moving on its own, before there's any plan. */
export function resolveImplicitMovementProfile({ tokenDoc, nature = MOVEMENT_NATURES.VOLUNTARY, combatant = null } = {}) {
  const baseRules = defaultRulesForNature(nature);
  const baseline = movementProfileBaseline(baseRules);
  const result = resolveRuleProfile(MOVEMENT_RULE_SUBJECT, baseline, {
    nature,
    plan: null,
    roles: {
      source: null,
      mover: { actor: tokenDoc?.actor ?? null, combatant, token: tokenDoc ?? null, item: null },
      reference: null,
      linked: [],
    },
  });
  return { ...result, baseline, rules: applyMovementProfile(baseRules, result.profile) };
}

function naturePolicy(nature) {
  const forced = nature === MOVEMENT_NATURES.FORCED;
  return {
    surfaces: forced ? "stop" : "ignore",
    transitions: forced ? "stop" : "allow",
    landing: "none",
    force: forced,
    falling: false,
  };
}

/** A request can tighten collision and reporting, but loosening them needs `trustedPolicy`. */
function sanitizePlanPolicy(nature, input = {}) {
  const policy = naturePolicy(nature);
  const trusted = input.trustedPolicy === true;
  const surfaces = input.collision?.surfaces;
  const transitions = input.collision?.transitions;
  const landing = input.landing;
  const force = input.report?.force;
  const falling = input.report?.falling;
  if (SURFACE_POLICIES.has(surfaces) && (trusted || !(policy.surfaces === "stop" && surfaces === "ignore"))) {
    policy.surfaces = surfaces;
  }
  if (TRANSITION_POLICIES.has(transitions) && (trusted || !(policy.transitions === "stop" && transitions === "allow"))) {
    policy.transitions = transitions;
  }
  if (LANDING_POLICIES.has(landing)) policy.landing = landing;
  if (typeof force === "boolean" && (trusted || !(policy.force === true && force === false))) policy.force = force;
  if (typeof falling === "boolean" && (trusted || !(policy.falling === true && falling === false))) policy.falling = falling;
  return policy;
}

function normalizeOnStaleOrigin(value) {
  return STALE_ORIGIN_POLICIES.has(value) ? value : "reresolve";
}

function normalizeRequireVerifiedRest(value) {
  if (!value || typeof value !== "object") return null;
  const elevation = Number(value.elevation);
  if (!Number.isFinite(elevation)) return null;
  return Object.freeze({ elevation });
}

function applyRequestPolicies(base, request = {}) {
  if (request.vertical) base.vertical = { allowed: true };
  if (SURFACE_POLICIES.has(request.collision?.surfaces)) base.collision.surfaces = request.collision.surfaces;
  if (TRANSITION_POLICIES.has(request.collision?.transitions)) base.collision.transitions = request.collision.transitions;
  if (LANDING_POLICIES.has(request.landing)) base.landing = request.landing;
  if (request.report?.force === true || request.report?.force === "post") base.report.force = "post";
  if (request.report?.force === false || request.report?.force === "suppress") base.report.force = "suppress";
  if (typeof request.report?.falling === "boolean") base.report.falling = request.report.falling;
}

function normalizeRole(raw, { withItem = false } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const role = {
    actorUuid: optionalString(raw.actorUuid),
    combatantId: optionalString(raw.combatantId),
    tokenUuid: optionalString(raw.tokenUuid),
  };
  if (withItem) {
    role.itemUuid = optionalString(raw.itemUuid);
    role.declarationId = optionalString(raw.declarationId);
    role.kind = optionalString(raw.kind);
    role.metadata = raw.metadata && typeof raw.metadata === "object" ? cloneData(raw.metadata) : {};
  }
  return role;
}

export function normalizeLinkedParticipant(raw) {
  const role = normalizeRole(raw);
  if (!role?.tokenUuid) return null;
  const follow = raw.follow && typeof raw.follow === "object" ? raw.follow : null;
  if (!follow || follow.mode !== LINKED_FOLLOW_MODES.OFFSET) return null;
  const dx = Number(follow.dx);
  const dy = Number(follow.dy);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const failurePolicy = FAILURE_POLICY_SET.has(raw.failurePolicy)
    ? raw.failurePolicy
    : LINKED_FAILURE_POLICIES.BEST_EFFORT;
  return {
    ...role,
    follow: { mode: LINKED_FOLLOW_MODES.OFFSET, dx, dy, dElevation: Number(follow.dElevation) || 0 },
    failurePolicy,
  };
}

/** Throws on a malformed plan (plans come from core code, not content). */
export function createMovementPlan(input = {}) {
  const nature = input.nature;
  if (!NATURE_SET.has(nature)) throw new Error(`[PMTTRPG] Invalid movement nature '${nature}'`);
  const mover = normalizeRole(input.mover);
  if (!mover?.tokenUuid) throw new Error("[PMTTRPG] Movement plan needs a mover token");
  const movementActionId = optionalString(input.movementActionId);
  if (!movementActionId) throw new Error("[PMTTRPG] Movement plan needs a movementActionId");

  const distanceMode = DISTANCE_MODE_SET.has(input.distanceMode) ? input.distanceMode : MOVEMENT_DISTANCE_MODES.UP_TO;
  const pathMode = PATH_MODE_SET.has(input.pathMode) ? input.pathMode : MOVEMENT_PATH_MODES.FREE;
  const vertical = input.vertical === true;
  const policy = sanitizePlanPolicy(nature, input);
  const rules = defaultRulesForNature(nature);
  applyRequestPolicies(rules, {
    vertical,
    landing: policy.landing,
    collision: { surfaces: policy.surfaces, transitions: policy.transitions },
    report: { force: policy.force, falling: policy.falling },
  });
  const distance = input.distance == null ? null : Math.max(0, Math.floor(Number(input.distance) || 0));
  const waypoints = (Array.isArray(input.waypoints) ? input.waypoints : [])
    .map(normalizeMovementPoint)
    .filter(Boolean);
  const expectedOrigins = {};
  for (const [uuid, origin] of Object.entries(input.expectedOrigins ?? {})) {
    if (origin && typeof origin === "object") expectedOrigins[uuid] = cloneData(origin);
  }

  return {
    id: optionalString(input.id) ?? foundry.utils.randomID(),
    parentId: optionalString(input.parentId),
    movementActionId,
    status: PLAN_STATUS.PLANNED,
    roles: {
      source: normalizeRole(input.source, { withItem: true }),
      mover,
      reference: normalizeMovementReference(input.reference),
      linked: (Array.isArray(input.linked) ? input.linked : []).map(normalizeLinkedParticipant).filter(Boolean),
    },
    request: Object.freeze({
      nature,
      destination: normalizeMovementPoint(input.destination),
      waypoints,
      distance,
      distanceMode,
      pathMode,
      vertical,
      landing: policy.landing,
      collision: Object.freeze({ surfaces: policy.surfaces, transitions: policy.transitions }),
      report: Object.freeze({ force: policy.force, falling: policy.falling }),
      onStaleOrigin: normalizeOnStaleOrigin(input.onStaleOrigin),
      requireVerifiedRest: normalizeRequireVerifiedRest(input.requireVerifiedRest),
      animation: input.animation === "straight" ? "straight" : null,
    }),
    rules,
    expectedOrigins,
    annotations: [],
    resolved: null,
  };
}

/** `plan.request` is frozen, therefore operations edit the copy in `pending.request`. */
export function beginPendingMovement(plan) {
  const entry = {
    plan,
    request: { ...plan.request, waypoints: [...plan.request.waypoints] },
    operations: [],
    proposalOperations: [],
    droppedLinked: new Set(),
    manualReason: null,
    abortReason: null,
  };
  pending.set(plan.id, entry);
  return entry;
}

export function getPendingMovement(id) {
  return pending.get(String(id ?? "")) ?? null;
}

export function pendingMovementForToken(tokenUuid) {
  const key = String(tokenUuid ?? "");
  if (!key) return null;
  for (const entry of pending.values()) {
    if (entry.plan.roles.mover.tokenUuid === key) return entry;
  }
  return null;
}

export function pendingMovementForAction(movementActionId) {
  const key = String(movementActionId ?? "");
  if (!key) return null;
  for (const entry of pending.values()) {
    if (entry.plan.movementActionId === key && !entry.plan.parentId) return entry;
  }
  return null;
}

export function endPendingMovement(id) {
  pending.delete(String(id ?? ""));
}

/** Frozen copy for processors (they change the plan through the movement operations). */
export function pendingMovementView(entry) {
  const plan = cloneData(entry.plan);
  plan.request = { ...cloneData(entry.request), nature: entry.plan.request.nature };
  const participants = [plan.roles.mover, ...plan.roles.linked];
  return deepFreeze({
    plan,
    resolved: cloneData(entry.plan.resolved),
    source: plan.roles.source,
    participants,
    movementActionId: plan.movementActionId,
    nature: plan.request.nature,
  });
}
