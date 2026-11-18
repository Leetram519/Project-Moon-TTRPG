/**
 * The display side of Action Economy state. Each feature registers a presenter
 * whose `getEntries` returns plain descriptors, and the Combat Tracker, Token
 * overlay, Action Menu and character sheet just render those.
 */

import { documentId, trimmedString } from "../shared-helpers.js";
import { combatantName, combatantOf } from "../combat/combatant-match.js";

export const ACTION_STATE_CATEGORIES = {
  TURN: "turn",
  RELATIONSHIP: "relationship",
  DEFERRED: "deferred",
};

export const ACTION_STATE_ROLES = {
  SELF: "self",
  SOURCE: "source",
  TARGET: "target",
  MUTUAL: "mutual",
};

export const ACTION_STATE_VISIBILITY = {
  PUBLIC: "public",
  OWNER: "owner",
  GM: "gm",
};

const ACTION_STATE_ACTIVE_KEY = "PMTTRPG.ActionState.Active";

const CATEGORY_SET = new Set(Object.values(ACTION_STATE_CATEGORIES));
const ROLE_SET = new Set(Object.values(ACTION_STATE_ROLES));
const VISIBILITY_SET = new Set(Object.values(ACTION_STATE_VISIBILITY));

// only Font Awesome class names!
const FA_CLASS_PATTERN = /^[a-z0-9-]+(?:\s+[a-z0-9-]+)*$/;

/** @type {{ id: string, order: number, seq: number, getEntries: Function, dismiss: Function|null }[]} */
const presenters = [];
let presenterSeq = 0;

/**
 * Registering the same `id` again replaces the old one. Lower `order` renders
 * first (ties keep registration order).
 */
export function registerActionStatePresenter({ id, order = 0, getEntries, dismiss } = {}) {
  const key = trimmedString(id);
  if (!key || typeof getEntries !== "function") {
    throw new Error("[PMTTRPG] Action State presenter requires id and getEntries");
  }
  unregisterActionStatePresenter(key);
  presenters.push({
    id: key,
    order: Number.isFinite(Number(order)) ? Number(order) : 0,
    seq: presenterSeq++,
    getEntries,
    dismiss: typeof dismiss === "function" ? dismiss : null,
  });
}

function unregisterActionStatePresenter(id) {
  const key = String(id ?? "");
  const index = presenters.findIndex((entry) => entry.id === key);
  if (index >= 0) presenters.splice(index, 1);
}

function sortedPresenters() {
  return [...presenters].sort((a, b) => (a.order - b.order) || (a.seq - b.seq));
}

function normalizeIcon(raw) {
  const img = trimmedString(raw?.img);
  let fa = trimmedString(raw?.fa);
  if (fa && !FA_CLASS_PATTERN.test(fa)) fa = null;
  return { img, fa };
}

function normalizeActionStateEntry(raw, { presenterId, combatant, index = 0 } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const labelKey = trimmedString(raw.labelKey);
  if (!labelKey) return null;

  const combatantId = trimmedString(raw.combatantId) ?? documentId(combatant);
  const presenter = trimmedString(presenterId) ?? trimmedString(raw.presenterId) ?? "unknown";
  const category = CATEGORY_SET.has(raw.category) ? raw.category : ACTION_STATE_CATEGORIES.TURN;
  const role = ROLE_SET.has(raw.role) ? raw.role : ACTION_STATE_ROLES.SELF;
  const visibility = VISIBILITY_SET.has(raw.visibility) ? raw.visibility : ACTION_STATE_VISIBILITY.PUBLIC;
  const detailData = raw.detailData && typeof raw.detailData === "object" && !Array.isArray(raw.detailData)
    ? { ...raw.detailData }
    : {};

  return {
    id: trimmedString(raw.id) ?? `${presenter}:${combatantId ?? "none"}:${index}`,
    presenterId: presenter,
    category,
    actionId: trimmedString(raw.actionId),
    combatantId,
    role,
    counterpartCombatantId: trimmedString(raw.counterpartCombatantId),
    labelKey,
    detailKey: trimmedString(raw.detailKey),
    detailData,
    icon: normalizeIcon(raw.icon),
    expiryKey: trimmedString(raw.expiryKey),
    visibility,
    dismissible: raw.dismissible === true,
    recordId: trimmedString(raw.recordId),
  };
}

function isCombatantOwner(combatant, user) {
  if (!user) return false;
  if (user.isGM === true) return true;
  return combatant.testUserPermission(user, "OWNER");
}

function canUserSeeActionState(entry, { combatant, user } = {}) {
  switch (entry?.visibility) {
    case ACTION_STATE_VISIBILITY.GM:
      return user?.isGM === true;
    case ACTION_STATE_VISIBILITY.OWNER:
      return isCombatantOwner(combatant, user);
    default:
      return true;
  }
}

/** Entries from every presenter for one Combatant, but only the ones `user` is allowed to see. */
export function getActionStateEntries(combatant, { combat = null, user = null } = {}) {
  if (!combatant) return [];
  const entries = [];
  for (const presenter of sortedPresenters()) {
    let raw;
    try {
      raw = presenter.getEntries({ combatant, combat, user });
    } catch (error) {
      console.warn(`[PMTTRPG] Action State presenter '${presenter.id}' failed`, error);
      continue;
    }
    const list = Array.isArray(raw) ? raw : [];
    list.forEach((item, index) => {
      const entry = normalizeActionStateEntry(item, { presenterId: presenter.id, combatant, index });
      if (!entry) return;
      if (!canUserSeeActionState(entry, { combatant, user })) return;
      entry.dismissible = entry.dismissible === true
        && presenter.dismiss !== null
        && isCombatantOwner(combatant, user);
      entries.push(entry);
    });
  }
  return entries;
}

// names get looked up at render time (null if they're gone)
function resolveActionStateCounterpartName(entry, { combat } = {}) {
  const id = entry?.counterpartCombatantId;
  if (!id) return null;
  const counterpart = combatantOf(combat, id);
  if (!counterpart) return null;
  return trimmedString(combatantName(counterpart));
}

function describeActionStateEntry(entry, { combat = null } = {}) {
  if (!entry) return null;

  const label = game.i18n.localize(entry.labelKey);
  const counterpartName = resolveActionStateCounterpartName(entry, { combat });
  const detail = entry.detailKey
    ? game.i18n.format(entry.detailKey, { ...entry.detailData, counterpart: counterpartName ?? "" })
    : null;
  const expiry = entry.expiryKey ? game.i18n.localize(entry.expiryKey) : null;

  const sentences = [];
  if (detail) sentences.push(asSentence(detail));
  if (expiry) sentences.push(game.i18n.format("PMTTRPG.ActionState.Lasts", { until: expiry }));
  const tooltip = sentences.length ? `${label}: ${sentences.join(" ")}` : label;

  const dismissible = entry.dismissible === true;
  const removeHint = dismissible ? game.i18n.localize("PMTTRPG.ActionState.RemoveHint") : "";

  return {
    id: entry.id,
    presenterId: entry.presenterId,
    category: entry.category,
    actionId: entry.actionId,
    role: entry.role,
    combatantId: entry.combatantId,
    counterpartCombatantId: entry.counterpartCombatantId,
    counterpartName,
    label,
    detail,
    expiry,
    tooltip,
    ariaLabel: counterpartName ? `${label} ${counterpartName}` : label,
    iconImg: entry.icon?.img ?? null,
    iconFa: entry.icon?.fa ?? null,
    dismissible,
    removeTooltip: dismissible ? `${asSentence(tooltip)} ${removeHint}` : tooltip,
  };
}

function asSentence(text) {
  const trimmed = String(text ?? "").trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Only an owner or GM can dismiss. It only removes the state.
 */
export async function dismissActionState(combatant, entryId, { combat = null, user = null } = {}) {
  if (!combatant || entryId == null || !isCombatantOwner(combatant, user)) return false;
  const id = String(entryId);
  const entry = getActionStateEntries(combatant, { combat, user }).find((item) => item.id === id);
  if (!entry?.dismissible) return false;
  const dismiss = sortedPresenters().find((item) => item.id === entry.presenterId)?.dismiss;
  if (!dismiss) return false;
  try {
    return await dismiss(entry, { combatant, combat, user }) === true;
  } catch (error) {
    console.warn(`[PMTTRPG] Action State dismiss for '${entry.presenterId}' failed`, error);
    return false;
  }
}

export async function confirmDismissActionState(combatant, entryId, { combat = null, user = null } = {}) {
  const view = buildActionStateViews(combatant, { combat, user }).find((item) => item.id === String(entryId));
  if (!view?.dismissible) return false;
  const { cancelButton, confirmButton, waitForWindowChoice } = await import("../apps/dialog-wait.js");
  const answer = await waitForWindowChoice({
    window: { title: game.i18n.format("PMTTRPG.ActionState.RemoveTitle", { label: view.label }) },
    content: `<p>${game.i18n.localize("PMTTRPG.ActionState.RemoveConfirm")}</p>`,
    buttons: [cancelButton(), confirmButton(() => true, { label: game.i18n.localize("PMTTRPG.ActionState.RemoveButton") })],
    rejectClose: false,
  });
  return answer === true;
}

export function buildActionStateViews(combatant, { combat = null, user = null } = {}) {
  return getActionStateEntries(combatant, { combat, user })
    .map((entry) => describeActionStateEntry(entry, { combat }))
    .filter(Boolean);
}

/** Matches entries to Action Menu rows by catalog id. Rows stay clickable since the workflow still does its own check. */
export function attachActionStatesToMenuRows(rows, entries, { combat = null } = {}) {
  const activeLabel = game.i18n.localize(ACTION_STATE_ACTIVE_KEY);
  return (rows ?? []).map((row) => {
    const matching = (entries ?? [])
      .filter((entry) => entry?.actionId && row?.id && entry.actionId === row.id)
      .map((entry) => describeActionStateEntry(entry, { combat }))
      .filter(Boolean)
      .map((view) => ({
        ...view,
        chip: view.counterpartName ? `${activeLabel} · ${view.counterpartName}` : activeLabel,
      }));
    return { ...row, state: matching[0] ?? null, states: matching };
  });
}

export function layoutActionStateBadges(entries, { cap = 3, expanded = false } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const limit = Math.max(1, Math.trunc(Number(cap) || 1));
  if (expanded || list.length <= limit) return { visible: list, overflow: 0 };
  return { visible: list.slice(0, limit), overflow: list.length - limit };
}

export function combatUpdateAffectsActionState(changed = {}) {
  if (!changed || typeof changed !== "object") return false;
  if (["turn", "round", "started", "active"].some((key) => key in changed)) return true;
  const systemFlags = changed.flags?.projectmoonttrpg;
  return !!systemFlags && typeof systemFlags === "object" && Object.keys(systemFlags).length > 0;
}
