import {
  CLASH_FLAG_SCOPE,
  CLASH_FLAG_KEY,
  serialiseClashState,
  deserialiseClashState,
} from "./clash-state.js";
import { showDiceForRoll } from "../utility.js";
import { resolveTokenDocument } from "../acting-user.js";

const SOCKET_EVENT = "system.projectmoonttrpg";
const CHAT_UPDATE = "chatUpdate";

export function emitChatUpdate(messageId, { content, flags = null } = {}) {
  const payload = {
    type: CHAT_UPDATE,
    message: messageId,
    content,
  };
  if (flags) payload.flags = flags;
  globalThis.game.socket.emit(SOCKET_EVENT, payload);
}

export function isChatUpdatePayload(data) {
  if (!data || typeof data !== "object") return false;
  if (data.type === CHAT_UPDATE) return true;
  return !data.type && !!data.message && data.content != null;
}

function flagsToUpdate(flags) {
  if (!flags || typeof flags !== "object") return {};
  return foundry.utils.flattenObject({ flags });
}

export function applyChatUpdate(data) {
  if (!isChatUpdatePayload(data) || data.content == null) return;
  const message = globalThis.game.messages.get(data.message);
  if (!message) return;
  message.update({
    content: data.content,
    ...flagsToUpdate(data.flags),
  });
}

const { renderTemplate } = foundry.applications.handlebars;

const TEMPLATES = {
  attackCard:      "systems/projectmoonttrpg/templates/combat/clashing/attack-card.hbs",
  clashResultCard: "systems/projectmoonttrpg/templates/combat/clashing/clash-result-card.hbs",
  rollBreakdown:   "systems/projectmoonttrpg/templates/combat/clashing/roll-breakdown.hbs",
};

// ── Card posting ──────────────────────────────────────────────────────────────

export async function postAttackCard(state, attackRoll = null, messageId = null) {
  const rollHtml = attackRoll
    ? await attackRoll.render({ isPrivate: false })
    : "";
  const content  = await renderTemplate(TEMPLATES.attackCard, {
    state, rollHtml, isGM: game.user.isGM, i18n: _attackCardI18n(state),
  });

  const chatData = {
    content,
    flags: { [CLASH_FLAG_SCOPE]: { [CLASH_FLAG_KEY]: serialiseClashState(state) } },
  };
  if (attackRoll) {
    chatData.rolls = [attackRoll.toJSON()];
    chatData.sound = CONFIG.sounds.dice;
  }

  let message;
  if (messageId) {
    message = game.messages.get(messageId);
    if (message) await _writeClashMessage(message, chatData);
  } else {
    chatData.author = game.user.id;
    chatData.speaker = clashMessageSpeaker(state.attackerActorId, state.attackerTokenId, state.attackerName);
    message = await ChatMessage.create(chatData);
  }

  return message;
}

export async function updateAttackCard(messageId, updatedState) {
  const message = game.messages.get(messageId);
  if (!message) return;
  const rollHtml = await _rerenderRollHtml(message);
  const content  = await renderTemplate(TEMPLATES.attackCard, {
    state: updatedState, rollHtml, isGM: game.user.isGM, i18n: _attackCardI18n(updatedState),
  });

  await _writeClashMessage(message, {
    content,
    flags: { [CLASH_FLAG_SCOPE]: { [CLASH_FLAG_KEY]: serialiseClashState(updatedState) } },
  });
}

export async function postResultCard(state, defenseRoll = null, messageId = null, attackRoll = null) {
  const defenseRollHtml = await defenseRoll?.render?.({ isPrivate: false });
  const attackerWon     = state.result === "attackWin";
  const defenderWon     = state.result === "defenseWin";
  const blockWin        = defenderWon && state.retaliationType === "block";
  const blockWinSt      = blockWin && !state.blockWinStExempt;
  const blockWinExempt  = blockWin && state.blockWinStExempt;
  const evadeWin        = defenderWon && (state.retaliationType === "evade"
    || state.retaliationType === "recycledEvade");
  const counterWin      = defenderWon && state.retaliationType === "counter";
  const counterHit      = counterWin;
  const counterOutOfRange = counterWin && state.counterInRange === false;

  // We (yes we) match the damage controls to the summary.
  const defaultPools = (attackerWon || counterHit)
    ? ["hp", "st"]
    : (blockWinSt || evadeWin)
      ? ["st"]
      : ["hp"];
  const poolSelect = {
    pools: defaultPools.join(","),
    pool: defaultPools[0],
    hp: defaultPools.includes("hp"),
    st: defaultPools.includes("st"),
    sp: defaultPools.includes("sp"),
  };

  const applyTarget = getClashApplyTarget(state);
 
  const content = await renderTemplate(TEMPLATES.clashResultCard, {
    state, defenseRollHtml, attackerWon, defenderWon, blockWin, blockWinSt, blockWinExempt,
    evadeWin, counterWin, counterHit, counterOutOfRange, poolSelect, applyTarget,
    isGM: game.user.isGM, i18n: _resultCardI18n(state, applyTarget),
  });
 
  const chatData = {
    content,
    flags: { [CLASH_FLAG_SCOPE]: { [CLASH_FLAG_KEY]: serialiseClashState(state) } },
  };

  // Keep the rolling banner up until DSN finishes (or times out).
  await _showClashResultDice(state, attackRoll, defenseRoll);

  let message;
  if (messageId) {
    message = game.messages.get(messageId);
    if (message) await _writeClashMessage(message, chatData);
  } else {
    chatData.author = game.user.id;
    chatData.speaker = clashMessageSpeaker(state.attackerActorId, state.attackerTokenId, state.attackerName);
    message = await ChatMessage.create(chatData);
  }

  return message;
}

/**
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export async function enhanceClashRollBreakdown(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;

  const state = message?.getFlag?.(CLASH_FLAG_SCOPE, CLASH_FLAG_KEY)
    ?? message?.flags?.[CLASH_FLAG_SCOPE]?.[CLASH_FLAG_KEY];
  if (!state) return;

  /** @type {{ el: Element, rows: object[]|null|undefined }[]} */
  const tips = [];

  for (const el of root.querySelectorAll('.clash-result-card__roll-total[data-clash-breakdown="attack"]')) {
    tips.push({ el, rows: state.attackRollBreakdown });
  }
  for (const el of root.querySelectorAll('.clash-result-card__roll-total[data-clash-breakdown="defense"]')) {
    tips.push({ el, rows: state.defenseRollBreakdown });
  }

  const attackRollWrap = root.querySelector('.clash-attack-card [data-clash-breakdown="attack"]');
  if (attackRollWrap) {
    const diceTotal = attackRollWrap.querySelector(".dice-total") ?? attackRollWrap;
    tips.push({ el: diceTotal, rows: state.attackRollBreakdown });
  }

  for (const { el, rows } of tips) {
    if (!el || !rows?.length) continue;
    const breakdownHtml = await renderTemplate(TEMPLATES.rollBreakdown, { rows });
    el.classList.add("clash-roll-total--hoverable");
    el.dataset.tooltipHtml = breakdownHtml;
    el.dataset.tooltipClass = "projectmoonttrpg damage-breakdown-tooltip";
    el.dataset.tooltipDirection = "UP";
    if (!el.getAttribute("aria-label")) {
      el.setAttribute("aria-label", game.i18n.localize("PMTTRPG.Clash.Breakdown.Title"));
    }
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
  }
}
// ── Button click wiring ───────────────────────────────────────────────────────

export function registerClashChatListeners() {
  Hooks.once("ready", () => {
    const target = document.getElementById("chat-log") ?? document.body;
    target.addEventListener("click", _clashButtonHandler, { capture: false });
  });
}

async function _clashButtonHandler(event) {
  const button = event.target.closest("[data-action^='clash-']");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();

  const action    = button.dataset.action;
  const messageId = button.dataset.messageId;
  if (!messageId) return;

  const message = game.messages.get(messageId);
  if (!message) return;

  const raw = message.getFlag(CLASH_FLAG_SCOPE, CLASH_FLAG_KEY);
  if (!raw) return;

  const state = deserialiseClashState(raw);
  const { handleRetaliateClick } = await import("./clashing.js");

  switch (action) {
    case "clash-retaliate":  await handleRetaliateClick(state, { isIntercept: false }); break;
    case "clash-intercept":  await handleRetaliateClick(state, { isIntercept: true  }); break;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getClashStateFromMessage(messageId) {
  const message = game.messages.get(messageId);
  if (!message) return null;
  const raw = message.getFlag(CLASH_FLAG_SCOPE, CLASH_FLAG_KEY);
  return raw ? deserialiseClashState(raw) : null;
}

export function getClashApplyTarget(state) {
  if (!state) return null;

  const attackerWon = state.result === "attackWin";
  const defenderWon = state.result === "defenseWin";
  const type = state.retaliationType;
  const blockWinSt = defenderWon && type === "block" && !state.blockWinStExempt;
  const evadeWin = defenderWon && (type === "evade" || type === "recycledEvade");
  const counterHit = defenderWon && type === "counter";

  let side = null;
  let kind = "damage";
  if (evadeWin) {
    side = "defender";
    kind = "heal";
  } else if (counterHit || blockWinSt) {
    side = "attacker";
  } else if (attackerWon) {
    side = "defender";
  } else {
    return null;
  }

  if (side === "attacker") {
    if (!state.attackerActorId && !state.attackerTokenId) return null;
    return {
      side,
      kind,
      actorId: state.attackerActorId ?? null,
      tokenId: state.attackerTokenId ?? null,
      name: state.attackerName ?? "",
      img: state.attackerImg ?? "",
    };
  }

  const actorId = state.retaliatorActorId ?? state.targetActorId ?? null;
  const tokenId = state.retaliatorTokenId ?? state.targetTokenId ?? null;
  if (!actorId && !tokenId) return null;
  return {
    side,
    kind,
    actorId,
    tokenId,
    name: state.retaliatorName ?? state.targetName ?? "",
    img: state.retaliatorImg ?? state.targetImg ?? "",
  };
}

export function resolveClashCombatant(actorId, tokenId) {
  if (tokenId) return resolveTokenDocument(tokenId)?.actor ?? null;
  return actorId ? (game.actors.get(actorId) ?? null) : null;
}

function clashMessageSpeaker(actorId, tokenId, alias = null) {
  if (!actorId && !tokenId) {
    return { scene: null, actor: null, token: null, alias: alias ?? null };
  }
  const token = tokenId ? resolveTokenDocument(tokenId) : null;
  if (tokenId && !token) {
    return { scene: null, actor: null, token: tokenId, alias: alias ?? null };
  }
  const actor = token?.actor ?? (actorId ? (game.actors.get(actorId) ?? null) : null);
  if (typeof ChatMessage?.getSpeaker === "function") {
    return ChatMessage.getSpeaker({
      actor: actor ?? undefined,
      token: token ?? undefined,
      alias: alias ?? undefined,
    });
  }
  return {
    scene: token?.parent?.id ?? null,
    actor: actor?.id ?? null,
    token: token?.id ?? null,
    alias: alias ?? token?.name ?? actor?.name ?? null,
  };
}

async function _writeClashMessage(message, chatData) {
  const update = {
    content: chatData.content,
    ...flagsToUpdate(chatData.flags),
  };
  if (chatData.rolls) update.rolls = chatData.rolls;
  if (chatData.sound) update.sound = chatData.sound;

  if (message.isAuthor || game.user.isGM) {
    await message.update(update);
    return;
  }
  emitChatUpdate(message.id, {
    content: chatData.content,
    flags: chatData.flags ?? null,
  });
}

function _dsnSpeakerForCombatant(actorId, tokenId) {
  const speaker = clashMessageSpeaker(actorId, tokenId);
  if (!speaker?.actor && !speaker?.token) return null;
  return speaker;
}

function _showClashDice(roll, actorId, tokenId) {
  const speaker = _dsnSpeakerForCombatant(actorId, tokenId);
  return showDiceForRoll(roll, { speaker });
}

async function _showClashResultDice(state, attackRoll, defenseRoll) {
  const shows = [];
  if (attackRoll) {
    shows.push(_showClashDice(attackRoll, state.attackerActorId, state.attackerTokenId));
  }
  if (defenseRoll) {
    shows.push(_showClashDice(
      defenseRoll,
      state.retaliatorActorId ?? state.targetActorId,
      state.retaliatorTokenId ?? state.targetTokenId,
    ));
  }
  if (!shows.length) return;
  try {
    await Promise.all(shows);
  } catch (err) {
    console.warn("[PMTTRPG] Clash Dice So Nice display failed; posting result card.", err);
  }
}

async function _rerenderRollHtml(message) {
  const rollJson = message.rolls?.[0];
  if (!rollJson) return "";
  try { return await Roll.fromData(rollJson).render({ isPrivate: false }); }
  catch { return ""; }
}

function _attackCardI18n(state) {
  return {
    retaliate:    game.i18n.localize("PMTTRPG.Clash.Retaliate"),
    intercept:    game.i18n.localize("PMTTRPG.Clash.Intercept"),
    retaliateHint: state.targetName
      ? game.i18n.format("PMTTRPG.Clash.RetaliateHint", { name: state.targetName })
      : game.i18n.localize("PMTTRPG.Clash.Retaliate"),
    interceptHint: game.i18n.localize("PMTTRPG.Clash.InterceptHint"),
    using:        game.i18n.localize("PMTTRPG.Clash.Using"),
    attackBy:     game.i18n.format("PMTTRPG.Clash.AttackBy",     { name: state.attackerName }),
    targeting:    state.targetName
      ? game.i18n.format("PMTTRPG.Clash.Targeting",   { name: state.targetName })
      : game.i18n.localize("PMTTRPG.Clash.NoTarget"),
    challengeNotice: game.i18n.format("PMTTRPG.Clash.ChallengeNotice", {
      attacker: state.attackerName,
      target: state.targetName || game.i18n.localize("PMTTRPG.Clash.NoTarget"),
    }),
    retaliatedBy: state.retaliatorName
      ? game.i18n.format("PMTTRPG.Clash.RetaliatedBy",{ name: state.retaliatorName })
      : "",
    rollHidden:   game.i18n.localize("PMTTRPG.Clash.RollHidden"),
    resolved:     game.i18n.localize("PMTTRPG.Clash.Resolved"),
    waiting:      game.i18n.localize("PMTTRPG.Clash.WaitingForRoll"),
  };
}

function _resultCardI18n(state, applyTarget = null) {
  const dtype = state.damageType || "none";
  const dtypeKey = `PMTTRPG.DamageType${dtype.charAt(0).toUpperCase()}${dtype.slice(1)}`;
  const name = applyTarget?.name || "";
  return {
    attackWin:    game.i18n.localize("PMTTRPG.Clash.AttackWin"),
    defenseWin:   game.i18n.localize("PMTTRPG.Clash.DefenseWin"),
    evadeWin:     game.i18n.localize("PMTTRPG.Clash.EvadeWin"),
    counterWin:   game.i18n.localize("PMTTRPG.Clash.CounterWin"),
    counterOutOfRange: game.i18n.localize("PMTTRPG.Clash.CounterOutOfRange"),
    blockWinRangedExempt: game.i18n.localize("PMTTRPG.Clash.BlockWinRangedExempt"),
    margin:       game.i18n.localize("PMTTRPG.Clash.Margin"),
    hpDamage:     game.i18n.localize("PMTTRPG.Clash.HPDamage"),
    stDamage:     game.i18n.localize("PMTTRPG.Clash.STDamage"),
    stRegen:      game.i18n.localize("PMTTRPG.Clash.STRegen"),
    stDamageToAttacker:     game.i18n.localize("PMTTRPG.Clash.STDamageToAttacker"),
    takeDamage:   game.i18n.localize("PMTTRPG.Clash.TakeDamage"),
    applyRegen:   game.i18n.localize("PMTTRPG.Clash.ApplyRegen"),
    damageApplied:game.i18n.localize("PMTTRPG.Clash.DamageApplied"),
    damageType:   game.i18n.localize(dtypeKey),
    applyTargetLabel: applyTarget
      ? game.i18n.format(
          applyTarget.kind === "heal" ? "PMTTRPG.Clash.Heal" : "PMTTRPG.Clash.ApplyTo",
          { name },
        )
      : "",
    winner: game.i18n.localize("PMTTRPG.Clash.Winner"),
    loser: game.i18n.localize("PMTTRPG.Clash.Loser"),
    applyTargetTitle: applyTarget
      ? game.i18n.format(
          applyTarget.kind === "heal" ? "PMTTRPG.Clash.ApplyHealTo" : "PMTTRPG.Clash.ApplyFullTo",
          { name },
        )
      : "",
    applyFullTitle: game.i18n.localize("PMTTRPG.DamageTaken.ApplyFull"),
    applyHalfTitle: game.i18n.localize("PMTTRPG.DamageTaken.ApplyHalf"),
    applyDoubleTitle: game.i18n.localize("PMTTRPG.DamageTaken.ApplyDouble"),
    applyHealTitle: game.i18n.localize("PMTTRPG.DamageTaken.ApplyHeal"),
  };
}