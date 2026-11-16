import { ACTION_DEFINITIONS } from "./catalog.js";
import { registerActionDeclarationProcessor } from "./declare.js";
import { ACTION_KINDS, ECONOMY_TYPES, actionEconomyApplies } from "./kinds.js";
import { optionalString } from "../shared-helpers.js";

const SYSTEM_ID = "projectmoonttrpg";

const ACTION_FEEDBACK_PROCESSOR_ID = "action-feedback";
const ACTION_FEEDBACK_PROCESSOR_ORDER = 2000;
const ACTION_FEEDBACK_TEMPLATE = "systems/projectmoonttrpg/templates/chat/action-feedback.hbs";
const ACTION_FEEDBACK_FLAG = "actionFeedback";
const ACTION_FEEDBACK_FLOAT_SETTING = "showActionFeedbackFloatingText";

const FEEDBACK_MODES = {
  CHAT: "chat",
  SILENT: "silent",
};

const CHAT = FEEDBACK_MODES.CHAT;
const SILENT = FEEDBACK_MODES.SILENT;

const ACTION_FEEDBACK_POLICY = {
  [ACTION_KINDS.ATTACK]: SILENT,
  [ACTION_KINDS.BLOCK]: SILENT,
  [ACTION_KINDS.EVADE]: SILENT,
  [ACTION_KINDS.COUNTER]: SILENT,
  [ACTION_KINDS.RECYCLED_EVADE]: SILENT,
  [ACTION_KINDS.OPPORTUNITY_ATTACK]: SILENT,
  [ACTION_KINDS.TOOL]: SILENT,
  [ACTION_KINDS.CHANGE_WEAPON]: CHAT,
  [ACTION_KINDS.CHANGE_OUTFIT]: CHAT,
  [ACTION_KINDS.DASH]: CHAT,
  [ACTION_KINDS.DISENGAGE]: CHAT,
  [ACTION_KINDS.REDUCE_STATUS]: CHAT,
  [ACTION_KINDS.CONVERT_TO_REACTIONS]: CHAT,
  [ACTION_KINDS.ASSIST]: CHAT,
  [ACTION_KINDS.MANUAL]: CHAT,
  [ACTION_KINDS.DELAY]: CHAT,
  [ACTION_KINDS.GRAPPLE]: CHAT,
  [ACTION_KINDS.BREAK_FREE]: CHAT,
  [ACTION_KINDS.THROW]: CHAT,
  [ACTION_KINDS.PROTECT]: CHAT,
  [ACTION_KINDS.READY]: CHAT,
  [ACTION_KINDS.TAKE_COVER]: CHAT,
  [ACTION_KINDS.CUSTOM]: CHAT,
};

const emittedDeclarationIds = new Set();
let floatHookRegistered = false;

function actionFeedbackMode(kind) {
  if (Object.prototype.hasOwnProperty.call(ACTION_FEEDBACK_POLICY, kind)) {
    return ACTION_FEEDBACK_POLICY[kind];
  }
  console.warn(`[PMTTRPG] no action feedback policy for kind '${kind}'; staying silent`);
  return FEEDBACK_MODES.SILENT;
}

function economyNotes(declaration) {
  const notes = [];
  if (declaration?.consumed === false && Number(declaration.skippedCost) > 0) {
    const inCombat = actionEconomyApplies(declaration.combat, declaration.combatant);
    notes.push(game.i18n.localize(inCombat ? "PMTTRPG.ActionFeedback.NotConsumed" : "PMTTRPG.ActionFeedback.OutOfCombat"));
  }
  if (declaration?.timing?.offTurn === true) {
    const source = optionalString(declaration.timing.source);
    notes.push(source
      ? game.i18n.format("PMTTRPG.ActionFeedback.OffTurnSource", { source })
      : game.i18n.localize("PMTTRPG.ActionFeedback.OffTurn"));
  }
  return notes;
}

function catalogLabelKeyForKind(kind) {
  const matches = ACTION_DEFINITIONS.filter((entry) => entry.kind === kind && entry.labelKey);
  if (matches.length !== 1) return null;
  return matches[0].labelKey;
}

function actionFeedbackLabelKey(declaration) {
  // kinds with several menu rows (or a declaration that needs its own label) set
  // the key in metadata
  const override = optionalString(declaration?.metadata?.feedbackLabelKey);
  if (override && /^PMTTRPG\./.test(override)) return override;
  if (declaration?.kind === ACTION_KINDS.MANUAL) {
    // a Used Action off turn paid a Reaction but it's still the Used Action button
    const usedReaction = declaration.economyType === ECONOMY_TYPES.REACTION && declaration.timing?.asReaction !== true;
    return usedReaction ? "PMTTRPG.UsedReaction" : "PMTTRPG.UsedAction";
  }
  return catalogLabelKeyForKind(declaration?.kind);
}

function economyLabelKey(economyType) {
  if (economyType === ECONOMY_TYPES.ACTION) return "PMTTRPG.ActionFeedback.Action";
  if (economyType === ECONOMY_TYPES.REACTION) return "PMTTRPG.ActionFeedback.Reaction";
  return null;
}

// The same actor can come in as two objects (like a token's actor and the world actor), and
// another unlinked token of that actor has the same id, so the tokens decide.
function isSelfTarget(declaration) {
  const actor = declaration?.actor;
  const target = declaration?.target;
  if (!actor || !target) return false;
  if (target === actor) return true;
  if (!target.id || target.id !== actor.id) return false;
  const targetTokenId = optionalString(target.token?.id) ?? optionalString(declaration.metadata?.targetTokenId);
  const tokenId = optionalString(declaration.tokenId) ?? optionalString(actor.token?.id);
  return !targetTokenId || !tokenId || targetTokenId === tokenId;
}

function targetDisplayName(declaration) {
  if (isSelfTarget(declaration)) return null;
  // a token's own name, like the message header uses
  const name = declaration?.target?.token?.name ?? declaration?.target?.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function feedbackDetail(metadata) {
  const raw = optionalString(metadata?.feedbackDetail);
  if (!raw) return null;
  // collapses whitespace but keeps non-breaking spaces
  const text = raw.replace(/<[^>]*>/g, " ").replace(/[<>]/g, "").replace(/[^\S\u00a0]+/g, " ").trim();
  return text.slice(0, 200) || null;
}

function metadataId(metadata, key) {
  return optionalString(metadata?.[key]);
}

// `declared: false` means a feature event that spent nothing (like Delay)
function buildActionFeedback(declaration, { declared = true } = {}) {
  if (!declaration?.id || !declaration.kind) return null;
  if (actionFeedbackMode(declaration.kind) !== FEEDBACK_MODES.CHAT) return null;
  // routine stuff (like a paid upkeep) can opt out per declaration
  if (declaration.metadata?.feedbackSilent === true) return null;

  // provided Actions don't have a catalog label key (their text is already resolved)
  const customLabel = declaration.kind === ACTION_KINDS.CUSTOM
    ? optionalString(declaration.metadata?.customActionLabel)
    : null;
  const labelKey = customLabel ? null : actionFeedbackLabelKey(declaration);
  const economyKey = economyLabelKey(declaration.economyType);
  const economyRequired = declared || declaration.economyType != null;
  if ((!labelKey && !customLabel) || (economyRequired && !economyKey)) {
    console.warn("[PMTTRPG] skipped action feedback; missing label", {
      id: declaration.id,
      kind: declaration.kind,
      economyType: declaration.economyType,
    });
    return null;
  }

  const actionLabel = customLabel ?? game.i18n.localize(labelKey);
  const free = declared && declaration.consumed !== false && Number(declaration.cost) === 0;
  const economyLabel = economyKey ? game.i18n.localize(free ? "PMTTRPG.ActionFeedback.Free" : economyKey) : null;
  if (!actionLabel || (economyKey && !economyLabel)) return null;

  const metadata = declaration.metadata ?? {};
  return {
    view: {
      actionLabel,
      economyLabel,
      targetName: targetDisplayName(declaration),
      detail: feedbackDetail(metadata),
      notes: economyNotes(declaration),
    },
    flag: {
      version: 1,
      declarationId: declared ? String(declaration.id) : null,
      eventId: declared ? null : String(declaration.id),
      kind: declaration.kind,
      economyType: declaration.economyType ?? null,
      actorId: optionalString(declaration.actorId),
      tokenId: optionalString(declaration.tokenId),
      combatantId: optionalString(declaration.combatantId),
      targetActorId: optionalString(declaration.targetActorId),
      targetTokenId: metadataId(metadata, "targetTokenId"),
      targetCombatantId: metadataId(metadata, "targetCombatantId"),
      itemId: optionalString(declaration.itemId),
      ...(declaration.consumed === false ? { consumed: false } : {}),
      ...(free ? { free: true } : {}),
      ...(declaration.timing?.offTurn === true ? { offTurn: true } : {}),
      ...(declaration.timing?.asReaction === true ? { asReaction: true } : {}),
      ...(customLabel ? { customActionLabel: customLabel } : {}),
      ...(labelKey && labelKey === optionalString(metadata.feedbackLabelKey) ? { feedbackLabelKey: labelKey } : {}),
    },
  };
}

function actionFeedbackSpeaker(declaration) {
  const actor = declaration?.actor ?? null;
  const tokenId = optionalString(declaration?.tokenId);
  const token = tokenId ? canvas.tokens?.get(tokenId)?.document ?? null : null;
  return ChatMessage.getSpeaker(token ? { actor, token } : { actor });
}

async function createFeedbackMessage(built) {
  const content = await foundry.applications.handlebars.renderTemplate(ACTION_FEEDBACK_TEMPLATE, built.view);
  return ChatMessage.create({
    user: game.user.id,
    speaker: built.speaker,
    content,
    flags: { projectmoonttrpg: { [ACTION_FEEDBACK_FLAG]: built.flag } },
  });
}

async function emitActionFeedback(declaration) {
  return postFeedback(declaration, true);
}

/** For a feature event that isn't a declaration (like a Delay commit). Only post it after your change is committed. */
export async function postActionFeedbackEvent(event) {
  return postFeedback(event, false);
}

export function combatantFeedbackEvent(combatant, { tokenId = null, ...fields } = {}) {
  return {
    ...fields,
    economyType: null,
    actor: combatant.actor ?? null,
    actorId: combatant.actorId ?? combatant.actor?.id ?? null,
    tokenId: tokenId ?? combatant.tokenId ?? null,
    combatantId: combatant.id ?? null,
  };
}

async function postFeedback(record, declared) {
  const id = optionalString(record?.id);
  if (!id || emittedDeclarationIds.has(id)) return false;
  emittedDeclarationIds.add(id);
  const built = buildActionFeedback(record, { declared });
  if (!built) {
    emittedDeclarationIds.delete(id);
    return false;
  }

  try {
    built.speaker = actionFeedbackSpeaker(record);
    await createFeedbackMessage(built);
  } catch (error) {
    emittedDeclarationIds.delete(id);
    console.warn("[PMTTRPG] action feedback chat message failed", error);
    return false;
  }
  return true;
}

export function registerActionFeedback() {
  registerActionDeclarationProcessor({
    id: ACTION_FEEDBACK_PROCESSOR_ID,
    order: ACTION_FEEDBACK_PROCESSOR_ORDER,
    fn: (declaration) => emitActionFeedback(declaration),
  });
}

function actionFeedbackFloatDecision({ feedback, settingEnabled, token } = {}) {
  if (!feedback || feedback.version !== 1) return null;
  if (settingEnabled !== true) return null;
  const tokenId = optionalString(feedback.tokenId);
  if (!tokenId || !token) return null;
  if (token.isVisible === false) return null;
  const seen = optionalString(token.id);
  if (seen !== tokenId) return null;
  return { tokenId };
}

function actionFeedbackFloatText(feedback) {
  if (feedback?.kind === ACTION_KINDS.CUSTOM) return optionalString(feedback.customActionLabel);
  const key = actionFeedbackLabelKey({
    kind: feedback?.kind,
    economyType: feedback?.economyType,
    timing: { asReaction: feedback?.asReaction === true },
    metadata: { feedbackLabelKey: feedback?.feedbackLabelKey ?? null },
  });
  if (!key) return null;
  const text = game.i18n.localize(key);
  return text || null;
}

function maybeShowActionFeedbackFloat(message, { settingEnabled = false } = {}) {
  const feedback = message?.flags?.projectmoonttrpg?.[ACTION_FEEDBACK_FLAG] ?? null;
  const tokenId = optionalString(feedback?.tokenId);
  const token = tokenId ? canvas.tokens?.get(tokenId) ?? null : null;
  if (!actionFeedbackFloatDecision({ feedback, settingEnabled, token })) return false;
  const text = actionFeedbackFloatText(feedback);
  if (!text) return false;
  showFloatingLabel(token, text);
  return true;
}

function showFloatingLabel(token, text) {
  canvas.interface.createScrollingText(token.center, text, {
    anchor: CONST.TEXT_ANCHOR_POINTS.CENTER,
    direction: CONST.TEXT_ANCHOR_POINTS.TOP,
    fontSize: 28,
    fill: 0xf4ead2,
    stroke: 0x141414,
    strokeThickness: 4,
    duration: 2500,
  });
}

export function registerActionFeedbackFloatingText() {
  if (floatHookRegistered) return;
  floatHookRegistered = true;
  Hooks.on("createChatMessage", (message) => {
    try {
      maybeShowActionFeedbackFloat(message, {
        settingEnabled: game.settings.get(SYSTEM_ID, ACTION_FEEDBACK_FLOAT_SETTING) === true,
      });
    } catch (error) {
      console.warn("[PMTTRPG] action feedback floating text failed", error);
    }
  });
}

export function registerActionFeedbackSettings() {
  game.settings.register(SYSTEM_ID, ACTION_FEEDBACK_FLOAT_SETTING, {
    name: "PMTTRPG.Settings.showActionFeedbackFloatingText.name",
    hint: "PMTTRPG.Settings.showActionFeedbackFloatingText.hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });
}
