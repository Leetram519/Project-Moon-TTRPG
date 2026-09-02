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
  return combatant?.token?.texture?.src
    ?? combatant?.token?.img
    ?? combatant?.tokenDocument?.texture?.src
    ?? combatant?.actor?.img
    ?? 'icons/svg/mystery-man.svg';
}

function getCombatantInitiative(combatant) {
  const initiative = Number(combatant?.initiative ?? NaN);
  return Number.isFinite(initiative) ? initiative : null;
}

function isCombatantVisible(combatant) {
  if (game.user.isGM || combatant?.isOwner) return true;

  const token = combatant?.token ?? combatant?.tokenDocument ?? null;
  if (!token) return true;

  return !token.hidden;
}

function buildCombatantTarget(combatant, { actorId = null, weaponRange = 1 } = {}) {
  if (!combatant?.actor) return null;

  const selfToken = game.actors.get(actorId).getActiveTokens(false, true)[0];

  const actor = combatant.actor;
  const token = combatant.token ?? combatant.tokenDocument ?? null;
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
    isSelf: actorId ? actor.id === actorId : false,
    outOfRange: PMTTRPGUtility.isTargetInWeaponRange(selfToken._id, combatant.tokenId, {weaponRange}),
  };
}

export function getCombatantTargetOptions({ combat = game.combat, actorId = null, tokenId = null, weaponRange = null, includeHidden = false } = {}) {
  return getCombatants(combat)
    .filter(combatant => Boolean(combatant?.actor))
    .filter(combatant => includeHidden || isCombatantVisible(combatant))
    .map(combatant => buildCombatantTarget(combatant, { actorId, tokenId, weaponRange }))
    .filter(Boolean);
}

export function resolveCombatantTarget(combatantId, { combat = game.combat, tokenId = null, weaponRange = null, actorId = null } = {}) {
  if (!combatantId) return null;
  const combatant = getCombatants(combat).find(entry => entry.id === combatantId) ?? null;
  return combatant ? buildCombatantTarget(combatant, { actorId, tokenId, weaponRange }) : null;
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
  const byToken = token.combatant
    ?? token.document?.combatant
    ?? (tokenId ? getCombatants(combat).find(entry => (entry.tokenId ?? entry.token?.id) === tokenId) : null);
  if (byToken) return byToken;

  const actorId = token.actor?.id ?? null;
  const baseActorId = token.document?.actorId ?? token.actor?.id ?? null;
  return getCombatants(combat).find(entry => {
    const combatantActorId = entry.actorId ?? entry.actor?.id ?? null;
    return combatantActorId && (combatantActorId === actorId || combatantActorId === baseActorId);
  }) ?? null;
}

function buildTargetFromToken(token, { actorId = null, combat = game.combat, weaponRange = 1 } = {}) {
  if (!token?.actor) return null;

  const combatant = resolveCombatantForToken(token, combat);
  if (combatant) return buildCombatantTarget(combatant, { actorId });

  const selfToken = game.actors.get(actorId).getActiveTokens(true, true)[0];

  const actor = token.actor;
  const tokenDoc = token.document ?? token;
  return {
    combatant: null,
    combatantId: null,
    actor,
    actorId: actor.id ?? null,
    token: tokenDoc,
    tokenId: getTokenId(token),
    name: token.name ?? actor.name ?? '',
    img: tokenDoc?.texture?.src ?? actor.img ?? 'icons/svg/mystery-man.svg',
    initiative: null,
    initiativeLabel: '-',
    isCurrent: false,
    isSelf: actorId ? actor.id === actorId : false,
    outOfRange: PMTTRPGUtility.isTargetInWeaponRange(selfToken._id, token._id, {weaponRange}),
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
  const selfToken = game.actors.get(actor?.id ?? null).getActiveTokens(true, true)[0];
  const options = getCombatantTargetOptions({ combat, actorId: actor?.id ?? null, tokenId: token?.id ?? null, weaponRange, includeHidden });
  const targetedTokens = getUserTargetedTokens();

  // One crosshair target does not need a picker.
  if (targetedTokens.length === 1) {
    return buildTargetFromToken(targetedTokens[0], { actorId: actor?.id ?? null, combat });
  }

  if (!options.length) return undefined;

  if(selfToken) {
    showWeaponRange(selfToken._id, weaponRange);
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
      if(selfToken) {
        hideWeaponRange(selfToken._id);
      }
      return resolveCombatantTarget(combatantId, { combat, actorId: actor?.id ?? null });
    }
  }, {
    action: 'cancel',
    label: game.i18n.localize('PMTTRPG.Dialog.cancel'),
    callback: () => {
      if(selfToken) {
        hideWeaponRange(selfToken._id);
      }
    }
  }];

  if (allowNone) {
    buttons.push({
      action: 'none',
      label: game.i18n.localize('PMTTRPG.Dialog.noTarget'),
      callback: () => {
      if(selfToken) {
        hideWeaponRange(selfToken._id);
      }
      }
    });
  }

  return foundry.applications.api.DialogV2.wait({
    window: { title },
    classes: dlgOptions.classes,
    content: html,
    buttons,
    rejectClose: false
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
    // assume latest version
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
      : combat.combatants.find(entry => entry.actorId === actor.id) ?? null;

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
