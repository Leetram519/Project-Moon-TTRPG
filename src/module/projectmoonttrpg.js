/**
 * A simple and flexible system for world-building using an arbitrary collection of character and item attributes
 * Author: Atropos
 * Software License: GNU GPLv3
 */

// Import Modules
import { PMTTRPG } from "./config.js";
import { ActorPMTTRPG } from "./actor/actor.js";
import { ItemPMTTRPG } from "./item/item.js";
import { TokenPMTTRPG } from "./canvas/token.js";
import { PMTTRPGItemSheet } from "./item/item-sheet.js";
import { PMTTRPGWeaponItemSheet } from "./item/weapon-item-sheet.js";
import { PMTTRPGSkillItemSheet } from "./item/skill-item-sheet.js";
import { PMTTRPGOutfitItemSheet } from "./item/outfit-item-sheet.js";
import { PMTTRPGAmmunitionItemSheet } from "./item/ammunition-item-sheet.js";
import { PMTTRPGToolItemSheet } from "./item/tool-item-sheet.js";
import { PMTTRPGEffectItemSheet } from "./item/effect-item-sheet.js";
import { PMTTRPGAugmentItemSheet } from "./item/augment-item-sheet.js";
import { PMTTRPGActorNpcSheet } from "./actor/actor-npc-sheet.js";
import { PMTTRPGCharacterSheet } from "./actor/character-sheet.js";
import { PMTTRPGRegisterHelpers } from "./handlebars.js";
import { preloadHandlebarsTemplates } from "./templates.js";
import { PMTTRPGUtility } from "./utility.js";
import { PMTTRPGTargetingAPI } from "./targeting.js";
import { CombatSidebarPMTTRPG } from "./combat/combat.js";
import { registerCombatMovement } from "./combat/movement.js";
import { PMTTRPGStatusMacroAPI } from "./status-macro-api.js";
import { registerEasyEffectsHooks } from "./easy-effects/registry.js";
import { registerActorScriptHooks } from "./easy-effects/actor-scripts.js";
import { registerChoiceDialogSocket } from "./easy-effects/choice-dialog.js";
import { registerGmRouteSocket } from "./easy-effects/gm-route.js";
import { registerStatusTray, registerStatusTraySettings } from "./apps/status-tray.js";
import { registerWorldEasyEffectsSettings } from "./apps/easy-effects-editor.js";
import { getActorWeaponDamageType, isSelectableDamageType } from "./damage-application.js";
import {
  registerTokenStatusBadges,
  registerTokenStatusBadgeSettings,
} from "./canvas/token.js";
import { registerClashChatListeners } from "./combat/clash-chat.js";
import { PMTTRPGClashAPI } from "./combat/clashing.js";

import * as chat from "./chat.js";
import { registerDiceSoNice } from "./integrations/dice-so-nice.js";

const { Actors, Items } = foundry.documents.collections;
const { renderTemplate } = foundry.applications.handlebars;

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

Hooks.once("init", async function() {
  console.log(`Initializing Project Moon TTRPG!`);

  game.projectmoonttrpg = {
    ActorPMTTRPG,
    ItemPMTTRPG,
    TokenPMTTRPG,
    rollItemMacro,
    PMTTRPGUtility,
    targeting: PMTTRPGTargetingAPI,
    statusMacros: PMTTRPGStatusMacroAPI,
    clash: PMTTRPGClashAPI,
  };

  CONFIG.PMTTRPG = PMTTRPG;
  CONFIG.Actor.documentClass = ActorPMTTRPG;
  CONFIG.Item.documentClass = ItemPMTTRPG;
  CONFIG.Token.objectClass = TokenPMTTRPG;
  registerTokenStatusBadges();
  CONFIG.Item.typeLabels = foundry.utils.mergeObject(CONFIG.Item.typeLabels ?? {}, {
    status: game.i18n.localize("TYPES.Item.status"),
    skill: game.i18n.localize("TYPES.Item.skill"),
    effect: game.i18n.localize("TYPES.Item.effect"),
    augment: game.i18n.localize("TYPES.Item.augment"),
    tool: game.i18n.localize("TYPES.Item.tool")
  });

  // Register sheet application classes
  Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  Actors.registerSheet("projectmoonttrpg", PMTTRPGCharacterSheet, {
    types: ['character'],
    makeDefault: true,
    label: "PMTTRPG.CharacterSheet"
  });
  Actors.registerSheet("projectmoonttrpg", PMTTRPGActorNpcSheet, {
    types: ['npc'],
    makeDefault: true,
    label: "PMTTRPG.NpcSheet"
  });
  Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  Items.registerSheet("projectmoonttrpg", PMTTRPGItemSheet, { makeDefault: false });
  Items.registerSheet("projectmoonttrpg", PMTTRPGWeaponItemSheet, {
    types: ['weapon'],
    makeDefault: true
  });
  Items.registerSheet("projectmoonttrpg", PMTTRPGSkillItemSheet, {
    types: ['skill'],
    makeDefault: true
  });
  Items.registerSheet("projectmoonttrpg", PMTTRPGOutfitItemSheet, {
    types: ['outfit'],
    makeDefault: true
  });
  Items.registerSheet("projectmoonttrpg", PMTTRPGAmmunitionItemSheet, {
    types: ['ammunition'],
    makeDefault: true
  });
  Items.registerSheet("projectmoonttrpg", PMTTRPGToolItemSheet, {
    types: ['tool'],
    makeDefault: true
  });
  Items.registerSheet("projectmoonttrpg", PMTTRPGEffectItemSheet, {
    types: ['effect'],
    makeDefault: true
  });
  Items.registerSheet("projectmoonttrpg", PMTTRPGAugmentItemSheet, {
    types: ['augment'],
    makeDefault: true
  });

  PMTTRPGRegisterHelpers.init();

  let combatPMTTRPG = new CombatSidebarPMTTRPG();
  combatPMTTRPG.startup();
  registerCombatMovement();

  /**
   * Track the system version upon which point a migration was last applied
   */
  game.settings.register("projectmoonttrpg", "systemMigrationVersion", {
    name: "System Migration Version",
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  // Configurable system settings.

  let browserDefaultColor = false;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    browserDefaultColor = true;
  }

  game.settings.register("projectmoonttrpg", "sanityFormula", {
    name: game.i18n.localize("PMTTRPG.Settings.sanityFormula.name"),
    hint: game.i18n.localize("PMTTRPG.Settings.sanityFormula.hint"),
    scope: 'world',
    config: true,
    type: new foundry.data.fields.StringField({
      choices: {
        "cr": "CR: [15 + (Prudence*3)]",
        "maxos1": "Maxo's Quickfix 1: [15 + (Rank*3) + (Prudence*3)]",
        "maxos2": "Maxo's Quickfix 2: [15 + (Prudence*6)]",
      },
      blank: false,
      required: true
    }),
    default: 'cr',
    onChange: () => window.location.reload()
  });

  registerStatusTraySettings();
  registerTokenStatusBadgeSettings();
  try {
    registerWorldEasyEffectsSettings();
  } catch (err) {
    console.error("[PMTTRPG] Failed to register World EasyEffects settings:", err);
  }

  // Preload template partials.
  preloadHandlebarsTemplates();

  registerEasyEffectsHooks();
  registerActorScriptHooks();
  registerClashChatListeners();
});

Hooks.once("ready", async function() {
  registerStatusTray();
  registerChoiceDialogSocket();
  registerGmRouteSocket();

  const clearEffectCatalogCache = (item) => {
    if (item?.type !== 'effect') return;
    if (PMTTRPGEffectItemSheet && PMTTRPGEffectItemSheet._effectCatalogCache) {
      delete PMTTRPGEffectItemSheet._effectCatalogCache.weapon;
      delete PMTTRPGEffectItemSheet._effectCatalogCache.outfit;
      delete PMTTRPGEffectItemSheet._effectCatalogCache.skill;
      delete PMTTRPGEffectItemSheet._effectCatalogCache.augment;
    }
  };

  Hooks.on('createItem', clearEffectCatalogCache);
  Hooks.on('updateItem', clearEffectCatalogCache);
  Hooks.on('deleteItem', clearEffectCatalogCache);

  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on("hotbarDrop", (bar, data, slot) => {
    //overwrite the default drop-to-hotbar behaviour for items
    if (data.type == "Item") {
      createPMTTRPGMacro(data, slot);
      return false;
    }
    else {
      return true
    }
  });

  CONFIG.PMTTRPG = PMTTRPG;

  // Add a lang class to the body.
  const lang = game.settings.get('core', 'language');
  $('html').addClass(`lang-${lang}`);

  // Update config.
  for (let [k,v] of Object.entries(CONFIG.PMTTRPG.rollResults)) {
    CONFIG.PMTTRPG.rollResults[k].label = game.i18n.localize(v.label);
  }

  // Handle sockets.
  game.socket.on('system.projectmoonttrpg', (data) => {
    if (!game.user.isGM) {
      return;
    }

    // Update chat cards.
    if (data?.message && data?.content) {
      let message = game.messages.get(data.message);
      message.update({'content': data.content});
    }

    // Update the move counter if a player made a move. Requires a GM account
    // to be logged in currently for the socket to work. If GM account is the
    // one that made the move, that happens directly in the actor update.
    if (data?.combatantUpdate) {
      game.combat.updateEmbeddedDocuments('Combatant', Array.isArray(data.combatantUpdate) ? data.combatantUpdate : [data.combatantUpdate]);
      ui.combat.render();
    }
  });
});

Hooks.on('createChatMessage', async (message, options, id) => {
  // TODO: expand this to work with multiple rolls.
  if (message?.rolls) {
    // Limit this to a single user.
    let firstGM = game.users.find(u => u.active && u.role == CONST.USER_ROLES.GAMEMASTER);
    if (!game.user.isGM || game.user.id !== firstGM.id) return;
    // Exit early if this is a rollable table.
    if (message?.flags?.core?.RollTable) return;
    // Since Clash has its own card, don't rewrite content or inject buttons.
    // To use a damage strip, include chat-buttons.html and set damageType (+ damageButtons: true).
    if (message?.flags?.projectmoonttrpg?.isClash) return;
    if (message?.flags?.projectmoonttrpg?.damageButtons) return;
    // Retrieve the roll.
    let r = message.rolls[0] ?? null;
    // Re-render the roll.
    if (r) {
      r.render().then(rTemplate => {
        const existingType = message.flags?.projectmoonttrpg?.damageType ?? null;
        let damageType = existingType;
        if (!isSelectableDamageType(damageType)) {
          const speakerActor = ChatMessage.getSpeakerActor?.(message.speaker)
            ?? game.actors.get(message.speaker?.actor);
          damageType = getActorWeaponDamageType(speakerActor) ?? "none";
        }
        // Render the damage buttons.
        renderTemplate(`systems/projectmoonttrpg/templates/parts/chat-buttons.html`, { damageType }).then(buttonTemplate => {
          if (message?.flags?.projectmoonttrpg?.damageButtons) return;
          if (message?.flags?.projectmoonttrpg?.isClash) return;
          // Update the chat message with the appended buttons.
          message.update({
            content: rTemplate + buttonTemplate,
            'flags.projectmoonttrpg.damageButtons': true,
            'flags.projectmoonttrpg.damageType': damageType,
          })
          // Update the chat log scroll position.
            .then(m => {
              let chatLog = document.querySelector('#chat-log');
              chatLog.scrollTop = chatLog.scrollHeight;
            });
        })
      });
    }
  }
});

Hooks.on('renderChatMessageHTML', (app, html, data) => {
  // Determine visibility.
  let chatData = app;
  const whisper = chatData.whisper || [];
  const isBlind = whisper.length && chatData.blind;
  const isVisible = (whisper.length) ? game.user.isGM || whisper.includes(game.user.id) || (!isBlind) : true;
  if (!isVisible) {
    html.querySelectorAll('.dice-formula').forEach(e => e.innerText = '???');
    html.querySelectorAll('.dice-total').forEach(e => e.innerText = '?');
    html.querySelectorAll('.dice-tooltip').forEach(e => e.remove());
  }

  chat.displayChatActionButtons(app, html, data);
});

Hooks.on('renderChatLog', (app, html, data) => chat.activateChatListeners(html));
Hooks.on('renderChatPopout', (app, html, data) => chat.activateChatListeners(html));

/* -------------------------------------------- */
/*  Foundry VTT Setup                           */
/* -------------------------------------------- */

/**
 * This function runs after game data has been requested and loaded from the servers, so documents exist
 */
Hooks.once("setup", function() {

  // Localize CONFIG objects once up-front
  const toLocalize = [
    "abilities"
  ];
  for (let o of toLocalize) {
    CONFIG.PMTTRPG[o] = Object.entries(CONFIG.PMTTRPG[o]).reduce((obj, e) => {
      obj[e[0]] = game.i18n.localize(e[1]);
      return obj;
    }, {});
  }
});

/* -------------------------------------------- */
/*  Actor Updates                               */
/* -------------------------------------------- */
Hooks.on('createActor', async (actor, options, id) => {
  // Prepare updates object.
  let updates = {};

  if (actor.type == 'character') {
    // Allow the character to levelup up when their level changes.
    await actor.setFlag('projectmoonttrpg', 'levelup', true);

    // Get the item moves as the priority.
    let moves = game.items.filter(i => i.type == 'move' && (i.system.moveType == 'basic' || i.system.moveType == 'special'));
    const compendium = await PMTTRPGUtility.loadCompendia('basic-moves');
    let actorMoves = [];

    actorMoves = actor.items.filter(i => i.type == 'move');

    // Get the compendium moves next.
    let moves_compendium = compendium.filter(m => {
      const notTaken = actorMoves.filter(i => i.name == m.name);
      return notTaken.length < 1;
    });
    // Append compendium moves to the item moves.
    let moves_list = moves.map(m => {
      return m.name;
    })
    for (let move of moves_compendium) {
      if (!moves_list.includes(move.name)) {
        moves.push(move);
        moves_list.push(move.name);
      }
    }

    // Sort the moves and build our groups.
    moves.sort((a, b) => {
      const aSort = a.name.toLowerCase();
      const bSort = b.name.toLowerCase();
      if (aSort < bSort) {
        return -1;
      }
      if (aSort > bSort) {
        return 1;
      }
      return 0;
    });

    // Add default look.
    updates['system.details.look'] = game.i18n.localize('PMTTRPG.DefaultLook');

    // Link the token.
    updates['token.actorLink'] = true;

    // Add to the actor.
    const movesToAdd = moves.map(m => foundry.utils.duplicate(m));

    // Only execute the function once.
    const owners = [];
    Object.entries(actor.permission).forEach(([uid, role]) => {
      // @todo unhardcode this role ID (owner).
      if (role == 3) owners.push(uid);
    });
    const isOwner = owners.includes(game.user.id);
    // @todo improve this to better handle multiple GMs/owers.
    const allowMoveAdd = game.user.isGM || (isOwner && game.users.filter(u => u.role == CONST.USER_ROLES.GAMEMASTER && u.document.active).length < 1);

    // If there are moves and we haven't already add them, add them.
    if (movesToAdd.length > 0 && allowMoveAdd) {
      await actor.createEmbeddedDocuments('Item', movesToAdd, {});
      console.log(movesToAdd);
    }
  }

  if (updates && Object.keys(updates).length > 0) {
    await actor.update(updates);
  }
});

Hooks.on('createItem', async (item, options, id) => {

})

Hooks.on('preUpdateActor', (actor, updateData, options, id) => {
  if (actor.type == 'character') {
    // Allow the character to levelup up when their level changes.
    if (updateData.system && updateData.system.attributes && updateData.system.attributes.level) {
      if (updateData.system.attributes.level.value > actor.system.attributes.level.value) {
        actor.setFlag('projectmoonttrpg', 'levelup', true);
      }
    }
  }
});

/* -------------------------------------------- */
/*  Level Up Listeners                          */
/* -------------------------------------------- */
Hooks.on('renderDialog', (dialog, html, options) => {
  // If this is the levelup dialog, we need to add listeners to it.
  if (dialog.id && dialog.id == 'level-up') {
    // If an ability score is chosen, we need to update the available options.
    html.find('.cell--ability-scores select').on('change', () => {
      // Build the list of selected score values.
      let scores = [];
      html.find('.cell--ability-scores select').each((index, item) => {
        let $self = $(item);
        const val = parseInt($self.val())
        if (!isNaN(val)) {
          scores.push(val);
        } else {
          const val = parseInt($self.find('option:selected').val())
          if (!isNaN(val)) {
            scores.push(val);
          }
        }
      });
      // Loop over the list again, disabling invalid options.
      html.find('.cell--ability-scores select').each((index, item) => {
        let $self = $(item);
        // Loop over the options in the select to get the possible value counts
        const valueCounts = {}
        $self.find('option').each((opt_index, opt_item) => {
          const $opt = $(opt_item);
          const val = parseInt($opt.attr('value'));
          if (valueCounts[val]) {
            valueCounts[val] ++
          } else {
            valueCounts[val] = 1
          }
        })
      });
    })
  }
});

Hooks.once('diceSoNiceReady', async (dice3d) => {
  await registerDiceSoNice(dice3d);
});

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createPMTTRPGMacro(data, slot) {
  // First, determine if this is a valid owned item.
  if (data.type !== "Item") return;
  if (!data.uuid.includes('Actor.') && !data.uuid.includes('Token.')) {
    return ui.notifications.warn("You can only create macro buttons for owned Items");
  }
  // If it is, retrieve it based on the uuid.
  const item = await Item.fromDropData(data);

  // Create the macro command
  // @todo refactor this to use uuids and folders.
  const command = `game.projectmoonttrpg.rollItemMacro("${item.name}");`;
  let macro = game.macros.find(m => (m.name === item.name) && (m.command === command));
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command: command,
      flags: {
        "projectmoonttrpg.itemMacro": true,
        "projectmoonttrpg.itemUuid": data.uuid
      }
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {string} itemData
 * @return {Promise}
 */
function rollItemMacro(itemData) {
  // Reconstruct the drop data so that we can load the item.
  // @todo this section isn't currently used, the name section below is used.
  if (itemData.includes('Actor.') || itemData.includes('Token.')) {
    const dropData = {
      type: 'Item',
      uuid: itemData
    };
    Item.fromDropData(dropData).then(item => {
      // Determine if the item loaded and if it's an owned item.
      if (!item || !item.parent) {
        const itemName = item?.name ?? itemData;
        return ui.notifications.warn(`Could not find item ${itemName}. You may need to delete and recreate this macro.`);
      }

      // Trigger the item roll
      item.roll();
    });
  }
  // Load item by name from the actor.
  else {
    const speaker = ChatMessage.getSpeaker();
    const itemName = itemData;
    let actor;
    if (speaker.token) actor = game.actors.tokens[speaker.token];
    if (!actor) actor = game.actors.get(speaker.actor);
    const item = actor ? actor.items.find(i => i.name === itemName) : null;
    if (!item) return ui.notifications.warn(`Your controlled Actor does not have an item named ${itemName}`);

    // Trigger the item roll
    return item.roll();
  }
}
