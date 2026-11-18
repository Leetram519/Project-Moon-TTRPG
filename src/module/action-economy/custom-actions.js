import { ACTION_GROUPS } from "./catalog.js";
import { canPayDeclaration, declareActorAction } from "./declare.js";
import { ACTION_KINDS, ACTION_TIMING, ECONOMY_TYPES } from "./kinds.js";
import { checkActionTiming } from "./timing.js";
import { listAvailableBindingSlots, bindSourceSlot } from "./action-bindings.js";
import { cancelButton, confirmButton, waitForWindowChoice } from "../apps/dialog-wait.js";
import { optionalString as text } from "../shared-helpers.js";

/**
 * Custom Action Menu rows that content and modules add through providers. Core only
 * reads the descriptor. The provider and its executor decide what the Action does.
 *
 * A provider returns one object per Action:
 *
 *   id              unique within that source
 *   sourceUuid      the document that grants the Action
 *   source          optional live document, otherwise resolved from sourceUuid
 *   label, img      just for display, never used as identity
 *   category        Action Menu category id, unknown ids fall back to "other"
 *   order           sort within the category
 *   economy         { type: "action", cost: integer >= 0 }
 *   targeting       { mode: "none" | "single", allowSelf: boolean }
 *   timing          "reactionOffTurn" is the default and costs one Reaction off turn, or nothing at
 *                   cost 0. "ownTurn" can't be used off turn and "anytime" can at the usual cost
 *   family          optional { key: "namespace.family", label, img }, same key means one shared row
 *   variant         optional { key, label, img }, key is local to the source
 *   bindings        optional { namespace, capacity, scope: "combat" | "persistent" }
 *   executor        { type: registered executor id, data: plain data }
 *   disabledReason  optional, the row stays visible but you can't use it
 *   detail          optional short text under the label
 */

const CUSTOM_ACTION_ROW_PREFIX = "custom-action|";
const CUSTOM_FAMILY_ROW_PREFIX = "custom-family|";
const OTHER_CATEGORY_ID = "other";
const BINDING_EXECUTOR_TYPE = "binding";

const FAMILY_KEY_PATTERN = /^[A-Za-z0-9_-]+[.:][A-Za-z0-9_.:-]+$/;

function plainData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "function") continue;
    out[key] = entry;
  }
  return out;
}

function logWarning(message, data) {
  console.warn(`[PMTTRPG] custom Action ${message}`, data ?? "");
}

/** @type {Map<string, { id: string, labelKey: string|null, label: string|null, order: number, builtIn: boolean }>} */
const categories = new Map();

function seedCategories() {
  for (const group of ACTION_GROUPS) {
    categories.set(group.id, { id: group.id, labelKey: group.labelKey, label: null, order: group.order, builtIn: true });
  }
  categories.set(OTHER_CATEGORY_ID, {
    id: OTHER_CATEGORY_ID,
    labelKey: "PMTTRPG.ActionMenu.Group.Other",
    label: null,
    order: 1000,
    builtIn: true,
  });
}
seedCategories();

export function registerActionMenuCategory({ id, labelKey = null, label = null, order = 500 } = {}) {
  const key = text(id);
  if (!key) throw new Error("[PMTTRPG] Action Menu category requires id");
  if (categories.get(key)?.builtIn) {
    console.warn(`[PMTTRPG] Action Menu category '${key}' is built in and cannot be replaced`);
    return false;
  }
  categories.set(key, { id: key, labelKey: text(labelKey), label: text(label), order: Number(order) || 0, builtIn: false });
  return true;
}

export function unregisterActionMenuCategory(id) {
  const key = text(id);
  if (!key || categories.get(key)?.builtIn) return false;
  return categories.delete(key);
}

export function listActionMenuCategories() {
  return [...categories.values()].sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id));
}

function hasActionMenuCategory(id) {
  return categories.has(String(id));
}

/** @type {Map<string, { availability?: Function, execute: Function }>} */
const executors = new Map();

/**
 * `handler` can be just `execute(descriptor, context)` or an object with `execute`
 * and an optional `availability(descriptor, context)`. Availability runs before the
 * declaration and returns `{ available, reason, detail }`.
 */
export function registerCustomActionExecutor(type, handler) {
  const key = text(type);
  const spec = typeof handler === "function" ? { execute: handler } : handler;
  if (!key || typeof spec?.execute !== "function") {
    throw new Error("[PMTTRPG] custom Action executor requires a type and an execute function");
  }
  executors.set(key, { availability: typeof spec.availability === "function" ? spec.availability : null, execute: spec.execute });
}

export function unregisterCustomActionExecutor(type) {
  const key = text(type);
  if (!key || key === BINDING_EXECUTOR_TYPE) return false;
  return executors.delete(key);
}

function hasCustomActionExecutor(type) {
  return executors.has(String(type));
}

async function customActionAvailability(descriptor, context = {}) {
  if (descriptor?.disabledReason) return { available: false, reason: descriptor.disabledReason };
  const unavailable = game.i18n.localize("PMTTRPG.CustomAction.Unavailable");
  const executor = executors.get(descriptor?.executor?.type);
  if (!executor) return { available: false, reason: unavailable };
  if (!executor.availability) return { available: true };
  try {
    const result = await executor.availability(descriptor, context);
    if (!result || result.available !== false) return { available: true, detail: text(result?.detail) };
    return { available: false, reason: text(result.reason) ?? unavailable, detail: text(result.detail) };
  } catch (error) {
    console.warn("[PMTTRPG] custom Action availability failed", { type: descriptor?.executor?.type, error });
    return { available: false, reason: unavailable };
  }
}

export async function executeCustomAction(descriptor, context = {}) {
  const executor = executors.get(descriptor?.executor?.type);
  if (!executor) return { ok: false, reason: "unknown-executor" };
  const result = await executor.execute(descriptor, context);
  if (result && result.ok === false) return result;
  return { ok: true, result };
}

function bindingSpec(descriptor) {
  const data = descriptor?.executor?.data ?? {};
  const bindings = descriptor?.bindings ?? {};
  const namespace = text(data.namespace ?? bindings.namespace);
  const capacity = Number(data.capacity ?? bindings.capacity);
  const scope = (data.scope ?? bindings.scope) === "persistent" ? "persistent" : "combat";
  if (!namespace || !Number.isInteger(capacity) || capacity < 1) return null;
  return { namespace, capacity, scope };
}

function targetBindingUuid(target) {
  return text(target?.combatant?.uuid) ?? text(target?.token?.uuid) ?? text(target?.actor?.uuid);
}

registerCustomActionExecutor(BINDING_EXECUTOR_TYPE, {
  availability(descriptor, context) {
    const spec = bindingSpec(descriptor);
    if (!spec || !descriptor.source) return { available: false, reason: game.i18n.localize("PMTTRPG.CustomAction.Unavailable") };
    const free = listAvailableBindingSlots(descriptor.source, spec.namespace, spec.capacity, { combat: context.combat ?? null });
    const detail = game.i18n.format("PMTTRPG.CustomAction.SlotsFree", { free: free.length, capacity: spec.capacity });
    if (!free.length) return { available: false, reason: game.i18n.localize("PMTTRPG.CustomAction.NoFreeSlot"), detail };
    return { available: true, detail };
  },
  async execute(descriptor, context) {
    const spec = bindingSpec(descriptor);
    if (!spec) return { ok: false, reason: "invalid-binding" };
    const targetUuid = targetBindingUuid(context.target);
    if (!targetUuid) return { ok: false, reason: "no-target" };
    const combat = context.combat ?? null;
    const free = listAvailableBindingSlots(descriptor.source, spec.namespace, spec.capacity, { combat });
    const slotId = context.slotId != null && free.includes(String(context.slotId)) ? String(context.slotId) : free[0];
    if (slotId == null) return { ok: false, reason: "no-free-slot" };
    return bindSourceSlot({
      source: descriptor.source,
      namespace: spec.namespace,
      slotId,
      targetUuid,
      combatId: spec.scope === "combat" ? (combat?.id ?? null) : null,
      capacity: spec.capacity,
    });
  },
});

/** @type {Map<string, { id: string, order: number, seq: number, getActions: Function }>} */
const providers = new Map();
let providerSeq = 0;

/** Registering the same id again just replaces the old one. */
export function registerActionProvider({ id, order = 0, getActions } = {}) {
  const key = text(id);
  if (!key || typeof getActions !== "function") {
    throw new Error("[PMTTRPG] Action provider requires id and getActions");
  }
  providers.set(key, { id: key, order: Number(order) || 0, seq: providerSeq++, getActions });
}

export function unregisterActionProvider(id) {
  return providers.delete(String(id ?? ""));
}

export function listActionProviders() {
  return [...providers.values()]
    .sort((a, b) => (a.order - b.order) || (a.seq - b.seq))
    .map((entry) => ({ id: entry.id, order: entry.order }));
}

function customActionIdentity(descriptor) {
  return `${descriptor.providerId}|${descriptor.sourceUuid}|${descriptor.id}`;
}

function normalizeCustomActionDescriptor(raw, { providerId } = {}) {
  const reject = (reason) => {
    logWarning(`dropped descriptor: ${reason}`, { providerId, id: raw?.id, sourceUuid: raw?.sourceUuid });
    return null;
  };
  if (!raw || typeof raw !== "object") return reject("not an object");
  const id = text(raw.id);
  const sourceUuid = text(raw.sourceUuid);
  const label = text(raw.label);
  if (!id) return reject("missing id");
  if (!sourceUuid) return reject("missing sourceUuid");
  if (!label) return reject("missing label");

  const economyType = text(raw.economy?.type) ?? ECONOMY_TYPES.ACTION;
  if (economyType !== ECONOMY_TYPES.ACTION) return reject(`unsupported economy '${economyType}'`);
  const costRaw = raw.economy?.cost ?? 1;
  const cost = Number(costRaw);
  if (!Number.isInteger(cost) || cost < 0) return reject(`invalid cost '${costRaw}'`);

  const mode = text(raw.targeting?.mode) ?? "none";
  if (mode !== "none" && mode !== "single") return reject(`unsupported targeting '${mode}'`);

  const executorType = text(raw.executor?.type);
  if (!executorType) return reject("missing executor");
  if (!hasCustomActionExecutor(executorType)) return reject(`unknown executor '${executorType}'`);

  let family = null;
  if (raw.family != null) {
    const key = text(raw.family.key);
    if (!key || !FAMILY_KEY_PATTERN.test(key)) return reject(`family key must be namespaced, got '${raw.family.key}'`);
    family = { key, label: text(raw.family.label), img: text(raw.family.img) };
  }
  let variant = null;
  if (raw.variant != null) {
    const key = text(raw.variant.key);
    if (!key) return reject("variant missing key");
    variant = { key, label: text(raw.variant.label), img: text(raw.variant.img) };
  }

  const timingRaw = text(raw.timing);
  let timing = ACTION_TIMING.REACTION_OFF_TURN;
  if (Object.values(ACTION_TIMING).includes(timingRaw)) {
    timing = timingRaw;
  } else if (timingRaw) {
    logWarning(`unknown timing '${timingRaw}', using '${ACTION_TIMING.REACTION_OFF_TURN}'`, { providerId, id });
  }

  let category = text(raw.category) ?? OTHER_CATEGORY_ID;
  if (!hasActionMenuCategory(category)) {
    logWarning(`unknown category '${category}', using '${OTHER_CATEGORY_ID}'`, { providerId, id });
    category = OTHER_CATEGORY_ID;
  }

  let bindings = null;
  if (raw.bindings != null) {
    const namespace = text(raw.bindings.namespace);
    const capacity = Number(raw.bindings.capacity);
    if (!namespace || !Number.isInteger(capacity) || capacity < 1) return reject("invalid bindings");
    bindings = { namespace, capacity, scope: raw.bindings.scope === "persistent" ? "persistent" : "combat" };
  }

  const descriptor = {
    providerId,
    id,
    sourceUuid,
    source: raw.source && typeof raw.source === "object" ? raw.source : null,
    label,
    img: text(raw.img),
    category,
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 50,
    economy: { type: economyType, cost },
    targeting: { mode, allowSelf: raw.targeting?.allowSelf === true },
    timing,
    family,
    variant,
    bindings,
    executor: { type: executorType, data: plainData(raw.executor?.data) },
    disabledReason: text(raw.disabledReason),
    detail: text(raw.detail),
  };
  descriptor.identity = customActionIdentity(descriptor);
  return descriptor;
}

function resolveSourceDocument(uuid) {
  try {
    return fromUuidSync(uuid) ?? null;
  } catch {
    return null;
  }
}

function sourceIsLive(source) {
  if (!source) return false;
  if (source.collection instanceof foundry.utils.Collection && source.id != null) {
    return source.collection.has(source.id);
  }
  return true;
}

/** Duplicates and entries whose source document is gone get dropped. */
export async function collectProvidedActions(context = {}) {
  const out = [];
  const seen = new Set();
  for (const provider of [...providers.values()].sort((a, b) => (a.order - b.order) || (a.seq - b.seq))) {
    let raw;
    try {
      raw = await provider.getActions(context);
    } catch (error) {
      logWarning(`provider '${provider.id}' failed`, error);
      continue;
    }
    for (const entry of Array.isArray(raw) ? raw : []) {
      const descriptor = normalizeCustomActionDescriptor(entry, { providerId: provider.id });
      if (!descriptor) continue;
      if (seen.has(descriptor.identity)) {
        logWarning("duplicate descriptor identity", { identity: descriptor.identity });
        continue;
      }
      descriptor.source ??= resolveSourceDocument(descriptor.sourceUuid);
      if (!sourceIsLive(descriptor.source)) {
        logWarning("source is gone", { sourceUuid: descriptor.sourceUuid });
        continue;
      }
      seen.add(descriptor.identity);
      out.push(descriptor);
    }
  }
  return out;
}

function customActionRowId(descriptor) {
  return descriptor.family
    ? `${CUSTOM_FAMILY_ROW_PREFIX}${descriptor.family.key}`
    : `${CUSTOM_ACTION_ROW_PREFIX}${descriptor.identity}`;
}

export function isCustomActionRowId(value) {
  const id = String(value ?? "");
  return id.startsWith(CUSTOM_ACTION_ROW_PREFIX) || id.startsWith(CUSTOM_FAMILY_ROW_PREFIX);
}

function descriptorsForRow(descriptors, rowId) {
  const id = String(rowId ?? "");
  if (id.startsWith(CUSTOM_FAMILY_ROW_PREFIX)) {
    const key = id.slice(CUSTOM_FAMILY_ROW_PREFIX.length);
    return descriptors.filter((entry) => entry.family?.key === key);
  }
  if (id.startsWith(CUSTOM_ACTION_ROW_PREFIX)) {
    const identity = id.slice(CUSTOM_ACTION_ROW_PREFIX.length);
    return descriptors.filter((entry) => !entry.family && entry.identity === identity);
  }
  return [];
}

function costLabel(cost, { asReaction = false } = {}) {
  if (cost === 0) return game.i18n.localize("PMTTRPG.CustomAction.Free");
  if (asReaction) return game.i18n.localize("PMTTRPG.ActionMenu.Cost.Reaction");
  return game.i18n.format(cost === 1 ? "PMTTRPG.CustomAction.Cost" : "PMTTRPG.CustomAction.CostPlural", { cost });
}

function descriptorLabel(descriptor) {
  return descriptor.variant?.label
    ? `${descriptor.family?.label ?? descriptor.label} · ${descriptor.variant.label}`
    : (descriptor.family?.label ?? descriptor.label);
}

/** The `timing` option for declareActorAction. Null keeps the kind's default, reactionOffTurn. */
function customActionTiming(descriptor) {
  if (descriptor?.timing === ACTION_TIMING.ANYTIME) {
    return { mode: ACTION_TIMING.ANYTIME, source: descriptorLabel(descriptor) };
  }
  if (descriptor?.timing === ACTION_TIMING.OWN_TURN) return { mode: ACTION_TIMING.OWN_TURN };
  return null;
}

function customTimingCheck(descriptor, context) {
  return checkActionTiming({
    combat: context.combat ?? null,
    combatant: context.combatant ?? null,
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.CUSTOM,
    timing: customActionTiming(descriptor),
  });
}

function canPay(actor, cost, { combat = null, combatant = null, timing = null } = {}) {
  return canPayDeclaration(actor, {
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.CUSTOM,
    cost,
    combat,
    combatant,
    timing,
  });
}

/** The menu rows pass `ignoreCost` since the Consume cost toggle can still waive the cost. */
async function describeUsable(descriptor, context, { ignoreCost = false }) {
  const timing = customTimingCheck(descriptor, context);
  const availability = timing.ok
    ? await customActionAvailability(descriptor, context)
    : { available: false, reason: game.i18n.localize("PMTTRPG.CustomAction.NotYourTurn") };
  const affordable = ignoreCost || canPay(context.actor, descriptor.economy.cost, {
    combat: context.combat ?? null,
    combatant: context.combatant ?? null,
    timing: customActionTiming(descriptor),
  });
  const reason = !availability.available
    ? availability.reason
    : (affordable ? null : game.i18n.localize("PMTTRPG.CustomAction.CannotAfford"));
  return {
    descriptor,
    usable: availability.available && affordable,
    reason,
    detail: availability.detail ?? descriptor.detail,
    asReaction: timing.asReaction === true,
  };
}

/**
 * A family is always one row no matter how many sources add variants, and a row
 * with nothing usable behind it gets disabled instead of hidden.
 */
export async function buildCustomActionMenuRows(descriptors, context = {}) {
  const rows = new Map();
  for (const descriptor of descriptors ?? []) {
    const rowId = customActionRowId(descriptor);
    const described = await describeUsable(descriptor, context, { ignoreCost: true });
    let row = rows.get(rowId);
    if (!row) {
      row = {
        id: rowId,
        categoryId: descriptor.category,
        order: descriptor.order,
        label: descriptor.family?.label ?? descriptor.label,
        img: descriptor.family?.img ?? descriptor.img,
        custom: true,
        entries: [],
      };
      rows.set(rowId, row);
    }
    row.entries.push(described);
  }
  const out = [];
  for (const row of rows.values()) {
    const usable = row.entries.filter((entry) => entry.usable);
    const costLabels = [...new Set(row.entries.map((entry) => costLabel(entry.descriptor.economy.cost, entry)))];
    const single = row.entries.length === 1 ? row.entries[0] : null;
    out.push({
      id: row.id,
      categoryId: row.categoryId,
      order: row.order,
      label: row.label,
      img: row.img,
      custom: true,
      costLabel: costLabels.length === 1 ? costLabels[0] : null,
      optionsLabel: row.entries.length > 1 ? game.i18n.format("PMTTRPG.CustomAction.Options", { count: row.entries.length }) : null,
      detail: single?.detail ?? null,
      disabled: usable.length === 0,
      disabledReason: usable.length === 0 ? (single?.reason ?? game.i18n.localize("PMTTRPG.CustomAction.Unavailable")) : null,
      variantCount: row.entries.length,
    });
  }
  return out.sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

function sameIdentity(a, b) {
  return !!a && !!b && a.identity === b.identity;
}

function targetActor(target) {
  return target?.actor ?? target?.combatant?.actor ?? null;
}

function isSelfTarget(target, context) {
  const combatantId = text(target?.combatant?.id);
  if (combatantId && context.combatant?.id != null) return combatantId === String(context.combatant.id);
  const tokenId = text(target?.tokenId ?? target?.token?.id);
  if (tokenId && context.tokenId != null) return tokenId === String(context.tokenId);
  return targetActor(target) != null && targetActor(target) === context.actor;
}

async function promptTarget(descriptor, context) {
  return game.projectmoonttrpg.targeting.promptTargetSelection({
    actor: context.actor,
    token: context.token ?? null,
    combat: context.combat ?? game.combat,
    title: descriptor.variant?.label ?? descriptor.label,
    hint: game.i18n.localize("PMTTRPG.CustomAction.ChooseTarget"),
    sourceName: context.actor?.name ?? "",
    sourceImg: context.actor?.img ?? "",
    weaponRange: null,
  });
}

function warnUser(message) {
  ui.notifications.warn(message);
}

function notify(key, data) {
  warnUser(game.i18n.format(key, data));
}

/**
 * We only trust `rowId` from the menu and collect the descriptors again before spending
 * anything. If the executor fails after the declaration whatever it cost stays spent.
 */
export async function runCustomActionMenuChoice(rowId, context = {}) {
  const actor = context.actor ?? null;
  if (!actor) return { ok: false, reason: "invalid-actor" };
  const ignoreCost = context.consume === false;

  const live = descriptorsForRow(await collectProvidedActions(context), rowId);
  if (!live.length) {
    notify("PMTTRPG.CustomAction.Gone");
    return { ok: false, reason: "gone" };
  }

  const described = [];
  for (const descriptor of live) described.push(await describeUsable(descriptor, context, { ignoreCost }));
  const usable = described.filter((entry) => entry.usable);
  if (!usable.length) {
    warnUser(described.length === 1 && described[0].reason ? described[0].reason : game.i18n.localize("PMTTRPG.CustomAction.Unavailable"));
    return { ok: false, reason: "unavailable" };
  }

  let chosen = described.length === 1 ? described[0].descriptor : null;
  if (!chosen) {
    chosen = await promptVariant(described, context);
    if (!chosen) return { ok: false, reason: "cancelled" };
    if (!usable.some((entry) => sameIdentity(entry.descriptor, chosen))) {
      notify("PMTTRPG.CustomAction.Unavailable");
      return { ok: false, reason: "unavailable" };
    }
  }

  let target = null;
  if (chosen.targeting.mode === "single") {
    target = await promptTarget(chosen, context);
    if (!target) return { ok: false, reason: "cancelled" };
    if (!targetActor(target)) {
      notify("PMTTRPG.CustomAction.NoTarget");
      return { ok: false, reason: "no-target" };
    }
    if (!chosen.targeting.allowSelf && isSelfTarget(target, context)) {
      notify("PMTTRPG.CustomAction.NoSelf");
      return { ok: false, reason: "self-target" };
    }
  }

  // the prompts can take a while so the source might be gone by now
  const again = descriptorsForRow(await collectProvidedActions(context), rowId).find((entry) => sameIdentity(entry, chosen));
  if (!again) {
    notify("PMTTRPG.CustomAction.Gone");
    return { ok: false, reason: "gone" };
  }
  const execContext = { ...context, target, declaration: null };
  const check = await describeUsable(again, execContext, { ignoreCost });
  if (!check.usable) {
    warnUser(check.reason ?? game.i18n.localize("PMTTRPG.CustomAction.Unavailable"));
    return { ok: false, reason: "unavailable" };
  }

  const source = again.source;
  const declared = await declareActorAction({
    actor,
    economyType: ECONOMY_TYPES.ACTION,
    kind: ACTION_KINDS.CUSTOM,
    cost: again.economy.cost,
    item: source?.documentName === "Item" ? source : undefined,
    tokenId: context.tokenId ?? context.token?.id ?? null,
    combatant: context.combatant ?? undefined,
    target: targetActor(target) ?? undefined,
    timing: customActionTiming(again),
    consume: context.consume,
    metadata: {
      customActionId: again.id,
      customActionProviderId: again.providerId,
      customActionSourceUuid: again.sourceUuid,
      customActionFamily: again.family?.key ?? null,
      customActionVariant: again.variant?.key ?? null,
      customActionLabel: descriptorLabel(again),
      targetCombatantId: text(target?.combatant?.id),
      targetTokenId: text(target?.tokenId ?? target?.token?.id ?? target?.combatant?.tokenId),
    },
  });
  if (!declared?.ok) return declared ?? { ok: false, reason: "declaration-failed" };

  execContext.declaration = declared.declaration;
  execContext.sourceDocument = source;
  try {
    const result = await executeCustomAction(again, execContext);
    if (result?.ok === false) {
      console.warn("[PMTTRPG] custom Action executor reported failure after the declaration", { identity: again.identity, reason: result.reason });
      notify("PMTTRPG.CustomAction.ExecutorFailed", { name: again.label });
      return { ok: false, reason: result.reason ?? "executor-failed", declared: true, declaration: declared.declaration };
    }
    return { ok: true, declaration: declared.declaration, descriptor: again, result };
  } catch (error) {
    console.error("[PMTTRPG] custom Action executor threw after the declaration", error);
    notify("PMTTRPG.CustomAction.ExecutorFailed", { name: again.label });
    return { ok: false, reason: "executor-failed", declared: true, declaration: declared.declaration };
  }
}

const VARIANT_TEMPLATE = "systems/projectmoonttrpg/templates/dialog/action-custom-variant.hbs";

function sourceName(descriptor) {
  return text(descriptor.source?.name) ?? "";
}

async function promptVariant(described, _context) {
  const nameCounts = new Map();
  for (const entry of described) {
    const name = entry.descriptor.variant?.label ?? entry.descriptor.label;
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  const first = described.find((entry) => entry.usable);
  const options = described.map((entry) => {
    const descriptor = entry.descriptor;
    const name = descriptor.variant?.label ?? descriptor.label;
    return {
      identity: descriptor.identity,
      label: name,
      source: (nameCounts.get(name) ?? 0) > 1 || !descriptor.variant ? sourceName(descriptor) : "",
      img: descriptor.variant?.img ?? descriptor.img,
      cost: costLabel(descriptor.economy.cost, entry),
      detail: entry.usable ? entry.detail : entry.reason,
      disabled: !entry.usable,
      checked: entry === first,
    };
  });
  const title = described[0].descriptor.family?.label ?? described[0].descriptor.label;
  const html = await foundry.applications.handlebars.renderTemplate(VARIANT_TEMPLATE, {
    options,
    hint: game.i18n.localize("PMTTRPG.CustomAction.ChooseVariant"),
  });
  const identity = await waitForWindowChoice({
    window: { title },
    content: html,
    buttons: [
      cancelButton(),
      confirmButton((_event, _button, dialog) => dialog.element.querySelector("[name='customVariant']:checked")?.value ?? null),
    ],
    rejectClose: false,
  });
  if (!identity) return null;
  return described.find((entry) => entry.descriptor.identity === identity)?.descriptor ?? null;
}
