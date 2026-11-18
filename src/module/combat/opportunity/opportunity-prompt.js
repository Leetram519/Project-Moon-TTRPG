import { canActAs, resolveActingUser, resolveTokenDocument, resolveTokenOrWorldActor } from "../../acting-user.js";
import { emitChatUpdate, flagsToUpdate } from "../clash-chat.js";
import { combatantOf, findCombatant } from "../combatant-match.js";
import { warnUser, actorItem } from "../../shared-helpers.js";
import { resolveOpportunityAttackDecision } from "./opportunity-attack.js";
import {
  applyOpportunityFlagsToSession,
  decideOpportunityAttack,
  decideOpportunityPass,
  forcePassOpportunitiesForRemovedChat,
  forcePassPendingOpportunities,
  getCurrentCheckpoint,
  getOpportunityDecision,
  getOpportunitySession,
  getOpportunitySessionByOpportunityId,
  hydrateOpportunitySessionFromFlags,
  OPPORTUNITY_DECISION_REASONS,
  OPPORTUNITY_DECISION_STATES,
  OPPORTUNITY_FLAG_KEY,
  OPPORTUNITY_FLAG_SCOPE,
  opportunityFlagsOnMessage,
  refreshOpportunityEligibleWeapons,
  serializeOpportunityDecision,
  sessionIsTerminal,
  OPPORTUNITY_DECISIONS,
  OPPORTUNITY_SESSION_STATES,
} from "./opportunity-session.js";

const TEMPLATES = {
  card: "systems/projectmoonttrpg/templates/chat/opportunity-card.hbs",
};

function isOpportunityActingUser({ actor, tokenId, user = game.user } = {}) {
  if (!user || !actor) return false;
  return resolveActingUser(actor, tokenId) === user;
}

/** The prompt goes to one user, but anyone who can act as the reactor (its owners and the GM) can answer it. */
function canAnswerOpportunity({ actor, tokenId, user = game.user } = {}) {
  if (!user || !actor) return false;
  return canActAs(actor, tokenId, user);
}

async function writeOpportunityMessage(message, { content, flags }) {
  const update = { content, ...flagsToUpdate(flags) };
  if (message.isAuthor || game.user.isGM) {
    await message.update(update);
    return;
  }
  emitChatUpdate(message.id, { content, flags });
}

async function renderCardContent(view, flags) {
  return foundry.applications.handlebars.renderTemplate(TEMPLATES.card, {
    ...view,
    flags,
    i18n: {
      title: game.i18n.localize("PMTTRPG.Opportunity.Title"),
      weapon: game.i18n.localize("PMTTRPG.Opportunity.Weapon"),
      attack: game.i18n.localize("PMTTRPG.Opportunity.Attack"),
      pass: game.i18n.localize("PMTTRPG.Opportunity.Pass"),
      passed: game.i18n.localize("PMTTRPG.Opportunity.Passed"),
      awaiting: game.i18n.localize("PMTTRPG.Opportunity.AwaitingAttack"),
      resolving: game.i18n.localize("PMTTRPG.Opportunity.Resolving"),
      committed: game.i18n.localize("PMTTRPG.Opportunity.AttackCommitted"),
      resolvingClash: game.i18n.localize("PMTTRPG.Opportunity.ResolvingClash"),
      resolved: game.i18n.localize("PMTTRPG.Opportunity.Resolved"),
      resolutionError: game.i18n.localize("PMTTRPG.Opportunity.ResolutionError"),
      expired: game.i18n.localize("PMTTRPG.Opportunity.Expired"),
      cancelled: game.i18n.localize("PMTTRPG.Opportunity.Cancelled"),
      forcePass: game.i18n.localize("PMTTRPG.Opportunity.ForcePass"),
    },
  });
}

export async function mirrorOpportunityDecision(session, decision, extras = {}) {
  if (!session || !decision) return null;
  if (!decision.messageId && !extras.messageId) return null;
  return syncOpportunityCard(session, decision, extras);
}

async function syncOpportunityCard(session, decision, extras = {}) {
  const messageId = extras.messageId ?? decision.messageId;
  const message = extras.message ?? (messageId ? game.messages.get(messageId) : null);
  const actor = extras.actor ?? resolveTokenOrWorldActor(decision.reactorActorId, decision.reactorTokenId);
  const flags = {
    [OPPORTUNITY_FLAG_SCOPE]: {
      [OPPORTUNITY_FLAG_KEY]: serializeOpportunityDecision(decision, {
        movementId: session.movementId,
        moverTokenId: session.moverTokenId,
        moverActorId: session.moverActorId,
        moverCombatantId: session.moverCombatantId,
        moverName: session.moverName,
        movementActionId: session.movementActionId ?? null,
        reactorName: decision.reactorName ?? actor?.name ?? null,
        eligibleWeapons: weaponChoices(actor, decision.eligibleWeaponIds),
        messageId,
      }),
    },
  };
  const view = buildOpportunityDecisionView(session, decision, {
    actor,
    canAct: isOpportunityActingUser({ actor, tokenId: decision.reactorTokenId }),
    cancelled: extras.cancelled,
    expired: extras.expired,
  });
  const content = await renderCardContent({
    ...view,
    messageId,
    canForcePass: game.user.isGM && view.pending,
  }, flags[OPPORTUNITY_FLAG_SCOPE][OPPORTUNITY_FLAG_KEY]);
  if (!message) return flags[OPPORTUNITY_FLAG_SCOPE][OPPORTUNITY_FLAG_KEY];
  await writeOpportunityMessage(message, { content, flags });
  return flags[OPPORTUNITY_FLAG_SCOPE][OPPORTUNITY_FLAG_KEY];
}

async function postOpportunityCard(session, decision) {
  const actor = resolveTokenOrWorldActor(decision.reactorActorId, decision.reactorTokenId);
  const payload = serializeOpportunityDecision(decision, {
    movementId: session.movementId,
    moverTokenId: session.moverTokenId,
    moverActorId: session.moverActorId,
    moverCombatantId: session.moverCombatantId,
    moverName: session.moverName,
    reactorName: decision.reactorName ?? actor?.name ?? null,
    eligibleWeapons: weaponChoices(actor, decision.eligibleWeaponIds),
  });
  const view = buildOpportunityDecisionView(session, decision, {
    actor,
    canAct: isOpportunityActingUser({ actor, tokenId: decision.reactorTokenId }),
  });
  const content = await renderCardContent({
    ...view,
    canForcePass: game.user.isGM && view.pending,
  }, payload);
  const message = await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor, token: resolveTokenDocument(decision.reactorTokenId) }),
    flags: { [OPPORTUNITY_FLAG_SCOPE]: { [OPPORTUNITY_FLAG_KEY]: payload } },
  });
  if (!message?.id) return message ?? null;
  decision.messageId = message.id;
  await syncOpportunityCard(session, decision, { actor, message, messageId: message.id });
  return message;
}

function reasonLocalization(reason) {
  switch (reason) {
    case OPPORTUNITY_DECISION_REASONS.INVALID_WEAPON:
    case OPPORTUNITY_DECISION_REASONS.STALE_WEAPON:
      return "PMTTRPG.Opportunity.StaleWeapon";
    case OPPORTUNITY_DECISION_REASONS.REACTION_UNAVAILABLE:
      return "PMTTRPG.Opportunity.ReactionUnavailable";
    case OPPORTUNITY_DECISION_REASONS.NO_AMMO:
      return "PMTTRPG.Opportunity.NoAmmunition";
    case OPPORTUNITY_DECISION_REASONS.MOVER_GONE:
      return "PMTTRPG.Opportunity.MoverUnavailable";
    case OPPORTUNITY_DECISION_REASONS.DECLARATION_FAILED:
      return "PMTTRPG.Opportunity.DeclarationFailed";
    case OPPORTUNITY_DECISION_REASONS.AMMO_CONSUME_FAILED:
    case OPPORTUNITY_DECISION_REASONS.ATTACK_SETUP_FAILED:
      return "PMTTRPG.Opportunity.ResolutionError";
    case OPPORTUNITY_DECISION_REASONS.ALREADY_RESOLVING:
      return "PMTTRPG.Opportunity.AlreadyResolving";
    case OPPORTUNITY_DECISION_REASONS.NOT_PENDING:
      return "PMTTRPG.Opportunity.AlreadyResolved";
    default:
      return "PMTTRPG.Opportunity.AlreadyResolved";
  }
}

export async function handleOpportunityDecision({
  action,
  opportunityId,
  movementId,
  chosenWeaponId,
  messageId,
} = {}) {
  let session = movementId
    ? getOpportunitySession(movementId)
    : getOpportunitySessionByOpportunityId(opportunityId);
  const message = messageId ? game.messages.get(messageId) : null;
  const flags = message?.getFlag(OPPORTUNITY_FLAG_SCOPE, OPPORTUNITY_FLAG_KEY);
  if (!session && flags) {
    if (flags.decision || (flags.state && flags.state !== OPPORTUNITY_DECISION_STATES.PENDING)) {
      warnUser("PMTTRPG.Opportunity.AlreadyResolved");
      return { ok: false, reason: OPPORTUNITY_DECISION_REASONS.NOT_PENDING };
    }
    session = hydrateOpportunitySessionFromFlags(flags);
  }

  const decision = getOpportunityDecision(session, opportunityId);
  if (!decision) {
    warnUser("PMTTRPG.Opportunity.AlreadyResolved");
    return { ok: false, reason: OPPORTUNITY_DECISION_REASONS.NOT_FOUND };
  }

  const actor = resolveTokenOrWorldActor(decision.reactorActorId, decision.reactorTokenId);
  const user = game.user;
  if (!canAnswerOpportunity({ actor, tokenId: decision.reactorTokenId, user })) {
    return { ok: false, reason: "not-acting-user" };
  }

  if (flags?.decision && decision.state === OPPORTUNITY_DECISION_STATES.PENDING) {
    applyOpportunityFlagsToSession(flags);
  }
  if (sessionIsTerminal(session) || decision.state !== OPPORTUNITY_DECISION_STATES.PENDING) {
    warnUser("PMTTRPG.Opportunity.AlreadyResolved");
    return { ok: false, reason: OPPORTUNITY_DECISION_REASONS.NOT_PENDING, decision };
  }

  const combatant = combatantOf(game.combat, decision.reactorCombatantId)
    ?? findCombatant({ combatants: game.combat?.combatants, tokenId: decision.reactorTokenId });

  const result = action === "pass"
    ? decideOpportunityPass(session, opportunityId)
    : decideOpportunityAttack(session, opportunityId, {
      chosenWeaponId,
      actor,
      combatant,
      combat: game.combat ?? null,
      reactorTokenId: decision.reactorTokenId,
      reactorActorId: decision.reactorActorId,
      reactorCombatantId: decision.reactorCombatantId,
    });

  if (!result.ok) {
    if (result.reason === OPPORTUNITY_DECISION_REASONS.STALE_WEAPON
      || result.reason === OPPORTUNITY_DECISION_REASONS.REACTION_UNAVAILABLE) {
      refreshOpportunityEligibleWeapons(session, opportunityId, {
        actor,
        combatant,
        combat: game.combat ?? null,
      });
    }
    warnUser(reasonLocalization(result.reason));
    if (decision.messageId || messageId) {
      await syncOpportunityCard(session, decision, { actor, messageId: decision.messageId || messageId });
    }
    return result;
  }

  await syncOpportunityCard(session, result.decision, {
    actor,
    messageId: result.decision.messageId || messageId,
  });

  if (action === "attack") {
    const resolved = await resolveOpportunityAttackDecision(session, opportunityId);
    if (!resolved.ok) warnUser(reasonLocalization(resolved.reason));
    await syncOpportunityCard(session, result.decision, {
      actor,
      messageId: result.decision.messageId || messageId,
    });
    return resolved.ok ? { ...result, ...resolved } : resolved;
  }

  return result;
}

export async function presentOpportunitySession(session) {
  if (!session) return null;
  const checkpoint = getCurrentCheckpoint(session);
  if (!checkpoint) return session;

  for (const decision of checkpoint.opportunities) {
    if (decision.messageId) continue;
    await postOpportunityCard(session, decision);
  }

  return session;
}

export async function expireOpportunityPromptSurface(session, extras = {}) {
  if (!session) return;
  for (const decision of session.decisions ?? []) {
    if (!decision.messageId) continue;
    try {
      await syncOpportunityCard(session, decision, extras);
    } catch (error) {
      console.warn("[PMTTRPG] expired card sync failed", error);
    }
  }
}

export async function handleOpportunityForcePass({ movementId, messageId } = {}) {
  if (!game.user.isGM) return { ok: false, reason: "not-gm" };
  let session = movementId ? getOpportunitySession(movementId) : null;
  const message = messageId ? game.messages.get(messageId) : null;
  const flags = message?.getFlag(OPPORTUNITY_FLAG_SCOPE, OPPORTUNITY_FLAG_KEY);
  if (!session && flags?.movementId) session = getOpportunitySession(flags.movementId);
  if (!session) return { ok: false, reason: OPPORTUNITY_DECISION_REASONS.NOT_FOUND };

  const result = forcePassPendingOpportunities(session);
  for (const decision of getCurrentCheckpoint(session)?.opportunities ?? []) {
    if (decision.messageId) {
      await syncOpportunityCard(session, decision, { messageId: decision.messageId });
    }
  }
  return result;
}

function enhanceOpportunityCard(message, html) {
  const flags = opportunityFlagsOnMessage(message);
  if (!flags) return;
  const actor = resolveTokenOrWorldActor(flags.reactorActorId, flags.reactorTokenId);
  const session = flags.movementId ? getOpportunitySession(flags.movementId) : null;
  const actionable = canAnswerOpportunity({ actor, tokenId: flags.reactorTokenId })
    && opportunityCardControlsEnabled(flags, session);
  for (const button of html.querySelectorAll("[data-action='opportunity-attack'], [data-action='opportunity-pass']")) {
    button.disabled = !actionable;
    button.hidden = !actionable;
  }
  for (const line of html.querySelectorAll("[data-opportunity-waiting]")) line.hidden = actionable;
  for (const button of html.querySelectorAll("[data-action='opportunity-force-pass']")) {
    const show = game.user.isGM && flags.state === OPPORTUNITY_DECISION_STATES.PENDING;
    button.disabled = !show;
    button.hidden = !show;
  }
}

async function opportunityChatClick(event) {
  const button = event.target.closest("[data-action^='opportunity-']");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();

  if (button.dataset.action === "opportunity-force-pass") {
    await handleOpportunityForcePass({
      movementId: button.dataset.movementId,
      messageId: button.dataset.messageId,
    });
    return;
  }
  const action = button.dataset.action === "opportunity-pass" ? "pass" : "attack";
  // The Attack and Pass buttons have data-opportunity-id too, so we find the
  // card by its class (otherwise we'd get the button and miss the weapon select).
  const card = button.closest(".pmttrpg-opportunity-card");
  const select = card?.querySelector("select[name='weapon']");
  await handleOpportunityDecision({
    action,
    opportunityId: button.dataset.opportunityId ?? card?.dataset.opportunityId,
    movementId: button.dataset.movementId ?? card?.dataset.movementId,
    messageId: button.dataset.messageId,
    chosenWeaponId: select?.value || button.dataset.weaponId || card?.dataset.weaponId || null,
  });
}

async function refreshForcePassedCards(session) {
  const checkpoint = getCurrentCheckpoint(session);
  for (const decision of checkpoint?.opportunities ?? []) {
    if (!decision.messageId) continue;
    if (!game.messages.get(decision.messageId)) continue;
    try {
      await syncOpportunityCard(session, decision, { messageId: decision.messageId });
    } catch (error) {
      console.warn("[PMTTRPG] force-pass card sync failed", error);
    }
  }
}

function releaseOpportunitiesForRemovedChat(message, options = {}) {
  const results = forcePassOpportunitiesForRemovedChat(message, options);
  for (const result of results) {
    if (result?.session) void refreshForcePassedCards(result.session);
  }
  return results;
}

export function registerOpportunityPromptListeners() {
  Hooks.once("ready", () => {
    document.body.addEventListener("click", opportunityChatClick);
  });
  Hooks.on("deleteChatMessage", (message, options) => {
    releaseOpportunitiesForRemovedChat(message, options);
  });
  Hooks.on("updateChatMessage", (message) => {
    const flags = opportunityFlagsOnMessage(message);
    if (flags) applyOpportunityFlagsToSession(flags);
  });
  Hooks.on("renderChatMessageHTML", enhanceOpportunityCard);
}

function weaponChoices(actor, eligibleWeaponIds) {
  return (eligibleWeaponIds ?? []).map((id) => {
    const weapon = actorItem(actor, id);
    return { id, name: weapon?.name ?? id };
  });
}

function opportunityCardControlsEnabled(flags, session) {
  if (sessionIsTerminal(session)) return false;
  if (!flags) return false;
  if (flags.decision) return false;
  return flags.state === OPPORTUNITY_DECISION_STATES.PENDING;
}

function buildOpportunityDecisionView(session, decision, extras = {}) {
  const actor = extras.actor;
  const canAct = extras.canAct;
  const weapons = extras.weapons ?? weaponChoices(actor, decision.eligibleWeaponIds);
  const cancelled = extras.cancelled === true
    || session?.state === OPPORTUNITY_SESSION_STATES.CANCELLED;
  const terminal = sessionIsTerminal(session) || cancelled || extras.expired === true;
  const pending = decision.state === OPPORTUNITY_DECISION_STATES.PENDING && !terminal;
  return {
    opportunityId: decision.opportunityId,
    movementId: session.movementId,
    reactorName: decision.reactorName ?? actor?.name ?? "",
    moverName: session.moverName ?? "",
    leavingText: game.i18n.format("PMTTRPG.Opportunity.LeavingReach", {
      mover: session.moverName ?? "",
    }),
    waitingText: game.i18n.localize("PMTTRPG.Opportunity.Waiting"),
    weapons,
    singleWeapon: weapons.length === 1 ? weapons[0] : null,
    pending,
    passed: !cancelled && decision.decision === OPPORTUNITY_DECISIONS.PASS
      && decision.state === OPPORTUNITY_DECISION_STATES.RESOLVED,
    cancelled,
    expired: !cancelled && (
      decision.decision === OPPORTUNITY_DECISIONS.EXPIRED
      || (terminal && decision.state === OPPORTUNITY_DECISION_STATES.PENDING)
    ),
    awaiting: decision.state === OPPORTUNITY_DECISION_STATES.AWAITING_ATTACK_RESOLUTION,
    resolving: decision.state === OPPORTUNITY_DECISION_STATES.RESOLVING_ATTACK,
    committed: decision.state === OPPORTUNITY_DECISION_STATES.ATTACK_COMMITTED,
    resolvedAttack: decision.decision === OPPORTUNITY_DECISIONS.ATTACK
      && decision.state === OPPORTUNITY_DECISION_STATES.RESOLVED,
    resolutionError: decision.state === OPPORTUNITY_DECISION_STATES.RESOLUTION_ERROR,
    canAct: !!canAct && pending,
    messageId: decision.messageId,
  };
}
