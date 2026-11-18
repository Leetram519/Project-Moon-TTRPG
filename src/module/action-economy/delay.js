import { compareCombatants, planCombatantPlacement } from "../combat/turn-order.js";
import {
  ASSIST_STATE_PATH,
  deferAssistEntries,
  rawAssistEntries,
  withCombatantAssistMutation,
} from "./assist-state.js";
import { ACTION_KINDS } from "./kinds.js";
import { flagKeyDeletion } from "./combat-flags.js";
import { createKeyedQueue } from "../keyed-queue.js";
import { cancelButton, confirmButton, waitForWindowChoice } from "../apps/dialog-wait.js";
import { turnsOf } from "../combat/combatant-match.js";
import { turnLifecyclesSettled } from "../combat/turn-stamps.js";
import { documentId } from "../shared-helpers.js";

/**
 * CR 3.x Delay. You pick it while the turn is only offered and the slot you
 * leave is never a turn. It's not an Action declaration so it spends nothing and
 * doesn't run [On Action].
 */

const SCOPE = "projectmoonttrpg";
const TIEBREAK_PATH = `flags.${SCOPE}.turnTiebreak`;

const DELAY_INTENT_KEY = "delayIntent";
export const DELAY_INTENT_PATH = `flags.${SCOPE}.${DELAY_INTENT_KEY}`;
const DELAY_INTENT_VERSION = 1;
const DELAY_DEFERRAL_KEY = "delayedTurn";
const DELAY_DEFERRAL_PATH = `flags.${SCOPE}.${DELAY_DEFERRAL_KEY}`;
// on Delay's own initiative and pointer writes so our turn lifecycle just ignores them
export const DELAY_INTERNAL_OPTION = "pmttrpgDelayInternal";
// on the real turn change a Delay commits. `maskedIds` are the Combatants whose
// slots Delay moved (they get no turn events)
export const DELAY_TRANSITION_OPTION = "pmttrpgDelayTransition";
const DELAY_NEXT_ROUND = "nextRound";
const DELAY_CHOICES = { TAKE: "take", DELAY: "delay" };

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function combatantById(combat, id) {
  if (id == null) return null;
  return combat.combatants.get(String(id)) ?? null;
}

// `speedBonus` already has Justice in it so we don't count it twice
function maxSpeedFromFormulaParts({ formula = "1d6", speedBonus = 0, macroMisc = 0, manualMisc = 0 } = {}) {
  const match = /^\s*(\d*)d(\d+)/i.exec(String(formula ?? ""));
  const count = match ? (Number(match[1]) || 1) : 1;
  const faces = match ? Number(match[2]) : 6;
  return count * faces + finiteNumber(speedBonus) + finiteNumber(macroMisc) + finiteNumber(manualMisc);
}

/**
 * The latest round this Combatant gave up by Delaying into the next one (or
 * null). Without this their max Speed could sort them after the current actor
 * and they'd get that round again.
 */
export function deferredRoundOf(combatant, combat) {
  const raw = combatant?.flags?.[SCOPE]?.[DELAY_DEFERRAL_KEY];
  if (!raw || typeof raw !== "object") return null;
  if (combat?.id != null && String(raw.combatId) !== String(combat.id)) return null;
  const round = Number(raw.skipRound);
  return Number.isInteger(round) ? round : null;
}

function isOfferable(combat, combatant, round) {
  if (!combatant) return false;
  if (combat?.settings?.skipDefeated && combatant.isDefeated) return false;
  const deferred = deferredRoundOf(combatant, combat);
  return deferred == null || Number(round) > deferred;
}

export function currentIdOf(combat) {
  if (!(Number(combat?.round) > 0)) return null;
  if (combat.turn === null || combat.turn === undefined) return null;
  return documentId(combat.combatant);
}

// before combat Foundry's nextTurn / nextRound only give a turn if `combat.turn` is already set
function delayGateApplies(combat, mode = "turn") {
  if (!combat || turnsOf(combat).length === 0) return false;
  const started = Number(combat.round) > 0;
  if (mode === "start") return !started;
  if (!started) return combat.turn !== null && combat.turn !== undefined;
  return true;
}

function initialDelayCursor(combat, mode = "turn") {
  const round = Number(combat?.round) || 0;
  if (mode === "start" || round === 0) return { round: 1, afterCombatantId: null };
  if (mode === "round") return { round: round + 1, afterCombatantId: null };
  return { round, afterCombatantId: currentIdOf(combat) };
}

// same as Foundry v14's nextTurn / nextRound but it also skips anyone who gave that round up
function findDelayCandidate(combat, cursor) {
  const turns = turnsOf(combat);
  if (!turns.length || !cursor) return null;
  const round = Number(cursor.round);
  let start = 0;
  if (cursor.afterCombatantId != null) {
    const index = turns.findIndex((entry) => documentId(entry) === String(cursor.afterCombatantId));
    start = index >= 0 ? index + 1 : 0;
  }
  for (let i = start; i < turns.length; i++) {
    if (isOfferable(combat, turns[i], round)) return { round, turn: i, combatant: turns[i] };
  }
  if (round !== Number(combat.round)) return null;
  const nextRound = round + 1;
  for (let i = 0; i < turns.length; i++) {
    if (isOfferable(combat, turns[i], nextRound)) return { round: nextRound, turn: i, combatant: turns[i] };
  }
  return null;
}

function naturalForwardTarget(combat, mode = "turn") {
  const turns = turnsOf(combat);
  const skip = !!combat?.settings?.skipDefeated;
  const round = Number(combat?.round) || 0;
  if (mode === "start") return { round: 1, turn: 0 };
  const firstOfNextRound = () => {
    let turn = (combat?.turn === null || combat?.turn === undefined || !turns.length) ? null : 0;
    if (skip && turn !== null) {
      turn = turns.findIndex((entry) => !entry.isDefeated);
      if (turn === -1) turn = 0;
    }
    return { round: round + 1, turn };
  };
  if (mode === "round" || round === 0) return firstOfNextRound();
  const current = Number.isInteger(combat?.turn) ? combat.turn : -1;
  let next = null;
  if (skip) {
    for (let i = current + 1; i < turns.length; i++) {
      if (!turns[i].isDefeated) {
        next = i;
        break;
      }
    }
  } else {
    next = current + 1;
  }
  if (next === null || next >= turns.length) return firstOfNextRound();
  return { round, turn: next };
}

function delayDestinations(combat, candidate) {
  const turns = turnsOf(combat);
  const candidateId = documentId(candidate?.combatant);
  const index = turns.findIndex((entry) => documentId(entry) === candidateId);
  if (index < 0) return [];
  return turns.slice(index + 1).filter((entry) => (
    documentId(entry) !== candidateId && isOfferable(combat, entry, candidate.round)
  ));
}

function projectTurnOrder(combat, updates = []) {
  const byId = new Map((updates ?? []).map((update) => [String(update._id), update]));
  const rows = combat.combatants.map((entry) => {
    const id = documentId(entry);
    const update = byId.get(id);
    const tiebreak = update && TIEBREAK_PATH in update
      ? update[TIEBREAK_PATH]
      : entry?.flags?.[SCOPE]?.turnTiebreak;
    return {
      id,
      initiative: update && "initiative" in update ? update.initiative : entry.initiative,
      actor: entry.actor,
      flags: { [SCOPE]: { turnTiebreak: tiebreak } },
    };
  });
  return rows.sort(compareCombatants).map((row) => row.id);
}

function delayMaskedIds(combat, { fromRound, delayedIds = [], takerId = null } = {}) {
  const ids = new Set((delayedIds ?? []).map(String));
  const lo = Math.max(1, Number(fromRound) || 0);
  for (const entry of combat.combatants) {
    const round = deferredRoundOf(entry, combat);
    if (round != null && round >= lo) ids.add(documentId(entry));
  }
  if (takerId != null) ids.delete(String(takerId));
  return [...ids];
}

/**
 * The view we hand to Foundry v14's `#triggerTurnEvents`. The Combatants Delay
 * moved becomes null, which makes Foundry move past them. On a round wrap the incoming
 * Combatant is also nulled in the old round's tail so only their real start runs.
 */
export function delayTurnEventView({ turns = [], previous = null, current = null, maskedIds = [] } = {}) {
  const masked = new Set((maskedIds ?? []).map(String));
  const currentId = current?.combatantId != null ? String(current.combatantId) : null;
  const view = [...turns].map((entry) => {
    const id = documentId(entry);
    return id && masked.has(id) && id !== currentId ? null : entry;
  });
  const wrapping = previous && current
    && Number(current.round) > Number(previous.round)
    && Number(previous.round) > 0
    && currentId;
  if (!wrapping) return { turns: view, previous: null };
  const tailStart = (Number(previous.turn) || 0) + 1;
  return {
    turns: suppressTailOccurrence(view, { tailStart, suppressId: currentId }),
    previous: null,
  };
}

// Foundry snapshots `turns` once and walks the old round's tail with the same
// indices. The first read of the incoming Combatant's index is the tail one.
function suppressTailOccurrence(entries, { tailStart, suppressId }) {
  const tailRuns = tailStart <= entries.length - 1;
  let inTail = tailRuns;
  let last = tailStart - 1;
  return new Proxy(entries, {
    get(target, prop) {
      if (prop === "length") return target.length;
      const index = typeof prop === "string" ? Number(prop) : NaN;
      if (!Number.isInteger(index) || String(index) !== prop) return target[prop];
      if (inTail) {
        if (index < last) inTail = false;
        else {
          last = index;
          const entry = target[index];
          if (documentId(entry) === suppressId) return null;
          return entry;
        }
      }
      return target[index];
    },
  });
}

export function readDelayIntent(combatant, combat = null) {
  const raw = combatant?.flags?.[SCOPE]?.[DELAY_INTENT_KEY];
  if (!raw || typeof raw !== "object" || Number(raw.version) !== DELAY_INTENT_VERSION) return null;
  if (combat?.id != null && raw.combatId != null && String(raw.combatId) !== String(combat.id)) return null;
  if (raw.mode !== "after" && raw.mode !== DELAY_NEXT_ROUND) return null;
  return raw;
}

export function buildDelayIntent(combat, { mode, afterCombatantId = null, currentCombatantId = currentIdOf(combat) } = {}) {
  return {
    version: DELAY_INTENT_VERSION,
    combatId: documentId(combat),
    armedRound: Number(combat?.round) || 0,
    armedWhileCurrentCombatantId: currentCombatantId == null ? null : String(currentCombatantId),
    mode: mode === DELAY_NEXT_ROUND ? DELAY_NEXT_ROUND : "after",
    afterCombatantId: mode === DELAY_NEXT_ROUND || afterCombatantId == null ? null : String(afterCombatantId),
  };
}

/** If the intent isn't valid anymore they just take the turn. */
export function validateDelayIntent(combat, candidate, intent) {
  if (!intent || !candidate?.combatant) return { ok: false, reason: "missing" };
  if (String(intent.combatId) !== String(documentId(combat))) return { ok: false, reason: "wrong-combat" };
  const armedCurrent = intent.armedWhileCurrentCombatantId ?? null;
  const current = currentIdOf(combat);
  if (String(armedCurrent ?? "") !== String(current ?? "")) return { ok: false, reason: "stale-current" };
  if (Number(intent.armedRound) !== (Number(combat?.round) || 0)) return { ok: false, reason: "stale-round" };
  if (!isOfferable(combat, candidate.combatant, candidate.round)) return { ok: false, reason: "not-offerable" };
  if (intent.mode === DELAY_NEXT_ROUND) {
    return { ok: true, response: { choice: DELAY_CHOICES.DELAY, nextRound: true } };
  }
  const afterId = intent.afterCombatantId == null ? null : String(intent.afterCombatantId);
  const destinations = delayDestinations(combat, candidate);
  if (!afterId || !destinations.some((entry) => documentId(entry) === afterId)) {
    return { ok: false, reason: "stale-destination" };
  }
  return { ok: true, response: { choice: DELAY_CHOICES.DELAY, nextRound: false, afterCombatantId: afterId } };
}

export function prospectiveDelayCombatant(combat) {
  if (!combat || !turnsOf(combat).length) return null;
  if (!(Number(combat.round) > 0)) {
    return findDelayCandidate(combat, { round: 1, afterCombatantId: null })?.combatant ?? null;
  }
  if (combat.turn === null || combat.turn === undefined) return null;
  return findDelayCandidate(combat, initialDelayCursor(combat, "turn"))?.combatant ?? null;
}

export function canArmDelay(user, combatant) {
  if (!user || !combatant) return false;
  if (user.isGM) return true;
  if (combatant.actor?.type === "npc") return false;
  return combatant.testUserPermission(user, "OWNER");
}

function intentUpdate(intent) {
  if (!intent) return flagKeyDeletion(DELAY_INTENT_PATH);
  return { [DELAY_INTENT_PATH]: intent };
}

/** We rebuild the intent here so a caller can't set the combat, round or turn fields themselves. */
export async function writeDelayIntent(combatant, intent) {
  if (!combatant) return false;
  if (!canArmDelay(game.user, combatant)) return false;
  const combat = combatant.parent;
  let stored = null;
  if (intent) {
    if (!combat) return false;
    const next = prospectiveDelayCombatant(combat);
    if (!next || documentId(next) !== documentId(combatant)) return false;
    stored = buildDelayIntent(combat, {
      mode: intent.mode,
      afterCombatantId: intent.afterCombatantId ?? null,
    });
    const round = prospectiveRound(combat, combatant);
    if (!validateDelayIntent(combat, { round, combatant }, stored).ok) return false;
  }
  const { canUserUpdateDocument } = await import("../acting-user.js");
  const update = intentUpdate(stored);
  if (canUserUpdateDocument(combatant)) {
    await combatant.update(update);
    return true;
  }
  const { runOnPrimaryGM } = await import("../easy-effects/gm-route.js");
  const op = stored ? "setCombatantDelayIntent" : "clearCombatantDelayIntent";
  return runOnPrimaryGM(op, { combatantUuid: combatant.uuid, intent: stored });
}

export function prospectiveRound(combat, combatant) {
  if (!(Number(combat?.round) > 0)) return 1;
  const found = findDelayCandidate(combat, initialDelayCursor(combat, "turn"));
  if (found && documentId(found.combatant) === documentId(combatant)) return found.round;
  return Number(combat.round) || 1;
}

const DELAY_PICK_TEMPLATE = "systems/projectmoonttrpg/templates/dialog/action-delay-destination.hbs";

function combatantLabel(combatant) {
  return combatant?.name || game.i18n.localize("PMTTRPG.Delay.Unknown");
}

function combatantPortrait(combatant) {
  return combatant?.img || combatant?.actor?.img || "";
}

// 0 is a real Speed so only a missing one is null
function trackerSpeed(combatant) {
  const raw = combatant?.initiative;
  if (raw == null || raw === "") return null;
  const speed = Number(raw);
  return Number.isFinite(speed) ? speed : null;
}

// Speed only shows when two rows have the same name
function delayPickRows(combat, combatant) {
  const round = prospectiveRound(combat, combatant);
  const destinations = delayDestinations(combat, { round, combatant });
  const names = destinations.map(combatantLabel);
  const shared = new Map();
  for (const name of names) shared.set(name, (shared.get(name) ?? 0) + 1);
  const intent = readDelayIntent(combatant, combat);
  const rows = destinations.map((entry, index) => {
    const id = documentId(entry);
    const name = names[index];
    const nextName = names[index + 1] ?? null;
    const speed = trackerSpeed(entry);
    return {
      id,
      name,
      img: combatantPortrait(entry),
      sharedName: (shared.get(name) ?? 0) > 1 && speed != null,
      speed,
      speedLabel: speed == null ? "" : game.i18n.format("PMTTRPG.Delay.SpeedValue", { speed }),
      follow: nextName
        ? game.i18n.format("PMTTRPG.Delay.Before", { names: nextName })
        : game.i18n.format("PMTTRPG.Delay.LastInRound", { round }),
      last: nextName == null,
      locateAria: game.i18n.format("PMTTRPG.Delay.Locate", { name }),
      selected: intent?.mode === "after" && String(intent.afterCombatantId) === String(id),
    };
  });
  return {
    round,
    rows,
    nextRoundSelected: intent?.mode === DELAY_NEXT_ROUND,
  };
}

function canvasToken(combatant) {
  if (!canvas.ready) return null;
  const token = combatant?.token?.object ?? null;
  if (!token || token.scene?.id !== canvas.scene?.id) return null;
  return token;
}

function canSeeToken(token) {
  if (!token) return false;
  return game.user.isGM === true || token.isVisible === true;
}

function panCanvas(point) {
  return canvas.animatePan(point);
}

const DELAY_HOVER_EVENT = { buttons: 0 };

function previewDelayToken(combatant, on) {
  const token = canvasToken(combatant);
  const visible = canSeeToken(token);
  if (!token || !visible) return false;
  if (on) token._onHoverIn(DELAY_HOVER_EVENT, { hoverOutOthers: false, updateLegend: false });
  else token._onHoverOut(DELAY_HOVER_EVENT, { updateLegend: false });
  return true;
}

function locateDelayToken(combatant) {
  const token = canvasToken(combatant);
  const visible = canSeeToken(token);
  const center = token?.center;
  if (!token || !visible || center?.x == null || center?.y == null) return false;
  panCanvas({ x: center.x, y: center.y });
  return true;
}

function bindDelayDestinationDialog(dialog, combat) {
  const root = dialog.element;
  if (!root || root.dataset.delayPickerBound) return;
  root.dataset.delayPickerBound = "1";
  const form = root.querySelector("form");
  const confirm = root.querySelector('button[data-action="confirm"]');
  const syncConfirm = () => {
    if (confirm) confirm.disabled = !form?.querySelector("[name='delayAfter']:checked");
  };
  syncConfirm();
  form?.addEventListener("change", syncConfirm);

  let previewed = null;
  const clearPreview = () => {
    if (!previewed) return;
    previewDelayToken(previewed, false);
    previewed = null;
  };
  form?.addEventListener("pointerover", (event) => {
    const row = event.target.closest("[data-delay-combatant]");
    if (!row || !form.contains(row)) return;
    const id = row.dataset.delayCombatant;
    if (previewed && documentId(previewed) === id) return;
    clearPreview();
    const next = combatantById(combat, id);
    if (!next) return;
    if (previewDelayToken(next, true)) previewed = next;
  });
  form?.addEventListener("pointerout", (event) => {
    const row = event.target.closest("[data-delay-combatant]");
    if (!row) return;
    const next = event.relatedTarget?.closest("[data-delay-combatant]");
    if (next === row) return;
    clearPreview();
  });
  form?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='locateDelayToken']");
    if (!button || !form.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    const id = button.closest("[data-delay-combatant]")?.dataset.delayCombatant;
    locateDelayToken(combatantById(combat, id));
  });
  dialog.addEventListener("close", clearPreview, { once: true });
}

/** Cancelling the dialog leaves whatever intent was already armed. */
export async function promptDelayIntent(combat, combatant) {
  if (!canArmDelay(game.user, combatant)) return false;
  const next = prospectiveDelayCombatant(combat);
  if (!next || documentId(next) !== documentId(combatant)) return false;
  if (currentIdOf(combat) != null && documentId(combatant) === String(currentIdOf(combat))) return false;
  const view = delayPickRows(combat, combatant);
  const { renderTemplate } = foundry.applications.handlebars;
  const html = await renderTemplate(DELAY_PICK_TEMPLATE, {
    ...view,
    hint: game.i18n.localize("PMTTRPG.Delay.PickHint"),
    roundGroup: game.i18n.format("PMTTRPG.Delay.RoundGroup", { round: view.round }),
    nextRoundGroup: game.i18n.format("PMTTRPG.Delay.RoundGroup", { round: view.round + 1 }),
    nextRound: game.i18n.localize("PMTTRPG.Delay.NextRound"),
    nextRoundHint: game.i18n.localize("PMTTRPG.Delay.NextRoundHint"),
  });
  const action = await waitForWindowChoice({
    window: { title: game.i18n.format("PMTTRPG.Delay.PickTitle", { name: combatantLabel(combatant) }) },
    content: html,
    buttons: [
      cancelButton(),
      confirmButton((_event, _button, dialog) => dialog.element?.querySelector("[name='delayAfter']:checked")?.value ?? null),
    ],
    render: (_event, dialog) => bindDelayDestinationDialog(dialog, combat),
    rejectClose: false,
  });
  if (!action) return false;
  const intent = action === DELAY_NEXT_ROUND
    ? buildDelayIntent(combat, { mode: DELAY_NEXT_ROUND })
    : buildDelayIntent(combat, { mode: "after", afterCombatantId: action });
  await writeDelayIntent(combatant, intent);
  return true;
}

export function delayIntentLabel(combat, intent) {
  if (!intent) return "";
  if (intent.mode === DELAY_NEXT_ROUND) return game.i18n.localize("PMTTRPG.Delay.NextRound");
  const after = combatantById(combat, intent.afterCombatantId);
  const name = after?.name ?? game.i18n.localize("PMTTRPG.Delay.Unknown");
  return game.i18n.format("PMTTRPG.Delay.After", { name });
}

const forwardAdvances = createKeyedQueue();

function withCombatForwardAdvance(key, task) {
  return forwardAdvances.run(key == null ? "" : String(key), task);
}

async function combatantMaxSpeed(combatant) {
  const actor = combatant?.actor;
  if (!actor) return null;
  const { getInitiativeFormulaParts } = await import("../targeting.js");
  return maxSpeedFromFormulaParts(getInitiativeFormulaParts(actor));
}

async function postDelayFeedback(event) {
  const { postActionFeedbackEvent } = await import("./action-feedback.js");
  return postActionFeedbackEvent(event);
}

// copies Foundry v14's startCombat / nextTurn / nextRound but adds DELAY_TRANSITION_OPTION so the moved slots get no turn events
async function explicitAdvance(combat, target, { maskedIds = [], start = false } = {}) {
  const updateData = { round: target.round, turn: target.turn };
  const transition = { [DELAY_TRANSITION_OPTION]: { maskedIds } };
  if (start) {
    combat._playCombatSound("startEncounter");
    Hooks.callAll("combatStart", combat, updateData);
    await combat.update(updateData, transition);
    await ActiveEffect.registry.refresh("combatStart", { combat });
    return combat;
  }
  const delta = combat.getTimeDelta(combat.round, combat.turn, target.round, target.turn);
  const updateOptions = { direction: 1, worldTime: { delta }, ...transition };
  Hooks.callAll(target.round !== combat.round ? "combatRound" : "combatTurn", combat, updateData, updateOptions);
  await combat.update(updateData, updateOptions);
  return combat;
}

function updateCombatants(combat, updates, options) {
  return combat.updateEmbeddedDocuments("Combatant", updates, options);
}

function updateCombat(combat, data, options) {
  return combat.update(data, options);
}

function naturalAdvance(combat, mode) {
  return combat._pmttrpgNaturalAdvance(mode);
}

async function clearDelayIntent(combat, combatant) {
  if (!combat || !combatant || !readDelayIntent(combatant)) return;
  await updateCombatants(combat, [{
    _id: documentId(combatant),
    ...flagKeyDeletion(DELAY_INTENT_PATH),
  }], { turnEvents: false, [DELAY_INTERNAL_OPTION]: true });
}

function warnUser(key) {
  ui.notifications.warn(game.i18n.localize(key));
}

function sameTurnState(combat, currentId, round) {
  return currentIdOf(combat) === currentId && Number(combat?.round) === round;
}

async function applyInternalReorder(combat, updates, currentId) {
  if (currentId == null) {
    try {
      await updateCombatants(combat, updates, { turnEvents: false, [DELAY_INTERNAL_OPTION]: true });
    } catch (error) {
      console.warn("[PMTTRPG] Delay reorder write failed", error);
      return { ok: false, reason: "write-failed" };
    }
    if (currentIdOf(combat) !== null) return { ok: false, fatal: true, reason: "pointer-mismatch" };
    return { ok: true };
  }
  const projected = projectTurnOrder(combat, updates);
  const currentIndex = projected.indexOf(currentId);
  if (currentIndex < 0) return { ok: false, reason: "no-current" };
  const persistedTurn = combat.turn;
  try {
    await updateCombatants(combat, updates, {
      turnEvents: false,
      combatTurn: currentIndex,
      [DELAY_INTERNAL_OPTION]: true,
    });
  } catch (error) {
    console.warn("[PMTTRPG] Delay reorder write failed", error);
    return { ok: false, reason: "write-failed" };
  }

  const liveIndex = turnsOf(combat).findIndex((entry) => documentId(entry) === currentId);
  if (liveIndex < 0) return { ok: false, fatal: true, reason: "pointer-lost" };
  if (Number(persistedTurn) !== liveIndex || Number(combat.turn) !== liveIndex) {
    try {
      await updateCombat(combat, { turn: liveIndex }, {
        turnEvents: false,
        diff: false,
        [DELAY_INTERNAL_OPTION]: true,
      });
    } catch (error) {
      console.error("[PMTTRPG] Delay pointer write failed after reorder", error);
      return { ok: false, fatal: true, reason: "pointer-write-failed" };
    }
  }
  if (currentIdOf(combat) !== currentId) return { ok: false, fatal: true, reason: "pointer-mismatch" };
  return { ok: true };
}

async function commitDelay(combat, candidate, response, { currentId }) {
  const combatant = candidate.combatant;
  if (response.nextRound) {
    let initiative = null;
    try {
      initiative = await combatantMaxSpeed(combatant);
    } catch (error) {
      console.warn("[PMTTRPG] Delay max Speed failed", error);
    }
    if (!Number.isFinite(initiative)) return { ok: false, reason: "no-speed" };
    const key = combatant.uuid ?? `combatant:${documentId(combatant)}`;
    return withCombatantAssistMutation(key, async () => {
      const deferred = deferAssistEntries(rawAssistEntries(combatant), {
        offeredRound: candidate.round,
        combat,
        targetCombatant: combatant,
      });
      const update = {
        _id: documentId(combatant),
        initiative,
        [TIEBREAK_PATH]: 0,
        [DELAY_DEFERRAL_PATH]: { combatId: documentId(combat), skipRound: candidate.round },
      };
      if (deferred.moved) update[ASSIST_STATE_PATH] = deferred.entries;
      const result = await applyInternalReorder(combat, [update], currentId);
      return { ...result, nextRound: true, initiative, movedAssists: deferred.moved };
    });
  }

  const destinations = delayDestinations(combat, candidate);
  const above = destinations.find((entry) => documentId(entry) === String(response.afterCombatantId));
  if (!above) return { ok: false, reason: "stale-destination" };
  const rest = turnsOf(combat).filter((entry) => documentId(entry) !== documentId(combatant));
  const aboveIndex = rest.findIndex((entry) => documentId(entry) === documentId(above));
  const below = aboveIndex >= 0 ? (rest[aboveIndex + 1] ?? null) : null;
  const updates = planCombatantPlacement(combat, combatant, { above, below });
  if (!updates?.length) return { ok: false, reason: "stale-destination" };
  if (Number(candidate.round) > Number(combat.round)) {
    const id = documentId(combatant);
    let own = updates.find((update) => String(update._id) === id);
    if (!own) {
      own = { _id: id };
      updates.push(own);
    }
    own[DELAY_DEFERRAL_PATH] = { combatId: documentId(combat), skipRound: Number(combat.round) };
  }
  const result = await applyInternalReorder(combat, updates, currentId);
  return { ...result, nextRound: false, afterCombatantId: documentId(above) };
}

async function commitTransition(combat, target, mode, { delayedIds }) {
  const natural = naturalForwardTarget(combat, mode);
  if (natural.round === target.round && natural.turn === target.turn) return naturalAdvance(combat, mode);
  const maskedIds = delayMaskedIds(combat, {
    fromRound: combat.round,
    delayedIds,
    takerId: target.turn === null ? null : documentId(turnsOf(combat)[target.turn]),
  });
  return explicitAdvance(combat, target, { maskedIds, start: mode === "start" });
}

function deferredFrom(combat, round) {
  return combat.combatants.some((entry) => {
    const deferred = deferredRoundOf(entry, combat);
    return deferred != null && deferred >= round;
  });
}

// just a backstop for corrupt state
const DELAY_GATE_STEP_LIMIT = 1000;

/**
 * The gate for one forward advance (Begin Combat included). No intent means they
 * take the turn, a valid one commits the Delay and we check the next person, and
 * an invalid one gets cleared.
 */
async function runDelayGate(combat, request = {}) {
  const mode = ["start", "round"].includes(request.mode) ? request.mode : "turn";
  if (request.expectedCurrentCombatantId != null
    && currentIdOf(combat) !== String(request.expectedCurrentCombatantId)) {
    return { ok: false, outcome: "stale" };
  }
  if (request.expectedRound != null && Number(combat.round) !== Number(request.expectedRound)) {
    return { ok: false, outcome: "stale" };
  }
  if (!delayGateApplies(combat, mode)) {
    if (mode === "start") return { ok: false, outcome: "stale" };
    return { ok: true, outcome: "natural", result: await naturalAdvance(combat, mode) };
  }

  let stepMode = mode;
  let currentId = currentIdOf(combat);
  let round = Number(combat.round);
  let cursor = initialDelayCursor(combat, stepMode);
  const delays = [];
  const delayedIds = new Set();
  let delaysSinceEmptyRound = 0;
  let emptyRounds = 0;
  const stall = (reason) => {
    console.warn("[PMTTRPG] Delay gate stopped without advancing", { reason });
    warnUser("PMTTRPG.Delay.Stalled");
    return { ok: false, outcome: "stalled", reason, delays };
  };
  const takeTurn = async (live) => {
    const result = await commitTransition(
      combat,
      { round: live.round, turn: live.turn },
      stepMode,
      { delayedIds: [...delayedIds] },
    );
    return { ok: true, outcome: "take", candidateId: documentId(live.combatant), delays, emptyRounds, result };
  };

  for (let step = 0; ; step++) {
    if (step >= DELAY_GATE_STEP_LIMIT) return stall("step-limit");
    if (!sameTurnState(combat, currentId, round)) return { ok: false, outcome: "stale", delays };

    const live = findDelayCandidate(combat, cursor);
    if (!live) {
      const nextRound = Number(combat.round) + 1;
      if (!deferredFrom(combat, Math.max(1, Number(combat.round)))) {
        return { ok: true, outcome: "natural", delays, result: await naturalAdvance(combat, stepMode) };
      }
      if (emptyRounds > 0 && delaysSinceEmptyRound === 0) return stall("no-candidate");
      await commitTransition(combat, { round: nextRound, turn: null }, stepMode, { delayedIds: [...delayedIds] });
      emptyRounds += 1;
      delaysSinceEmptyRound = 0;
      stepMode = "turn";
      currentId = currentIdOf(combat);
      round = Number(combat.round);
      cursor = initialDelayCursor(combat, "turn");
      continue;
    }

    const intent = readDelayIntent(live.combatant, combat);
    if (!intent) return takeTurn(live);
    const check = validateDelayIntent(combat, live, intent);
    if (!check.ok) {
      await clearDelayIntent(combat, live.combatant);
      warnUser(check.reason === "stale-destination" ? "PMTTRPG.Delay.Stale" : "PMTTRPG.Delay.Invalid");
      return takeTurn(live);
    }

    const committed = await commitDelay(combat, live, check.response, { currentId });
    if (!committed.ok) {
      await clearDelayIntent(combat, live.combatant);
      if (committed.fatal) {
        warnUser("PMTTRPG.Delay.PointerFailed");
        return { ok: false, outcome: "pointer-error", delays };
      }
      warnUser(committed.reason === "stale-destination" ? "PMTTRPG.Delay.Stale" : "PMTTRPG.Delay.Failed");
      return takeTurn(live);
    }

    await clearDelayIntent(combat, live.combatant);
    delaysSinceEmptyRound += 1;
    delayedIds.add(documentId(live.combatant));
    delays.push({ combatantId: documentId(live.combatant), ...committed });
    try {
      await postDelayFeedback({
        id: foundry.utils.randomID(),
        kind: ACTION_KINDS.DELAY,
        economyType: null,
        actor: live.combatant.actor ?? null,
        actorId: live.combatant.actorId,
        tokenId: live.combatant.tokenId ?? null,
        combatantId: documentId(live.combatant),
      });
    } catch (error) {
      console.warn("[PMTTRPG] Delay feedback failed", error);
    }
  }
}

export function enqueueDelayGate(combat, request = {}) {
  return withCombatForwardAdvance(combat?.uuid ?? documentId(combat), async () => {
    // the pointer can't get ahead of the last turn change's End of Turn and Turn Start
    await turnLifecyclesSettled(combat);
    return runDelayGate(combat, request);
  });
}

let warnedNoGm = false;

/**
 * The active GM runs the gate and everyone else just sends it a request. With no
 * active GM we fall back to the normal advance.
 */
export async function requestDelayAwareAdvance(combat, mode = "turn") {
  if (!delayGateApplies(combat, mode)) return combat._pmttrpgNaturalAdvance(mode);
  const { getTurnEventGM, runOnTurnEventGM } = await import("../easy-effects/gm-route.js");
  const gm = getTurnEventGM();
  if (!gm) {
    if (!warnedNoGm) {
      warnedNoGm = true;
      console.warn("[PMTTRPG] No active GM, turns advance without the Delay gate");
      ui.notifications.warn(game.i18n.localize("PMTTRPG.Delay.NeedsGM"));
    }
    await turnLifecyclesSettled(combat);
    return combat._pmttrpgNaturalAdvance(mode);
  }
  const request = {
    combatUuid: combat.uuid,
    mode,
    expectedCurrentCombatantId: currentIdOf(combat),
    expectedRound: Number(combat.round),
  };
  if (gm.id === game.user.id) {
    await enqueueDelayGate(combat, request);
    return combat;
  }
  await runOnTurnEventGM("delayForwardAdvance", request);
  return combat;
}

/**
 * Clears armed intents when the round goes back to 0, otherwise they'd still be
 * sitting on the Combatants at the next start.
 */
export function registerDelayIntent() {
  Hooks.on("updateCombat", (combat, changed) => {
    if (!("round" in changed) || Number(changed.round) > 0) return;
    const authority = game.users.activeGM;
    const user = game.user;
    if (!user.isGM) return;
    if (authority && user.id !== authority.id) return;
    const updates = [];
    for (const combatant of combat.combatants) {
      if (!combatant.flags[SCOPE]?.[DELAY_INTENT_KEY]) continue;
      updates.push({
        _id: documentId(combatant),
        ...flagKeyDeletion(DELAY_INTENT_PATH),
      });
    }
    if (!updates.length) return;
    void combat.updateEmbeddedDocuments("Combatant", updates, {
      turnEvents: false,
      [DELAY_INTERNAL_OPTION]: true,
    }).catch((error) => console.warn("[PMTTRPG] Delay intent cleanup failed", error));
  });
}
