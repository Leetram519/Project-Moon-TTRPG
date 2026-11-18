import { PMTTRPGUtility } from "../utility.js";
import { resolveActingUser } from "../acting-user.js";
import { waitForChoice, waitForWindowChoice } from "../apps/dialog-wait.js";

const SOCKET_EVENT = "system.projectmoonttrpg";
const CHOICE_REQUEST = "eeChoiceRequest";
const CHOICE_RESPONSE = "eeChoiceResponse";
const CHOICE_TIMEOUT_MS = 120_000;

/** @type {Map<string, { resolve: (id: string|null) => void }>} */
const _pending = new Map();
let _socketRegistered = false;

/**
 * Asks whoever controls the actor (this client if that's us) and returns
 * the chosen answer id, or null if they cancel. If a remote user doesn't
 * answer within`timeoutMs` then we return `timeoutValue`.
 */
export async function promptChoiceDialog({
  prompt,
  choices,
  actor = null,
  tokenId = null,
  title = null,
  cancel = true,
  windowStyle = false,
  timeoutMs = CHOICE_TIMEOUT_MS,
  timeoutValue = null,
} = {}) {
  const list = Array.isArray(choices) ? choices.filter((c) => c?.id && c?.label) : [];
  if (!list.length) return null;

  ensureChoiceSocket();

  const recipient = resolvePromptUser(actor, tokenId);
  if (!recipient || recipient.id === game.user.id) {
    return showLocalChoiceDialog({ prompt, choices: list, title, cancel, windowStyle });
  }

  return requestRemoteChoice({
    userId: recipient.id,
    prompt,
    choices: list,
    title,
    cancel,
    windowStyle,
    timeoutMs,
    timeoutValue,
  });
}

/**
 * Active non-GM owner of the token or actor, else the current user if they
 * can act, else an active GM.
 */
export function resolvePromptUser(actor, tokenId = null) {
  if (!actor && !tokenId) return game.user;
  return resolveActingUser(actor, tokenId) ?? game.user;
}

async function showLocalChoiceDialog({ prompt, choices, title: windowTitle = null, cancel = true, windowStyle = false }) {
  const classes = ["projectmoonttrpg", "PMTTRPG-dialog"];
  if (PMTTRPGUtility.nightmode) classes.push("nightmode");

  const title = windowTitle || game.i18n.localize("PMTTRPG.Dialog.easyEffectsChoiceTitle");
  const text = foundry.utils.escapeHTML(String(prompt ?? ""));
  const content = windowStyle
    ? `<div class="action-weapon-form"><p class="action-weapon-form__hint">${text}</p></div>`
    : `<p class="ee-choice-prompt">${text}</p>`;

  const buttons = choices.map((choice, index) => ({
    action: choice.id,
    label: choice.label,
    default: index === 0,
    callback: () => choice.id,
  }));
  if (cancel) buttons.push({
    action: "cancel",
    label: game.i18n.localize("PMTTRPG.Dialog.cancel"),
    callback: () => null,
  });

  if (windowStyle) return waitForWindowChoice({ window: { title }, content, buttons, rejectClose: false });
  return waitForChoice({
    window: { title },
    classes,
    content,
    buttons,
    rejectClose: false,
  });
}

function requestRemoteChoice({ userId, prompt, choices, title = null, cancel = true, windowStyle = false, timeoutMs = CHOICE_TIMEOUT_MS, timeoutValue = null }) {
  const requestId = foundry.utils.randomID();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      _pending.delete(requestId);
      console.warn("[EasyEffects] Choice dialog timed out waiting for remote user");
      ui.notifications?.warn(game.i18n.localize("PMTTRPG.Dialog.easyEffectsChoiceTimeout"));
      resolve(timeoutValue);
    }, timeoutMs);

    _pending.set(requestId, {
      resolve: (answerId) => {
        clearTimeout(timer);
        _pending.delete(requestId);
        resolve(answerId);
      },
    });

    game.socket.emit(SOCKET_EVENT, {
      type: CHOICE_REQUEST,
      requestId,
      userId,
      prompt,
      choices,
      title,
      cancel,
      windowStyle,
    });
  });
}

export function registerChoiceDialogSocket() {
  ensureChoiceSocket();
}

function ensureChoiceSocket() {
  if (_socketRegistered) return;
  if (!game?.socket) return;
  _socketRegistered = true;

  game.socket.on(SOCKET_EVENT, async (data) => {
    if (!data || typeof data !== "object") return;

    if (data.type === CHOICE_REQUEST) {
      if (data.userId !== game.user.id) return;
      const answerId = await showLocalChoiceDialog({
        prompt: data.prompt,
        choices: data.choices ?? [],
        title: typeof data.title === "string" ? data.title : null,
        cancel: data.cancel !== false,
        windowStyle: data.windowStyle === true,
      });
      game.socket.emit(SOCKET_EVENT, {
        type: CHOICE_RESPONSE,
        requestId: data.requestId,
        answerId,
      });
      return;
    }

    if (data.type === CHOICE_RESPONSE) {
      const pending = _pending.get(data.requestId);
      if (!pending) return;
      pending.resolve(data.answerId ?? null);
    }
  });
}
