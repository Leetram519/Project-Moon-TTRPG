import { PMTTRPGUtility } from "../utility.js";
import { PMTTRPGRolls } from "../rolls.js";
import { getRankFromLevel } from "../actor/progression.js";
import { computeEffectSummary, normalizeEffectEntries } from "../effects/effect-summary.js";
import { slotCostFromHand } from "../inventory/slots.js";
import { useTool } from "./tool-use.js";
import { getItemSlug, sluggify } from "../slug.js";
import {
  buildAppliedToolOnBeforeChat,
  buildAppliedToolTemplateData,
  canConsumeAppliedTool,
  promptAppliedToolDialog,
} from "./applied-tool.js";
import {
  buildDeclaredSkillTemplateData,
  promptDeclareSkillDialog,
} from "./declare-skill.js";
import { applyDiceMaxFloor, formatDiceFormula } from "../easy-effects/dice-formula.js";
import { promptRangedAmmo } from "../combat/clash-dialog.js";
import { resolveRangedDamageType } from "../damage-application.js";
import { normalizeWeaponProperties } from "./weapon-properties.js";

/**
 * Skill XOR applied tool.
 */
export async function pickDeclaredBuyIn(actor, hostItem, {
  applyTo,
  skillType = "attack",
  configureDialog = true,
  appliedTool = undefined,
  consumeAppliedTool = true,
  declaredSkill = undefined,
  consumeSkillLight = true,
  defenseType = null,
} = {}) {
  let skill = declaredSkill;
  let consumeLight = consumeSkillLight !== false;

  if (configureDialog && declaredSkill === undefined) {
    const skillPick = await promptDeclareSkillDialog(actor, {
      skillType,
      hostItem,
    });
    if (skillPick == null) return null;
    skill = skillPick.skill;
    consumeLight = !!skillPick.consumeLight;
  }

  let tool = appliedTool;
  let consumeTool = consumeAppliedTool;

  if (skill) {
    tool = null;
    consumeTool = false;
  } else if (configureDialog && appliedTool === undefined) {
    const pick = await promptAppliedToolDialog(actor, {
      applyTo,
      hostItem,
      defenseType,
    });
    if (pick == null) return null;
    tool = pick.tool;
    consumeTool = pick.consume;
  }

  return { skill: skill ?? null, consumeLight, tool, consumeTool };
}

async function pickWeaponBuyIn(actor, hostItem, options = {}) {
  return pickDeclaredBuyIn(actor, hostItem, {
    ...options,
    applyTo: "weapon",
    skillType: "attack",
  });
}

function getEffectSignature(entry) {
  return [
    entry?.effectUuid || entry?.name || '',
    entry?.procOn || '',
    entry?.procResult || '',
    entry?.procChoice || '',
    entry?.procStat || '',
    entry?.procDice || '',
    entry?.procAction || '',
    entry?.procCondition || '',
    entry?.mode || ''
  ].join('|').toLowerCase();
}

export class ItemPMTTRPG extends Item {
  get slug() {
    return getItemSlug(this);
  }

  /** @override */
  static migrateData(source) {
    source = super.migrateData(source) ?? source;
    if (source?.type === "tool" && source.system) {
      if (source.system.held) source.system.equipped = true;
      delete source.system.held;
      if (source.system.applyTo == null) source.system.applyTo = "";
      if (source.system.damageType == null) source.system.damageType = "";
    }
    if (source?.type === "weapon" && source.system) {
      Object.assign(source.system, normalizeWeaponProperties(source.system));
    }
    if (source?.type === "ammunition" && source.system && !source.system.damageType) {
      source.system.damageType = "slash";
    }
    if (source?.system && (source.system.slug === undefined || source.system.slug === null)) {
      source.system.slug = "";
    }
    return source;
  }

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);
    const incoming = data.system?.slug;
    if (typeof incoming === "string" && incoming.trim()) return;
    const name = data.name ?? this.name ?? "";
    const slug = sluggify(name);
    if (slug) this.updateSource({ "system.slug": slug });
  }

  /** @inheritDoc */
  async _preUpdate(changed, options, userId) {
    if (this.type === "tool" && this._source?.system?.held != null) {
      changed.system ??= {};
      if (this._source.system.held && changed.system.equipped === undefined) {
        changed.system.equipped = true;
      }
      changed.system.held = foundry.data.operators.ForcedDeletion;
    }
    if (this.type === "weapon" && changed.system) {
      const merged = { ...this._source?.system, ...changed.system };
      const next = normalizeWeaponProperties(merged);
      if (next.formProperty !== merged.formProperty) changed.system.formProperty = next.formProperty;
      if (next.handProperty !== merged.handProperty) changed.system.handProperty = next.handProperty;
    }
    if (changed.system && Object.hasOwn(changed.system, "slug")) {
      const raw = changed.system.slug;
      changed.system.slug = typeof raw === "string" ? sluggify(raw) : "";
    }
    if (this.type === "status" && changed.system) {
      const nextMax = Object.hasOwn(changed.system, "stackMax")
        ? Math.max(0, Number(changed.system.stackMax) || 0)
        : Math.max(0, Number(this.system?.stackMax ?? 0) || 0);
      if (Object.hasOwn(changed.system, "stacks") || nextMax > 0) {
        const rawStacks = Object.hasOwn(changed.system, "stacks")
          ? changed.system.stacks
          : this.system?.stacks;
        let stacks = Math.max(0, Number(rawStacks ?? 1) || 0);
        if (nextMax > 0) stacks = Math.min(stacks, nextMax);
        changed.system.stacks = stacks;
        if (Object.hasOwn(changed.system, "stackMax")) {
          changed.system.stackMax = nextMax;
        }
      }
      if (Object.hasOwn(changed.system, "priority")) {
        changed.system.priority = Math.max(0, Math.min(100, Number(changed.system.priority) || 0));
      }
    }
    return super._preUpdate(changed, options, userId);
  }

  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareData() {
    super.prepareData();

    // Get the Item's data
    const itemData = this;
    const actorData = this.actor ? this.actor : {};
    const data = itemData.system;
    const effectProcOn = data.procOn ?? 'alwaysActive';

    if (itemData.type == 'weapon') {
      const baseDieSides = 10;
      const baseRange = 1;
      let diceMaxBonus = 0;
      let dicePowerFromHand = 0;
      let dicePowerFromAttack = 0;
      let rangeBonus = 0;
      Object.assign(data, normalizeWeaponProperties(data));

      switch (data.weaponType) {
        // "[Ranged Weapons] have a base Range of 10 SQRs, which can be modified with certain Effects." // CR 3.x
        case 'ranged':
          rangeBonus += 9;
          break;
        default:
          break;
      }

      switch (data.formProperty) {
        case 'long':
          rangeBonus += 1;
          break;
        case 'medium':
        case 'highCaliber':
          diceMaxBonus += 2;
          break;
        default:
          break;
      }

      switch (data.handProperty) {
        case 'off1h':
          dicePowerFromHand += 1;
          break;
        case 'off2h':
          dicePowerFromHand += 2;
          break;
        default:
          break;
      }

      dicePowerFromAttack = Number(actorData?.system?.attributes?.attackModifier?.value ?? 0);
      const eeMods = actorData?.system?.attributes?.easyEffectsMods;
      const eeAttackMax = Number(eeMods?.attackMax ?? 0);
      const eeRangeUp = Number(eeMods?.rangeBonus ?? 0);
      const { sides: dieSides, powerAdjust: maxFloorPower } = applyDiceMaxFloor(
        baseDieSides,
        diceMaxBonus + eeAttackMax,
      );
      const dicePowerTotal = dicePowerFromHand + dicePowerFromAttack + maxFloorPower;
      data.offensiveDiceComputed = formatDiceFormula(1, dieSides, dicePowerTotal);
      data.diceMaxBonus = diceMaxBonus + eeAttackMax;
      data.dicePowerFromHand = dicePowerFromHand;
      data.dicePowerFromAttack = dicePowerFromAttack;
      data.dicePowerTotal = dicePowerTotal;
      data.range = baseRange + rangeBonus + eeRangeUp;

      const rank = Number(data.rank ?? 0);
      const weaponEpBase = rank < 0 ? 0 : (rank * 2) + 2;

      let epBonusFromHands = 0;
      switch (data.handProperty) {
      case 'off2h':
      case 'def2h':
        epBonusFromHands += 2;
        break;
      default:
        break;
      }
      data.epBase = weaponEpBase;
      data.epBonusFromHands = epBonusFromHands;
      data.epMax = weaponEpBase + epBonusFromHands + (Number(data.bonusEP) || 0);
      const normalizedEffects = normalizeEffectEntries(data.effects);
      data.effects = normalizedEffects;
      data.effectsSummary = computeEffectSummary(normalizedEffects, Number(data.epMax ?? 0));
    }

    if (itemData.type == 'ammunition') {
      data.quantity = Math.max(0, Number(data.quantity ?? 1));
      data.easyEffects = String(data.easyEffects ?? '');
      const normalizedEffects = normalizeEffectEntries(data.effects);
      data.effects = normalizedEffects;
      data.epMax = Number(data.epMax ?? 0) || 0;
      data.effectsSummary = computeEffectSummary(normalizedEffects, data.epMax);
    }

    if (itemData.type == 'outfit') {
      const blockBaseSides = 10;
      const evadeBaseSides = 12;
      let blockPower = 0;
      let evadePower = 0;
      data.bonusLight = 0;
      data.bonusEP = 0;

      switch (data.outfitProperty) {
      case 'armored':
        blockPower += 1;
        break;
      case 'swift':
        evadePower += 1;
        break;
      case 'balanced':
        data.bonusLight = 1;
        data.bonusEP = 2;
        break;
      default:
        break;
      }

      const tem = Number(actorData?.system?.abilities?.tem?.value ?? 0);
      const ins = Number(actorData?.system?.abilities?.ins?.value ?? 0);
      const eeMods = actorData?.system?.attributes?.easyEffectsMods;
      const blockFromEffects = Number(eeMods?.blockPower ?? 0);
      const evadeFromEffects = Number(eeMods?.evadePower ?? 0);
      const blockMaxFromEffects = Number(eeMods?.blockMax ?? 0);
      const evadeMaxFromEffects = Number(eeMods?.evadeMax ?? 0);

      const blockMaxApplied = applyDiceMaxFloor(blockBaseSides, blockMaxFromEffects);
      const evadeMaxApplied = applyDiceMaxFloor(evadeBaseSides, evadeMaxFromEffects);
      const blockTotal = blockPower + tem + blockFromEffects + blockMaxApplied.powerAdjust;
      const evadeTotal = evadePower + ins + evadeFromEffects + evadeMaxApplied.powerAdjust;

      data.blockDicePower = blockPower;
      data.evadeDicePower = evadePower;
      data.dicePowerFromTemperance = tem;
      data.dicePowerFromInsight = ins;
      data.blockDiceComputed = formatDiceFormula(1, blockMaxApplied.sides, blockTotal);
      data.evadeDiceComputed = formatDiceFormula(1, evadeMaxApplied.sides, evadeTotal);

      data.resistanceTypes = {
        slash: 'PMTTRPG.DamageTypeSlash',
        pierce: 'PMTTRPG.DamageTypePierce',
        blunt: 'PMTTRPG.DamageTypeBlunt'
      };

      data.resistances = data.resistances || {};
      data.resistances.hp = data.resistances.hp || {};
      data.resistances.st = data.resistances.st || {};
      for (let damageType of ['slash', 'pierce', 'blunt']) {
        data.resistances.hp[damageType] = data.resistances.hp[damageType] || 'normal';
        data.resistances.st[damageType] = data.resistances.st[damageType] || 'normal';
      }
      // Compute EP for outfits: (Rank*2)+2, minimum 0. Add outfit property bonusEP.
      const orank = Number(data.rank ?? 0);
      const outfitEpBase = orank < 0 ? 0 : (orank * 2) + 2;
      data.epBase = outfitEpBase;
      data.epMax = outfitEpBase + (Number(data.bonusEP) || 0);
      const normalizedEffects = normalizeEffectEntries(data.effects);
      data.effects = normalizedEffects;
      data.effectsSummary = computeEffectSummary(normalizedEffects, Number(data.epMax ?? 0));
      // Compute human-readable multiplier strings for template display, e.g. "2x", "1.5x", "0.25x", "0x"
      data.resistancesDisplay = { hp: {}, st: {} };
      const formatMultiplier = (m) => {
        if (m === 0) return '0x';
        // Ensure consistent formatting (no trailing .0)
        return `${Number.isInteger(m) ? m : m}${'x'}`;
      };
      for (let damageType of ['slash', 'pierce', 'blunt']) {
        const hpKey = data.resistances.hp[damageType];
        const stKey = data.resistances.st[damageType];
        const hpMult = CONFIG.PMTTRPG.resistances[hpKey]?.multiplier ?? 1;
        const stMult = CONFIG.PMTTRPG.resistances[stKey]?.multiplier ?? 1;
        data.resistancesDisplay.hp[damageType] = formatMultiplier(hpMult);
        data.resistancesDisplay.st[damageType] = formatMultiplier(stMult);
      }
    }

    if (itemData.type == 'skill') {
      const rank = Math.max(0, Number(data.rank ?? 0));
      const lightCost = Math.max(1, Number(data.lightCost ?? 1));
      const actorLightMax = Number(actorData?.system?.attributes?.light?.max ?? 0);

      data.rank = rank;
      data.lightCost = lightCost;
      // EP formula: (Rank * 2) + ((Light Cost - 1) * Rank) + 2 [+ 2 if innate]
      const innate = !!data.innate;
      const skillEpBase = rank < 0 ? 0 : (rank * 2) + 2;
      const skillEpMax = skillEpBase + ((lightCost - 1) * rank) + (innate ? 2 : 0);
      data.epBase = skillEpBase;
      data.epMax = skillEpMax;
      const normalizedEffects = normalizeEffectEntries(data.effects);
      data.effects = normalizedEffects;
      data.effectsSummary = computeEffectSummary(normalizedEffects, Number(data.epMax ?? 0));
      data.lightCostMax = actorLightMax > 0 ? actorLightMax : null;
    }

    if (itemData.type == 'tool') {
      const rank = Number(data.rank ?? 0);
      data.rank = rank;
      data.form = data.form || 'consumable';
      data.handProperty = data.handProperty || 'handless';
      data.toolKind = data.toolKind || 'market';
      data.applyTo = data.applyTo ?? '';
      data.damageType = data.damageType ?? '';
      data.inventoryTag = data.inventoryTag || 'tool';
      data.slotCost = data.compact ? 0 : slotCostFromHand(data.handProperty);
      data.stackPerSlot = Math.max(1, Number(data.stackPerSlot ?? 1));
      data.quantity = Math.max(0, Number(data.quantity ?? 1));
      data.usesMax = Math.max(0, Number(data.usesMax ?? 3));
      data.usesRemaining = Math.max(0, Number(data.usesRemaining ?? data.usesMax));
      data.allowUse = !!data.allowUse;
      if (data.packing) {
        if (data.packing.accepts === "specializedAmmunition") {
          data.packing.accepts = "ammunition";
        }
        data.packing.accepts = data.packing.accepts || "none";
        data.packing.capacity = Math.max(0, Number(data.packing.capacity) || 0);
      }

      let epBase = 0;
      if (data.handProperty === 'handless') epBase = rank < 0 ? 0 : rank * 2;
      else if (data.handProperty === 'twoHanded') epBase = rank < 0 ? 0 : (rank * 2) + 4;
      else epBase = rank < 0 ? 0 : (rank * 2) + 2;
      data.epBase = epBase;
      data.epMax = epBase;
      const normalizedEffects = normalizeEffectEntries(data.effects);
      data.effects = normalizedEffects;
      data.effectsSummary = computeEffectSummary(normalizedEffects, Number(data.epMax ?? 0));
    }

    if (itemData.type == 'augment') {
      const rank = actorData?.system?.attributes
        ? Math.max(0, getRankFromLevel(actorData.system.attributes.level?.value))
        : Math.max(0, Number(data.rank ?? 0));
      data.rank = rank;
      const augmentEpBase = rank < 0 ? 0 : rank * 4;
      data.epBase = augmentEpBase;
      data.epMax = augmentEpBase;
      const normalizedEffects = normalizeEffectEntries(data.effects);
      data.effects = normalizedEffects;
      data.effectsSummary = computeEffectSummary(normalizedEffects, Number(data.epMax ?? 0));
    }

    if (itemData.type == 'status') {
      data.isStatus = true;
      data.stacks = Math.max(0, Number(data.stacks ?? 1) || 0);
      // 0 = unlimited; 1 = binary (no quantity UI); otherwise hard cap.
      data.stackMax = Math.max(0, Number(data.stackMax ?? 0) || 0);
      if (data.stackMax > 0) data.stacks = Math.min(data.stacks, data.stackMax);
      data.priority = Math.max(0, Math.min(100, Number(data.priority ?? 0) || 0));
      data.proc = foundry.utils.mergeObject({
        turnStart: false,
        endOfRound: false,
        actionOrReaction: false,
        attackerBurst: false,
        onHitWhenActorHas: false,
        onHitWhenTargetHas: false,
        alwaysActive: false,
        skillEffect: false,
      }, data.proc ?? {}, { inplace: false });
      data.macro = foundry.utils.mergeObject({
        uuid: '',
      }, data.macro ?? {}, { inplace: false });
    }

    if (itemData.type == 'effect') {
      const effectProcOn = data.procOn ?? 'alwaysActive';
      data.appliesTo = data.appliesTo ?? 'weapon';
      data.canPositive = data.canPositive !== false;
      data.canNegative = data.canNegative !== false;
      data.stackMax = Math.max(1, Number(data.stackMax ?? (data.allowMultiple === false ? 1 : 5)) || 5);
      data.procOn = data.procOn ?? 'alwaysActive';
      data.procResult = data.procResult ?? 'none';
      data.procResultLocked = data.procResultLocked ?? (['onClash', 'onClashResult', 'onEitherClashResult'].includes(effectProcOn) && data.procResult !== 'none');
      data.procChoice = data.procChoice ?? 'none';
      data.procChoiceLocked = data.procChoiceLocked ?? false;
      data.procStat = data.procStat ?? 'any';
      data.procDice = data.procDice ?? 'any';
      data.procAction = data.procAction ?? 'any';
      data.procCondition = data.procCondition ?? '';
      data.positive = data.positive ?? '';
      data.negative = data.negative ?? '';
      data.macro = foundry.utils.mergeObject({
        uuid: '',
      }, data.macro ?? {}, { inplace: false });
      data.showProcResult = ['onClashResult', 'onEitherClashResult'].includes(effectProcOn);
      data.showProcChoice = ['onClash', 'onClashResult', 'onEitherClashResult', 'onCondition'].includes(effectProcOn);
      data.showProcStat = ['onCondition', 'onUse', 'onAction'].includes(effectProcOn);
      data.showProcDice = ['onClash', 'onClashResult', 'onEitherClashResult', 'onBurst', 'onCritical', 'onDevastating'].includes(effectProcOn);
      data.showProcAction = ['onUse', 'onAction'].includes(effectProcOn);
    }
  }

  /** @override */
  getRollData() {
    return this.actor ? {
      ...super.getRollData(),
      ...this.actor.getRollData()
    } : super.getRollData();
  }

  /**
   * Roll the item to Chat, creating a chat card which contains follow up attack or damage roll options
   * @return {Promise}
   */
  async roll({
    configureDialog = true,
    mode = 'block',
    ammo = null,
    consumeAmmo = true,
    dryFire = false,
    appliedTool = undefined,
    consumeAppliedTool = true,
    declaredSkill = undefined,
    consumeSkillLight = true,
    targetSelection,
  } = {}) {
    if (this.type == 'tool') {
      return useTool(this, {
        configureDialog,
        consume: true,
        target: targetSelection === undefined
          ? undefined
          : (targetSelection?.actor ?? targetSelection ?? null),
      });
    }

    if (this.type == 'skill') {
      return PMTTRPGRolls.doSkillRoll({
        actor: this.actor,
        skill: this,
        templateData: {
          image: this.img,
          title: this.name,
          details: this.system.description,
        }
      });
    }

    if (this.type == 'outfit') {
      let tool = appliedTool;
      let willConsumeTool = consumeAppliedTool;

      if (configureDialog && appliedTool === undefined) {
        const pick = await promptAppliedToolDialog(this.actor, {
          applyTo: 'outfit',
          hostItem: this,
          defenseType: mode,
        });
        if (pick === null) return;
        tool = pick.tool;
        willConsumeTool = pick.consume;
      }

      if (!canConsumeAppliedTool(tool, willConsumeTool)) {
        ui.notifications.warn(game.i18n.localize('PMTTRPG.Dialog.noToolUses'));
        return;
      }

      const formula = mode == 'evade' ? this.system.evadeDiceComputed : this.system.blockDiceComputed;
      const flavor = mode == 'evade' ? 'PMTTRPG.SkillTypeEvade' : 'PMTTRPG.SkillTypeBlock';
      const title = tool ? `${this.name} · ${tool.name}` : this.name;
      const actionType = mode === 'evade' ? 'evade' : 'block';

      PMTTRPGRolls.rollMove({
        actor: this.actor,
        data: this,
        formula: formula,
        templateData: {
          image: this.img,
          title,
          flavor: game.i18n.localize(flavor),
          rollType: 'defense',
          defenseType: mode,
          ...buildAppliedToolTemplateData(tool),
        },
        onBeforeChat: buildAppliedToolOnBeforeChat({
          actor: this.actor,
          tool,
          hostItem: this,
          actionType,
          consume: willConsumeTool,
        }),
      });
      return;
    }

    if (this.type == 'weapon' && (ammo || dryFire)) {
      const ammoQuantity = ammo ? Number(ammo.system?.quantity ?? 0) : 0;
      const isDryFire = !!(dryFire || !ammo || ammoQuantity <= 0);

      const buyIn = await pickWeaponBuyIn(this.actor, this, {
        configureDialog,
        appliedTool,
        consumeAppliedTool,
        declaredSkill,
        consumeSkillLight,
      });
      if (!buyIn) return;
      const tool = buyIn.tool;
      const willConsumeTool = buyIn.consumeTool;
      const skill = buyIn.skill;
      const consumeLight = buyIn.consumeLight;

      if (!canConsumeAppliedTool(tool, willConsumeTool)) {
        ui.notifications.warn(game.i18n.localize('PMTTRPG.Dialog.noToolUses'));
        return;
      }

      if (!isDryFire && consumeAmmo && ammo) {
        await ammo.update({ 'system.quantity': Math.max(0, ammoQuantity - 1) });
      }

      const dryFireLabel = game.i18n.localize('PMTTRPG.Clash.DryFireShort');
      const titleParts = isDryFire
        ? [this.name, dryFireLabel]
        : [this.name, ammo.name];
      if (skill) titleParts.push(skill.name);
      else if (tool) titleParts.push(tool.name);

      PMTTRPGRolls.rollMove({
        actor: this.actor,
        data: this,
        targetSelection,
        templateData: {
          image: this.img,
          title: titleParts.join(' · '),
          trigger: null,
          details: this.system.description,
          rollType: 'damage',
          dryFire: isDryFire,
          ammoName: isDryFire ? dryFireLabel : ammo.name,
          ammoType: isDryFire ? null : (ammo.system?.ammoType ?? null),
          ammoDamageType: isDryFire ? null : (ammo.system?.damageType ?? null),
          ammoId: isDryFire ? null : (ammo?.id ?? null),
          ...buildAppliedToolTemplateData(tool),
          ...buildDeclaredSkillTemplateData(skill, consumeLight),
          damageType: resolveRangedDamageType({
            weapon: this,
            ammo: isDryFire ? null : ammo,
            appliedTool: tool,
            dryFire: isDryFire,
          }),
        },
        onBeforeChat: buildAppliedToolOnBeforeChat({
          actor: this.actor,
          tool,
          hostItem: this,
          target: targetSelection?.actor ?? null,
          actionType: 'attack',
          consume: willConsumeTool,
        }),
      });
      return;
    }

    if (this.type == 'weapon' && this.system.weaponType == 'ranged') {
      if (configureDialog) {
        const ammoPick = await promptRangedAmmo(this.actor, this);
        if (!ammoPick) return;

        const buyIn = await pickWeaponBuyIn(this.actor, this, {
          configureDialog: true,
          appliedTool,
          consumeAppliedTool,
          declaredSkill,
          consumeSkillLight,
        });
        if (!buyIn) return;

        const targeting = game.projectmoonttrpg?.targeting;
        const chosenTarget = targeting ? await targeting.promptTargetSelection({
          actor: this.actor,
          token: this.actor.getActiveTokens(true)[0] ?? null,
          title: this.name,
          sourceName: this.name,
          sourceImg: this.img,
          weaponRange: this.system.range,
          preferredCombatantId: game.combat?.combatant?.id ?? null,
        }) : undefined;

        if (chosenTarget === null) return;

        this.roll({
          configureDialog: false,
          ammo: ammoPick.ammo,
          consumeAmmo: ammoPick.consumeAmmo,
          dryFire: ammoPick.dryFire,
          appliedTool: buyIn.tool,
          consumeAppliedTool: buyIn.consumeTool,
          declaredSkill: buyIn.skill,
          consumeSkillLight: buyIn.consumeLight,
          targetSelection: chosenTarget
        });
        return;
      }
    }

    if (this.type == 'weapon') {
      const buyIn = await pickWeaponBuyIn(this.actor, this, {
        configureDialog,
        appliedTool,
        consumeAppliedTool,
        declaredSkill,
        consumeSkillLight,
      });
      if (!buyIn) return;
      const tool = buyIn.tool;
      const willConsumeTool = buyIn.consumeTool;
      const skill = buyIn.skill;
      const consumeLight = buyIn.consumeLight;

      const targeting = game.projectmoonttrpg?.targeting;
      const chosenTarget = targetSelection !== undefined
        ? targetSelection
        : (targeting ? await targeting.promptTargetSelection({
          actor: this.actor,
          title: this.name,
          sourceName: this.name,
          sourceImg: this.img,
          weaponRange: this.system.range,
          preferredCombatantId: game.combat?.combatant?.id ?? null,
        }) : undefined);

      if (chosenTarget === null) return;

      if (!canConsumeAppliedTool(tool, willConsumeTool)) {
        ui.notifications.warn(game.i18n.localize('PMTTRPG.Dialog.noToolUses'));
        return;
      }

      const titleParts = [this.name];
      if (skill) titleParts.push(skill.name);
      else if (tool) titleParts.push(tool.name);

      PMTTRPGRolls.rollMove({
        actor: this.actor,
        data: this,
        targetSelection: chosenTarget,
        templateData: {
          image: this.img,
          title: titleParts.join(' · '),
          details: this.system.description,
          rollType: 'damage',
          damageType: tool?.system?.damageType || this.system?.damageType || null,
          ...buildAppliedToolTemplateData(tool),
          ...buildDeclaredSkillTemplateData(skill, consumeLight),
        },
        onBeforeChat: buildAppliedToolOnBeforeChat({
          actor: this.actor,
          tool,
          hostItem: this,
          target: chosenTarget?.actor ?? null,
          actionType: 'attack',
          consume: willConsumeTool,
        }),
      });
      return;
    }

    PMTTRPGRolls.rollMove({actor: this.actor, data: this});
  }

  get compendiumSourceUuid() {
    return this._stats?.compendiumSource ?? this.getFlag('core', 'sourceId') ?? null;
  }

  get isLinkedToCompendium() {
    return !!this.compendiumSourceUuid;
  }

  /**
   * Compares the compendium source's modifiedTime against what the GM last
   * acknowledged (either by syncing or by dismissing). Returns an object so
   * the sheet has the modifiedTime on hand for the dismiss/sync calls.
   */
  async checkOutdated() {
    if (!this.isLinkedToCompendium) return { outdated: false, sourceModifiedTime: null };

    const source = await fromUuid(this.compendiumSourceUuid).catch(() => null);
    const sourceModifiedTime = source?._stats?.modifiedTime ?? null;
    if (!sourceModifiedTime) return { outdated: false, sourceModifiedTime: null };

    // We track two timestamps: when the GM last synced, and when they last dismissed.
    // Whichever is newer counts as "acknowledged for this version".
    const lastSyncedAt   = this.getFlag('projectmoonttrpg', 'lastSyncedAt')   ?? 0;
    const dismissedAt    = this.getFlag('projectmoonttrpg', 'syncDismissedAt') ?? 0;
    const lastAcknowledged = Math.max(lastSyncedAt, dismissedAt);

    return {
      outdated: sourceModifiedTime > lastAcknowledged,
      sourceModifiedTime
    };
  }

  /**
   * Permanently dismiss the banner for this exact compendium version.
   * If the compendium item is updated later, the banner will reappear.
   */
  async dismissOutdatedWarning(sourceModifiedTime) {
    return this.setFlag('projectmoonttrpg', 'syncDismissedAt', sourceModifiedTime);
  }

  /**
   * Sync from compendium and record the timestamp so the banner won't
   * show again until the compendium item is updated past this version.
   */
  async syncFromCompendium({ render = true } = {}) {
    const uuid = this.compendiumSourceUuid;
    if (!uuid) return null;

    const source = await fromUuid(uuid).catch(() => null);
    if (!source) {
      console.warn(`PMTTRPG | Could not resolve compendium source ${uuid} for "${this.name}"`);
      return null;
    }

    const fields = ItemPMTTRPG.SYNCED_FIELDS[this.type] ?? [];
    if (!fields.length) return null;

    const sourceData = source.toObject();
    const update = {};
    for (const path of fields) {
      const value = foundry.utils.getProperty(sourceData, path);
      if (value !== undefined) foundry.utils.setProperty(update, path, value);
    }

    if (update.system?.effects) {
      update.system.effects = await this._resyncEffectEntries(update.system.effects);
    }

    // Record the sync so the banner stays hidden until the next compendium edit.
    foundry.utils.setProperty(update, 'flags.projectmoonttrpg.lastSyncedAt',
      source._stats?.modifiedTime ?? Date.now());

    await this.update(update, { render: false });

    if (render) this.sheet?.render();
    return this;
  }

  static get SYNCED_FIELDS() {
    return {
      weapon:  ['name', 'img', 'system.description', 'system.formProperty', 'system.handProperty',
                'system.weaponType', 'system.rank', 'system.bonusEP', 'system.effects'],
      outfit:  ['name', 'img', 'system.description', 'system.outfitProperty', 'system.rank',
                'system.bonusEP', 'system.bonusLight', 'system.resistances', 'system.effects'],
      skill:   ['name', 'img', 'system.description', 'system.rank', 'system.lightCost',
                'system.innate', 'system.effects'],
      ammunition: ['name', 'img', 'system.description', 'system.ammoType', 'system.damageType',
                'system.inventoryPool', 'system.effects', 'system.easyEffects'],
      tool:    ['name', 'img', 'system.description', 'system.rank', 'system.form',
                'system.handProperty', 'system.toolKind', 'system.applyTo', 'system.damageType',
                'system.allowUse', 'system.effects', 'system.easyEffects'],
      augment: ['name', 'img', 'system.description', 'system.effects'],
      status:  ['name', 'img', 'system.description', 'system.proc'],
      effect:  ['name', 'img', 'system.description', 'system.appliesTo', 'system.canPositive',
                'system.canNegative', 'system.stackMax', 'system.procOn', 'system.procResult',
                'system.procChoice', 'system.procStat', 'system.procDice', 'system.procAction', 'system.procCondition',
                'system.positive', 'system.negative', 'system.macro']
    };
  }

  async _resyncEffectEntries(effects = []) {
    const byUuid = new Map((this.system.effects ?? []).map(e => [e.effectUuid, e]));

    return Promise.all(effects.map(async (entry) => {
      if (!entry.effectUuid) return entry;
      const effectDoc = await fromUuid(entry.effectUuid).catch(() => null);
      const merged = foundry.utils.mergeObject(entry, {}, { inplace: false });

      if (effectDoc) {
        merged.name          = effectDoc.name;
        merged.cost          = effectDoc.system.cost          ?? merged.cost;
        merged.stackMax      = effectDoc.system.stackMax      ?? merged.stackMax;
        merged.procOn        = effectDoc.system.procOn        ?? merged.procOn;
        merged.procResult    = effectDoc.system.procResult    ?? merged.procResult;
        merged.procChoice    = effectDoc.system.procChoice    ?? merged.procChoice;
        merged.procStat      = effectDoc.system.procStat      ?? merged.procStat;
        merged.procDice      = effectDoc.system.procDice      ?? merged.procDice;
        merged.procAction    = effectDoc.system.procAction    ?? merged.procAction;
        merged.procCondition = effectDoc.system.procCondition ?? merged.procCondition;
        merged.positive      = effectDoc.system.positive      ?? merged.positive;
        merged.negative      = effectDoc.system.negative      ?? merged.negative;
        merged.macro         = effectDoc.system.macro         ?? merged.macro;
        if (String(effectDoc.system.easyEffects ?? "").trim()) {
          merged.easyEffectsTemplate = String(effectDoc.system.easyEffects);
        }
      }

      // Preserve the player's own stack/mode choices.
      const existing = byUuid.get(entry.effectUuid);
      if (existing) {
        merged.stack = existing.stack;
        merged.count = existing.count;
        merged.mode  = existing.mode;
        if (existing.procResult) merged.procResult = existing.procResult;
        if (existing.procChoice) merged.procChoice = existing.procChoice;
      }

      return merged;
    }));
  }
}
