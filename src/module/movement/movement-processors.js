/**
 * Movement processors run one at a time in `order`, each only in its own phase. `plan` ones
 * change policies before the geometry, `resolved` ones change the proposed result and
 * `committed` ones just watch.
 *
 * `claims` is an optional sync check the voluntary path uses to decide if an ordinary drag
 * needs a plan at all.
 */

import { pendingMovementView } from "./movement-plan.js";
import { createPlanOperations, createProposalOperations, PLAN_PHASE, RESOLVED_PHASE } from "./movement-operations.js";

export const MOVEMENT_PHASES = {
  PLAN: PLAN_PHASE,
  RESOLVED: RESOLVED_PHASE,
  COMMITTED: "committed",
};

const PHASE_SET = new Set(Object.values(MOVEMENT_PHASES));

const processors = [];
let processorSeq = 0;

export function registerMovementProcessor({ id, order = 0, phase, claims = null, process } = {}) {
  const key = typeof id === "string" ? id.trim() : "";
  if (!key || typeof process !== "function" || !PHASE_SET.has(phase)) {
    throw new Error("[PMTTRPG] movement processor requires id, a known phase, and process");
  }
  unregisterMovementProcessor(key);
  processors.push({
    id: key,
    order: Number.isFinite(Number(order)) ? Number(order) : 0,
    seq: processorSeq++,
    phase,
    claims: typeof claims === "function" ? claims : null,
    process,
  });
}

export function unregisterMovementProcessor(id) {
  const key = String(id ?? "");
  const index = processors.findIndex((entry) => entry.id === key);
  if (index >= 0) processors.splice(index, 1);
}

export function listMovementProcessors() {
  return sorted().map(({ id, order, phase }) => ({ id, order, phase }));
}

function sorted() {
  return [...processors].sort((a, b) => (a.order - b.order) || (a.seq - b.seq));
}

export function movementProcessorClaims(context = {}) {
  const claimed = [];
  for (const processor of sorted()) {
    if (!processor.claims) continue;
    try {
      if (processor.claims(context)) claimed.push(processor.id);
    } catch (error) {
      console.warn(`[PMTTRPG] movement processor claims '${processor.id}' threw; ignored`, error);
    }
  }
  return claimed;
}

export async function runMovementPhase(phase, pending) {
  for (const processor of sorted()) {
    if (processor.phase !== phase) continue;
    const view = pendingMovementView(pending);
    let ops = null;
    if (phase === MOVEMENT_PHASES.PLAN) ops = createPlanOperations(pending, { processorId: processor.id });
    else if (phase === MOVEMENT_PHASES.RESOLVED) ops = createProposalOperations(pending, { processorId: processor.id });
    try {
      await processor.process({ view, ops });
    } catch (error) {
      console.warn(`[PMTTRPG] movement processor '${processor.id}' failed; skipped`, error);
    }
  }
}
