import { PMTTRPGUtility } from '../utility.js';
import { getActionEconomyFromRank, getRankFromLevel, TACTICAL_SQUARES_BASE, squareTurnCap } from './progression.js';
import { actorHistorySquareCost, actorSquaresExhausted } from '../combat/movement.js';
const { renderTemplate } = foundry.applications.handlebars;
import { applyAlwaysActiveModifiers, runOnTakingDamage, runDepletedEasyEffects } from '../easy-effects/registry.js';
import { applyResourceModsToSystem, applyResourceOverridesToSystem } from '../easy-effects/nouns.js';
import { applyInventorySlotUsage } from '../inventory/slots.js';
import { isPendingStatus, normalizeArrival } from '../status/pending.js';
import { clampPoolValue, crossesDepletion } from '../pool-clamp.js';
import {
  APPLY_POOLS,
  DAMAGE_TYPES,
  buildAppliedDamage,
  normalizePools,
  poolTempPath,
  poolValuePath,
  postDamageTakenMessage,
  resolveResistance,
  tempPoolKey,
} from '../damage-application.js';

const STATUS_STACK_HOOK_MAX_DEPTH = 8;
const _statusStackHookDepth = new WeakMap();

function sourceSystemNumber(actorData, path) {
  const n = Number(foundry.utils.getProperty(actorData._source ?? {}, `system.${path}`));
  return Number.isFinite(n) ? n : 0;
}

function statusMutationOptions(options = {}, delta = 0) {
  const silent = !!options.silent;
  const amount = Math.trunc(Number(delta) || 0);
  return {
    PMTTRPG: {
      silentStatusText: silent,
      statusTextDelta: silent ? 0 : amount,
    },
  };
}

async function emitStatusStackHook(actor, hookName, payload) {
  const depth = _statusStackHookDepth.get(actor) ?? 0;
  if (depth >= STATUS_STACK_HOOK_MAX_DEPTH) {
    console.warn(
      `PMTTRPG | Skipping ${hookName} (${payload.statusName}): re-entrancy depth ${depth}`
    );
    return;
  }
  _statusStackHookDepth.set(actor, depth + 1);
  try {
    const results = Hooks.callAll(hookName, payload) ?? [];
    await Promise.all(
      (Array.isArray(results) ? results : [results]).filter((r) => r instanceof Promise)
    );
  } finally {
    const next = (_statusStackHookDepth.get(actor) ?? 1) - 1;
    if (next <= 0) _statusStackHookDepth.delete(actor);
    else _statusStackHookDepth.set(actor, next);
  }
}

/**
 * Extends the basic Actor class for Project Moon TTRPG.
 * @extends {Actor}
 */
export class ActorPMTTRPG extends Actor {

  /**
   * Augment the basic actor data with additional dynamic data.
   */
  prepareData() {
    super.prepareData();

    const actorData = this;
    const data = actorData.system;
    const flags = actorData.flags;

    if (actorData.type === 'character' || actorData.type === 'npc') {
      this._prepareCharacterData(actorData);
      for (const item of this.items) {
        if (item.type === 'weapon' || item.type === 'outfit') item.prepareData();
      }
    }
  }

  /**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorData) {
    const data = actorData.system;

    if (!data.abilities) {
      if (actorData.type !== 'npc') return;
      data.abilities = {
        for: { value: 0, min: -1, mod: 0, debility: false },
        pru: { value: 0, min: -1, mod: 0, debility: false },
        jus: { value: 0, min: -1, mod: 0, debility: false },
        cha: { value: 0, min: -1, mod: 0, debility: false },
        ins: { value: 0, min: -1, mod: 0, debility: false },
        tem: { value: 0, min: -1, mod: 0, debility: false },
      };
    }
    if (!data.attributes.light) {
      data.attributes.light = { value: 0, min: 0, maxBase: 0, maxMisc: 0, max: 0 };
    }
    for (const key of ['actions', 'reactions', 'movement']) {
      if (!data.attributes[key]) {
        data.attributes[key] = { value: 0, min: 0, maxBase: 0, maxMisc: 0, max: 0 };
      }
    }
    if (!data.details) data.details = {};
    if (!data.details.gmBrief) {
      data.details.gmBrief = {
        complexityGm: 0,
        complexityPlayers: 0,
        strength: '',
        designIntention: '',
        recommendedBehavior: '',
        lore: '',
        notes: '',
      };
    }

    // Ability Scores - keep value and compute a 'mod' for use in rolls.
    for (let [a, abl] of Object.entries(data.abilities)) {
      // Ensure a numeric value exists
      abl.value = Number(abl.value) || 0;
      // For the new system the stat value itself is used as the modifier.
      abl.mod = PMTTRPGUtility.getAbilityMod(abl.value, true);

      // Add labels.
      abl.label = CONFIG.PMTTRPG.abilities[a];
    }

    // Derived Attributes based on Stats and Rank
    const rank = Number(getRankFromLevel(data.attributes.level?.value)) || 0;
    data.attributes.rank = data.attributes.rank || {};
    data.attributes.rank.value = rank;
    const fort = Number(data.abilities.for?.value) || 0;
    const pru = Number(data.abilities.pru?.value) || 0;
    const jus = Number(data.abilities.jus?.value) || 0;
    const cha = Number(data.abilities.cha?.value) || 0;
    const ins = Number(data.abilities.ins?.value) || 0;
    const tem = Number(data.abilities.tem?.value) || 0;

    // Health Points: 64 + (Fortitude*8) + (Rank*32)
    const hpMaxBase = 64 + (fort * 8) + (rank * 32);
    if (!data.attributes.hp) data.attributes.hp = {};
    data.attributes.hp.maxBase = hpMaxBase;
    data.attributes.hp.maxMisc = sourceSystemNumber(actorData, "attributes.hp.maxMisc");
    data.attributes.hp.max = hpMaxBase + data.attributes.hp.maxMisc;
    if (data.attributes.hp.value === undefined || data.attributes.hp.value === null) {
      data.attributes.hp.value = data.attributes.hp.max;
    } else {
      data.attributes.hp.value = Math.clamp(Number(data.attributes.hp.value) || 0, 0, data.attributes.hp.max);
    }

    // Stagger Threshold (ST): 20 + (Charm*4) + (Rank*4)
    const stMaxBase = 20 + (cha * 4) + (rank * 4);
    data.attributes.st = data.attributes.st || {};
    data.attributes.st.maxBase = stMaxBase;
    data.attributes.st.maxMisc = sourceSystemNumber(actorData, "attributes.st.maxMisc");
    data.attributes.st.max = stMaxBase + data.attributes.st.maxMisc;
    if (data.attributes.st.value === undefined || data.attributes.st.value === null) {
      data.attributes.st.value = data.attributes.st.max;
    } else {
      data.attributes.st.value = Math.clamp(Number(data.attributes.st.value) || 0, 0, data.attributes.st.max);
    }
    // Sanity Points (SP): 15 + (Prudence*3)
    let spMaxBase = 15 + (pru * 3);
    switch(game.settings.get('projectmoonttrpg', 'sanityFormula')) {
      case "maxos1":
        spMaxBase = 15 + (rank * 3) + (pru * 3);
        break;
      case "maxos2":
        spMaxBase = 15 + (pru * 6);
        break;
      default:
        spMaxBase = 15 + (pru * 3);
        break;
    }

    data.attributes.sp = data.attributes.sp || {};
    data.attributes.sp.maxBase = spMaxBase;
    data.attributes.sp.maxMisc = sourceSystemNumber(actorData, "attributes.sp.maxMisc");
    data.attributes.sp.max = spMaxBase + data.attributes.sp.maxMisc;
    if (data.attributes.sp.value === undefined || data.attributes.sp.value === null) {
      data.attributes.sp.value = data.attributes.sp.max;
    } else {
      data.attributes.sp.value = clampPoolValue("sp", data.attributes.sp.value, data.attributes.sp.max);
    }

    // Light: 3 + Rank. Clamp after equipment bonuses.
    const lightMaxBase = 3 + rank;
    data.attributes.light = data.attributes.light || {};
    data.attributes.light.maxBase = lightMaxBase;
    data.attributes.light.maxMisc = sourceSystemNumber(actorData, "attributes.light.maxMisc");
    data.attributes.light.max = lightMaxBase + data.attributes.light.maxMisc;
    if (data.attributes.light.value === undefined || data.attributes.light.value === null) {
      data.attributes.light.value = data.attributes.light.max;
    } else {
      data.attributes.light.value = Number(data.attributes.light.value) || 0;
    }

    const economy = getActionEconomyFromRank(rank);
    for (const [key, maxBase] of [
      ['actions', economy.actions],
      ['reactions', economy.reactions],
      ['movement', economy.movement],
    ]) {
      const pool = data.attributes[key] || {};
      data.attributes[key] = pool;
      pool.min = 0;
      pool.maxBase = maxBase;
      pool.maxMisc = sourceSystemNumber(actorData, `attributes.${key}.maxMisc`);
      pool.max = pool.maxBase + pool.maxMisc;
      if (pool.value === undefined || pool.value === null) {
        pool.value = pool.max;
      } else {
        pool.value = Number(pool.value) || 0;
      }
    }

    const squares = data.attributes.squares || {};
    data.attributes.squares = squares;
    squares.min = 0;
    squares.maxBase = TACTICAL_SQUARES_BASE;
    squares.maxMisc = sourceSystemNumber(actorData, "attributes.squares.maxMisc");
    squares.max = Math.max(0, squares.maxBase + squares.maxMisc);
    if (squares.value === undefined || squares.value === null) {
      squares.value = squares.max;
    } else {
      squares.value = Math.max(0, Number(squares.value) || 0);
    }

    // Equipped outfit bonuses.
    let outfitBlockBonus = 0;
    let outfitEvadeBonus = 0;
    let outfitLightBonus = 0;
    let outfitEpBonus = 0;
    for (let item of actorData.items || []) {
      if (item.type != 'outfit') continue;
      if (!item.system?.equipped) continue;
      outfitBlockBonus += Number(item.system?.blockDicePower ?? 0);
      outfitEvadeBonus += Number(item.system?.evadeDicePower ?? 0);
      outfitLightBonus += Number(item.system?.bonusLight ?? 0);
      outfitEpBonus += Number(item.system?.bonusEP ?? 0);
    }

    // Combat modifiers
    data.attributes.attackModifier = data.attributes.attackModifier || {};
    data.attributes.attackModifier.value = rank;
    data.attributes.evadeModifier = data.attributes.evadeModifier || {};
    data.attributes.evadeModifier.value = ins + outfitEvadeBonus;
    data.attributes.blockModifier = data.attributes.blockModifier || {};
    data.attributes.blockModifier.value = tem + outfitBlockBonus;

    data.attributes.light.maxMisc += outfitLightBonus;
    data.attributes.light.max = data.attributes.light.maxBase + data.attributes.light.maxMisc;

    // Equipment rank limit and inventory slot pools
    data.attributes.equipmentRankLimit = data.attributes.equipmentRankLimit || {};
    data.attributes.equipmentRankLimit.value = rank + 1;
    data.attributes.toolSlots = data.attributes.toolSlots || {};
    data.attributes.toolSlots.value = 4;
    data.attributes.narrativeSlots = data.attributes.narrativeSlots || {};
    data.attributes.narrativeSlots.value = 4;
    data.attributes.stockSlots = data.attributes.stockSlots || {};
    data.attributes.stockSlots.value = 4;

    // Speed: base dice + Justice bonus
    data.attributes.speed = data.attributes.speed || {};
    data.attributes.speed.dice = data.attributes.speed.dice || '1d6';
    data.attributes.speed.bonus = jus;

    // Add base flags.
    if (!actorData.flags.projectmoonttrpg) actorData.flags.projectmoonttrpg = {};
    if (!actorData.flags.projectmoonttrpg.sheetDisplay) actorData.flags.projectmoonttrpg.sheetDisplay = {};
    if (!actorData.flags.projectmoonttrpg.initiative) actorData.flags.projectmoonttrpg.initiative = {};
    actorData.flags.projectmoonttrpg.initiative.manualMisc = Number(actorData.flags.projectmoonttrpg.initiative.manualMisc) || 0;
    actorData.flags.projectmoonttrpg.initiative.macroMisc = Number(actorData.flags.projectmoonttrpg.initiative.macroMisc) || 0;

    // Handle max XP.
    data.attributes.xp.max = 8;

    // Handle roll mode flag.
    if (actorData?.flags?.projectmoonttrpg) {
      if (!actorData.flags.projectmoonttrpg.rollMode) actorData.flags.projectmoonttrpg.rollMode = 'def';
    }

    try {
      const eeMods = applyAlwaysActiveModifiers(actorData);
      data.attributes.attackModifier.value += eeMods.attackPower;
      data.attributes.evadeModifier.value += eeMods.evadePower;
      data.attributes.blockModifier.value += eeMods.blockPower;
      applyResourceModsToSystem(data, eeMods);
      for (const key of ['hp', 'st', 'sp']) {
        const pool = data.attributes[key];
        if (!pool) continue;
        pool.eeMaxOverridden = false;
        pool.eeMaxOverrideBy = "";
        pool.max = (Number(pool.maxBase) || 0) + (Number(pool.maxMisc) || 0);
        pool.value = clampPoolValue(key, pool.value, pool.max);
      }
      if (data.attributes.light) {
        data.attributes.light.eeMaxOverridden = false;
        data.attributes.light.eeMaxOverrideBy = "";
      }
      applyResourceOverridesToSystem(data, eeMods);
      data.attributes.light.value = Math.clamp(
        Number(data.attributes.light.value) || 0, 0, data.attributes.light.max
      );
      // Clash rolls consume these modifiers.
      data.attributes.easyEffectsMods = eeMods;
    } catch (err) {
      console.error('[EasyEffects] Error in Always Active pass:', err);
    }

    for (const key of ['actions', 'reactions', 'movement']) {
      const pool = data.attributes[key];
      if (!pool) continue;
      pool.max = (Number(pool.maxBase) || 0) + (Number(pool.maxMisc) || 0);
      const raw = Number(pool.value) || 0;
      pool.value = key === 'reactions'
        ? Math.max(0, raw)
        : Math.clamp(raw, 0, pool.max);
    }

    const squaresPool = data.attributes.squares;
    if (squaresPool) {
      squaresPool.max = Math.max(
        0,
        (Number(squaresPool.maxBase) || TACTICAL_SQUARES_BASE) + (Number(squaresPool.maxMisc) || 0)
      );
      squaresPool.value = Math.max(0, Number(squaresPool.value) || 0);
      const usedSquares = actorHistorySquareCost(this);
      squaresPool.used = usedSquares;
      squaresPool.exhausted = actorSquaresExhausted(this);
      squaresPool.remaining = squaresPool.exhausted
        ? 0
        : Math.max(0, squareTurnCap(squaresPool) - usedSquares);
    }

    applyInventorySlotUsage(data.attributes, actorData.items);
    for (const key of ['toolSlots', 'narrativeSlots', 'stockSlots']) {
      const pool = data.attributes[key];
      pool.over = Number(pool.used ?? 0) > Number(pool.value ?? 0);
    }
  }

  async refreshActionEconomy() {
    const updates = {};
    if (this.getFlag("projectmoonttrpg", "squaresExhausted")) {
      updates["flags.projectmoonttrpg.squaresExhausted"] = false;
    }
    for (const key of ['actions', 'reactions', 'movement', 'squares']) {
      const pool = this.system.attributes?.[key];
      if (!pool) continue;
      const max = Number(pool.max) || 0;
      if ((Number(pool.value) || 0) !== max) {
        updates[`system.attributes.${key}.value`] = max;
      }
    }
    if (foundry.utils.isEmpty(updates)) return this;
    return this.update(updates);
  }

  /**
   * Spend from an action-economy pool.
   * @param {"actions"|"reactions"|"movement"} poolKey
   * @param {number} [amount=1]
   * @returns {Promise<boolean>}
   */
  async spendActionEconomy(poolKey, amount = 1) {
    const allowed = new Set(['actions', 'reactions', 'movement']);
    if (!allowed.has(poolKey)) {
      throw new Error(`Invalid action economy pool: ${poolKey}`);
    }
    const pool = this.system.attributes?.[poolKey];
    if (!pool) return false;
    const spent = Math.max(0, Number(amount) || 0);
    if (spent === 0) return false;
    const current = Number(pool.value) || 0;
    if (current < spent) {
      ui.notifications.warn(game.i18n.format('PMTTRPG.Notifications.actionEconomyInsufficient', {
        name: this.name,
        pool: game.i18n.localize({
          actions: 'PMTTRPG.Actions',
          reactions: 'PMTTRPG.Reactions',
          movement: 'PMTTRPG.Movement',
        }[poolKey]),
        current,
        needed: spent,
      }));
      return false;
    }
    await this.update({ [`system.attributes.${poolKey}.value`]: current - spent });
    return true;
  }

  /**
   * Convert Actions into Reactions
   * @param {number} [amount] Defaults to all remaining Actions.
   */
  async convertActionsToReactions(amount) {
    const actionPool = this.system.attributes?.actions;
    const reactionPool = this.system.attributes?.reactions;
    if (!actionPool || !reactionPool) return this;

    const available = Math.max(0, Number(actionPool.value) || 0);
    if (available <= 0) {
      ui.notifications.warn(game.i18n.format("PMTTRPG.Notifications.convertNoActions", {
        name: this.name,
      }));
      return this;
    }

    let n = (amount === undefined || amount === null)
      ? available
      : Math.max(0, Math.floor(Number(amount) || 0));

    if (n <= 0) {
      ui.notifications.warn(game.i18n.format("PMTTRPG.Notifications.convertNoActions", {
        name: this.name,
      }));
      return this;
    }

    if (n > available) {
      ui.notifications.warn(game.i18n.format("PMTTRPG.Notifications.convertActionsCapped", {
        name: this.name,
        available,
      }));
      n = available;
    }

    return this.update({
      "system.attributes.actions.value": available - n,
      "system.attributes.reactions.value": (Number(reactionPool.value) || 0) + n,
    });
  }

  /** @override */
  getRollData() {
    const rollData = super.getRollData();

    for (let prop of ['attributes', 'abilities']) {
      if (!rollData?.[prop]) continue;
      for (let [k, v] of Object.entries(rollData[prop])) {
        v.val = v.value;
        rollData[k] = v;
      }
    }

    if (rollData?.attributes) rollData.attr = rollData.attributes;
    if (rollData?.abilities) rollData.abil = rollData.abilities;

    return rollData;
  }

  /**
   * Listen for click events on rollables.
   * @param {MouseEvent} event
   */
  async _onRoll(event, actor = null) {
    actor = !actor ? this.actor : actor;

    // Initialize variables.
    event.preventDefault();

    if (!actor.system) {
      return;
    }

    const a = event.currentTarget;
    const data = a.dataset;
    const actorData = actor.system;
    const itemId = $(a).parents('.item').attr('data-item-id');
    const item = actor.items.get(itemId);
    let formula = null;
    let titleText = null;
    let flavorText = null;
    let templateData = {};

    // Handle rolls coming directly from the ability score.
    if ($(a).hasClass('ability-rollable') && data.mod) {
      formula = `2d6+${data.mod}`;
      flavorText = data.label;

      templateData = {
        title: flavorText
      };

      this.rollMove(formula, actor, data, templateData);
    }
    else if ($(a).hasClass('damage-rollable') && data.roll) {
      formula = data.roll;
      titleText = data.label;
      flavorText = data.flavor;
      templateData = {
        title: titleText,
        flavor: flavorText
      };

      this.rollMove(formula, actor, data, templateData, null, true);
    }
    else if (itemId != undefined) {
      item.roll();
    }
  }

  /**
   * Roll a move and use the chat card template.
   * @param {Object} templateData
   */
  async rollMove(roll, actor, dataset, templateData, form = null, applyDamage = false) {
    let actorData = actor.system;
    // Render the roll.
    let template = 'systems/projectmoonttrpg/templates/chat/chat-move.html';
    // GM rolls.
    let chatData = {
      author: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: actor })
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
    
    if (["gm", "blind"].includes(rollMode)) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM");
    if (rollMode === "self") chatData["whisper"] = [game.user.id];
    if (rollMode === "blind") chatData["blind"] = true;
    // Handle dice rolls.
    if (roll) {
      // Roll can be either a formula like `2d6+3` or a raw stat like `str`.
      let formula = '';
      // Handle ability scores (no input).
      if (roll.match(/(\d*)d\d+/g)) {
        formula = roll;
      }
      // Handle moves.
      else {
        formula = `2d6+${actorData.abilities[roll].mod}`;
        if (dataset.mod && dataset.mod != 0) {
          formula += `+${dataset.mod}`;
        }
      }
      if (formula != null) {
        // Do the roll.
        let roll = new Roll(`${formula}`, actor.getRollData());
        await roll.roll();
        // Add success notification.
        if (formula.includes('2d6')) {
          if (roll.total < 7) {
            templateData.result = 'failure';
          }
          else if (roll.total > 6 && roll.total < 10) {
            templateData.result = 'partial';
          }
          else {
            templateData.result = 'success';
          }
        }
        // Render it.
        roll.render().then(r => {
          templateData.rollPMTTRPG = r;
          renderTemplate(template, templateData).then(content => {
            chatData.content = content;
            if (game.dice3d) {
              game.dice3d.showForRoll(roll, game.user, true, chatData.whisper, chatData.blind).then(displayed => ChatMessage.create(chatData));
            }
            else {
              chatData.sound = CONFIG.sounds.dice;
              ChatMessage.create(chatData);
            }
          });
        });
      }
    }
    else {
      renderTemplate(template, templateData).then(content => {
        chatData.content = content;
        ChatMessage.create(chatData);
      });
    }
  }

  /**
   * Apply damage or healing to one or more pools.
   * @param {number|string} amount
   * @param {object} [options]
   * @param {"full"|"half"|"double"|"heal"} [options.op="full"]
   * @param {"hp"|"st"|"sp"|Array<"hp"|"st"|"sp">} [options.pool="hp"]
   * @param {string} [options.sourceLabel]
   * @param {boolean} [options.fromAttack]
   * @param {string} [options.formula]
   * @returns {Promise<object|null>}
   */
  async applyDamage(amount, options = {}) {
    const op = options.op ?? "full";
    const pools = normalizePools(options.pool);
    const createMessage = options.createMessage !== false;
    const rawDamageType = typeof options.damageType === "string" ? options.damageType.trim() : "";
    const damageType = DAMAGE_TYPES.includes(rawDamageType.toLowerCase()) ? rawDamageType.toLowerCase() : null;
    const eeDamageType = damageType || rawDamageType;
    const source = typeof options.source === "string" && options.source.trim() ? options.source.trim() : null;
    const fromAttack = options.fromAttack === true;
    const explicitSourceLabel = typeof options.sourceLabel === "string" && options.sourceLabel.trim()
      ? options.sourceLabel.trim()
      : null;
    const sourceLabel = explicitSourceLabel ?? source ?? options.attacker?.name ?? null;
    const formula = typeof options.formula === "string" && options.formula.trim()
      ? options.formula.trim()
      : null;
    const afterResistance = Number(options.afterResistance) || 0;
    const forceSkipResistance = options.skipResistance === true || op === "heal";
    const forceApplyResistance = options.skipResistance === false;
    const useOutfitTypeResists = !forceSkipResistance && (forceApplyResistance || !source);
    const skipEasyEffects = options.skipEasyEffects === true;

    const base = Number(amount) || 0;
    let sharedAmount = base;
    switch (op) {
      case "half":
        sharedAmount = Math.floor(sharedAmount / 2);
        break;
      case "double":
        sharedAmount *= 2;
        break;
      default:
        break;
    }

    const breakdown = [];
    if (sourceLabel) breakdown.push({ key: "source", source: sourceLabel });
    if (eeDamageType) breakdown.push({ key: "damageType", damageType: eeDamageType });
    if (formula) breakdown.push({ key: "roll", formula });
    breakdown.push({ key: "base", amount: base });
    if (op !== "full") breakdown.push({ key: "op", op, from: base, to: sharedAmount });

    let amountAfterSource = sharedAmount;
    let poolsAfter = pools;
    let damageTypeForResist = damageType;
    let afterDeltaByPool = {};
    let beforeDeltaByPool = {};

    if (op !== "heal" && !skipEasyEffects) {
      const beforeEe = amountAfterSource;
      const damageCtx = {
        amount: amountAfterSource,
        pool: pools.length === 1 ? (pools[0] ?? "hp") : pools.slice(),
        source: source ?? "",
        damageType: eeDamageType,
        fromAttack,
        afterDeltaByPool: {},
        beforeDeltaByPool: {},
      };
      await runOnTakingDamage(this, damageCtx, { attacker: options.attacker ?? null });
      amountAfterSource = Math.max(0, Number(damageCtx.amount) || 0);
      afterDeltaByPool = damageCtx.afterDeltaByPool && typeof damageCtx.afterDeltaByPool === "object"
        ? damageCtx.afterDeltaByPool
        : {};
      beforeDeltaByPool = damageCtx.beforeDeltaByPool && typeof damageCtx.beforeDeltaByPool === "object"
        ? damageCtx.beforeDeltaByPool
        : {};
      poolsAfter = normalizePools(damageCtx.pool);

      const rawAfter = typeof damageCtx.damageType === "string" ? damageCtx.damageType.trim() : "";
      damageTypeForResist = DAMAGE_TYPES.includes(rawAfter.toLowerCase())
        ? rawAfter.toLowerCase()
        : null;

      if (amountAfterSource !== beforeEe) {
        if (source) {
          breakdown.push({
            key: "sourceResistance",
            source,
            sourceLabel: source,
            reduction: beforeEe - amountAfterSource,
            from: beforeEe,
            to: amountAfterSource,
          });
        } else {
          breakdown.push({
            key: "easyEffects",
            reduction: beforeEe - amountAfterSource,
            from: beforeEe,
            to: amountAfterSource,
          });
        }
      }

      const poolChanged = poolsAfter.join(",") !== pools.join(",");
      const typeChanged = rawAfter !== eeDamageType;
      if (poolChanged || typeChanged) {
        breakdown.push({
          key: "convert",
          fromPool: pools.join(","),
          toPool: poolsAfter.join(","),
          fromType: eeDamageType || "",
          toType: rawAfter || "",
        });
      }
    }

    const actorUpdates = {};
    const appliedEntries = [];

    for (const pool of poolsAfter) {
      const poolData = this.system?.attributes?.[pool];
      if (!poolData) continue;

      const current = Number(poolData.value) || 0;
      const max = Number(poolData.max) || 0;
      let newAmount = amountAfterSource;
      const beforeFlat = Number(beforeDeltaByPool[pool]) || 0;
      if (beforeFlat) {
        const before = newAmount;
        newAmount = Math.max(0, newAmount + beforeFlat);
        breakdown.push({
          key: "easyEffects",
          pool,
          reduction: -beforeFlat,
          from: before,
          to: newAmount,
        });
      }
      const skipTypeResist = !useOutfitTypeResists || pool === "sp" || pool === "light";

      if (!skipTypeResist) {
        const resist = resolveResistance(this, pool, damageTypeForResist);
        if (resist) {
          const before = newAmount;
          newAmount = Math.floor(newAmount * resist.multiplier);
          breakdown.push({
            key: "resistance",
            pool,
            damageType: resist.damageType,
            level: resist.key,
            multiplier: resist.multiplier,
            reason: resist.reason,
            cause: resist.cause ?? null,
            from: before,
            to: newAmount,
          });
        }
      }

      const afterFlat = afterResistance + (Number(afterDeltaByPool[pool]) || 0);
      if (afterFlat) {
        const before = newAmount;
        newAmount = Math.max(0, newAmount + afterFlat);
        breakdown.push({
          key: "afterResistance",
          pool,
          amount: afterFlat,
          from: before,
          to: newAmount,
        });
      }

      if (newAmount === 0 && op !== "heal") {
        breakdown.push({ key: "final", amount: 0, pool, heal: false });
        continue;
      }

      if (op === "heal") {
        const uncapped = current + newAmount;
        const next = clampPoolValue(pool, uncapped, max);
        if (next === current) {
          breakdown.push({ key: "final", amount: 0, pool, heal: true });
          continue;
        }

        const path = poolValuePath(pool);
        actorUpdates[path] = next;
        appliedEntries.push({ pool, path, pre: current, post: next });

        const applied = Math.abs(current - next);
        if (uncapped !== next) {
          breakdown.push({
            key: "clamp",
            pool,
            from: Math.abs(current - uncapped),
            to: applied,
            reason: uncapped > max ? "max" : "min",
          });
        }
        breakdown.push({ key: "final", amount: applied, pool, heal: true });
        continue;
      }

      // Temp absorbs before the pools (hp/st/sp).
      let remaining = newAmount;
      const tempKey = tempPoolKey(pool);
      if (tempKey) {
        const temp = Math.max(0, Number(poolData.temp) || 0);
        if (temp > 0 && remaining > 0) {
          const absorbed = Math.min(temp, remaining);
          remaining -= absorbed;
          const nextTemp = temp - absorbed;
          const tempPath = poolTempPath(pool);
          actorUpdates[tempPath] = nextTemp;
          appliedEntries.push({ pool: tempKey, path: tempPath, pre: temp, post: nextTemp });
          breakdown.push({
            key: "temp", pool, absorbed, from: temp, to: nextTemp,
          });
        }
      }

      if (remaining === 0) {
        breakdown.push({ key: "final", amount: newAmount, pool: tempKey || pool, heal: false });
        continue;
      }

      const uncapped = current - remaining;
      const next = clampPoolValue(pool, uncapped, max);
      if (next === current) {
        breakdown.push({ key: "final", amount: 0, pool, heal: false });
        continue;
      }

      const path = poolValuePath(pool);
      actorUpdates[path] = next;
      appliedEntries.push({ pool, path, pre: current, post: next });

      const applied = Math.abs(current - next);
      if (uncapped !== next) {
        breakdown.push({
          key: "clamp",
          pool,
          from: Math.abs(current - uncapped),
          to: applied,
          reason: uncapped > max ? "max" : "min",
        });
      }
      breakdown.push({ key: "final", amount: applied, pool, heal: false });
    }

    if (appliedEntries.length) {
      await this.update(actorUpdates);
    }

    const appliedDamage = buildAppliedDamage(this, appliedEntries, breakdown);
    if (createMessage && (appliedEntries.length || breakdown.length)) {
      if (op === "heal") appliedDamage.isHealing = true;
      await postDamageTakenMessage(this, appliedDamage);
    }
    return appliedEntries.length || breakdown.length ? appliedDamage : null;
  }

  /**
   * Reverse a prior applyDamage
   * @param {object} appliedDamage
   */
  async undoDamage(appliedDamage) {
    if (!appliedDamage?.updates?.length) return;

    const actorUpdates = {};
    for (const update of appliedDamage.updates) {
      const currentValue = foundry.utils.getProperty(this, update.path);
      if (typeof currentValue === "number") {
        const poolKey = String(update.path).match(/attributes\.(\w+)\.value/)?.[1];
        const max = poolKey ? Number(this.system?.attributes?.[poolKey]?.max) || null : null;
        let restored = currentValue + update.value;
        if (max !== null) restored = clampPoolValue(poolKey, restored, max);
        actorUpdates[update.path] = restored;
      }
    }
    if (!Object.keys(actorUpdates).length) return;
    await this.update(actorUpdates, { PMTTRPG: { damageUndo: true } });
  }

  /**
   * Apply post-combat healing to this actor.
   * According to CR 3.x, actors regen Full ST, [Rank] Light and 5 + [Prudence] SP.
   */
  async applyPostCombatHealing() {
    const updates = {};
    updates[`system.attributes.st.value`] = this.system.st.max;
    updates[`system.attributes.light.value`] = this.system.light.value + this.system.rank;
    updates[`system.attributes.sp.value`] = this.system.sp.value + this.system.abilities.pru + 5;
    await actor.update(updates);
  }

  /**
   * Apply post-combat healing to this actor.
   * According to CR 3.x, actors regen (25 + [For*3] + [Rank*3]) HP, 3 + [Prudence] SP, and [Rank] Light.
   * Multiply this by the number of hours rested.
   * 
   * @param {number} hours Number of hours to rest
   */
  async applyRestHealing(hours = 1) {
    const updates = {};
    updates[`system.attributes.hp.value`] = this.system.hp.value + (this.system.abilities.for + this.system.rank + 25) * hours;
    updates[`system.attributes.sp.value`] = this.system.sp.value + (this.system.abilities.pru + 3) * hours;
    updates[`system.attributes.light.value`] = this.system.light.value + (this.system.rank) * hours;
    await actor.update(updates);
  }

  /**
   * Scrolling text helper method.
   *
   * @param {number} delta Difference to display.
   * @param {number} max Maximum value to calculate against.
   * @param {string} suffix Text to display
   * @param {object} overrideOptions Override options to pass to the token method.
   * @param {"hp"|"st"|"sp"|null} [pool=null]
   */
  showScrollingText(delta, max, suffix="", overrideOptions={}, pool=null) {
    const tokens = this.isToken ? [this.token?.object] : this.getActiveTokens(true);
    if (tokens.length > 0) {
      if (!delta) delta = 0;

      const poolColors = {
        st: 0xffcc00,
        sp: 0x4a9eff,
      };
      let color = poolColors[pool];
      if (color === undefined) {
        color = 0x999999;
        if (delta < 0) color = 0xcc0000;
        else if (delta > 0) color = 0x00cc00;
      }

      for (const token of tokens) {
        if (!token?.center || token.isVisible === false) continue;
        const pct = delta !== 0 ? Math.clamp(Math.abs(delta) / max, 0, 1) : 0.25;
        let content = delta !== 0 ? delta.signedString() + " " + suffix : suffix;
        let textOptions = {
          anchor: CONST.TEXT_ANCHOR_POINTS.CENTER,
          direction: CONST.TEXT_ANCHOR_POINTS.TOP,
          fontSize: 16 + (32 * pct),
          fill: color,
          stroke: 0x000000,
          strokeThickness: 4,
          duration: 3000
        };
        canvas.interface.createScrollingText(token.center, content, foundry.utils.mergeObject(textOptions, overrideOptions));
      }
    }
  }

  /** @override */
  async _preCreate(data, options, user) {
    if (this.type === "character") {
      this.updateSource({
        prototypeToken: {
          actorLink: true,
          disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
          sight: { enabled: true }
        }
      });
    }
  }

  /** @override */
  async _preUpdate(data, options, userId) {
    await super._preUpdate(data, options, userId);
    options.PMTTRPG = options?.PMTTRPG ?? {};

    if (!options.PMTTRPG?.preUpdate) {
      options.PMTTRPG.preUpdate = {system: foundry.utils.duplicate(this.system)};
    }
  }

  /** @override */
  async _onUpdate(updateData, options, userId) {
    await super._onUpdate(updateData, options, userId);
    const context = options?.PMTTRPG?.preUpdate ?? false;

    if (!options.diff || !context || updateData.system === undefined) return; // Nothing to do.

    this._runDepletedEasyEffects(updateData, context, options, userId);

    const poolAnchors = {
      hp: CONST.TEXT_ANCHOR_POINTS.TOP,
      st: CONST.TEXT_ANCHOR_POINTS.CENTER,
      sp: CONST.TEXT_ANCHOR_POINTS.BOTTOM,
      light: CONST.TEXT_ANCHOR_POINTS.BOTTOM,
    };
    const poolLabels = {
      hp: "PMTTRPG.TrackerHP",
      st: "PMTTRPG.TrackerST",
      sp: "PMTTRPG.TrackerSP",
      light: "PMTTRPG.Light",
    };

    for (const pool of APPLY_POOLS) {
      if (updateData.system?.attributes?.[pool]?.value === undefined) continue;
      const original = context.system.attributes?.[pool]?.value ?? null;
      const current = updateData.system.attributes[pool].value ?? null;
      const max = context.system.attributes?.[pool]?.max ?? updateData.system.attributes[pool].max;
      if (isNaN(original) || isNaN(current)) continue;

      const delta = current - original;
      if (delta === 0) continue;
      this.showScrollingText(delta, max, game.i18n.localize(poolLabels[pool]), {
        anchor: poolAnchors[pool],
      }, pool);
    }
  }

  /**
   * Runs [On Depleted] when a pool first hits 0 or below.
   * @param {object} updateData
   * @param {object} preUpdate
   * @param {object} options
   * @param {string} userId
   */
  _runDepletedEasyEffects(updateData, preUpdate, options, userId) {
    if (userId !== game.userId) return;
    if (options?.PMTTRPG?.damageUndo) return;

    const jobs = [];
    for (const pool of APPLY_POOLS) {
      const after = updateData.system?.attributes?.[pool]?.value;
      if (after === undefined) continue;
      const before = preUpdate.system?.attributes?.[pool]?.value;
      if (!crossesDepletion(before, after)) continue;
      const max = Number(preUpdate.system?.attributes?.[pool]?.max) || 0;
      jobs.push({ pool, before, max });
    }
    if (!jobs.length) return;
    const actor = this;
    setTimeout(() => {
      for (const job of jobs) void runDepletedEasyEffects(actor, job);
    }, 0);
  }

  /**
   * Returns the current stack count of a named status on this actor.
   * Count = number of owned items with type 'status' and matching name.
   *
   * @param {string} statusName  e.g. "Burn", "Poise", "Charge"
   * @returns {number}
   */
  getStatusStacks(statusName) {
    const name = ActorPMTTRPG.normalizeStatusRefName(statusName);
    const matching = this.items.filter(
      i => i.type === 'status' && i.name === name && !isPendingStatus(i)
    );
    if (!matching.length) return 0;

    const usesStacksField = matching.some(i => i.system?.stacks != null);
    if (usesStacksField || matching.length === 1) {
      return matching.reduce(
        (sum, i) => sum + Math.max(0, Number(i.system?.stacks ?? 1) || 0),
        0
      );
    }
    return matching.length;
  }

  /**
   * @param {string} statusName
   * @returns {string}
   */
  getStatusOrigin(statusName) {
    const matching = this._activeStatusItems(statusName);
    if (!matching.length) return "";
    return ActorPMTTRPG._normalizeOriginUuid(matching[0].system?.origin);
  }

  getPendingStatusStacks(statusName, arrival = null) {
    const name = ActorPMTTRPG.normalizeStatusRefName(statusName);
    return this.items
      .filter(i => {
        if (i.type !== 'status' || i.name !== name || !isPendingStatus(i)) return false;
        if (arrival == null) return true;
        return normalizeArrival(i.system?.arrival) === normalizeArrival(arrival);
      })
      .reduce((sum, i) => sum + Math.max(0, Number(i.system?.stacks ?? 0) || 0), 0);
  }

  _activeStatusItems(statusName) {
    const name = ActorPMTTRPG.normalizeStatusRefName(statusName);
    return this.items.filter(
      i => i.type === 'status' && i.name === name && !isPendingStatus(i)
    );
  }

  _pendingStatusItems(statusName, arrival = null) {
    const name = ActorPMTTRPG.normalizeStatusRefName(statusName);
    return this.items.filter(i => {
      if (i.type !== 'status' || i.name !== name || !isPendingStatus(i)) return false;
      if (arrival == null) return true;
      return normalizeArrival(i.system?.arrival) === normalizeArrival(arrival);
    });
  }

  /**
   * Max stacks for a status definition (0 = unlimited).
   * @param {Item|object} source
   * @returns {number}
   */
  static _statusStackMax(source) {
    return Math.max(0, Number(source?.system?.stackMax ?? 0) || 0);
  }

  static _normalizeOriginUuid(value) {
    if (!value) return "";
    if (typeof value === "object") {
      if (typeof value.uuid === "string") return value.uuid;
      return "";
    }
    return String(value).trim();
  }

  /**
   * @param {string} statusName
   * @param {number} [amount=1]
   * @param {Item|object|null} [source=null]
   * @param {{ origin?: string|Actor|null, originUuid?: string|null, silent?: boolean }} [options]
   * @returns {Promise<Item[]>}
   */
  async addStatusStacks(statusName, amount = 1, source = null, options = {}) {
    const add = Math.max(0, Math.trunc(Number(amount) || 0));
    if (add <= 0) return [];

    const statusRef = String(statusName ?? "").trim();
    let canonicalName = ActorPMTTRPG.normalizeStatusRefName(statusRef);
    let matching = this._activeStatusItems(canonicalName);

    let sourceItem = matching[0];
    let itemData;
    if (sourceItem) {
      itemData = sourceItem.toObject();
      canonicalName = sourceItem.name;
    } else if (source) {
      itemData = typeof source.toObject === "function"
        ? source.toObject()
        : foundry.utils.duplicate(source);
      canonicalName = itemData?.name || canonicalName;
      matching = this._activeStatusItems(canonicalName);
      sourceItem = matching[0] ?? null;
    } else {
      itemData = await ActorPMTTRPG._resolveStatusTemplate(statusRef);
      if (!itemData) {
        const warning = game.i18n.format("PMTTRPG.StatusNotFound", { name: statusRef });
        console.warn(`PMTTRPG | ${warning}`);
        ui.notifications?.warn(warning);
        return [];
      }
      canonicalName = itemData.name;
      matching = this._activeStatusItems(canonicalName);
      sourceItem = matching[0] ?? null;
    }

    // A pending item used as a template must become active.
    if (itemData.system) {
      itemData.system.pending = false;
      itemData.system.arrival = "";
      itemData.system.shelved = false;
    }

    const originUuid = ActorPMTTRPG._normalizeOriginUuid(
      options.originUuid ?? options.origin ?? source?.system?.origin ?? itemData?.system?.origin
    );

    const stackMax = ActorPMTTRPG._statusStackMax(itemData);
    const current = this.getStatusStacks(canonicalName);
    const room = stackMax > 0 ? Math.max(0, stackMax - current) : add;
    const toAdd = stackMax > 0 ? Math.min(add, room) : add;
    if (toAdd <= 0) return sourceItem ? [sourceItem] : [];

    const nextStacks = current + toAdd;
    const wasAbsent = current <= 0;

    let kept;
    if (matching.length === 0) {
      const created = foundry.utils.duplicate(itemData);
      delete created._id;
      created.system = created.system ?? {};
      created.system.stacks = nextStacks;
      created.system.pending = false;
      created.system.arrival = "";
      created.system.shelved = false;
      created.system.origin = originUuid;
      if (stackMax > 0) created.system.stackMax = stackMax;
      const docs = await this.createEmbeddedDocuments('Item', [created], statusMutationOptions(options, toAdd));
      kept = docs[0];
    } else {
      // Merge legacy copies into the kept item.
      kept = matching[0];
      const extras = matching.slice(1).map(i => i.id);
      const updates = {
        'system.stacks': nextStacks,
        'system.pending': false,
        'system.arrival': "",
        'system.shelved': false,
      };
      // Do not replace the first applier.
      if (originUuid && !ActorPMTTRPG._normalizeOriginUuid(kept.system?.origin)) {
        updates['system.origin'] = originUuid;
      }
      await kept.update(updates, statusMutationOptions(options, toAdd));
      if (extras.length) {
        await this.deleteEmbeddedDocuments('Item', extras, statusMutationOptions(options, 0));
      }
    }

    if (wasAbsent && kept) {
      Hooks.callAll("pmttrpg.statusApplied", {
        actor: this,
        item: kept,
        statusName: canonicalName,
        stacks: nextStacks,
        origin: kept.system?.origin ?? originUuid ?? "",
      });
    }
    if (kept) {
      await emitStatusStackHook(this, "pmttrpg.statusGained", {
        actor: this,
        item: kept,
        statusName: canonicalName,
        before: current,
        after: nextStacks,
        amount: toAdd,
        origin: kept.system?.origin ?? originUuid ?? "",
      });
    }
    return kept ? [kept] : [];
  }

  /**
   * Sets the stack count of a status to an exact value.
   * Adds or removes items as needed.
   *
   * @param {string} statusName  Display name or Document UUID
   * @param {number} target
   * @param {{ silent?: boolean }} [options]
   * @returns {Promise<void>}
   */
  async setStatusStacks(statusName, target, options = {}) {
    let desired = Math.max(0, Math.trunc(Number(target) || 0));
    const statusRef = String(statusName ?? "").trim();
    let canonicalName = ActorPMTTRPG.normalizeStatusRefName(statusRef);
    let matching = this._activeStatusItems(canonicalName);
    let stackMax = matching[0]
      ? ActorPMTTRPG._statusStackMax(matching[0])
      : 0;

    if (!matching.length && desired > 0) {
      const itemData = await ActorPMTTRPG._resolveStatusTemplate(statusRef);
      if (itemData) {
        stackMax = ActorPMTTRPG._statusStackMax(itemData);
        canonicalName = itemData.name || canonicalName;
        matching = this._activeStatusItems(canonicalName);
      }
    }
    if (stackMax > 0 && desired > 0) desired = Math.min(desired, stackMax);

    if (desired <= 0) {
      if (!matching.length) return;
      const current = this.getStatusStacks(canonicalName);
      await this.removeStatusStacks(canonicalName, Math.max(current, 1), options);
      return;
    }

    const current = this.getStatusStacks(canonicalName);
    if (current === desired && matching.length === 1) {
      if (Number(matching[0].system?.stacks ?? 1) !== desired) {
        await matching[0].update({ 'system.stacks': desired }, statusMutationOptions(options, 0));
      }
      return;
    }

    const delta = desired - current;
    if (delta > 0) await this.addStatusStacks(statusRef, delta, null, options);
    else if (delta < 0) await this.removeStatusStacks(canonicalName, Math.abs(delta), options);
    else if (matching.length > 1) {
      // The total matches, but legacy copies still need merging.
      await matching[0].update({ 'system.stacks': desired }, statusMutationOptions(options, 0));
      await this.deleteEmbeddedDocuments(
        'Item',
        matching.slice(1).map(i => i.id),
        statusMutationOptions(options, 0),
      );
    }
  }

  /**
   * Remove status stacks, clamping at zero.
   * @param {string} statusName
   * @param {number} [amount=1]
   * @param {{ silent?: boolean }} [options]
   * @returns {Promise<string[]>}
   */
  async removeStatusStacks(statusName, amount = 1, options = {}) {
    const remove = Math.max(0, Math.trunc(Number(amount) || 0));
    if (remove <= 0) return [];

    const matching = this._activeStatusItems(statusName);
    if (!matching.length) return [];

    const current = this.getStatusStacks(statusName);
    const next = Math.max(0, current - remove);
    if (next === current) return [];
    const item = matching[0];
    const lost = current - next;

    if (next <= 0) {
      const extras = matching.slice(1).map(i => i.id);
      if (extras.length) {
        await this.deleteEmbeddedDocuments('Item', extras, statusMutationOptions({ silent: true }, 0));
      }
      const deleted = await this.deleteEmbeddedDocuments(
        'Item',
        [item.id],
        statusMutationOptions(options, -lost),
      );
      await emitStatusStackHook(this, "pmttrpg.statusLost", {
        actor: this,
        item,
        statusName,
        before: current,
        after: 0,
        amount: lost,
      });
      Hooks.callAll("pmttrpg.statusRemoved", {
        actor: this,
        item,
        statusName,
      });
      return deleted;
    }

    const extras = matching.slice(1).map(i => i.id);
    await item.update({ 'system.stacks': next }, statusMutationOptions(options, -lost));
    if (extras.length) {
      await this.deleteEmbeddedDocuments('Item', extras, statusMutationOptions({ silent: true }, 0));
    }
    await emitStatusStackHook(this, "pmttrpg.statusLost", {
      actor: this,
      item,
      statusName,
      before: current,
      after: next,
      amount: lost,
    });
    return extras;
  }

  /**
   * @param {string} statusName
   * @param {number} [amount=1]
   * @param {{ arrival?: "round"|"turn", source?: Item|object|null, origin?: string|Actor|null, originUuid?: string|null, silent?: boolean }} [options]
   */
  async addPendingStatusStacks(statusName, amount = 1, options = {}) {
    const add = Math.max(0, Math.trunc(Number(amount) || 0));
    if (add <= 0) return [];
    const arrival = normalizeArrival(options.arrival ?? "round");
    const source = options.source ?? null;
    const statusRef = String(statusName ?? "").trim();
    let canonicalName = ActorPMTTRPG.normalizeStatusRefName(statusRef);

    let active = this._activeStatusItems(canonicalName);
    let pending = this._pendingStatusItems(canonicalName, arrival);

    let itemData;
    if (pending[0]) {
      itemData = pending[0].toObject();
      canonicalName = pending[0].name;
    } else if (active[0]) {
      itemData = active[0].toObject();
      canonicalName = active[0].name;
    } else if (source) {
      itemData = typeof source.toObject === "function"
        ? source.toObject()
        : foundry.utils.duplicate(source);
      canonicalName = itemData?.name || canonicalName;
      active = this._activeStatusItems(canonicalName);
      pending = this._pendingStatusItems(canonicalName, arrival);
    } else {
      itemData = await ActorPMTTRPG._resolveStatusTemplate(statusRef);
      if (!itemData) {
        const warning = game.i18n.format("PMTTRPG.StatusNotFound", { name: statusRef });
        console.warn(`PMTTRPG | ${warning}`);
        ui.notifications?.warn(warning);
        return [];
      }
      canonicalName = itemData.name;
      active = this._activeStatusItems(canonicalName);
      pending = this._pendingStatusItems(canonicalName, arrival);
    }

    const originUuid = ActorPMTTRPG._normalizeOriginUuid(
      options.originUuid ?? options.origin ?? source?.system?.origin ?? itemData?.system?.origin
    );

    const stackMax = ActorPMTTRPG._statusStackMax(itemData);
    const activeStacks = this.getStatusStacks(canonicalName);
    const pendingStacks = this.getPendingStatusStacks(canonicalName, arrival);
    // Live and queued stacks share the same cap.
    const room = stackMax > 0
      ? Math.max(0, stackMax - activeStacks - pendingStacks)
      : add;
    const toAdd = stackMax > 0 ? Math.min(add, room) : add;
    if (toAdd <= 0) return pending[0] ? [pending[0]] : [];

    const nextStacks = pendingStacks + toAdd;
    if (pending[0]) {
      const kept = pending[0];
      const extras = pending.slice(1).map(i => i.id);
      const updates = {
        "system.stacks": nextStacks,
        "system.pending": true,
        "system.arrival": arrival,
        "system.shelved": false,
      };
      if (originUuid && !ActorPMTTRPG._normalizeOriginUuid(kept.system?.origin)) {
        updates["system.origin"] = originUuid;
      }
      await kept.update(updates, statusMutationOptions(options, toAdd));
      if (extras.length) {
        await this.deleteEmbeddedDocuments("Item", extras, statusMutationOptions(options, 0));
      }
      return [kept];
    }

    const created = foundry.utils.duplicate(itemData);
    delete created._id;
    created.system = created.system ?? {};
    created.system.stacks = nextStacks;
    created.system.pending = true;
    created.system.arrival = arrival;
    created.system.shelved = false;
    created.system.origin = originUuid || ActorPMTTRPG._normalizeOriginUuid(created.system.origin);
    if (stackMax > 0) created.system.stackMax = stackMax;
    const docs = await this.createEmbeddedDocuments("Item", [created], statusMutationOptions(options, toAdd));
    return docs;
  }

  /**
   * @param {string} statusName
   * @param {number} [amount=1]
   * @param {{ arrival?: "round"|"turn", silent?: boolean }} [options]
   * @returns {Promise<string[]>}
   */
  async removePendingStatusStacks(statusName, amount = 1, options = {}) {
    const remove = Math.max(0, Math.trunc(Number(amount) || 0));
    if (remove <= 0) return [];

    const arrival = normalizeArrival(options.arrival ?? "round");
    const pending = this._pendingStatusItems(statusName, arrival);
    if (!pending.length) return [];

    const current = this.getPendingStatusStacks(statusName, arrival);
    const next = Math.max(0, current - remove);
    if (next === current) return [];
    const item = pending[0];
    const lost = current - next;
    const extras = pending.slice(1).map(i => i.id);

    if (extras.length) {
      await this.deleteEmbeddedDocuments("Item", extras, statusMutationOptions({ silent: true }, 0));
    }
    if (next <= 0) {
      return this.deleteEmbeddedDocuments("Item", [item.id], statusMutationOptions(options, -lost));
    }
    await item.update({ "system.stacks": next }, statusMutationOptions(options, -lost));
    return extras;
  }

  /**
   * @param {string} statusName
   * @param {number} target
   * @param {{ arrival?: "round"|"turn", silent?: boolean }} [options]
   * @returns {Promise<Item[]>}
   */
  async setPendingStatusStacks(statusName, target, options = {}) {
    const arrival = normalizeArrival(options.arrival ?? "round");
    let desired = Math.max(0, Math.trunc(Number(target) || 0));
    const statusRef = String(statusName ?? "").trim();
    let canonicalName = ActorPMTTRPG.normalizeStatusRefName(statusRef);
    let pending = this._pendingStatusItems(canonicalName, arrival);

    let stackMax = pending[0]
      ? ActorPMTTRPG._statusStackMax(pending[0])
      : 0;
    if (!pending.length && desired > 0) {
      const itemData = await ActorPMTTRPG._resolveStatusTemplate(statusRef);
      if (itemData) {
        stackMax = ActorPMTTRPG._statusStackMax(itemData);
        canonicalName = itemData.name || canonicalName;
        pending = this._pendingStatusItems(canonicalName, arrival);
      }
    }

    const activeStacks = this.getStatusStacks(canonicalName);
    if (stackMax > 0 && desired > 0) {
      desired = Math.min(desired, Math.max(0, stackMax - activeStacks));
    }

    if (desired <= 0) {
      if (!pending.length) return [];
      const current = this.getPendingStatusStacks(canonicalName, arrival);
      return this.removePendingStatusStacks(canonicalName, Math.max(current, 1), { ...options, arrival });
    }

    if (!pending.length) {
      return this.addPendingStatusStacks(statusRef, desired, { ...options, arrival });
    }

    const current = this.getPendingStatusStacks(canonicalName, arrival);
    const kept = pending[0];
    if (!kept || !this.items.has(kept.id)) return [];
    const extras = pending.slice(1).map(i => i.id).filter(id => id && this.items.has(id));
    if (current === desired && extras.length === 0) {
      if (Number(kept.system?.stacks ?? 0) !== desired) {
        await kept.update({ "system.stacks": desired }, statusMutationOptions(options, 0));
      }
      return [kept];
    }

    await kept.update(
      { "system.stacks": desired },
      statusMutationOptions(options, desired - current),
    );
    if (extras.length) {
      await this.deleteEmbeddedDocuments("Item", extras, statusMutationOptions(options, 0));
    }
    return [kept];
  }

  // Reuse the item so Pause does not fire On Lose.
  async pauseStatusToPending(statusName, options = {}) {
    const arrival = normalizeArrival(options.arrival ?? "round");
    const matching = this._activeStatusItems(statusName);
    const activeStacks = this.getStatusStacks(statusName);
    if (!matching.length || activeStacks <= 0) return [];

    const kept = matching[0];
    const pending = this._pendingStatusItems(statusName, arrival);
    const pendingStacks = this.getPendingStatusStacks(statusName, arrival);
    const stackMax = ActorPMTTRPG._statusStackMax(kept);
    let nextStacks = activeStacks + pendingStacks;
    if (stackMax > 0) nextStacks = Math.min(nextStacks, stackMax);

    const toDelete = [
      ...matching.slice(1).map(i => i.id),
      ...pending.map(i => i.id),
    ];

    await kept.update({
      "system.stacks": nextStacks,
      "system.pending": true,
      "system.arrival": arrival,
      "system.shelved": true,
    }, statusMutationOptions({ silent: true }, 0));
    if (toDelete.length) {
      await this.deleteEmbeddedDocuments("Item", toDelete, statusMutationOptions({ silent: true }, 0));
    }
    return [kept];
  }

  // Pause-shelved stacks skip On Gain when restored.
  async promotePendingStatuses({ arrival = "round" } = {}) {
    const want = normalizeArrival(arrival);
    const pending = this.items.filter(
      i => isPendingStatus(i) && normalizeArrival(i.system?.arrival) === want
    );
    if (!pending.length) return;

    for (const item of pending) {
      const name = item.name;
      const stacks = Math.max(0, Number(item.system?.stacks ?? 0) || 0);
      if (stacks <= 0) {
        await this.deleteEmbeddedDocuments("Item", [item.id], statusMutationOptions({ silent: true }, 0));
        continue;
      }

      const active = this._activeStatusItems(name);
      const shelved = !!item.system?.shelved;

      if (active.length) {
        await this.addStatusStacks(name, stacks, item, { silent: true });
        await this.deleteEmbeddedDocuments("Item", [item.id], statusMutationOptions({ silent: true }, 0));
        continue;
      }

      await item.update({
        "system.stacks": stacks,
        "system.pending": false,
        "system.arrival": "",
        "system.shelved": false,
      }, statusMutationOptions({ silent: true }, 0));

      if (shelved) continue;

      Hooks.callAll("pmttrpg.statusApplied", {
        actor: this,
        item,
        statusName: name,
        stacks,
      });
      await emitStatusStackHook(this, "pmttrpg.statusGained", {
        actor: this,
        item,
        statusName: name,
        before: 0,
        after: stacks,
        amount: stacks,
      });
    }
  }

  /** @param {string} ref @returns {boolean} */
  static _looksLikeStatusUuid(ref) {
    const s = String(ref ?? "").trim();
    if (!s || !s.includes(".")) return false;
    return /^(?:Item|Actor|Compendium|Scene)\./.test(s) || s.includes(".Item.");
  }

  /** @param {string} statusRef @returns {string} */
  static normalizeStatusRefName(statusRef) {
    const ref = String(statusRef ?? "").trim();
    if (!ref || !ActorPMTTRPG._looksLikeStatusUuid(ref)) return ref;
    try {
      const doc = globalThis.fromUuidSync?.(ref);
      if (doc?.type === "status") return doc.name;
    } catch (_) { /* ignore */ }
    const worldId = /^Item\.(.+)$/.exec(ref)?.[1];
    if (worldId) {
      const it = game.items?.get(worldId);
      if (it?.type === "status") return it.name;
    }
    return ref;
  }

  /**
   * Lookup order: UUID, world items, item compendia.
   * @param {string} statusRef
   * @returns {Promise<object|null>}
   */
  static async _resolveStatusTemplate(statusRef) {
    const ref = String(statusRef ?? "").trim();
    if (!ref) return null;

    if (ActorPMTTRPG._looksLikeStatusUuid(ref)) {
      try {
        const doc = await fromUuid(ref);
        if (doc?.type === "status") return doc.toObject();
      } catch (err) {
        console.warn(`PMTTRPG | Could not resolve status UUID '${ref}'`, err);
      }
      return null;
    }

    const world = game.items?.find(i => i.type === "status" && i.name === ref) ?? null;
    if (world) return world.toObject();

    return ActorPMTTRPG._fetchStatusFromCompendium(ref);
  }

  /**
   * Searches all loaded compendium packs for a status item by name.
   * Checks Item-type packs only.
   *
   * @param {string} statusName
   * @returns {Promise<object|null>}  Raw item data object, or null if not found.
   */
  static async _fetchStatusFromCompendium(statusName) {
    // Search packs in order — first match wins.
    // You can narrow this by filtering pack.metadata.id if you want to
    // prioritise your own compendium:
    //   e.g. pack.metadata.id === 'projectmoonttrpg.statuses'
    for (const pack of game.packs) {
      if (pack.documentName !== 'Item') continue;

      const index = await pack.getIndex({ fields: ['name', 'type'] });
      const entry = index.find(
        e => e.type === 'status' && e.name === statusName
      );
      if (!entry) continue;

      const doc = await pack.getDocument(entry._id);
      return doc?.toObject() ?? null;
    }

    return null;
  }
}
