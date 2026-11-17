import { applyRuntimeResourceLocal, recoverPoolLocal } from "./nouns.js";
import { getEquippedOutfit } from "../damage-application.js";
import { normalizeResistanceDamageType, normalizeResistanceLevel } from "./resistances.js";
import { applyEEMetaPatch, canMutateEEMetaHost, isApprovedEEMetaHost } from "./ee-meta.js";
import { canActAs, canUserUpdateDocument } from "../acting-user.js";
import { ACTION_BINDINGS_PATH, bindingListForStorage } from "../action-economy/action-bindings.js";
import { DROPPED_ITEM_PATH } from "../action-economy/formulas.js";
import { ACTION_STATE_ENTRY_KEYS, actionStateEntryUpdate, flagKeyDeletion } from "../action-economy/combat-flags.js";
import {
  ASSIST_STATE_PATH,
  appendAssistEntry,
  consumeAssistEntry,
  pruneAssistEntries,
  rawAssistEntries,
  withCombatantAssistMutation,
} from "../action-economy/assist-state.js";

const SOCKET_EVENT = "system.projectmoonttrpg";
const GM_REQUEST = "eeGmRequest";
const GM_RESPONSE = "eeGmResponse";
const GM_TIMEOUT_MS = 30_000;

/** @type {Map<string, { resolve: (v: any) => void, reject: (e: Error) => void }>} */
const _pending = new Map();
let _socketRegistered = false;

export function canMutateActor(actor) {
  return canUserUpdateDocument(actor);
}

function sanitizeActorUpdate(update) {
  if (!update || typeof update !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(update)) {
    if (key.startsWith("system.attributes.") || key.startsWith("flags.projectmoonttrpg.")) {
      out[key] = value;
    }
  }
  return out;
}

function sanitizeItemUpdate(update) {
  if (!update || typeof update !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(update)) {
    if (key.startsWith("system.")) out[key] = value;
    else if (key === DROPPED_ITEM_PATH) out[key] = value === true;
    else if (key === ACTION_BINDINGS_PATH) {
      const records = bindingListForStorage(value);
      if (records) out[key] = records;
    }
  }
  return out;
}

/** Plain data for the socket reply. A Document (or anything we can't serialize) just goes back as `true`. */
function gmRouteSocketResult(result) {
  if (result === undefined || result === null) return null;
  if (typeof result !== "object") return result;
  if (typeof result.documentName === "string") return true;
  try {
    return JSON.parse(JSON.stringify(result));
  } catch {
    return true;
  }
}

function uuidFromDocOrString(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && typeof value.uuid === "string" && value.uuid.trim()) {
    return value.uuid.trim();
  }
  return null;
}

function pushUuid(out, seen, value) {
  const uuid = uuidFromDocOrString(value);
  if (!uuid || seen.has(uuid)) return;
  seen.add(uuid);
  out.push(uuid);
}

/**
 * Socket payload for applyDamage.
 */
export function sanitizeDamageOptions(options = {}) {
  const out = {};
  if (options.op != null) out.op = options.op;
  if (options.pool != null) out.pool = options.pool;
  if (typeof options.source === "string") out.source = options.source;
  if (options.fromAttack === true) out.fromAttack = true;
  if (typeof options.damageType === "string") out.damageType = options.damageType;
  if (typeof options.sourceLabel === "string") out.sourceLabel = options.sourceLabel;
  if (typeof options.formula === "string" && options.formula.trim()) {
    out.formula = options.formula.trim();
  }
  if (options.skipEasyEffects === true) out.skipEasyEffects = true;
  if (options.skipResistance === true) out.skipResistance = true;
  if (options.skipResistance === false) out.skipResistance = false;
  if (options.createMessage === false) out.createMessage = false;
  if (Number.isFinite(Number(options.afterResistance))) {
    out.afterResistance = Number(options.afterResistance);
  }
  const healerUuid = uuidFromDocOrString(options.healerUuid) ?? uuidFromDocOrString(options.healer);
  if (healerUuid) out.healerUuid = healerUuid;
  const itemUuid = uuidFromDocOrString(options.itemUuid) ?? uuidFromDocOrString(options.item);
  if (itemUuid) out.itemUuid = itemUuid;
  const attackerUuid = uuidFromDocOrString(options.attackerUuid) ?? uuidFromDocOrString(options.attacker);
  if (attackerUuid) out.attackerUuid = attackerUuid;
  const attackerItemUuid = uuidFromDocOrString(options.attackerItemUuid)
    ?? uuidFromDocOrString(options.attackerItem);
  if (attackerItemUuid) out.attackerItemUuid = attackerItemUuid;

  const sourceItemUuids = [];
  const seen = new Set();
  if (Array.isArray(options.sourceItemUuids)) {
    for (const value of options.sourceItemUuids) pushUuid(sourceItemUuids, seen, value);
  }
  if (Array.isArray(options.sourceItems)) {
    for (const value of options.sourceItems) pushUuid(sourceItemUuids, seen, value);
  } else {
    pushUuid(sourceItemUuids, seen, options.sourceItems);
  }
  pushUuid(sourceItemUuids, seen, attackerItemUuid);
  if (sourceItemUuids.length) out.sourceItemUuids = sourceItemUuids;
  return out;
}

export function getPrimaryGM() {
  return game.users.find((u) => u.active && u.isGM) ?? null;
}

function isPrimaryGM() {
  const gm = getPrimaryGM();
  return !!(gm && game.user.id === gm.id);
}

export function getTurnEventGM() {
  return game.users.activeGM ?? null;
}

function isTurnEventGM() {
  const gm = getTurnEventGM();
  return !!(gm && game.user.id === gm.id);
}

/**
 * Routes actor mutations through an owner or active GM.
 * Persistent EE metadata uses `runEEMetaPatch` instead
 * @param {Actor} actor
 * @param {string} op
 * @param {object} [payload]
 * @returns {Promise<any>}
 */
export async function runAsOwnerOrGM(actor, op, payload = {}) {
  ensureGmRouteSocket();

  if (!HANDLERS[op]) {
    throw new Error(`[EasyEffects] Unknown GM route op '${op}'`);
  }

  if (canMutateActor(actor)) {
    return HANDLERS[op]({ ...payload, actor });
  }

  const wirePayload = {
    ...payload,
    actorUuid: actor.uuid,
  };
  delete wirePayload.actor;
  return dispatchToPrimaryGM(op, wirePayload);
}

/**
 * Players can only update a Combatant if they can modify its Actor. A write to someone
 * else's Combatant (like an Assist) goes through the GM instead.
 */
export async function runAsCombatantOwnerOrGM(combatant, op, payload = {}) {
  ensureGmRouteSocket();

  if (!HANDLERS[op]) {
    throw new Error(`[EasyEffects] Unknown GM route op '${op}'`);
  }
  if (!combatant?.uuid) return false;

  if (canUserUpdateDocument(combatant)) {
    return HANDLERS[op]({ ...payload, combatant, combatantUuid: combatant.uuid });
  }

  const wirePayload = { ...payload, combatantUuid: combatant.uuid };
  delete wirePayload.combatant;
  return dispatchToPrimaryGM(op, wirePayload);
}

/** Runs `op` on the primary GM (locally if that's us). Handlers get `{ fromUserId }` as a second argument. */
export async function runOnPrimaryGM(op, payload = {}) {
  ensureGmRouteSocket();
  if (!HANDLERS[op]) {
    throw new Error(`[EasyEffects] Unknown GM route op '${op}'`);
  }
  if (isPrimaryGM()) return HANDLERS[op](payload, { fromUserId: game.user.id });
  return dispatchToPrimaryGM(op, payload);
}

/**
 * Same socket as `runOnPrimaryGM`, but `game.users.activeGM` is the one that answers
 * `delayForwardAdvance`. The Delay mask has to go on the client that runs Foundry's turn events.
 */
export async function runOnTurnEventGM(op, payload = {}) {
  ensureGmRouteSocket();
  if (!HANDLERS[op]) {
    throw new Error(`[EasyEffects] Unknown GM route op '${op}'`);
  }
  if (isTurnEventGM()) return HANDLERS[op](payload, { fromUserId: game.user.id });
  if (!getTurnEventGM()) return null;
  return dispatchToPrimaryGM(op, payload);
}

function dispatchToPrimaryGM(op, wirePayload) {
  const primary = getPrimaryGM();
  if (!primary) {
    const msg = game.i18n.localize("PMTTRPG.Dialog.easyEffectsNoGM");
    console.warn(`[EasyEffects] ${msg} (op=${op})`);
    ui.notifications?.warn(msg);
    return null;
  }

  const requestId = foundry.utils.randomID();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(requestId);
      const msg = game.i18n.localize("PMTTRPG.Dialog.easyEffectsGmTimeout");
      console.warn(`[EasyEffects] ${msg} (op=${op})`);
      ui.notifications?.warn(msg);
      resolve(null);
    }, GM_TIMEOUT_MS);

    _pending.set(requestId, {
      resolve: (value) => {
        clearTimeout(timer);
        _pending.delete(requestId);
        resolve(value);
      },
      reject: (err) => {
        clearTimeout(timer);
        _pending.delete(requestId);
        reject(err);
      },
    });

    game.socket.emit(SOCKET_EVENT, {
      type: GM_REQUEST,
      requestId,
      op,
      payload: wirePayload,
      fromUserId: game.user.id,
    });
  });
}

async function resolveActor(data) {
  if (data.actor) return data.actor;
  if (!data.actorUuid) return null;
  return fromUuid(data.actorUuid);
}

async function resolveCombatant(data) {
  const doc = data.combatant ?? (data.combatantUuid ? await fromUuid(data.combatantUuid) : null);
  if (!doc || doc.documentName !== "Combatant") return null;
  if (data.combatId && String(doc.parent?.id) !== String(data.combatId)) return null;
  return doc;
}

function combatOfCombatant(combatant) {
  return combatant.parent;
}

async function writeAssistEntries(combatant, entries) {
  await combatant.update({ [ASSIST_STATE_PATH]: entries });
  return true;
}

async function resolveCombat(data) {
  const doc = data.combatUuid ? await fromUuid(data.combatUuid) : null;
  return doc?.documentName === "Combat" ? doc : null;
}

const HANDLERS = {
  commitPlannedMovement: async (data, meta = {}) => {
    const { commitPlannedMovementRequest } = await import("../movement/movement-commit.js");
    const user = game.users.get(meta.fromUserId ?? "") ?? null;
    return commitPlannedMovementRequest(data, { fromUser: user });
  },

  mutateGrappleState: async (data, meta = {}) => {
    const combat = await resolveCombat(data);
    if (!combat) return { ok: false, reason: "no-combat" };
    const { handleGrappleMutationRequest } = await import("../grapple/grapple-authority.js");
    const fromUser = game.users.get(meta.fromUserId ?? "") ?? null;
    return handleGrappleMutationRequest(combat, data.op, data.payload ?? {}, { fromUser });
  },

  setCombatantFirstAction: async (data) => {
    const combatant = await resolveCombatant(data);
    const marker = data.marker;
    if (!combatant || !marker || typeof marker !== "object") return false;
    if (!Number.isInteger(marker.started) || typeof marker.declarationId !== "string") return false;
    await combatant.update({
      "flags.projectmoonttrpg.actionState.firstAction": {
        combatId: String(marker.combatId ?? ""),
        started: marker.started,
        round: Number.isInteger(marker.round) ? marker.round : null,
        declarationId: marker.declarationId,
      },
    });
    return true;
  },

  grantCombatantReactionCredits: async (data) => {
    const combatant = await resolveCombatant(data);
    if (!combatant) return { ok: false, reason: "no-combatant" };
    const { grantReactionCreditsHere } = await import("../action-economy/reaction-credits.js");
    return grantReactionCreditsHere(combatant, data.grant ?? {});
  },

  editCombatantReactionCredit: async (data) => {
    const combatant = await resolveCombatant(data);
    if (!combatant) return { ok: false, reason: "no-combatant" };
    if (typeof data.creditId !== "string" || typeof data.op !== "string") return { ok: false, reason: "invalid-edit" };
    const { editReactionCreditHere } = await import("../action-economy/reaction-credits.js");
    return editReactionCreditHere(combatant, data.creditId, data.op);
  },

  setCombatantReactionUse: async (data) => {
    const combatant = await resolveCombatant(data);
    if (!combatant) return false;
    const { REACTION_USE_PATH, normalizeReactionUseStamp } = await import("../action-economy/reaction-use.js");
    const stamp = normalizeReactionUseStamp(data.stamp);
    if (!stamp || stamp.combatantId !== String(combatant.id)) return false;
    await combatant.update({ [REACTION_USE_PATH]: stamp });
    return true;
  },

  commitGrappleContestDefense: async (data, meta = {}) => {
    const { commitGrappleContestDefense } = await import("../grapple/grapple-contest.js");
    return commitGrappleContestDefense(data, meta);
  },

  removeCombatantReactionAvailability: async (data) => {
    const combatant = await resolveCombatant(data);
    if (!combatant?.actor) return { ok: false, reason: "no-combatant" };
    const { removeReactionAvailability } = await import("../action-economy/reaction-credits.js");
    return removeReactionAvailability(combatant.actor, Math.max(0, Math.round(Number(data.amount) || 0)), { combatant });
  },

  spendCombatantReactionForDeclaration: async (data) => {
    const combatant = await resolveCombatant(data);
    if (!combatant?.actor) return { ok: false, reason: "no-combatant" };
    const { spendReactionsForDeclaration } = await import("../action-economy/reaction-credits.js");
    return spendReactionsForDeclaration(combatant.actor, {
      kind: typeof data.kind === "string" ? data.kind : null,
      itemId: typeof data.itemId === "string" ? data.itemId : null,
      acceptKinds: Array.isArray(data.acceptKinds) ? data.acceptKinds.filter((kind) => typeof kind === "string") : null,
      amount: Math.max(1, Math.min(10, Math.round(Number(data.amount) || 1))),
      order: typeof data.order === "string" ? data.order : null,
    }, { combatant, warn: false });
  },

  delayForwardAdvance: async (data, meta = {}) => {
    const combat = await resolveCombat(data);
    if (!combat) return false;
    const user = game.users.get(meta.fromUserId ?? "") ?? null;
    const current = combat.combatant;
    const allowed = user?.isGM === true
      || current?.testUserPermission(user, "OWNER") === true;
    if (!allowed) return false;
    const { enqueueDelayGate } = await import("../action-economy/delay.js");
    void enqueueDelayGate(combat, {
      mode: data.mode,
      expectedCurrentCombatantId: data.expectedCurrentCombatantId ?? null,
      expectedRound: data.expectedRound ?? null,
    }).catch((error) => console.error("[PMTTRPG] Delay gate failed", error));
    return true;
  },

  setCombatantDelayIntent: async (data, meta = {}) => {
    const combatant = await resolveCombatant(data);
    if (!combatant?.parent) return false;
    const user = game.users.get(meta.fromUserId ?? "") ?? null;
    const {
      DELAY_INTENT_PATH,
      buildDelayIntent,
      canArmDelay,
      prospectiveDelayCombatant,
      prospectiveRound,
      validateDelayIntent,
    } = await import("../action-economy/delay.js");
    if (!canArmDelay(user, combatant)) return false;
    const combat = combatant.parent;
    const next = prospectiveDelayCombatant(combat);
    if (!next || next.id !== combatant.id) return false;
    const intent = buildDelayIntent(combat, {
      mode: data.intent?.mode,
      afterCombatantId: data.intent?.afterCombatantId ?? null,
    });
    const round = prospectiveRound(combat, combatant);
    if (!validateDelayIntent(combat, { round, combatant }, intent).ok) return false;
    await combatant.update({ [DELAY_INTENT_PATH]: intent });
    return true;
  },

  clearCombatantDelayIntent: async (data, meta = {}) => {
    const combatant = await resolveCombatant(data);
    if (!combatant) return false;
    const user = game.users.get(meta.fromUserId ?? "") ?? null;
    const { canArmDelay } = await import("../action-economy/delay.js");
    if (!canArmDelay(user, combatant)) return false;
    await combatant.update(flagKeyDeletion("flags.projectmoonttrpg.delayIntent"));
    return true;
  },

  appendCombatantAssist: async (data) => {
    const combatant = await resolveCombatant(data);
    if (!combatant || !data.entry) return false;
    return withCombatantAssistMutation(combatant.uuid, async () => {
      const result = appendAssistEntry(rawAssistEntries(combatant), data.entry, {
        combat: combatOfCombatant(combatant),
        targetCombatant: combatant,
      });
      if (!result.ok) {
        console.warn("[PMTTRPG] Assist append rejected", { reason: result.reason, entryId: data.entry?.id });
        return false;
      }
      return writeAssistEntries(combatant, result.entries);
    });
  },

  consumeCombatantAssist: async (data) => {
    const combatant = await resolveCombatant(data);
    if (!combatant || !data.entryId) return false;
    return withCombatantAssistMutation(combatant.uuid, async () => {
      const result = consumeAssistEntry(rawAssistEntries(combatant), data.entryId, {
        combat: combatOfCombatant(combatant),
        targetCombatant: combatant,
      });
      if (!result.ok) return false;
      return writeAssistEntries(combatant, result.entries);
    });
  },

  setCombatantActionStateEntry: async (data, meta = {}) => {
    const combatant = await resolveCombatant(data);
    if (!combatant) return false;
    const key = typeof data.key === "string" ? data.key : "";
    if (!ACTION_STATE_ENTRY_KEYS.has(key)) return false;
    const user = game.users.get(meta.fromUserId ?? "") ?? null;
    if (!canActAs(combatant.actor, combatant.tokenId, user)) return false;
    if (data.value == null) {
      await combatant.update(actionStateEntryUpdate(key, null));
      return true;
    }
    if (typeof data.value !== "object" || Array.isArray(data.value)) return false;
    let encoded = "";
    try {
      encoded = JSON.stringify(data.value);
    } catch {
      return false;
    }
    if (encoded.length > 4000) return false;
    await combatant.update(actionStateEntryUpdate(key, data.value));
    return true;
  },

  claimClashCard: async (data, meta = {}) => {
    const { commitClashClaimAsGM } = await import("../combat/clash-economy.js");
    return commitClashClaimAsGM(data, meta);
  },

  pruneCombatantAssists: async (data) => {
    const combatant = await resolveCombatant(data);
    if (!combatant) return false;
    return withCombatantAssistMutation(combatant.uuid, async () => {
      const result = pruneAssistEntries(rawAssistEntries(combatant), {
        combat: combatOfCombatant(combatant),
        targetCombatant: combatant,
      });
      if (!result.removed) return true;
      return writeAssistEntries(combatant, result.entries);
    });
  },

  addStatusStacks: async ({ actor, actorUuid, statusName, amount, originUuid = null, origin = null }) => {
    const a = await resolveActor({ actor, actorUuid });
    if (!a) return null;
    return a.addStatusStacks(statusName, amount, null, { originUuid: originUuid ?? origin });
  },

  addPendingStatusStacks: async ({ actor, actorUuid, statusName, amount, arrival, originUuid = null, origin = null }) => {
    const a = await resolveActor({ actor, actorUuid });
    if (!a) return null;
    return a.addPendingStatusStacks(statusName, amount, {
      arrival,
      originUuid: originUuid ?? origin,
    });
  },

  pauseStatusToPending: async ({ actor, actorUuid, statusName, arrival }) => {
    const a = await resolveActor({ actor, actorUuid });
    if (!a) return null;
    return a.pauseStatusToPending(statusName, { arrival });
  },

  promotePendingStatuses: async ({ actor, actorUuid, arrival }) => {
    const a = await resolveActor({ actor, actorUuid });
    if (!a) return null;
    return a.promotePendingStatuses({ arrival });
  },

  removeStatusStacks: async ({ actor, actorUuid, statusName, amount }) => {
    const a = await resolveActor({ actor, actorUuid });
    if (!a) return null;
    return a.removeStatusStacks(statusName, amount);
  },

  setStatusStacks: async ({ actor, actorUuid, statusName, amount }) => {
    const a = await resolveActor({ actor, actorUuid });
    if (!a) return null;
    return a.setStatusStacks(statusName, amount);
  },

  applyDamage: async ({ actor, actorUuid, amount, options }) => {
    const a = await resolveActor({ actor, actorUuid });
    if (!a) return null;
    return a.applyDamage(amount, sanitizeDamageOptions(options ?? {}));
  },

  applyRuntimeResource: async ({ actor, actorUuid, nounId, mode, amount }) => {
    const a = await resolveActor({ actor, actorUuid });
    if (!a) return false;
    return applyRuntimeResourceLocal(a, nounId, { mode, amount });
  },

  recoverPool: async ({ actor, actorUuid, noun, amount }) => {
    const a = await resolveActor({ actor, actorUuid });
    if (!a) return false;
    return recoverPoolLocal(a, noun, amount);
  },

  setStat: async ({ actor, actorUuid, statName, amount }) => {
    const a = await resolveActor({ actor, actorUuid });
    if (!a || !statName) return null;
    const n = Number(amount) || 0;
    if (a.system.attributes?.[statName] !== undefined) {
      return a.update({ [`system.attributes.${statName}.value`]: n });
    }
    if (a.system.abilities?.[statName] !== undefined) {
      return a.update({ [`system.abilities.${statName}.value`]: n });
    }
    console.warn(`[EasyEffects] Unknown stat '${statName}' on ${a.name}`);
    return null;
  },

  setOutfitResistances: async ({ actor, actorUuid, overrides }) => {
    const a = await resolveActor({ actor, actorUuid });
    if (!a || !overrides || typeof overrides !== "object") return false;
    const outfit = getEquippedOutfit(a);
    if (!outfit) {
      console.warn(`[EasyEffects] set resistance: no outfit on '${a.name}'`);
      return false;
    }
    const updates = {};
    for (const [key, level] of Object.entries(overrides)) {
      const lvl = normalizeResistanceLevel(level);
      if (!lvl) continue;
      const [pool, damageType] = String(key).split(".");
      if ((pool !== "hp" && pool !== "st") || !normalizeResistanceDamageType(damageType)) continue;
      updates[`system.resistances.${pool}.${damageType}`] = lvl;
    }
    if (!Object.keys(updates).length) return false;
    await outfit.update(updates);
    return true;
  },

  applyActorUpdate: async ({ actor, actorUuid, update }) => {
    const a = await resolveActor({ actor, actorUuid });
    const next = sanitizeActorUpdate(update);
    if (!a || !Object.keys(next).length) return false;
    await a.update(next);
    return true;
  },

  updateOwnedItem: async ({ itemUuid, update }) => {
    const item = itemUuid ? await fromUuid(itemUuid) : null;
    const next = sanitizeItemUpdate(update);
    if (!item || !Object.keys(next).length) return false;
    await item.update(next);
    return true;
  },

  grantRecycledEvade: async ({ actor, actorUuid, outfitUuid = null }) => {
    const a = await resolveActor({ actor, actorUuid });
    if (!a) return false;
    const outfit = outfitUuid ? await fromUuid(outfitUuid) : null;
    const { grantRecycledEvadeLocal } = await import("../combat/recycled-evade.js");
    await grantRecycledEvadeLocal(a, outfit);
    return true;
  },

  bumpRecycledEvade: async ({ actor, actorUuid, outfitUuid = null }) => {
    const a = await resolveActor({ actor, actorUuid });
    if (!a) return false;
    const outfit = outfitUuid ? await fromUuid(outfitUuid) : null;
    const { bumpRecycledEvadeLocal } = await import("../combat/recycled-evade.js");
    await bumpRecycledEvadeLocal(a, outfit);
    return true;
  },

  clearRecycledEvade: async ({ actor, actorUuid }) => {
    const a = await resolveActor({ actor, actorUuid });
    if (!a) return false;
    const { clearRecycledEvadeLocal } = await import("../combat/recycled-evade.js");
    await clearRecycledEvadeLocal(a);
    return true;
  },

  patchEEMeta: async ({ document, documentUuid, set, unset }) => {
    let doc = document ?? null;
    if (!doc && documentUuid) doc = await fromUuid(documentUuid);
    if (!isApprovedEEMetaHost(doc)) {
      console.warn(
        `[EasyEffects] patchEEMeta rejected document type '${doc?.documentName ?? "unknown"}'`
      );
      return false;
    }
    return applyEEMetaPatch(doc, { set, unset });
  },

  settleDepletedEasyEffects: async () => {
    const { settleDepletedEasyEffects } = await import("./registry.js");
    await settleDepletedEasyEffects();
    return true;
  },
};

export function registerGmRouteSocket() {
  ensureGmRouteSocket();
}

/*Persistent EE metadata on Actor, Item, Combat, or Combatant
* Calls local applyEEMetaPatch when the user can mutate the host, otherwise asks
* the primary GM to patch it.
*/
export async function runEEMetaPatch(doc, patch = {}) {
  ensureGmRouteSocket();

  if (!isApprovedEEMetaHost(doc)) {
    console.warn(
      `[EasyEffects] patchEEMeta rejected document type '${doc?.documentName ?? "unknown"}'`
    );
    return false;
  }

  if (canMutateEEMetaHost(doc)) {
    return applyEEMetaPatch(doc, patch);
  }

  const primary = getPrimaryGM();
  if (!primary) {
    const msg = game.i18n.localize("PMTTRPG.Dialog.easyEffectsNoGM");
    console.warn(`[EasyEffects] ${msg} (op=patchEEMeta)`);
    ui.notifications?.warn(msg);
    return null;
  }

  const requestId = foundry.utils.randomID();
  const wirePayload = {
    documentUuid: doc.uuid,
    set: patch.set && typeof patch.set === "object" ? patch.set : {},
    unset: Array.isArray(patch.unset) ? patch.unset : [],
  };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(requestId);
      const msg = game.i18n.localize("PMTTRPG.Dialog.easyEffectsGmTimeout");
      console.warn(`[EasyEffects] ${msg} (op=patchEEMeta)`);
      ui.notifications?.warn(msg);
      resolve(null);
    }, GM_TIMEOUT_MS);

    _pending.set(requestId, {
      resolve: (value) => {
        clearTimeout(timer);
        _pending.delete(requestId);
        resolve(value);
      },
      reject: (err) => {
        clearTimeout(timer);
        _pending.delete(requestId);
        reject(err);
      },
    });

    game.socket.emit(SOCKET_EVENT, {
      type: GM_REQUEST,
      requestId,
      op: "patchEEMeta",
      payload: wirePayload,
      fromUserId: game.user.id,
    });
  });
}

function ensureGmRouteSocket() {
  if (_socketRegistered) return;
  if (!game?.socket) return;
  _socketRegistered = true;

  game.socket.on(SOCKET_EVENT, async (data) => {
    if (!data || typeof data !== "object") return;

    if (data.type === GM_REQUEST) {
      const handles = data.op === "delayForwardAdvance" ? isTurnEventGM() : isPrimaryGM();
      if (!handles) return;
      if (!HANDLERS[data.op]) {
        game.socket.emit(SOCKET_EVENT, {
          type: GM_RESPONSE,
          requestId: data.requestId,
          ok: false,
          error: `Unknown op '${data.op}'`,
        });
        return;
      }

      try {
        const result = await HANDLERS[data.op](data.payload ?? {}, { fromUserId: data.fromUserId ?? null });
        game.socket.emit(SOCKET_EVENT, {
          type: GM_RESPONSE,
          requestId: data.requestId,
          ok: true,
          result: gmRouteSocketResult(result),
        });
      } catch (err) {
        console.error("[EasyEffects] GM route failed", data.op, err);
        game.socket.emit(SOCKET_EVENT, {
          type: GM_RESPONSE,
          requestId: data.requestId,
          ok: false,
          error: err?.message ?? String(err),
        });
      }
      return;
    }

    if (data.type === GM_RESPONSE) {
      const pending = _pending.get(data.requestId);
      if (!pending) return;
      if (data.ok === false) {
        pending.reject(new Error(data.error || "GM route failed"));
        return;
      }
      pending.resolve(data.result ?? null);
    }
  });
}
