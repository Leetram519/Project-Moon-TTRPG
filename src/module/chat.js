import {
  DAMAGE_POOLS,
  enhanceDamageTakenCard,
  getActorWeaponDamageType,
  isSelectableDamageType,
} from "./damage-application.js";

import {
  getClashStateFromMessage,
  getClashApplyTarget,
  resolveClashCombatant,
  enhanceClashRollBreakdown,
  emitChatUpdate,
} from "./combat/clash-chat.js";
import { getClashDamageSourceRef } from "./combat/clash-state.js";
import { actorFromSpeaker } from "./acting-user.js";

export const displayChatActionButtons = function(message, html, data) {
  const chatCard = html.querySelector?.(".PMTTRPG.chat-card") ?? null;

  // Sync damage type from flags if the card did not include one.
  const flaggedType = message?.flags?.projectmoonttrpg?.damageType;
  $(html).find(".chat-damage-buttons").each((_, el) => {
    if (!el.dataset.damageType && isSelectableDamageType(flaggedType)) {
      el.dataset.damageType = flaggedType;
      el.querySelectorAll("button.dtype").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.damageType === flaggedType);
      });
    }
  });

  const appliedDamage = message?.flags?.projectmoonttrpg?.appliedDamage;
  if (appliedDamage) {
    const actor = fromUuidSync(appliedDamage.uuid);
    const canRevert = game.user.isGM || actor?.isOwner;
    if (appliedDamage.isReverted || !canRevert || !appliedDamage.updates?.length) {
      $(html).find('button[data-action="revert-damage"]').remove();
    }
    enhanceDamageTakenCard(message, html[0] ?? html);
  }

  const root = html?.[0] ?? html;
  if (root?.querySelector?.(".clash-card")) {
    enhanceClashRollBreakdown(message, root);
  }

  if ( chatCard && chatCard.length > 0 ) {
    // If the user is the message author or the actor owner, proceed.
    let actor = actorFromSpeaker(data.message.speaker);
    // Exit early from further operations if this is a GM user.
    if ( game.user.isGM ) return;
    if ((data.author.id === game.user.id) || ( actor && actor.isOwner )) return;
    // Otherwise conceal action buttons.
    chatCard.find("button[data-action], .button-disabled").each((i, btn) => {
      btn.style.display = "none"
    });
  }

  if (chatCard) {
    const actor = actorFromSpeaker(data.message.speaker);
    if (game.user.isGM) return;
    if (data.author.id === game.user.id || (actor && actor.isOwner)) return;
    chatCard.querySelectorAll("button[data-action], .button-disabled").forEach(btn => {
      btn.style.display = "none";
    });
  }
};

export const activateChatListeners = function(html) {
  const el = html instanceof HTMLElement ? html : html[0] ?? html;
  el.addEventListener("click", _onChatCardAction);
};

function _onChatCardAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;

  if (action === "set-pool") {
    _chatActionSetPool(button, event);
    return;
  }
  if (action === "set-damage-type") {
    _chatActionSetDamageType(button);
    return;
  }

  event.preventDefault();

  const card      = button.closest(".chat-card");
  const messageEl = button.closest(".message");
  const messageId = messageEl?.dataset?.messageId;
  const message   = messageId ? game.messages.get(messageId) : null;

  if (action === "revert-damage") {
    _chatActionRevertDamage(message, button);
    return;
  }

  // Don't also run the normal damage handler
  if (action.startsWith("clash-") && (action.includes("damage") || action.includes("heal"))) {
    _clashActionDamage(message, action, button);
    return;
  }

  // Chat damage.
  if (action.includes("damage") || action === "heal") {
    _chatActionDamage(message, action, button);
    return;
  }

  // All remaining actions require user to be a GM.
  if (!game.user.isGM) return;
}

function _getChatCardActor(card) {
  const tokenKey = card.dataset.tokenId;
  if (tokenKey) {
    const [sceneId, tokenId] = tokenKey.split(".");
    const scene = game.scenes.get(sceneId);
    if (!scene) return null;
    const tokenDoc = scene.tokens.get(tokenId);
    return tokenDoc?.actor ?? null;
  }
  return game.actors.get(card.dataset.actorId) ?? null;
}

function _readSelectedPools(root) {
  const raw = root?.dataset?.pools || root?.dataset?.pool || "hp";
  const pools = String(raw).split(",").map((p) => p.trim()).filter((p) => DAMAGE_POOLS.includes(p));
  return pools.length ? DAMAGE_POOLS.filter((p) => pools.includes(p)) : ["hp"];
}

function _writeSelectedPools(root, pools) {
  const ordered = DAMAGE_POOLS.filter((p) => pools.includes(p));
  const next = ordered.length ? ordered : ["hp"];
  root.dataset.pools = next.join(",");
  root.dataset.pool = next[0];
  root.querySelectorAll("button.pool").forEach((btn) => {
    btn.classList.toggle("active", next.includes(btn.dataset.pool));
  });
}

function _chatActionSetPool(button, event) {
  const root = button.closest(".chat-damage-buttons");
  if (!root) return;
  const pool = button.dataset.pool;
  if (!DAMAGE_POOLS.includes(pool)) return;

  let pools = _readSelectedPools(root);
  if (pools.includes(pool)) {
    if (pools.length > 1) pools = pools.filter((p) => p !== pool);
  } else {
    pools = [...pools, pool];
  }

  _writeSelectedPools(root, pools);
}

function _chatActionSetDamageType(button) {
  const root = button.closest(".chat-damage-buttons");
  if (!root) return;
  const damageType = button.dataset.damageType;
  if (!isSelectableDamageType(damageType)) return;
  root.dataset.damageType = damageType;
  root.querySelectorAll("button.dtype").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.damageType === damageType);
  });
}

async function _chatActionMarkXp(actor, message) {
  if (!actor.system?.attributes?.xp) return;

  const xp = actor.system.attributes.xp.value ?? 0;
  await actor.update({ "system.attributes.xp.value": Number(xp) + 1 });

  if (!message) return;

  const parser  = new DOMParser();
  const doc     = parser.parseFromString(message.content, "text/html");
  const btn     = doc.querySelector(".xp-button");
  if (btn) {
    const span = document.createElement("span");
    span.className   = "xp-button button button-disabled";
    span.textContent = game.i18n.localize("PMTTRPG.XpMarked") + " ";
    const icon = document.createElement("i");
    icon.className = "fas fa-check";
    span.appendChild(icon);
    btn.replaceWith(span);
  }

  const newContent = doc.body.innerHTML;

  if (message.isAuthor || game.user.isGM) {
    await message.update({ content: newContent });
  } else {
    emitChatUpdate(message.id, { content: newContent });
  }
}

function _resolveDamageType(message, root) {
  const fromCard = root?.dataset?.damageType;
  if (isSelectableDamageType(fromCard)) return fromCard;

  const fromFlag = message?.flags?.projectmoonttrpg?.damageType;
  if (isSelectableDamageType(fromFlag)) return fromFlag;

  const speakerActor = actorFromSpeaker(message.speaker);
  return getActorWeaponDamageType(speakerActor) ?? "none";
}

function _controlledTokenActors() {
  return canvas.tokens?.controlled?.map((t) => t.document.actor).filter(Boolean) ?? [];
}

function _resolveDealerSourceItems(actor, ref) {
  if (!actor || !ref) return { attackerItem: null, sourceItems: [] };
  const get = (id) => (id ? actor.items.get(id) ?? null : null);
  const attackerItem = get(ref.itemId);
  const sourceItems = [
    attackerItem,
    get(ref.appliedToolId),
    get(ref.skillId),
    get(ref.ammoId),
  ].filter(Boolean);
  return { attackerItem, sourceItems };
}

async function _clashActionDamage(message, action, button) {
  const state = message?.id ? getClashStateFromMessage(message.id) : null;
  const applyTarget = getClashApplyTarget(state);
  const namedApply = button?.classList?.contains("clash-apply-target");

  let actors;
  if (namedApply) {
    const actor = applyTarget
      ? resolveClashCombatant(applyTarget.actorId, applyTarget.tokenId)
      : null;
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("PMTTRPG.Clash.NoApplyTarget"));
      return;
    }
    actors = [actor];
  } else {
    actors = _controlledTokenActors();
    if (!actors.length) {
      ui.notifications.warn(game.i18n.localize("PMTTRPG.DamageTaken.NoSelectedTokens"));
      return;
    }
  }

  const root = button?.closest?.(".chat-damage-buttons")
    ?? button?.closest?.(".clash-result-card")?.querySelector?.(".chat-damage-buttons");
  const pools = _readSelectedPools(root);
  const damageType = _resolveDamageType(message, root);
  const rollTotal = _resolveClashDamageAmount(state, pools, message);

  const opByAction = {
    "clash-damage": "full",
    "clash-half-damage": "half",
    "clash-double-damage": "double",
    "clash-heal": "heal",
  };
  const op = opByAction[action];
  if (!op) return;

  const sourceRef = op === "heal" ? null : getClashDamageSourceRef(state);
  const attacker = sourceRef
    ? resolveClashCombatant(sourceRef.actorId, sourceRef.tokenId)
    : null;
  const { attackerItem, sourceItems } = _resolveDealerSourceItems(attacker, sourceRef);

  for (const actor of actors) {
    await actor.applyDamage(rollTotal, {
      pool: pools.length === 1 ? pools[0] : pools,
      op,
      damageType,
      attacker,
      attackerItem,
      sourceItems,
      healer: op === "heal" ? actor : undefined,
      fromAttack: op !== "heal",
    });
  }
}

// Use the clash state numbers and only scrape the card if those are missing
function _resolveClashDamageAmount(state, pools, message) {
  if (state) {
    const stOnly = pools.includes("st") && !pools.includes("hp");
    if (stOnly && state.stDamage != null) return Number(state.stDamage) || 0;
    if (state.hpDamage != null) return Number(state.hpDamage) || 0;

    // Evade win heals ST by the defense total.
    if ((state.retaliationType === "evade" || state.retaliationType === "recycledEvade")
      && state.defenseRollTotal != null) {
      return Number(state.defenseRollTotal) || 0;
    }
    // Block win deals ST rebound (stored stDamage, else the clash difference). Ranged attackers are exempt.
    if (state.retaliationType === "block") {
      if (state.blockWinStExempt) return 0;
      if (state.stDamage != null) return Number(state.stDamage) || 0;
      if (state.margin != null) return Number(state.margin) || 0;
    }
  }

  const text = $(message?.content ?? "").find(".clash-damage-line").first().text().trim();
  const match = text.match(/\d+/);
  return Number(match?.[0]) || 0;
}

async function _chatActionDamage(message, action, button) {
  let actors = canvas.tokens.controlled.map(t => t.document.actor).filter(Boolean);
  if (!actors.length) return;

  const root = button?.closest?.(".chat-damage-buttons");
  const pools = _readSelectedPools(root);
  const damageType = _resolveDamageType(message, root);
  let rollTotal = Number($(message.content).find('.dice-total')?.first()?.text()?.trim()) || 0;
  const attacker = actorFromSpeaker(message.speaker);

  const opByAction = {
    damage: "full",
    "half-damage": "half",
    "double-damage": "double",
    heal: "heal",
  };
  const op = opByAction[action];
  if (!op) return;

  for (const actor of actors) {
    await actor.applyDamage(rollTotal, {
      pool: pools.length === 1 ? pools[0] : pools,
      op,
      damageType,
      attacker: op === "heal" ? null : attacker,
      healer: op === "heal" ? attacker : undefined,
      sourceLabel: message.speaker?.alias ?? attacker?.name ?? null,
      fromAttack: op !== "heal",
    });
  }
}

async function _chatActionRevertDamage(message, button) {
  const appliedDamage = message?.flags?.projectmoonttrpg?.appliedDamage;
  if (!appliedDamage || appliedDamage.isReverted) return;

  const actor = fromUuidSync(appliedDamage.uuid);
  if (!(actor instanceof Actor)) return;
  if (!(game.user.isGM || actor.isOwner)) return;

  await actor.undoDamage(appliedDamage);

  const notifyKey = appliedDamage.isHealing
    ? "PMTTRPG.DamageTaken.RevertHealNotify"
    : "PMTTRPG.DamageTaken.RevertNotify";
  ui.notifications.info(game.i18n.format(notifyKey, { name: actor.name }));

  const messageEl = button.closest(".message");
  messageEl?.querySelector(".damage-taken")?.classList.add("reverted");
  messageEl?.querySelector(".statements")?.classList.add("reverted");
  button.remove();

  const contentEl = messageEl?.querySelector(".message-content");
  await message.update({
    "flags.projectmoonttrpg.appliedDamage.isReverted": true,
    content: contentEl?.innerHTML ?? message.content,
  });
}