import { PMTTRPGUtility } from "./utility.js";
import { showWeaponRange, hideWeaponRange } from './canvas/token.js';

const { renderTemplate } = foundry.applications.handlebars;

function getInitiativeMisc(actor, miscType) {
  return Number(foundry.utils.getProperty(actor, `flags.projectmoonttrpg.initiative.${miscType}`) ?? 0) || 0;
}

function computeInitiativeFormulaParts(actor, { macroMisc = null, manualMisc = null } = {}) {
  const speedBonus = Number.isFinite(Number(actor.system.attributes.speed.bonus)) ? Number(actor.system.attributes.speed.bonus) : 0;
  const resolvedMacroMisc = Number.isFinite(Number(macroMisc)) ? Number(macroMisc) : getInitiativeMisc(actor, 'macroMisc');
  const resolvedManualMisc = Number.isFinite(Number(manualMisc)) ? Number(manualMisc) : getInitiativeMisc(actor, 'manualMisc');

  return {
    speedBonus,
    macroMisc: resolvedMacroMisc,
    manualMisc: resolvedManualMisc,
    formula: `1d6${speedBonus >= 0 ? `+${speedBonus}` : speedBonus}${resolvedMacroMisc >= 0 ? `+${resolvedMacroMisc}` : resolvedMacroMisc}${resolvedManualMisc >= 0 ? `+${resolvedManualMisc}` : resolvedManualMisc}`,
  };
}

async function applyInitiativeMisc(actor, { macroMisc = null, manualMisc = null } = {}) {
  if (!actor) return null;

  const updates = {};
  if (macroMisc !== null && macroMisc !== undefined) {
    updates['flags.projectmoonttrpg.initiative.macroMisc'] = Number(macroMisc) || 0;
  }
  if (manualMisc !== null && manualMisc !== undefined) {
    updates['flags.projectmoonttrpg.initiative.manualMisc'] = Number(manualMisc) || 0;
  }

  if (Object.keys(updates).length) {
    await actor.update(updates);
  }

  return actor;
}

function getCombatants(combat = game.combat) {
  if (!combat) return [];

  if (Array.isArray(combat.turns) && combat.turns.length) {
    return combat.turns;
  }

  const combatants = combat.combatants;
  if (!combatants) return [];

  if (Array.isArray(combatants)) {
    return combatants;
  }

  if (typeof combatants.values === 'function') {
    return Array.from(combatants.values());
  }

  return Array.from(combatants);
}

function getCombatantImage(combatant) {
  // combatant.token is the TokenDocument — no tokenDocument alias exists
  return combatant?.token?.texture?.src
    ?? combatant?.actor?.img
    ?? 'icons/svg/mystery-man.svg';
}

function getCombatantInitiative(combatant) {
  const initiative = Number(combatant?.initiative ?? NaN);
  return Number.isFinite(initiative) ? initiative : null;
}

function isCombatantVisible(combatant) {
  if (game.user.isGM || combatant?.isOwner) return true;

  // combatant.token is the TokenDocument
  const token = combatant?.token ?? null;
  if (!token) return true;

  return !token.hidden;
}

function resolveSelfTokenDocument(actor, tokenDocument = null) {
  if (tokenDocument) return tokenDocument;

  if (actor?.token) return actor.token;

  const sceneToken = canvas.scene?.tokens.find(t => t.actor === actor) ?? null;
  if (sceneToken) return sceneToken;

  return actor?.getActiveTokens(false, true)[0] ?? null;
}

function buildCombatantTarget(combatant, { actorId = null, selfTokenDocument = null, weaponRange = 1 } = {}) {
  // Always derive actor from token to handle unlinked tokens correctly
  const { token, actor } = PMTTRPGUtility.resolveTokenAndActor(combatant);

  if (!actor) return null;

  const initiative = getCombatantInitiative(combatant);

  return {
    combatant,
    combatantId: combatant.id ?? null,
    actor,
    actorId: actor.id ?? null,
    token,
    tokenId: combatant.tokenId ?? null,
    name: combatant.name ?? actor.name ?? '',
    img: getCombatantImage(combatant),
    initiative,
    initiativeLabel: initiative ?? '-',
    isCurrent: game.combat?.combatant?.id === combatant.id,
    // Compare by tokenId first (unlinked-safe), fall back to actorId
    isSelf: selfTokenDocument
      ? combatant.tokenId === selfTokenDocument.id
      : (actorId ? actor.id === actorId : false),
    outOfRange: selfTokenDocument
      ? PMTTRPGUtility.isTargetInWeaponRange(selfTokenDocument.id, combatant.tokenId, { weaponRange })
      : false,
  };
}

export function getCombatantTargetOptions({
  combat = game.combat,
  actorId = null,
  tokenId = null,
  selfTokenDocument = null,
  weaponRange = null,
  includeHidden = false,
} = {}) {
  return getCombatants(combat)
    .filter(combatant => Boolean(combatant?.actor))
    .filter(combatant => includeHidden || isCombatantVisible(combatant))
    .map(combatant => buildCombatantTarget(combatant, { actorId, selfTokenDocument, weaponRange }))
    .filter(Boolean);
}

export function resolveCombatantTarget(combatantId, {
  combat = game.combat,
  actorId = null,
  selfTokenDocument = null,
  weaponRange = null,
} = {}) {
  if (!combatantId) return null;
  const combatant = getCombatants(combat).find(entry => entry.id === combatantId) ?? null;
  return combatant ? buildCombatantTarget(combatant, { actorId, selfTokenDocument, weaponRange }) : null;
}

function getUserTargetedTokens() {
  return Array.from(game.user?.targets ?? []).filter(token => token?.actor);
}

function getTokenId(token) {
  return token?.id ?? token?.document?.id ?? null;
}

function resolveCombatantForToken(token, combat = game.combat) {
  if (!token || !combat) return null;

  const tokenId = getTokenId(token);

  const direct = token.combatant ?? token.document?.combatant ?? null;
  if (direct) return direct;

  if (tokenId) {
    const byTokenId = getCombatants(combat).find(
      entry => (entry.tokenId ?? entry.token?.id) === tokenId
    ) ?? null;
    if (byTokenId) return byTokenId;
  }

  return null;
}

function buildTargetFromToken(token, { actorId = null, selfTokenDocument = null, combat = game.combat, weaponRange = 1 } = {}) {
  if (!token?.actor) return null;

  const combatant = resolveCombatantForToken(token, combat);
  if (combatant) return buildCombatantTarget(combatant, { actorId, selfTokenDocument, weaponRange });

  const actor = token.actor;
  const tokenDoc = token.document ?? token;
  const tokenId = getTokenId(token);

  return {
    combatant: null,
    combatantId: null,
    actor,
    actorId: actor.id ?? null,
    token: tokenDoc,
    tokenId,
    name: token.name ?? actor.name ?? '',
    img: tokenDoc?.texture?.src ?? actor.img ?? 'icons/svg/mystery-man.svg',
    initiative: null,
    initiativeLabel: '-',
    isCurrent: false,
    isSelf: selfTokenDocument ? tokenId === selfTokenDocument.id : (actorId ? actor.id === actorId : false),
    outOfRange: selfTokenDocument
      ? PMTTRPGUtility.isTargetInWeaponRange(selfTokenDocument.id, tokenId, { weaponRange })
      : false,
  };
}

function getUserTargetCombatantIds(options = [], combat = game.combat) {
  const optionIds = new Set(options.map(option => option.combatantId).filter(Boolean));
  return getUserTargetedTokens()
    .map(token => resolveCombatantForToken(token, combat)?.id ?? null)
    .filter(id => id && optionIds.has(id));
}

function getSelectedCombatantId(options = [], preferredCombatantId = null, combat = game.combat) {
  if (preferredCombatantId && options.some(option => option.combatantId === preferredCombatantId)) {
    return preferredCombatantId;
  }

  const targetedIds = getUserTargetCombatantIds(options, combat);
  if (targetedIds.length) return targetedIds[0];

  return options[0]?.combatantId ?? null;
}

export async function promptTargetSelection({
  actor = null,
  token = null,
  combat = game.combat,
  title = game.i18n.localize('PMTTRPG.Dialog.targetingTitle'),
  hint = game.i18n.localize('PMTTRPG.Dialog.chooseTargetHint'),
  sourceName = '',
  sourceImg = '',
  weaponRange = 1,
  allowNone = false,
  includeHidden = false,
  preferredCombatantId = null,
} = {}) {
  const selfTokenDocument = resolveSelfTokenDocument(actor, token?.document ?? token ?? null);

  const options = getCombatantTargetOptions({
    combat,
    actorId: actor?.id ?? null,
    selfTokenDocument,
    weaponRange,
    includeHidden,
  });

  const targetedTokens = getUserTargetedTokens();

  if (targetedTokens.length === 1) {
    return buildTargetFromToken(targetedTokens[0], {
      actorId: actor?.id ?? null,
      selfTokenDocument,
      combat,
      weaponRange,
    });
  }

  if (!options.length) return undefined;

  if (selfTokenDocument) {
    showWeaponRange(selfTokenDocument.id, weaponRange);
  }

  const selectedCombatantId = getSelectedCombatantId(options, preferredCombatantId, combat);
  const dialogData = {
    title,
    hint,
    source: {
      name: sourceName,
      img: sourceImg,
    },
    options: options.map(option => ({
      ...option,
      isDefault: option.combatantId === selectedCombatantId,
    })),
    selectedCombatantId,
    allowNone,
  };

  const html = await renderTemplate('systems/projectmoonttrpg/templates/dialog/target-roll-dialog.html', dialogData);
  const dlgOptions = {
    classes: ['projectmoonttrpg', 'PMTTRPG-dialog']
  };

  if (PMTTRPGUtility.nightmode) dlgOptions.classes.push('nightmode');

  const buttons = [{
    action: 'select',
    label: game.i18n.localize('PMTTRPG.Dialog.selectTarget'),
    default: true,
    callback: (event, button, dialog) => {
      const form = dialog.element.querySelector('form');
      const combatantId = form.combatantId?.value ?? selectedCombatantId;
      if (selfTokenDocument) hideWeaponRange(selfTokenDocument.id);
      return resolveCombatantTarget(combatantId, {
        combat,
        actorId: actor?.id ?? null,
        selfTokenDocument,
        weaponRange,
      });
    }
  }, {
    action: 'cancel',
    label: game.i18n.localize('PMTTRPG.Dialog.cancel'),
    callback: () => {
      if (selfTokenDocument) hideWeaponRange(selfTokenDocument.id);
    }
  }];

  if (allowNone) {
    buttons.push({
      action: 'none',
      label: game.i18n.localize('PMTTRPG.Dialog.noTarget'),
      callback: () => {
        if (selfTokenDocument) hideWeaponRange(selfTokenDocument.id);
      }
    });
  }

  return foundry.applications.api.DialogV2.wait({
    window: { title },
    classes: dlgOptions.classes,
    content: html,
    buttons,
    rejectClose: false,
    close: () => {
      if (selfTokenDocument) hideWeaponRange(selfTokenDocument.id);
    }
  });
}

export async function rollInitiative(actor, { macroMisc = null, manualMisc = null } = {}) {
  if (!actor) return false;

  const parts = computeInitiativeFormulaParts(actor, { macroMisc, manualMisc });
  const roll = await (new Roll(parts.formula, actor.getRollData())).evaluate();
  const rollPMTTRPG = await roll.render();

  const templateData = {
    actor,
    title: game.i18n.localize('PMTTRPG.InitiativeRoll'),
    flavor: game.i18n.localize('PMTTRPG.InitiativeRollHint'),
    details: game.i18n.format('PMTTRPG.InitiativeFormula', { formula: parts.formula }),
    resultLabel: game.i18n.localize('PMTTRPG.Initiative'),
    resultDetails: game.i18n.format('PMTTRPG.InitiativeFormula', { formula: parts.formula }),
    rollType: 'initiative',
    rollPMTTRPG,
    roll,
  };

  const chatData = {
    author: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content: await renderTemplate('systems/projectmoonttrpg/templates/chat/chat-move.html', templateData),
  };

  let rollMode = "publicroll";
  switch(game.release.generation) {
    case 13:
      rollMode = game.settings.get("core", "rollMode");
      break;
    default:
      rollMode = game.settings.get("core", "messageMode");
      break;
  }

  if (["gm", "blind"].includes(rollMode)) chatData.whisper = ChatMessage.getWhisperRecipients('GM');
  if (rollMode === 'self') chatData.whisper = [game.user.id];
  if (rollMode === 'blind') chatData.blind = true;

  await ChatMessage.create(chatData);

  const combat = game.combat;
  if (combat) {
    const tokenId = actor.token?.id ?? null;
    const combatant = tokenId
      ? combat.combatants.find(entry => entry.tokenId === tokenId)
      : combat.combatants.find(entry => entry.actorId === actor.id && !entry.token?.actorLink === false) ?? null;

    if (combatant) {
      await combatant.update({ initiative: roll.total });
    }
  }

  return roll;
}

export function buildAttackContextPayload({ actor = null, item = null, roll = null, templateData = {}, target = null } = {}) {
  const payload = {
    actor,
    actorId: actor?.id ?? null,
    item,
    itemId: item?.id ?? null,
    roll,
    templateData,
  };

  if (!target) return payload;

  payload.target = target;
  payload.targetActor = target.actor ?? null;
  payload.targetActorId = target.actorId ?? null;
  payload.targetCombatant = target.combatant ?? null;
  payload.targetCombatantId = target.combatantId ?? null;
  payload.targetToken = target.token ?? null;
  payload.targetTokenId = target.tokenId ?? null;
  payload.targetName = target.name ?? '';
  payload.targetImg = target.img ?? '';
  payload.targetInitiative = target.initiative ?? null;

  return payload;
}

export function getInitiativeFormulaParts(actor, options = {}) {
  return computeInitiativeFormulaParts(actor, options);
}

export function setInitiativeMisc(actor, options = {}) {
  return applyInitiativeMisc(actor, options);
}

export const PMTTRPGTargetingAPI = {
  getCombatantTargetOptions,
  resolveCombatantTarget,
  promptTargetSelection,
  buildAttackContextPayload,
  getInitiativeFormulaParts,
  setInitiativeMisc,
  rollInitiative,
};