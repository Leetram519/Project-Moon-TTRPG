import { getRankFromLevel } from "../actor/progression.js";
import { isPendingStatus } from "../status/pending.js";
import { reduceStatusPauseBudget, reduceStatusStandardBudget } from "./formulas.js";

function actorJustice(actor) {
  return Number(actor?.system?.abilities?.jus?.value) || 0;
}

function actorRank(actor) {
  const prepared = Number(actor?.system?.attributes?.rank?.value);
  if (Number.isFinite(prepared)) return prepared;
  return getRankFromLevel(actor?.system?.attributes?.level?.value) || 0;
}

function getReduceStatusBudget(actor) {
  const misc = Number(actor?.system?.attributes?.reduceStatus?.misc) || 0;
  return reduceStatusStandardBudget(actorJustice(actor), actorRank(actor), misc);
}

function getPauseReductionBudget(actor) {
  return reduceStatusPauseBudget(actorJustice(actor));
}

function hasOwnReduceStatusType(item) {
  const raw = item?.system?.reduceStatus;
  if (!raw || typeof raw !== "object") return false;
  if (!Object.prototype.hasOwnProperty.call(raw, "type")) return false;
  const type = String(raw.type).trim();
  return type === "standard" || type === "pause";
}

function sourceStatusDocument(item) {
  const uuid = item?._stats?.compendiumSource || item?.flags?.core?.sourceId;
  if (!uuid) return null;
  try {
    const source = fromUuidSync(uuid);
    return source?.type === "status" ? source : null;
  } catch {
    return null;
  }
}

function reduceStatusData(item) {
  if (hasOwnReduceStatusType(item)) return item.system.reduceStatus;
  const source = sourceStatusDocument(item);
  return source?.system?.reduceStatus ?? item?.system?.reduceStatus ?? {};
}

function getStatusIdentity(item) {
  return String(item?.name ?? "").trim();
}

function getReduceStatusType(item) {
  const type = String(reduceStatusData(item)?.type ?? "none").trim();
  if (type === "standard" || type === "pause") return type;
  return "none";
}

function normalizeBlockIdentity(raw) {
  return String(raw ?? "").trim();
}

function collectReduceStatusBlocks(pauseItems) {
  const blocked = new Set();
  for (const item of pauseItems ?? []) {
    if (getReduceStatusType(item) !== "pause") continue;
    const blocks = reduceStatusData(item)?.blocks;
    if (!Array.isArray(blocks)) continue;
    for (const raw of blocks) {
      const identity = normalizeBlockIdentity(raw);
      if (identity) blocked.add(identity);
    }
  }
  return blocked;
}

function compareReduceStatusItems(a, b) {
  const pa = Math.max(0, Number(a?.system?.priority ?? 0) || 0);
  const pb = Math.max(0, Number(b?.system?.priority ?? 0) || 0);
  if (pb !== pa) return pb - pa;
  const nameCmp = String(a?.name ?? "").localeCompare(String(b?.name ?? ""));
  if (nameCmp) return nameCmp;
  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
}

function isActiveStatusItem(actor, item) {
  return item?.type === "status"
    && !isPendingStatus(item)
    && !item.system?.shelved
    && actor.getStatusStacks(item.name) > 0;
}

function toReduceStatusEntry(actor, item) {
  return {
    statusName: item.name,
    itemId: item.id,
    stacks: actor.getStatusStacks(item.name),
    img: item.img,
    name: item.name,
  };
}

function pickCanonicalItem(existing, item) {
  if (!existing) return item;
  return compareReduceStatusItems(item, existing) < 0 ? item : existing;
}

function getReducibleStatuses(actor) {
  const standardByIdentity = new Map();
  const pauseByIdentity = new Map();
  const pauseItems = [];

  if (!actor?.items) return { standard: [], pause: [] };

  for (const item of actor.items) {
    if (!isActiveStatusItem(actor, item)) continue;
    if (getReduceStatusType(item) !== "pause") continue;
    pauseItems.push(item);
    const identity = getStatusIdentity(item);
    if (!identity) continue;
    pauseByIdentity.set(identity, pickCanonicalItem(pauseByIdentity.get(identity), item));
  }

  const blockedIdentities = collectReduceStatusBlocks(pauseItems);

  for (const item of actor.items) {
    if (!isActiveStatusItem(actor, item)) continue;
    if (getReduceStatusType(item) !== "standard") continue;
    const identity = getStatusIdentity(item);
    if (!identity || blockedIdentities.has(identity)) continue;
    standardByIdentity.set(identity, pickCanonicalItem(standardByIdentity.get(identity), item));
  }

  const standard = [...standardByIdentity.values()]
    .sort(compareReduceStatusItems)
    .map((item) => toReduceStatusEntry(actor, item));
  const pause = [...pauseByIdentity.values()]
    .sort(compareReduceStatusItems)
    .map((item) => toReduceStatusEntry(actor, item));

  return { standard, pause };
}

export function canReduceActor(actor) {
  const { standard, pause } = getReducibleStatuses(actor);
  return standard.length > 0 || pause.length > 0;
}

export function describeReduceStatusOptions(targetActor, { budgetActor } = {}) {
  const budgetSource = budgetActor ?? targetActor;
  const standardBudget = getReduceStatusBudget(budgetSource);
  const pauseBudget = getPauseReductionBudget(budgetSource);
  const { standard, pause } = getReducibleStatuses(targetActor);
  const pauseAvailable = pauseBudget > 0 && pause.length > 0;
  return {
    standardBudget,
    pauseBudget,
    standard,
    pause: pauseAvailable ? pause : [],
    canStandard: standard.length > 0,
    canPause: pauseAvailable,
    canReduce: standard.length > 0 || pauseAvailable,
  };
}

function parseNonNegativeInt(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function reductionRow(entry, amount) {
  return {
    statusName: entry.statusName,
    itemId: entry.itemId,
    amount,
  };
}

function validateStandardPlan(options, rows, { cap = false } = {}) {
  if (!options.canStandard) return null;
  const byName = new Map(options.standard.map((entry) => [entry.statusName, entry]));
  const requested = new Map();
  for (const row of rows ?? []) {
    const statusName = String(row?.statusName ?? "").trim();
    const amount = parseNonNegativeInt(row?.amount);
    if (!statusName || amount == null) return null;
    if (!byName.has(statusName)) {
      if (cap) continue;
      return null;
    }
    if (requested.has(statusName)) return null;
    requested.set(statusName, amount);
  }

  const reductions = [];
  let total = 0;
  for (const entry of options.standard) {
    const raw = requested.has(entry.statusName) ? requested.get(entry.statusName) : 0;
    const amount = cap ? Math.min(raw, entry.stacks) : raw;
    if (!cap && amount > entry.stacks) return null;
    if (amount > 0) reductions.push(reductionRow(entry, amount));
    total += amount;
  }

  if (total < 1 || total > options.standardBudget) return null;
  if (!reductions.length) return null;
  return { mode: "standard", reductions };
}

function validatePausePlan(options, statusName) {
  if (!options.canPause) return null;
  const name = String(statusName ?? "").trim();
  const entry = options.pause.find((row) => row.statusName === name || row.itemId === name);
  if (!entry) return null;
  const amount = Math.min(options.pauseBudget, entry.stacks);
  if (amount <= 0) return null;
  return { mode: "pause", reductions: [reductionRow(entry, amount)] };
}

/**
 * Checks a dialog form snapshot or a plan again against the
 * target's current statuses. With `{ cap: true }` amounts over the
 * remaining stacks get lowered and unknown statuses get skipped.
 */
export function resolveReduceStatusPlan(targetActor, submission, extra = {}) {
  if (!targetActor || submission == null) return null;
  const options = describeReduceStatusOptions(targetActor, extra);
  const cap = extra.cap === true;

  if (submission.mode === "pause") {
    const fromReductions = submission.reductions?.[0]?.statusName
      ?? submission.reductions?.[0]?.itemId;
    return validatePausePlan(options, submission.pauseItemId ?? fromReductions);
  }

  if (submission.mode === "standard") {
    if (Array.isArray(submission.reductions)) {
      return validateStandardPlan(options, submission.reductions, { cap });
    }
    const byId = new Map(options.standard.map((entry) => [entry.itemId, entry]));
    const rows = [];
    for (const [itemId, raw] of Object.entries(submission.amounts ?? {})) {
      const entry = byId.get(itemId);
      if (!entry) {
        if (cap) continue;
        return null;
      }
      const amount = parseNonNegativeInt(raw);
      if (amount == null) return null;
      rows.push({ statusName: entry.statusName, amount });
    }
    return validateStandardPlan(options, rows, { cap });
  }

  return null;
}
