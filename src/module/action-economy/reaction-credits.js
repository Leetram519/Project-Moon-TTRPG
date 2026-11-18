import { ACTION_KINDS, actionEconomyApplies } from "./kinds.js";
import { createKeyedQueue } from "../keyed-queue.js";
import { combatantActsFor } from "./acting-token.js";
import { canUserUpdateDocument } from "../acting-user.js";
import { isNextTurnStarted, latestTurnIdentity } from "../combat/turn-stamps.js";
import { exactCombatantForToken } from "../combat/combatant-match.js";

const SCOPE = "projectmoonttrpg";
const FLAG_KEY = "reactionCredits";
const FLAG_PATH = `flags.${SCOPE}.${FLAG_KEY}`;

const HELD_WEAPON_SOURCE_PREFIX = "held:";
const CONTENT_SOURCE_PREFIX = "content:";
const GRANT_SOURCE_PREFIX = "grant:";

export function isHeldWeaponReactionSourceKey(sourceKey) {
  return typeof sourceKey === "string" && sourceKey.startsWith(HELD_WEAPON_SOURCE_PREFIX);
}

export function isContentReactionSourceKey(sourceKey) {
  return typeof sourceKey === "string" && sourceKey.startsWith(CONTENT_SOURCE_PREFIX);
}

export function isGrantReactionSourceKey(sourceKey) {
  return typeof sourceKey === "string" && sourceKey.startsWith(GRANT_SOURCE_PREFIX);
}

function contentReactionSourceKey(itemId, kind, index) {
  return `${CONTENT_SOURCE_PREFIX}${itemId ?? "actor"}:${kind}:${index}`;
}

const REACTION_CREDIT_KIND_RESTRICTIONS = {
  UNIVERSAL: "universal",
  BLOCK: ACTION_KINDS.BLOCK,
  EVADE: ACTION_KINDS.EVADE,
  COUNTER: ACTION_KINDS.COUNTER,
  OPPORTUNITY_ATTACK: ACTION_KINDS.OPPORTUNITY_ATTACK,
};

const VALID_KIND_RESTRICTIONS = new Set(Object.values(REACTION_CREDIT_KIND_RESTRICTIONS));

/** The kinds a credit can be limited to (Universal pays for any of them). */
const TYPED_REACTION_CREDIT_KINDS = [
  REACTION_CREDIT_KIND_RESTRICTIONS.BLOCK,
  REACTION_CREDIT_KIND_RESTRICTIONS.EVADE,
  REACTION_CREDIT_KIND_RESTRICTIONS.COUNTER,
  REACTION_CREDIT_KIND_RESTRICTIONS.OPPORTUNITY_ATTACK,
];

const REACTION_CREDIT_BOUNDARIES = {
  NEXT_TURN_START: "nextTurnStart",
  ROUND_END: "roundEnd",
};

export const REACTION_PAYMENT_ORDERS = {
  RESTRICTED_FIRST: "restrictedFirst",
  POOL_FIRST: "poolFirst",
  ANY: "any",
};

const ANY_KIND_PAYMENT_ORDER = [
  REACTION_CREDIT_KIND_RESTRICTIONS.COUNTER,
  REACTION_CREDIT_KIND_RESTRICTIONS.BLOCK,
  REACTION_CREDIT_KIND_RESTRICTIONS.EVADE,
  REACTION_CREDIT_KIND_RESTRICTIONS.OPPORTUNITY_ATTACK,
];

const GRANTED_BY = new Set(["easyEffects", "manual"]);

const reactionCreditMutations = createKeyedQueue();

function normalizeCreditExpiry(raw) {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, value: null };
  if (raw.boundary === REACTION_CREDIT_BOUNDARIES.NEXT_TURN_START
    && Number.isInteger(raw.afterStarted) && raw.afterStarted >= 0) {
    return { ok: true, value: { boundary: raw.boundary, afterStarted: raw.afterStarted } };
  }
  if (raw.boundary === REACTION_CREDIT_BOUNDARIES.ROUND_END && Number.isInteger(raw.round) && raw.round >= 0) {
    return { ok: true, value: { boundary: raw.boundary, round: raw.round } };
  }
  return { ok: false, value: null };
}

function normalizeReactionCredit(raw) {
  if (!raw || typeof raw !== "object") return null;

  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return null;

  const kindRestriction = typeof raw.kindRestriction === "string" ? raw.kindRestriction.trim() : "";
  if (!VALID_KIND_RESTRICTIONS.has(kindRestriction)) return null;

  const sourceKey = typeof raw.sourceKey === "string" ? raw.sourceKey.trim() : "";
  if (!sourceKey) return null;

  if (!Array.isArray(raw.sourceItemIds)) return null;
  if (!raw.sourceItemIds.every((entry) => typeof entry === "string")) return null;

  let itemRestriction = null;
  if (raw.itemRestriction != null) {
    if (typeof raw.itemRestriction !== "string") return null;
    itemRestriction = raw.itemRestriction.trim();
    if (!itemRestriction) return null;
  }

  if (typeof raw.spent !== "boolean") return null;

  const expiry = normalizeCreditExpiry(raw.expires);
  if (!expiry.ok) return null;
  const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 80) : "";
  const grantedBy = GRANTED_BY.has(raw.grantedBy) ? raw.grantedBy : null;

  return {
    id,
    kindRestriction,
    sourceKey,
    sourceItemIds: raw.sourceItemIds.slice(),
    itemRestriction,
    spent: raw.spent,
    ...(expiry.value ? { expires: expiry.value } : {}),
    ...(label ? { label } : {}),
    ...(grantedBy ? { grantedBy } : {}),
  };
}

/** If two credits share an id the first valid one wins. */
export function getReactionCredits(combatant) {
  const raw = combatant?.flags?.[SCOPE]?.[FLAG_KEY];
  if (!Array.isArray(raw)) return [];

  const seen = new Set();
  const credits = [];
  for (const entry of raw) {
    const credit = normalizeReactionCredit(entry);
    if (!credit || seen.has(credit.id)) continue;
    seen.add(credit.id);
    credits.push(credit);
  }
  return credits;
}

/** The typed credits the actor's [Always Active] scripts grant right now. */
export function deriveContentReactionContributions(actor) {
  const grants = actor?.system?.attributes?.easyEffectsMods?.reactionGrants;
  if (!Array.isArray(grants)) return [];
  const next = new Map();
  const contributions = [];
  for (const grant of grants) {
    const kind = grant?.kind;
    if (!TYPED_REACTION_CREDIT_KINDS.includes(kind)) continue;
    const amount = Math.max(0, Math.floor(Number(grant.amount) || 0));
    const itemId = typeof grant.itemId === "string" && grant.itemId ? grant.itemId : null;
    const base = `${itemId ?? "actor"}:${kind}`;
    let index = next.get(base) ?? 0;
    for (let i = 0; i < amount; i++) {
      contributions.push({
        kindRestriction: kind,
        sourceKey: contentReactionSourceKey(itemId, kind, index++),
        sourceItemIds: itemId ? [itemId] : [],
        itemRestriction: null,
      });
    }
    next.set(base, index);
  }
  return contributions;
}

function combatOfCombatant(combatant, fallback = null) {
  return combatant?.parent ?? fallback ?? game.combat;
}

/**
 * Content credits only count while their source still grants them, and a grant
 * only counts until its boundary. Everything else (held weapons) is always live.
 */
export function isCreditLive(credit, { combatant = null, combat = null, actor = null, contentKeys = null } = {}) {
  if (!credit) return false;
  if (isContentReactionSourceKey(credit.sourceKey)) {
    const keys = contentKeys
      ?? new Set(deriveContentReactionContributions(combatant?.actor ?? actor).map((entry) => entry.sourceKey));
    return keys.has(credit.sourceKey);
  }
  const expires = credit.expires;
  if (!expires) return true;
  const active = combatOfCombatant(combatant, combat);
  if (!active || !combatant) return false;
  if (expires.boundary === REACTION_CREDIT_BOUNDARIES.NEXT_TURN_START) {
    return !isNextTurnStarted({ combatantId: String(combatant.id), afterStarted: expires.afterStarted }, active);
  }
  if (expires.boundary === REACTION_CREDIT_BOUNDARIES.ROUND_END) return Number(active.round) === expires.round;
  return false;
}

function getLiveReactionCredits(combatant, options = {}) {
  const credits = getReactionCredits(combatant);
  if (!credits.length) return credits;
  const contentKeys = credits.some((entry) => isContentReactionSourceKey(entry.sourceKey))
    ? new Set(deriveContentReactionContributions(combatant?.actor ?? options.actor).map((entry) => entry.sourceKey))
    : null;
  return credits.filter((entry) => isCreditLive(entry, { ...options, combatant, contentKeys }));
}

/** The Combatant you passed, then a unique token match, then a unique Actor match. Null if it's ambiguous. */
export function resolveReactionCreditCombatant(actor, options = {}) {
  const explicit = options.combatant;
  if (explicit && combatantActsFor(explicit, actor)) return explicit;

  const combat = options.combat ?? game.combat;
  if (!combat || !actor) return null;

  const optionTokenId = options.tokenId ?? options.token?.id ?? null;
  for (const tokenId of [optionTokenId, actor.token?.id ?? null]) {
    const byToken = exactCombatantForToken(combat, tokenId);
    if (byToken && combatantActsFor(byToken, actor)) return byToken;
  }

  const byActor = combat.combatants.filter((entry) => combatantActsFor(entry, actor));
  if (byActor.length === 1) return byActor[0];
  return null;
}

export function combatantForReactionToken(actor, tokenId, combat = game.combat) {
  return resolveReactionCreditCombatant(actor, { tokenId, combat });
}

function reactionMutationKey(combatant) {
  return combatant?.uuid ?? null;
}

/**
 * One credit-ledger write at a time per Combatant (on this client). Declarations
 * take the Actor declaration lock before this one.
 */
function withReactionCreditMutation(combatant, task) {
  return reactionCreditMutations.run(reactionMutationKey(combatant), task);
}

/** Without `acceptKinds` a declaration that isn't a typed Reaction only takes Universal credits and the pool. */
function normalizeAcceptKinds(acceptKinds, kind = null) {
  if (acceptKinds == null) return TYPED_REACTION_CREDIT_KINDS.includes(kind) ? [kind] : [];
  const list = Array.isArray(acceptKinds) ? acceptKinds : [acceptKinds];
  return [...new Set(list.filter((entry) => TYPED_REACTION_CREDIT_KINDS.includes(entry)))];
}

function normalizePaymentOrder(order) {
  return Object.values(REACTION_PAYMENT_ORDERS).includes(order) ? order : REACTION_PAYMENT_ORDERS.RESTRICTED_FIRST;
}

function normalizePaymentAmount(amount) {
  const value = Number(amount ?? 1);
  return Number.isInteger(value) && value >= 1 ? value : null;
}

function creditPaysRequest(credit, { acceptKinds, itemId, order }) {
  if (!credit || credit.spent !== false) return false;
  if (order === REACTION_PAYMENT_ORDERS.ANY) return true;
  if (credit.kindRestriction !== REACTION_CREDIT_KIND_RESTRICTIONS.UNIVERSAL && !acceptKinds.includes(credit.kindRestriction)) {
    return false;
  }
  if (credit.itemRestriction != null && credit.itemRestriction !== itemId) return false;
  return true;
}

function creditConstraintRank(credit) {
  if (credit.itemRestriction != null) return 0;
  if (credit.kindRestriction !== REACTION_CREDIT_KIND_RESTRICTIONS.UNIVERSAL) return 1;
  return 2;
}

function anyOrderRank(credit) {
  if (credit.kindRestriction === REACTION_CREDIT_KIND_RESTRICTIONS.UNIVERSAL) return 0;
  const index = ANY_KIND_PAYMENT_ORDER.indexOf(credit.kindRestriction);
  return 1 + (index < 0 ? ANY_KIND_PAYMENT_ORDER.length : index);
}

// `restrictedFirst` uses the most restricted credit first and the pool last,
// `poolFirst` starts with the pool, and `any` takes every credit (item-restricted
// ones too) starting with the pool and Universal credits
function planReactionPayment(credits, pool, request = {}) {
  const amount = normalizePaymentAmount(request.amount);
  if (amount == null) return { ok: false, reason: "invalid-amount", units: [], available: 0 };
  const order = normalizePaymentOrder(request.order);
  const acceptKinds = normalizeAcceptKinds(request.acceptKinds, request.kind ?? null);
  const itemId = request.itemId ?? null;

  const eligible = [];
  const list = Array.isArray(credits) ? credits : [];
  list.forEach((credit, index) => {
    if (creditPaysRequest(credit, { acceptKinds, itemId, order })) eligible.push({ credit, index });
  });
  eligible.sort((a, b) => (order === REACTION_PAYMENT_ORDERS.ANY ? anyOrderRank(a.credit) - anyOrderRank(b.credit) : 0)
    || (creditConstraintRank(a.credit) - creditConstraintRank(b.credit))
    || (a.index - b.index));

  const creditUnits = eligible.map(({ credit }) => ({
    by: "credit",
    creditId: credit.id,
    kindRestriction: credit.kindRestriction,
    itemRestriction: credit.itemRestriction ?? null,
  }));
  const poolUnits = Array.from({ length: Math.max(0, Math.floor(Number(pool) || 0)) }, () => ({ by: "pool" }));
  const ordered = order === REACTION_PAYMENT_ORDERS.RESTRICTED_FIRST
    ? [...creditUnits, ...poolUnits]
    : [...poolUnits, ...creditUnits];
  if (ordered.length < amount) return { ok: false, reason: "insufficient", units: [], available: ordered.length };
  return { ok: true, reason: null, units: ordered.slice(0, amount), available: ordered.length };
}

function reactionRequestOf(declaration = {}) {
  return {
    kind: declaration?.kind ?? null,
    acceptKinds: declaration?.acceptKinds ?? null,
    itemId: declaration?.itemId ?? declaration?.item?.id ?? null,
    amount: declaration?.amount ?? 1,
    order: declaration?.order ?? null,
  };
}

function findReactionCreditForDeclaration(credits, declaration) {
  const plan = planReactionPayment(credits, 0, { ...reactionRequestOf(declaration), amount: 1 });
  if (!plan.ok) return null;
  return (Array.isArray(credits) ? credits : []).find((credit) => credit.id === plan.units[0].creditId) ?? null;
}

function liveCreditsFor(actor, options = {}) {
  const combatant = options.combatant ?? resolveReactionCreditCombatant(actor, options);
  return { combatant, credits: combatant ? getLiveReactionCredits(combatant, { ...options, actor }) : [] };
}

/** Same matching as spendReactionsForDeclaration without writing anything. Out of combat it's always true. */
export function canPayReactionForDeclaration(actor, declaration, options = {}) {
  if (!actor) return false;
  const { combatant, credits } = liveCreditsFor(actor, options);
  if (!actionEconomyApplies(options.combat ?? combatant?.parent ?? game.combat, combatant)) return true;
  return planReactionPayment(credits, readUnrestrictedReactions(actor), reactionRequestOf(declaration)).ok;
}

/** The numeric pool plus every unspent credit that could pay this declaration. */
export function countReactionsForDeclaration(actor, declaration, options = {}) {
  if (!actor) return 0;
  const { credits } = liveCreditsFor(actor, options);
  return planReactionPayment(credits, readUnrestrictedReactions(actor), { ...reactionRequestOf(declaration), amount: 1 }).available;
}

function unspentCreditsInLossOrder(credits) {
  const list = [];
  const source = Array.isArray(credits) ? credits : [];
  for (let index = 0; index < source.length; index++) {
    const credit = source[index];
    if (!credit || credit.spent !== false) continue;
    list.push({ credit, index, rank: creditConstraintRank(credit) });
  }
  list.sort((a, b) => (a.rank - b.rank) || (a.index - b.index));
  return list.map((entry) => entry.credit);
}

function rawCreditArray(combatant) {
  return Array.isArray(combatant?.flags?.[SCOPE]?.[FLAG_KEY])
    ? combatant.flags[SCOPE][FLAG_KEY]
    : [];
}

function markCreditsSpentState(rawCredits, creditIds, spent) {
  const pending = new Set(creditIds);
  const updated = [];
  for (const entry of rawCredits) {
    if (pending.size) {
      const normalized = normalizeReactionCredit(entry);
      if (normalized && pending.has(normalized.id)) {
        pending.delete(normalized.id);
        updated.push({ ...entry, spent });
        continue;
      }
    }
    updated.push(entry);
  }
  return { updated, marked: creditIds.length - pending.size };
}

function markCreditsSpent(rawCredits, creditIds) {
  return markCreditsSpentState(rawCredits, creditIds, true);
}

async function persistCreditLedger(combatant, updated, creditIds, extraUpdate = {}) {
  try {
    const result = await combatant.update({ [FLAG_PATH]: updated, ...extraUpdate });
    if (result === false || result == null) {
      console.error("[PMTTRPG] Reaction credit failed to persist", { creditIds });
      return { ok: false, reason: "persist-failed" };
    }
  } catch (error) {
    console.error("[PMTTRPG] Reaction credit failed to persist", { creditIds, error });
    return { ok: false, reason: "persist-failed" };
  }
  return { ok: true };
}

export async function writeReactionCreditLedger(combatant, credits, extraUpdate = {}) {
  const list = Array.isArray(credits) ? credits : [];
  const ids = list.map((entry) => entry?.id).filter(Boolean);
  return withReactionCreditMutation(combatant, () => persistCreditLedger(combatant, list, ids, extraUpdate));
}

function readUnrestrictedReactions(actor) {
  return Math.max(0, Number(actor?.system?.attributes?.reactions?.value) || 0);
}

/** `effective` is the numeric pool plus unspent credits, worked out on read only. */
export function getEffectiveReactionAvailability(actor, options = {}) {
  const unrestricted = readUnrestrictedReactions(actor);
  const combatant = resolveReactionCreditCombatant(actor, options);
  if (!combatant) return { unrestricted, credits: 0, effective: unrestricted };

  let credits = 0;
  for (const credit of getLiveReactionCredits(combatant, { ...options, actor })) {
    if (credit.spent === false) credits += 1;
  }
  return { unrestricted, credits, effective: unrestricted + credits };
}

function normalizeLossAmount(amount) {
  const value = Math.round(Number(amount) || 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

async function writeUnrestrictedReactions(actor, next) {
  const current = readUnrestrictedReactions(actor);
  if (next === current) return { ok: true };
  try {
    const result = await actor.update({ "system.attributes.reactions.value": next });
    if (result === false || result == null) {
      console.error("[PMTTRPG] Unrestricted Reactions failed to update");
      return { ok: false, reason: "numeric-failed" };
    }
  } catch (error) {
    console.error("[PMTTRPG] Unrestricted Reactions failed to update", error);
    return { ok: false, reason: "numeric-failed" };
  }
  return { ok: true };
}

function emptyLossResult(actor, options, requested, extra = {}) {
  const remaining = getEffectiveReactionAvailability(actor, options);
  return {
    ok: extra.ok ?? true,
    requested,
    removed: extra.removed ?? 0,
    creditIdsSpent: extra.creditIdsSpent ?? [],
    unrestrictedRemoved: extra.unrestrictedRemoved ?? 0,
    remainingEffective: remaining.effective,
    ...extra,
  };
}

async function commitRemoveReactionAvailability(actor, amount, options = {}) {
  const requested = normalizeLossAmount(amount);
  if (requested <= 0) return emptyLossResult(actor, options, requested);

  const combatant = resolveReactionCreditCombatant(actor, options);
  const ordered = unspentCreditsInLossOrder(combatant ? getLiveReactionCredits(combatant, { ...options, actor }) : []);
  const creditIdsSpent = [];
  let remaining = requested;
  for (const credit of ordered) {
    if (remaining <= 0) break;
    creditIdsSpent.push(credit.id);
    remaining -= 1;
  }

  if (creditIdsSpent.length) {
    const { updated, marked } = markCreditsSpent(rawCreditArray(combatant), creditIdsSpent);
    if (marked !== creditIdsSpent.length) {
      return emptyLossResult(actor, options, requested, { ok: false, reason: "persist-failed" });
    }
    const persist = await persistCreditLedger(combatant, updated, creditIdsSpent);
    if (!persist.ok) {
      return emptyLossResult(actor, options, requested, { ok: false, reason: "persist-failed" });
    }
  }

  const unrestricted = readUnrestrictedReactions(actor);
  const unrestrictedRemoved = Math.min(remaining, unrestricted);
  if (unrestrictedRemoved > 0) {
    const numeric = await writeUnrestrictedReactions(actor, unrestricted - unrestrictedRemoved);
    if (!numeric.ok) {
      return emptyLossResult(actor, options, requested, {
        ok: false,
        reason: "numeric-failed",
        removed: creditIdsSpent.length,
        creditIdsSpent,
        unrestrictedRemoved: 0,
        partial: true,
      });
    }
  }

  return emptyLossResult(actor, options, requested, {
    removed: creditIdsSpent.length + unrestrictedRemoved,
    creditIdsSpent,
    unrestrictedRemoved,
  });
}

export async function removeReactionAvailability(actor, amount, options = {}) {
  const combatant = resolveReactionCreditCombatant(actor, options);
  return withReactionCreditMutation(combatant, () => commitRemoveReactionAvailability(actor, amount, options));
}

export async function exhaustAllReactions(actor, options = {}) {
  const available = getEffectiveReactionAvailability(actor, options);
  return removeReactionAvailability(actor, available.effective, options);
}

const CREDIT_KIND_LABEL_KEYS = {
  universal: "PMTTRPG.ReactionCredit.Universal",
  block: "PMTTRPG.ReactionCredit.Block",
  evade: "PMTTRPG.ReactionCredit.Evade",
  counter: "PMTTRPG.ReactionCredit.Counter",
  opportunityAttack: "PMTTRPG.ReactionCredit.OpportunityAttack",
};

const CREDIT_EXPIRY_LABEL_KEYS = {
  [REACTION_CREDIT_BOUNDARIES.NEXT_TURN_START]: "PMTTRPG.ReactionCredit.UntilNextTurn",
  [REACTION_CREDIT_BOUNDARIES.ROUND_END]: "PMTTRPG.ReactionCredit.ThisRound",
};

function localizedOrNull(key) {
  const localized = key ? game.i18n.localize(key) : null;
  return localized && localized !== key ? localized : null;
}

function reactionCreditKindLabel(kindRestriction) {
  return localizedOrNull(CREDIT_KIND_LABEL_KEYS[kindRestriction]) ?? kindRestriction;
}

function reactionCreditSourceName(actor, credit) {
  if (!isContentReactionSourceKey(credit.sourceKey) && !isGrantReactionSourceKey(credit.sourceKey)) return null;
  if (credit.label) return credit.label;
  const itemId = credit.sourceItemIds?.[0];
  const name = itemId ? actor?.items.get(itemId)?.name : null;
  if (name) return name;
  return credit.grantedBy === "manual" ? localizedOrNull("PMTTRPG.ReactionCredit.SourceManual") : null;
}

function reactionCreditParts(actor, credit) {
  const kindLabel = reactionCreditKindLabel(credit.kindRestriction);
  const itemName = credit.itemRestriction
    ? (actor?.items.get(credit.itemRestriction)?.name ?? credit.itemRestriction)
    : null;
  const sourceName = itemName ? null : reactionCreditSourceName(actor, credit);
  const expiryLabel = credit.expires ? localizedOrNull(CREDIT_EXPIRY_LABEL_KEYS[credit.expires.boundary]) : null;
  const named = itemName ?? sourceName;
  const base = named ? `${kindLabel} · ${named}` : kindLabel;
  return { kindLabel, itemName, sourceName, expiryLabel, label: expiryLabel ? `${base} (${expiryLabel})` : base };
}

function groupReactionCreditBreakdown(breakdown) {
  const groups = new Map();
  for (const entry of breakdown) {
    const key = `${entry.kindRestriction}|${entry.itemRestriction ?? ""}|${entry.label}`;
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      continue;
    }
    groups.set(key, {
      kindRestriction: entry.kindRestriction,
      itemRestriction: entry.itemRestriction,
      kindLabel: entry.kindLabel,
      itemName: entry.itemName,
      label: entry.label,
      count: 1,
    });
  }
  return [...groups.values()];
}

/** Just for display. Don't bind any of this to `reactions.value` inputs. */
export function prepareReactionDisplay(actor, options = {}) {
  const availability = getEffectiveReactionAvailability(actor, options);
  const combatant = resolveReactionCreditCombatant(actor, options);
  const live = combatant ? getLiveReactionCredits(combatant, { ...options, actor }) : [];
  const breakdown = [];
  for (const credit of live) {
    if (credit.spent !== false) continue;
    const parts = reactionCreditParts(actor, credit);
    breakdown.push({
      id: credit.id,
      kindRestriction: credit.kindRestriction,
      itemRestriction: credit.itemRestriction,
      sourceKey: credit.sourceKey,
      kindLabel: parts.kindLabel,
      itemName: parts.itemName,
      sourceName: parts.sourceName,
      expiryLabel: parts.expiryLabel,
      label: parts.label,
    });
  }
  const universal = planReactionPayment(live, availability.unrestricted, {
    kind: ACTION_KINDS.MANUAL,
    acceptKinds: [],
    order: REACTION_PAYMENT_ORDERS.POOL_FIRST,
  }).available;
  return {
    unrestricted: availability.unrestricted,
    unrestrictedMax: Math.max(0, Number(actor?.system?.attributes?.reactions?.max) || 0),
    credits: availability.credits,
    effective: availability.effective,
    universal,
    hasCredits: breakdown.length > 0,
    breakdown,
    groups: groupReactionCreditBreakdown(breakdown),
    creditTitle: breakdown.map((entry) => entry.label).join(", "),
  };
}

/** Every live credit (spent ones too) for the hand-editing dialog. */
export function reactionCreditRows(actor, combatant, options = {}) {
  if (!combatant) return [];
  return getLiveReactionCredits(combatant, { ...options, actor }).map((credit) => ({
    id: credit.id,
    kindRestriction: credit.kindRestriction,
    ...reactionCreditParts(actor, credit),
    spent: credit.spent === true,
    removable: isGrantReactionSourceKey(credit.sourceKey),
  }));
}

async function commitRestoreSpentReactionCredits(actor, options = {}) {
  const combatant = resolveReactionCreditCombatant(actor, options);
  const spentIds = (combatant ? getLiveReactionCredits(combatant, { ...options, actor }) : [])
    .filter((credit) => credit.spent === true)
    .map((credit) => credit.id);
  if (!spentIds.length) {
    return { ok: true, restoredIds: [] };
  }

  const { updated, marked } = markCreditsSpentState(rawCreditArray(combatant), spentIds, false);
  if (marked !== spentIds.length) {
    return { ok: false, reason: "persist-failed", restoredIds: [] };
  }
  const persist = await persistCreditLedger(combatant, updated, spentIds);
  if (!persist.ok) return { ok: false, reason: persist.reason, restoredIds: [] };
  return { ok: true, restoredIds: spentIds };
}

export async function restoreSpentReactionCredits(actor, options = {}) {
  const combatant = resolveReactionCreditCombatant(actor, options);
  return withReactionCreditMutation(combatant, () => commitRestoreSpentReactionCredits(actor, options));
}

/**
 * The ledger lives on the Combatant and you can't always update it, like when
 * the retaliator commits an attacker's Reaction on an attack card.
 */
function reactionSpendRunsElsewhere(combatant) {
  return !!combatant && !canUserUpdateDocument(combatant, game.user);
}

async function routeReactionSpend(combatant, request) {
  let result = null;
  try {
    const { runAsCombatantOwnerOrGM } = await import("../easy-effects/gm-route.js");
    result = await runAsCombatantOwnerOrGM(combatant, "spendCombatantReactionForDeclaration", {
      kind: request?.kind ?? null,
      itemId: request?.itemId ?? null,
      acceptKinds: request?.acceptKinds ?? null,
      amount: request?.amount ?? 1,
      order: request?.order ?? null,
    });
  } catch (error) {
    console.error("[PMTTRPG] Routed Reaction spend failed", error);
  }
  if (result && typeof result === "object" && typeof result.ok === "boolean") return result;
  return { ok: false, reason: "persist-failed" };
}

function warnInsufficientReactions(actor) {
  const key = "PMTTRPG.ActionDeclaration.NoReactionLeft";
  ui.notifications.warn(game.i18n.format(key, { name: actor?.name ?? "" }));
}

function spendResult(units) {
  const firstCredit = units.find((unit) => unit.by === "credit") ?? null;
  return {
    ok: true,
    paidBy: units[0]?.by === "credit" ? "credit" : "numeric",
    creditId: firstCredit?.creditId ?? null,
    paid: units.map((unit) => ({ ...unit })),
  };
}

async function commitSpendReactions(actor, request, options = {}) {
  const combatant = resolveReactionCreditCombatant(actor, options);
  const credits = combatant ? getLiveReactionCredits(combatant, { ...options, actor }) : [];
  const plan = planReactionPayment(credits, readUnrestrictedReactions(actor), request);
  if (!plan.ok) {
    if (plan.reason === "insufficient" && options.warn !== false) warnInsufficientReactions(actor);
    return { ok: false, reason: plan.reason };
  }

  const creditIds = plan.units.filter((unit) => unit.by === "credit").map((unit) => unit.creditId);
  const poolUnits = plan.units.length - creditIds.length;

  if (creditIds.length) {
    if (reactionSpendRunsElsewhere(combatant)) return routeReactionSpend(combatant, request);
    const { updated, marked } = markCreditsSpent(rawCreditArray(combatant), creditIds);
    if (marked !== creditIds.length) {
      console.error("[PMTTRPG] Reaction credit failed to persist", { creditIds });
      return { ok: false, reason: "persist-failed" };
    }
    const persist = await persistCreditLedger(combatant, updated, creditIds);
    if (!persist.ok) return persist;
  }

  if (poolUnits > 0) {
    const spent = await actor.spendActionEconomy("reactions", poolUnits, { warn: false });
    if (!spent) {
      if (options.warn !== false) warnInsufficientReactions(actor);
      if (creditIds.length) {
        const { updated } = markCreditsSpentState(rawCreditArray(combatant), creditIds, false);
        const restored = await persistCreditLedger(combatant, updated, creditIds);
        if (!restored.ok) return { ok: false, reason: "persist-failed", partial: true };
      }
      return { ok: false, reason: "insufficient" };
    }
  }

  return spendResult(plan.units);
}

/**
 * Pays `amount` Reactions with the credits and pool the request accepts. Credits
 * get written first and if the pool write fails they're put back. If you can't
 * update the Combatant a spend that needs credits runs on the primary GM instead.
 */
export async function spendReactionsForDeclaration(actor, request = {}, options = {}) {
  const combatant = resolveReactionCreditCombatant(actor, options);
  return withReactionCreditMutation(combatant, () => commitSpendReactions(actor, reactionRequestOf(request), options));
}

const GRANT_LIMIT = 10;

function normalizeReactionGrantRequest(raw = {}) {
  const kind = typeof raw.kind === "string" ? raw.kind : REACTION_CREDIT_KIND_RESTRICTIONS.UNIVERSAL;
  if (!VALID_KIND_RESTRICTIONS.has(kind)) return null;
  const amount = Number(raw.amount ?? 1);
  if (!Number.isInteger(amount) || amount < 1 || amount > GRANT_LIMIT) return null;
  const boundary = raw.boundary ?? REACTION_CREDIT_BOUNDARIES.NEXT_TURN_START;
  if (!Object.values(REACTION_CREDIT_BOUNDARIES).includes(boundary)) return null;
  const sourceItemId = typeof raw.sourceItemId === "string" && raw.sourceItemId.trim() ? raw.sourceItemId.trim() : null;
  const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 80) : "";
  const grantedBy = GRANTED_BY.has(raw.grantedBy) ? raw.grantedBy : "easyEffects";
  return { kind, amount, boundary, sourceItemId, label, grantedBy };
}

function grantExpiry(boundary, combatant, combat) {
  if (!combat?.started) return null;
  if (boundary === REACTION_CREDIT_BOUNDARIES.ROUND_END) {
    return Number.isInteger(combat.round) ? { boundary, round: combat.round } : null;
  }
  const turn = latestTurnIdentity(combat, combatant);
  return turn ? { boundary, afterStarted: turn.started } : null;
}

async function commitReactionGrant(combatant, request) {
  const grant = normalizeReactionGrantRequest(request);
  if (!grant) return { ok: false, reason: "invalid-grant" };
  const expires = grantExpiry(grant.boundary, combatant, combatOfCombatant(combatant));
  if (!expires) return { ok: false, reason: "no-combat" };
  const records = Array.from({ length: grant.amount }, () => {
    const id = foundry.utils.randomID();
    return {
      id,
      kindRestriction: grant.kind,
      sourceKey: `${GRANT_SOURCE_PREFIX}${id}`,
      sourceItemIds: grant.sourceItemId ? [grant.sourceItemId] : [],
      itemRestriction: null,
      spent: false,
      expires,
      ...(grant.label ? { label: grant.label } : {}),
      grantedBy: grant.grantedBy,
    };
  });
  const persist = await persistCreditLedger(combatant, [...rawCreditArray(combatant), ...records], records.map((entry) => entry.id));
  if (!persist.ok) return persist;
  return { ok: true, creditIds: records.map((entry) => entry.id) };
}

/** Runs on whoever can update the Combatant (see grantReactionCredits). */
export async function grantReactionCreditsHere(combatant, request) {
  if (!combatant) return { ok: false, reason: "no-combatant" };
  return withReactionCreditMutation(combatant, () => commitReactionGrant(combatant, request));
}

/**
 * Gives the actor's Combatant one-off credits from a `{ kind, amount, boundary,
 * sourceItemId, label, grantedBy }` request. They last until its next Turn Start,
 * or until the round ends with `boundary: "roundEnd"`, and need a started combat.
 */
export async function grantReactionCredits(actor, request = {}, options = {}) {
  const combatant = resolveReactionCreditCombatant(actor, options);
  if (!combatant) return { ok: false, reason: "no-combatant" };
  const grant = normalizeReactionGrantRequest(request);
  if (!grant) return { ok: false, reason: "invalid-grant" };
  const { runAsCombatantOwnerOrGM } = await import("../easy-effects/gm-route.js");
  const result = await runAsCombatantOwnerOrGM(combatant, "grantCombatantReactionCredits", { grant });
  return result && typeof result === "object" ? result : { ok: false, reason: "persist-failed" };
}

const REACTION_CREDIT_EDITS = ["spend", "restore", "remove"];

async function commitReactionCreditEdit(combatant, creditId, op) {
  if (!REACTION_CREDIT_EDITS.includes(op)) return { ok: false, reason: "invalid-edit" };
  const credit = getReactionCredits(combatant).find((entry) => entry.id === creditId) ?? null;
  if (!credit) return { ok: false, reason: "missing" };
  if (op === "remove") {
    if (!isGrantReactionSourceKey(credit.sourceKey)) return { ok: false, reason: "not-removable" };
    const updated = rawCreditArray(combatant).filter((entry) => normalizeReactionCredit(entry)?.id !== creditId);
    const persist = await persistCreditLedger(combatant, updated, [creditId]);
    return persist.ok ? { ok: true, credit } : persist;
  }
  const spent = op === "spend";
  if (credit.spent === spent) return { ok: true, credit, unchanged: true };
  const { updated, marked } = markCreditsSpentState(rawCreditArray(combatant), [creditId], spent);
  if (!marked) return { ok: false, reason: "persist-failed" };
  const persist = await persistCreditLedger(combatant, updated, [creditId]);
  return persist.ok ? { ok: true, credit } : persist;
}

export async function editReactionCreditHere(combatant, creditId, op) {
  if (!combatant) return { ok: false, reason: "no-combatant" };
  return withReactionCreditMutation(combatant, () => commitReactionCreditEdit(combatant, creditId, op));
}

/** Spends, restores or removes one credit by hand. Only grants can be removed since the rest come back at the next refresh. */
export async function editReactionCredit(combatant, creditId, op) {
  if (!combatant) return { ok: false, reason: "no-combatant" };
  const { runAsCombatantOwnerOrGM } = await import("../easy-effects/gm-route.js");
  const result = await runAsCombatantOwnerOrGM(combatant, "editCombatantReactionCredit", { creditId, op });
  return result && typeof result === "object" ? result : { ok: false, reason: "persist-failed" };
}
