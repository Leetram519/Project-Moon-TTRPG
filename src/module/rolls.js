import { PMTTRPGUtility } from "./utility.js";
import { PMTTRPGTargetingAPI } from "./targeting.js";
const { renderTemplate } = foundry.applications.handlebars;
import { initiateAttack } from "./combat/clashing.js";
import { promptRangedAmmo } from "./combat/clash-dialog.js";

export class PMTTRPGRolls {

  constructor() {
    this.actor = null;
    this.actorData = null;
    this.item = null;
  }

  static getRollFormula(defaultFormula = '2d6') {
    // TODO: Incorporate adv/dis/ongoing/forward.
    return defaultFormula;
  }

  static getModifiers(actor) {
    let forward = Number(actor.system.attributes?.forward?.value) ?? 0;
    let ongoing = Number(actor.system.attributes?.ongoing?.value) ?? 0;
    let result = '';
    if (forward) result += `+${forward}`;
    if (ongoing) result += `+${ongoing}`;
    return result;
  }

  static getSkillTypeLabel(skillType) {
    switch (skillType) {
    case 'attack':
      return game.i18n.localize('PMTTRPG.SkillTypeAttack');
    case 'block':
      return game.i18n.localize('PMTTRPG.SkillTypeBlock');
    case 'evade':
      return game.i18n.localize('PMTTRPG.SkillTypeEvade');
    case 'stat':
      return game.i18n.localize('PMTTRPG.SkillTypeStatUse');
    default:
      return skillType;
    }
  }

  static getSkillOptions(actor, skillType) {
    if (!actor) return [];

    const items = actor.items.filter(item => skillType === 'attack' ? item.type === 'weapon' : item.type === 'outfit') ?? [];
    const isAttack = skillType === 'attack';

    return items
      .map(item => {
        const isEquipped = !!item.system?.equipped;
        const formula = isAttack
          ? (item.system?.offensiveDiceComputed || '1d10')
          : (skillType === 'block'
            ? (item.system?.blockDiceComputed || '1d10')
            : (item.system?.evadeDiceComputed || '1d12'));

        return {
          id: item.id,
          name: item.name,
          img: item.img,
          formula,
          damageType: isAttack ? (item.system?.damageType ?? null) : null,
          typeLabel: isAttack ? game.i18n.localize('PMTTRPG.Weapon') : game.i18n.localize('PMTTRPG.Outfits'),
          isEquipped,
          isDefault: isEquipped,
        };
      })
      .sort((left, right) => {
        if (left.isDefault === right.isDefault) return left.name.localeCompare(right.name);
        return left.isDefault ? -1 : 1;
      });
  }

  static async promptSkillRoll({ actor, skill, skillType, options = [] } = {}) {
    if (!actor || !skill) return null;

    const defaultOption = options.find(option => option.isDefault) ?? options[0] ?? null;
    const dialogData = {
      skill: {
        name: skill.name,
        img: skill.img,
        typeLabel: this.getSkillTypeLabel(skillType),
        lightCost: Number(skill.system?.lightCost ?? 0),
        description: skill.system?.description ?? '',
      },
      options,
      selectedOption: defaultOption,
      consumeLight: true,
    };

    const html = await renderTemplate('systems/projectmoonttrpg/templates/dialog/skill-roll-dialog.html', dialogData);
    const dlgOptions = {
      classes: ['projectmoonttrpg', 'PMTTRPG-dialog']
    };

    if (PMTTRPGUtility.nightmode) dlgOptions.classes.push('nightmode');

    return foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.format('PMTTRPG.Dialog.skillRollTitle', { skill: skill.name }) },
      position: { width: 440 },
      classes: dlgOptions.classes,
      content: html,
      buttons: [{
        action: 'roll',
        label: game.i18n.localize('PMTTRPG.Dialog.roll'),
        default: true,
        callback: (event, button, dialog) => {
          const form = dialog.element.querySelector('form');
          return {
            itemId: form.itemId?.value ?? defaultOption?.id ?? null,
            consumeLight: !!form.consumeLight?.checked,
          };
        }
      }, {
        action: 'cancel',
        label: game.i18n.localize('PMTTRPG.Dialog.cancel'),
        callback: () => null
      }],
      rejectClose: false
    });
  }

  static async doSkillRoll({ actor, skill, templateData = {} } = {}) {
    if (!actor || !skill) return false;

    this.actor = actor;
    this.actorData = actor.system ?? {};
    this.item = null;

    const skillType = skill.system?.skillType ?? 'attack';
    if (skillType === 'stat') {
      const statKey = skill.system?.stat || 'for';
      const statLabel = game.i18n.localize(`PMTTRPG.Ability${statKey[0].toUpperCase()}${statKey.slice(1)}`);
      return this.doStatRoll({
        actor,
        stat: statKey,
        label: statLabel,
        templateData: foundry.utils.mergeObject(templateData, {
          image: skill.img,
          title: skill.name,
          details: skill.system?.description ?? ''
        }, { inplace: false })
      });
    }

    const options = this.getSkillOptions(actor, skillType);
    if (!options.length) {
      ui.notifications.warn(game.i18n.localize(skillType === 'attack' ? 'PMTTRPG.Notifications.noWeaponWarning' : 'PMTTRPG.Notifications.noOutfitWarning'));
      return false;
    }

    const promptResult = await this.promptSkillRoll({ actor, skill, skillType, options });
    if (!promptResult) return false;

    const selectedOption = options.find(option => option.id === promptResult.itemId) ?? options[0];
    if (!selectedOption) return false;

    const hostItem = actor.items.get(selectedOption.id) ?? null;
    if (!hostItem) return false;

    if (skillType === 'attack') {
      let ammo = null;
      let consumeAmmo = true;
      let dryFire = false;
      if (hostItem.system?.weaponType === 'ranged') {
        const ammoPick = await promptRangedAmmo(actor, hostItem);
        if (!ammoPick) return false;
        ammo = ammoPick.ammo;
        consumeAmmo = ammoPick.consumeAmmo;
        dryFire = ammoPick.dryFire;
      }

      const targetSelection = await PMTTRPGTargetingAPI.promptTargetSelection({
        actor,
        title: skill.name,
        sourceName: hostItem.name,
        sourceImg: skill.img,
        preferredCombatantId: game.combat?.combatant?.id ?? null,
      });
      if (targetSelection === null) return false;

      return hostItem.roll({
        configureDialog: false,
        ammo,
        consumeAmmo,
        dryFire,
        appliedTool: null,
        consumeAppliedTool: false,
        declaredSkill: skill,
        consumeSkillLight: promptResult.consumeLight,
        targetSelection,
      });
    }

    const lightCost = Math.max(0, Number(skill.system?.lightCost ?? 0));
    if (promptResult.consumeLight && lightCost > 0) {
      const currentLight = Number(actor.system?.attributes?.light?.value ?? 0);
      await actor.update({
        'system.attributes.light.value': Math.max(0, currentLight - lightCost)
      });
    }

    const flavor = game.i18n.format('PMTTRPG.Dialog.usingSkillWith', { item: selectedOption.name });

    return this.rollMove({
      actor,
      formula: selectedOption.formula,
      templateData: foundry.utils.mergeObject(templateData, {
        image: skill.img,
        title: skill.name,
        flavor,
        details: skill.system?.description ?? '',
        rollType: 'defense',
        defenseType: skillType,
        skillName: skill.name,
        skillUseName: selectedOption.name,
        skillUseFormula: selectedOption.formula,
      }, { inplace: false })
    });
  }

  static async promptStatRoll(abilityLabel, rollMode = 'def') {
    let dialogData = {
      abilityLabel,
      rollMode
    };
    const html = await renderTemplate('systems/projectmoonttrpg/templates/dialog/stat-roll-dialog.html', dialogData);
    const dlgOptions = {
      classes: ['projectmoonttrpg', 'PMTTRPG-dialog']
    };

    if (PMTTRPGUtility.nightmode) dlgOptions.classes.push('nightmode');

    return foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.format('PMTTRPG.Dialog.statRollTitle', { ability: abilityLabel }) },
      classes: dlgOptions.classes,
      content: html,
      buttons: [{
        action: 'roll',
        label: game.i18n.localize('PMTTRPG.Dialog.roll'),
        default: true,
        callback: (event, button, dialog) => {
          const form = dialog.element.querySelector('form');
          return { rollMode: form.advantage.value, modifier: Number(form.modifier.value) || 0 };
        }
      }, {
        action: 'cancel',
        label: game.i18n.localize('PMTTRPG.Dialog.cancel'),
        callback: () => null
      }],
      rejectClose: false
    });
  }

  static async doStatRoll({ actor, stat, label = null, templateData = {}, statModifier = 0 } = {}) {
    if (!actor || !stat) return false;

    this.actor = actor;
    this.actorData = actor.system ?? {};
    this.item = null;

    const abilityLabel = label ?? game.i18n.localize(`PMTTRPG.${stat.toUpperCase()}`);
    const rollDialog = await this.promptStatRoll(abilityLabel, actor.flags?.projectmoonttrpg?.rollMode ?? 'def');
    if (!rollDialog) return false;

    await this.actor.setFlag('projectmoonttrpg', 'rollMode', rollDialog.rollMode);

    return this.rollMove({
      actor,
      formula: stat,
      templateData,
      statModifier: Number(statModifier) + rollDialog.modifier
    });
  }

  static async rollMove(options = {}) {
    let dice = this.getRollFormula('2d6');

    // TODO: Create a way to resolve this using the formula only, sans actor.
    // If there's no actor, we need to exit.
    if (!options.actor) {
      return false;
    }

    // If there's no formula or item, we need to exit.
    if (!options.formula && !options.data) {
      return false;
    }

    // Grab the actor data.
    this.actor = options.actor;
    this.actorData = this.actor ? this.actor.system : {};
    let actorType = this.actor.type;

    // Grab the item data, if any.
    this.item = options?.data;
    const targetSelection = options?.targetSelection ?? null;

    // Grab the formula, if any.
    let formula = options.formula ?? null;
    let label = options?.data?.label ?? '';
    
    // Grab the stat modifier (from stat roll dialog), if any.
    let statModifier = options?.statModifier ?? 0;
    const onBeforeChat = typeof options?.onBeforeChat === "function" ? options.onBeforeChat : null;

    // Prepare template data for the roll.
    let templateData = options.templateData ? foundry.utils.duplicate(options.templateData): {};
    let data = {};

    if (targetSelection) {
      templateData.target = targetSelection;
      templateData.attackRoll = true;
    }

    let dlgOptions = {
      classes: ['projectmoonttrpg', 'PMTTRPG-dialog']
    };

    if (this.item) {
      if (this.item.type == 'weapon') {
        templateData = foundry.utils.mergeObject(
          {
            image: this.item.img,
            title: this.item.name,
            trigger: null,
            details: this.item.system.description,
            rollType: 'damage',
            damageType: this.item.system?.damageType ?? null,
          }, templateData
        );
        data.roll = this.item.system.offensiveDiceComputed;
        this.rollMoveExecute(data.roll, data, templateData, null, statModifier, onBeforeChat);
      }
      else if (this.item.type == 'outfit') {
        this.rollMoveExecute(formula, data, templateData, null, statModifier, onBeforeChat);
      }
    }
    else {
      this.rollMoveExecute(formula, data, templateData, null, statModifier, onBeforeChat);
    }
  }

  static async rollMoveExecute(roll, dataset, templateData, form = null, statModifier = 0, onBeforeChat = null) {
    // Render the roll.
    let template = 'systems/projectmoonttrpg/templates/chat/chat-move.html';
    let dice = PMTTRPGUtility.getRollFormula('2d6');
    let forwardUsed = false;
    let rollModeUsed = false;
    let resultRangeNeeded = false;
    let rollData = this.actor.getRollData();
    // GM rolls.
    let chatData = {
      author: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor })
    };

    // Dice So Nice Dice Type Integration
    rollData.type = templateData.visualType;

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
    if (!PMTTRPGUtility.isEmpty(roll)) {
      // Validate teh roll
      let validRoll = false;
      try {
        validRoll = typeof Roll.validate === "function" ? Roll.validate(roll.trim()) : !!(new Roll(roll.trim(), {type:rollData.visualType}, rollData));
      } catch (error) {
        validRoll = false;
      }
      // Roll can be either a formula like `2d6+3` or a raw stat like `str`.
      let formula = validRoll ? roll.trim() : '';
      // Handle bond (user input).
      if (!validRoll || dataset?.rollType == 'formula') {
        if (dataset?.rollType == 'formula') {
          formula = roll;
        }
        
        else if (roll.match(/(\d*)d\d+/g)) {
          formula = roll;
        }
        
        else {
          // Determine if the stat toggle is in effect.
          let toggleModifier = 0;
          formula = `${dice}+${this.actorData.abilities[roll].mod}${toggleModifier ? '+' + toggleModifier : ''}`;
          if (dataset.mod && dataset.mod != 0) {
            formula += `+${dataset.mod}`;
          }
          // Add stat modifier from dialog (if provided)
          if (statModifier && statModifier != 0) {
            formula += statModifier > 0 ? `+${statModifier}` : `${statModifier}`;
          }
        }

        // Handle formula overrides.
        let formulaOverride = this.actor.system.attributes?.rollFormula?.value;
        if (formulaOverride && formula.includes('2d6')) {
          let overrideIsValid = false;
          try {
            overrideIsValid = typeof Roll.validate === "function"
              ? Roll.validate(formulaOverride.trim())
              : !!(new Roll(formulaOverride.trim(), {type:rollData.visualType}, rollData));
          }
          catch (error) {
            overrideIsValid = false;
          }

          if (overrideIsValid) formula = formula.replace('2d6', formulaOverride);
        }

        if (formula.includes('2d6') || formulaOverride && formula.includes(formulaOverride)) {
          resultRangeNeeded = true;
        }

        // Handle adv/dis.
        let rollMode = this.actor.flags?.projectmoonttrpg?.rollMode ?? 'def';
        switch (rollMode) {
          case 'adv':
            rollModeUsed = true;
            if (formula.includes('2d6')) {
              formula = formula.replace('2d6', '{2d6, 2d6}kh');
            }
            else if (formula.includes('d6')) {
              // Match the first d6 as (n)d6.
              formula = formula.replace(/(\d*)(d6)/, (match, p1, p2, offset, string) => {
                let count = keep + 1;
                return `{${count}d6, ${count}d6}kh`; // Ex: 2d6 -> 3d6kh2
              });
            }
            break;

          case 'dis':
            rollModeUsed = true;
            if (formula.includes('2d6')) {
              formula = formula.replace('2d6', '{2d6, 2d6}kl');
            }
            else if (formula.includes('d6')) {
              formula = formula.replace(/(\d*)(d6)/, (match, p1, p2, offset, string) => {
                let count = keep + 1;
                return `{${count}d6, ${count}d6}kl`;
              });
            }
            break;
        }

        // Append the modifiers.
        let modifiers = PMTTRPGRolls.getModifiers(this.actor);
        formula = `${formula}${modifiers}`;
        forwardUsed = Number(this.actor.system.attributes?.forward?.value) != 0;
      }
      if (formula != null) {
        // Defer targeted weapon rolls until someone retaliates.
        if (templateData?.attackRoll && templateData?.target && this.item) {
          templateData.actor = this.actor;

          const attackPayload = PMTTRPGTargetingAPI.buildAttackContextPayload({
            actor: this.actor,
            item: this.item,
            roll: null,
            templateData,
            target: templateData.target,
          });
          attackPayload.rollBreakdown = [];

          try {
            await initiateAttack(attackPayload);
          } catch (error) {
            console.warn("[PMTTRPG] initiateAttack failed", error);
          }
          return;
        }

        // Do the roll.
        let roll = new Roll(`${formula}`, {type:rollData.visualType}, rollData);
        await (roll.evaluate());
        let rollType = templateData.rollType ?? 'none';
        // Add success notification.
        if (resultRangeNeeded) {
          // Retrieve the result ranges.
          let resultRanges = CONFIG.PMTTRPG.rollResults;
          let resultType = null;
          // Iterate through each result range until we find a match.
          for (let [resultKey, resultRange] of Object.entries(resultRanges)) {
            // Grab the start and end.
            let start = resultRange.start;
            let end = resultRange.end;
            // If both are present, roll must be between them.
            if (start && end) {
              if (roll.total >= start && roll.total <= end) {
                resultType = resultKey;
                break;
              }
            }
            // If start only, treat it as greater than or equal to.
            else if (start) {
              if (roll.total >= start) {
                resultType = resultKey;
                break;
              }
            }
            // If end only, treat it as less than or equal to.
            else if (end) {
              if (roll.total <= end) {
                resultType = resultKey;
                break;
              }
            }
          }

          // Update the templateData.
          templateData.resultLabel = resultRanges[resultType]?.label ?? resultType;
          templateData.result = resultType;
        }

        if (typeof onBeforeChat === "function") {
          try {
            await onBeforeChat({ resultType: templateData.result ?? null, roll, templateData });
          }
          catch (error) {
            console.warn("[PMTTRPG] onBeforeChat failed", error);
          }
        }

        // Render it.
        templateData.actor = this.actor;
        templateData.formula = formula;

        if (formula != null) {
          // if it's a clash prompt, intercept and prevent the rest.
          if (templateData?.attackRoll && templateData?.target) {
            const attackPayload = PMTTRPGTargetingAPI.buildAttackContextPayload({
              actor: this.actor,
              item: this.item,
              roll,
              templateData,
              target: templateData.target,
            });
            try {
              await game.projectmoonttrpg?.statusMacros?.emitAttackRoll(attackPayload);
            }
            catch (error) {
              console.warn('[PMTTRPG] Attack roll hook failed', error);
            }
            try {
            // Hand off to the clash system. initiateAttack() posts the attack card (with hidden roll + Retaliate buttons) and 
            // waits for a retaliator. it does NOT fire attackConnected immediately. That hook only fires after the clash resolves.
              if (this.item) {
                await initiateAttack(attackPayload);
                return;
              }


              /*Hooks.callAll("pmttrpg.attackConnected", {
                attacker: this.actor,
                defender: attackPayload.targetActor ?? null,
                item: this.item,
                appliedTool: templateData.appliedToolId
                  ? (this.actor?.items.get(templateData.appliedToolId) ?? null)
                  : null,
              });*/
            }
            catch (error) {
              console.warn("[EasyEffects] attackConnected hook failed", error);
            }
          }
          try {
            templateData.rollPMTTRPG = await roll.render();
            templateData.roll = roll;
            chatData.content = await renderTemplate(template, templateData);
            chatData.flags = foundry.utils.mergeObject(chatData.flags ?? {}, {
              projectmoonttrpg: {
                damageType: templateData.damageType ?? null,
                rollType: templateData.rollType ?? null,
              },
            });
            if (game.dice3d) {
              await game.dice3d.showForRoll(roll, game.user, true, chatData.whisper, chatData.blind);
              await ChatMessage.create(chatData);
            }
            else {
              chatData.sound = CONFIG.sounds.dice;
              await ChatMessage.create(chatData);
            }
          } catch (error) {
            console.warn("[PMTTRPG] rollMove chat failed", error);
          }
        }
      }
    }
    else {
      renderTemplate(template, templateData).then(content => {
        chatData.content = content;
        chatData.flags = foundry.utils.mergeObject(chatData.flags ?? {}, {
          projectmoonttrpg: {
            damageType: templateData.damageType ?? null,
            rollType: templateData.rollType ?? null,
          },
        });
        ChatMessage.create(chatData);
      });
    }

    // Update the combat flags.
    if (game.combat && game.combat.combatants) {
      let combatant = game.combat.combatants.find(c => c.actor.id == this.actor.id);
      if (combatant) {
        let moveCount = combatant.flags.projectmoonttrpg ? combatant.flags.projectmoonttrpg.moveCount : 0;
        moveCount = moveCount ? Number(moveCount) + 1 : 1;
        // Emit a socket for the GM client.
        if (!game.user.isGM) {
          game.socket.emit('system.projectmoonttrpg', {
            combatantUpdate: { _id: combatant.id, 'flags.projectmoonttrpg.moveCount': moveCount }
          });
        }
        else {
          await game.combat.updateEmbeddedDocuments('Combatant', [{ _id: combatant.id, 'flags.projectmoonttrpg.moveCount': moveCount }]);
          ui.combat.render();
        }
      }
    }

    // Update forward.
    if (forwardUsed || rollModeUsed) {
      let updates = {};
      if (forwardUsed) updates['system.attributes.forward.value'] = 0;
      if (rollModeUsed && game.settings.get('projectmoonttrpg', 'advForward')) {
        updates['flags.projectmoonttrpg.rollMode'] = 'def';
      }
      await this.actor.update(updates);
    }
  }
}