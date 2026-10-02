import { PMTTRPGUtility } from "../utility.js";
import { buildEffectSummaryGroups, computeEffectSummary, effectShowsProcChoice } from "../effects/effect-summary.js";
import {
  buildEasyEffectsFromHostEffects,
  isEasyEffectsSyncDirty,
  syncEasyEffectsFromHostEffects,
} from "../easy-effects/sync-from-effects.js";
import { bindEasyEffectsHighlighter } from "../easy-effects/highlight.js";
import { emitItemEquipped } from "../easy-effects/registry.js";
import { sluggify } from "../slug.js";
import { isPendingStatus } from "../status/pending.js";
import { openEEFlagInspector } from "../apps/ee-flag-inspector.js";
import { EffectAutocomplete } from "../effects/effect-autocomplete.js";

const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { TextEditor, FormDataExtended } = foundry.applications.ux;

/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheetV2}
 */
export class PMTTRPGItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  constructor(options = {}) {
    super(options);
    this.tagify = null;
    this.needsRender = false;
    this._pendingChangeField = null;
  }

  tabGroups = { primary: 'description' };

  static DEFAULT_OPTIONS = {
    classes: ["projectmoonttrpg", "sheet", "item"],
    position: { width: 540, height: 560 },
    window: { resizable: true },
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
    actions: {
      tab: PMTTRPGItemSheet.prototype._onTabClick,
      editImage: PMTTRPGItemSheet.prototype._onEditImage,
      "sync-from-compendium": PMTTRPGItemSheet.prototype._onSyncFromCompendium,
      "dismiss-outdated": PMTTRPGItemSheet.prototype._onDismissOutdated,
      syncFromCompendium: PMTTRPGItemSheet.prototype._onSyncFromCompendium,
      dismissOutdated: PMTTRPGItemSheet.prototype._onDismissOutdated,
      "regenerate-slug": PMTTRPGItemSheet.prototype._onRegenerateSlug,
      regenerateSlug: PMTTRPGItemSheet.prototype._onRegenerateSlug,
      "sync-easy-effects": PMTTRPGItemSheet.prototype._onSyncEasyEffects,
      syncEasyEffects: PMTTRPGItemSheet.prototype._onSyncEasyEffects,
      eeFlags: PMTTRPGItemSheet.prototype._onOpenEEFlags,
    },
  };

  // _renderHTML resolves the template from the item type.
  // Subclasses override this with their own static PARTS.
  static PARTS = {
    body: {}
  };

  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    options.classes = (options.classes ?? []).filter((cls) => cls !== "nightmode");
    return options;
  }

  _configureRenderParts(options) {
    const parts = foundry.utils.deepClone(super._configureRenderParts(options));
    if (!parts.body?.template) {
      parts.body ??= {};
      parts.body.template = `systems/projectmoonttrpg/templates/items/${this.document.type}-sheet.html`;
    }
    parts.body.scrollable ??= [".sheet-body"];
    return parts;
  }

  _getHeaderControls() {
    const controls = super._getHeaderControls() ?? [];
    if (!controls.some(c => c.action === "eeFlags")) {
      controls.push({
        icon: "fa-solid fa-flag",
        label: "PMTTRPG.EEFlagInspector.HeaderControl",
        action: "eeFlags",
        visible: () => game.user.isGM,
      });
    }
    return controls;
  }

  _onOpenEEFlags() {
    if (!game.user.isGM) return;
    openEEFlagInspector(this.item ?? this.document);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const itemData = this.document.toObject(false);

    const enrichmentOptions = {
      async: true,
      documents: true,
      secrets: this.document.isOwner,
      rollData: this.document.getRollData(),
      relativeTo: this.document
    };

    const system = foundry.utils.duplicate(this.document.system);

    system.descriptionEnriched = await TextEditor.enrichHTML(system.description ?? '', enrichmentOptions);

    if (itemData.type === 'effect') {
      system.positiveEnriched = await TextEditor.enrichHTML(system.positive ?? '', enrichmentOptions);
      system.negativeEnriched = await TextEditor.enrichHTML(system.negative ?? '', enrichmentOptions);
    }

    if (itemData.type === 'equipment') {
      if (system.tags != undefined && system.tags !== '') {
        let tagArray = [];
        try { tagArray = JSON.parse(system.tags); }
        catch (e) { tagArray = [system.tags]; }
        system.tagsString = tagArray.map(t => t.value).join(', ');
      }
      // Otherwise, set tags equal to the string.
      else {
        system.tags = system.tagsString;
      }
    }

    // Handle move results.
    if (itemData.type === 'move' || itemData.type === 'npcMove') {
      if (system.moveResults) {
        for (const key of Object.keys(system.moveResults)) {
          system.moveResults[key].key = `system.moveResults.${key}.value`;
          system.moveResults[key].enriched = await TextEditor.enrichHTML(system.moveResults[key].value, enrichmentOptions);
        }
      }
    }

    // Handle choices.
    if (system?.choices) {
      system.choicesEnriched = await TextEditor.enrichHTML(system.choices, enrichmentOptions);
    }

    // Handle bonds.
    if (itemData.type === 'bond') {
      const nameEnriched = await TextEditor.enrichHTML(this.document.name, enrichmentOptions);
      this.document._nameEnriched = nameEnriched;
    }

    // Handle select options.
    const selects = {};

    if (itemData.type === 'equipment') {
      selects.itemTypes = {
        weapon: 'PMTTRPG.Weapon',
        armor: 'PMTTRPG.Armor',
        dungeongear: 'PMTTRPG.DungeonGear',
        poison: 'PMTTRPG.Poison',
        service: 'PMTTRPG.Service',
        meal: 'PMTTRPG.Meal',
        transport: 'PMTTRPG.Transport',
        landbuilding: 'PMTTRPG.LandBuildings',
        bribe: 'PMTTRPG.Bribe',
        giftsfinery: 'PMTTRPG.GiftsFinery',
        hoard: 'PMTTRPG.Hoard',
      };
    }

    if (itemData.type === 'effect') {
      selects.effectAppliesTo = {
        weapon: 'TYPES.Item.weapon',
        outfit: 'TYPES.Item.outfit',
        skill: 'TYPES.Item.skill',
        augment: 'TYPES.Item.augment',
        ammunition: 'TYPES.Item.ammunition',
      };
    }

    if (itemData.type === 'npcMove') {
      selects.moveTypes = {
        basic: 'PMTTRPG.MoveBasic',
        special: 'PMTTRPG.MoveSpecial',
      };
    }

    if (itemData.type === 'skill') {
      selects.skillTypes = {
        attack: 'PMTTRPG.SkillTypeAttack',
        block: 'PMTTRPG.SkillTypeBlock',
        evade: 'PMTTRPG.SkillTypeEvade',
        stat: 'PMTTRPG.SkillTypeStatUse'
      };
      selects.abilities = {
        for: 'PMTTRPG.AbilityFor',
        pru: 'PMTTRPG.AbilityPru',
        jus: 'PMTTRPG.AbilityJus',
        cha: 'PMTTRPG.AbilityCha',
        ins: 'PMTTRPG.AbilityIns',
        tem: 'PMTTRPG.AbilityTem'
      };
    }

    if (itemData.type === 'move') {
      selects.moveTypes = {
        basic: 'PMTTRPG.MoveBasic',
        starting: 'PMTTRPG.MoveStarting',
        advanced: 'PMTTRPG.MoveAdvanced',
        special: 'PMTTRPG.MoveSpecial',
      };
      selects.rollTypes = {
        FOR: 'PMTTRPG.FOR',
        PRU: 'PMTTRPG.PRU',
        JUS: 'PMTTRPG.JUS',
        CHA: 'PMTTRPG.CHA',
        INS: 'PMTTRPG.INS',
        TEM: 'PMTTRPG.TEM',
        ASK: 'PMTTRPG.ASK',
        BOND: 'PMTTRPG.Modifier',
        FORMULA: 'PMTTRPG.FORMULA',
      };
    }
    if (itemData.type === 'class') {
      selects.damages = { d4: 'd4',
         d6: 'd6',
         d8: 'd8',
         d10: 'd10',
         d12: 'd12',
       };
      selects.equipmentGroupModes = {
        radio: 'PMTTRPG.ChooseOne',
        checkbox: 'PMTTRPG.ChooseAny',
      };
    }

    selects.effectModes = {
      positive: 'PMTTRPG.EffectModePositive',
      negative: 'PMTTRPG.EffectModeNegative'
    };
    selects.effectProcOn = {
      alwaysActive: 'PMTTRPG.EffectProcAlwaysActive',
      onClash: 'PMTTRPG.EffectProcOnClash',
      onClashResult: 'PMTTRPG.EffectProcOnClashResult',
      onEitherClashResult: 'PMTTRPG.EffectProcOnEitherClashResult',
      onCondition: 'PMTTRPG.EffectProcOnCondition',
      onUse: 'PMTTRPG.EffectProcOnUse',
      onBurst: 'PMTTRPG.EffectProcOnBurst',
      onCritical: 'PMTTRPG.EffectProcOnCritical',
      onDevastating: 'PMTTRPG.EffectProcOnDevastating',
      onAction: 'PMTTRPG.EffectProcOnAction'
    };
    selects.effectProcResult = {
      none: 'PMTTRPG.EffectProcResultNone',
      win: 'PMTTRPG.EffectProcResultWin',
      lose: 'PMTTRPG.EffectProcResultLose'
    };
    selects.effectProcChoice = {
      none: 'PMTTRPG.EffectProcChoiceNone',
      attack: 'PMTTRPG.EffectProcChoiceAttack',
      defense: 'PMTTRPG.EffectProcChoiceDefense'
    };
    selects.effectProcStat = {
      any: 'PMTTRPG.EffectProcStatAny',
      for: 'PMTTRPG.AbilityFor',
      pru: 'PMTTRPG.AbilityPru',
      jus: 'PMTTRPG.AbilityJus',
      cha: 'PMTTRPG.AbilityCha',
      ins: 'PMTTRPG.AbilityIns',
      tem: 'PMTTRPG.AbilityTem'
    };
    selects.effectProcDice = {
      any: 'PMTTRPG.EffectProcDiceAny',
      offensive: 'PMTTRPG.EffectProcDiceOffensive',
      defensive: 'PMTTRPG.EffectProcDiceDefensive'
    };
    selects.effectProcAction = {
      any: 'PMTTRPG.EffectProcActionAny',
      action: 'PMTTRPG.EffectProcActionAction',
      reaction: 'PMTTRPG.EffectProcActionReaction'
    };

    Object.assign(context, {
      item: this.document,
      cssClass: this.isEditable ? "editable" : "locked",
      editable: this.isEditable,
      system,
      effects: this.document.effects.map(e => foundry.utils.deepClone(e)),
      selects,
      effectChoices: [],
      limited: this.document.limited,
      options: this.options,
      owner: this.document.isOwner,
      title: this.document.name,
      activeTab: this.tabGroups?.primary ?? "description",
      itemTypeLabel: game.i18n.localize(`TYPES.Item.${this.document.type}`),
    });

    if (this._supportsEffects()) {
      const effectContext = await this._prepareEffectHostContext();
      context.effectChoices = effectContext.effectChoices;

      // TODO: Implement homebrew variations


      context.system.effects = effectContext.effects;
      context.system.effectSummaryGroups = effectContext.effectSummaryGroups;
      context.system.effectSummary = effectContext.effectSummary;
      context.system.effectSearchPlaceholder = effectContext.effectSearchPlaceholder;
    }

    if (game.user.isGM && this.document.isLinkedToCompendium) {
      const { outdated, sourceModifiedTime } = await this.document.checkOutdated();
      context.isOutdated = outdated;
      context.compendiumModifiedTime = sourceModifiedTime;
    } else {
      context.isOutdated = false;
    }

    context.supportsEasyEffects = this._supportsEasyEffects();
    context.supportsEffects = this._supportsEffects();
    context.canSyncEasyEffects = this._supportsEffects() && this.isEditable;
    context.easyEffectsHint = this.document.type === "effect"
      ? "PMTTRPG.EasyEffectsEffectTemplateHint"
      : this._supportsEffects()
        ? "PMTTRPG.EasyEffectsHostSyncHint"
        : null;
    context.slugPlaceholder = this.document.slug || "";

    // On an actor, Current Stacks is the matching live or pending total.
    if (itemData.type === "status" && this.document.parent?.getStatusStacks) {
      context.system.stacks = isPendingStatus(this.document)
        ? this.document.parent.getPendingStatusStacks(
          this.document.name,
          this.document.system?.arrival,
        )
        : this.document.parent.getStatusStacks(this.document.name);
    }

    return context;
  }

  _onTabClick(event, target) {
    event.preventDefault();
    const group = target.dataset.group ?? "primary";
    const tabId = target.dataset.tab;
    if (!tabId || this.tabGroups[group] === tabId) return;
    this.tabGroups[group] = tabId;
    for (const el of this.element.querySelectorAll(`[data-group="${group}"][data-tab]`)) {
      el.classList.toggle("active", el.dataset.tab === tabId);
    }
    for (const el of this.element.querySelectorAll(`.sheet-tabs [data-tab]`)) {
      el.classList.toggle("active", el.dataset.tab === tabId);
    }
  }

  async _onEditImage(event, target) {
    if (!this.isEditable) return;
    event.preventDefault();
    const attr = target.dataset.edit || "img";
    const current = foundry.utils.getProperty(this.document, attr);
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current,
      callback: (path) => this.document.update({ [attr]: path }),
      position: { top: (this.position.top ?? 0) + 40, left: (this.position.left ?? 0) + 10 },
    });
    return fp.browse();
  }

  _onRender(context, options) {
    super._onRender(context, options);

    if (this.tagify) {
      this.tagify.destroy();
      this.tagify = null;
    }
    this._tagify(this.isEditable);

    this._listenerAbort?.abort();
    this._listenerAbort = new AbortController();
    const { signal } = this._listenerAbort;

    bindEasyEffectsHighlighter(this.element, { signal });

    if (!this.isEditable) return;

    for (const el of this.element.querySelectorAll('.class-fields')) {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.class-control')) this._onClickClassControl(e);
      }, { signal });
    }

    if (this._supportsEffects()) {
      for (const el of this.element.querySelectorAll('.effect-control')) {
        el.addEventListener('click', (e) => this._onEffectControl(e), { signal });
      }
      for (const el of this.element.querySelectorAll('.effect-picker')) {
        el.addEventListener('change', (e) => this._onEffectPickerChange(e), { signal });
        el.addEventListener('keydown', (e) => this._onEffectPickerKeydown(e), { signal });
      }
      for (const el of this.element.querySelectorAll('.effect-row__stack')) {
        el.addEventListener('change', (e) => this._onEffectStackChange(e), { signal });
      }
      for (const el of this.element.querySelectorAll('.effect-row__proc-result-select')) {
        el.addEventListener('change', (e) => this._onEffectProcResultChange(e), { signal });
      }
      for (const el of this.element.querySelectorAll('.effect-row__proc-choice-select')) {
        el.addEventListener('change', (e) => this._onEffectProcChoiceChange(e), { signal });
      }
      for (const el of this.element.querySelectorAll('.effect-row__proc-stat-select')) {
        el.addEventListener('change', (e) => this._onEffectProcStatChange(e), { signal });
      }
      for (const el of this.element.querySelectorAll('.effect-row__proc-action-select')) {
        el.addEventListener('change', (e) => this._onEffectProcActionChange(e), { signal });
      }
      for (const el of this.element.querySelectorAll('.effect-row__mode-select')) {
        el.addEventListener('change', (e) => this._onEffectModeChange(e), { signal });
      }

      this.element.addEventListener('dragover', this._onEffectDragOver.bind(this), { signal });
      this.element.addEventListener('drop', this._onDrop.bind(this), { signal });

      const eacContainer = this.element.querySelector('.effect-autocomplete');
      if (eacContainer && this.isEditable) {
        this._mountEffectAutocomplete(eacContainer, { signal });
      }
    }
  }

  async _onClose(options) {
    this._listenerAbort?.abort();
    if (this.tagify) {
      this.tagify.destroy();
      if (this.needsRender && this.document?.parent) this.document.parent.render(true);
    }
    await super._onClose(options);
  }

  _onChangeForm(formConfig, event) {
    const target = event.target instanceof HTMLElement
      ? (event.target.closest("[name]") ?? event.target)
      : null;
    this._pendingChangeField = target?.name ?? null;
    return super._onChangeForm(formConfig, event);
  }

  _prepareSubmitData(event, form, formData, updateData) {
    if (this.document.type !== "class") {
      const name = this._pendingChangeField;
      this._pendingChangeField = null;
      if (name && name in formData.object) {
        const newValue = formData.object[name];
        if (newValue === foundry.utils.getProperty(this.document, name)) return {};
        return foundry.utils.expandObject({ [name]: newValue });
      }
      return {};
    }
    return super._prepareSubmitData(event, form, formData, updateData);
  }

  async _processSubmitData(event, form, submitData, options) {
    // Route actor-owned stack changes through the status API.
    if (this.document.type === "status" && this.document.parent?.setStatusStacks) {
      const hasStacks = Object.prototype.hasOwnProperty.call(submitData.system ?? {}, "stacks");
      const stacks = hasStacks ? submitData.system.stacks : undefined;
      if (hasStacks) delete submitData.system.stacks;
      const pending = isPendingStatus(this.document);
      const arrival = this.document.system?.arrival;

      const flat = foundry.utils.flattenObject(submitData);
      if (Object.keys(flat).length) {
        await super._processSubmitData(event, form, submitData, options);
      }
      if (hasStacks) {
        if (pending && this.document.parent.setPendingStatusStacks) {
          await this.document.parent.setPendingStatusStacks(this.document.name, stacks, { arrival });
        } else {
          await this.document.parent.setStatusStacks(this.document.name, stacks);
        }
      }
      return;
    }
    return super._processSubmitData(event, form, submitData, options);
  }

  async _onSubmitForm(formConfig, event) {
    if (this.document.type !== "class") {
      return super._onSubmitForm(formConfig, event);
    }

    const form = this.form;
    if (!form) return;

    const formData = new FormDataExtended(form);
    const formObj = foundry.utils.expandObject(formData.object);

    let i = 0;
    const deletedKeys = [];

    if (typeof formObj.system?.equipment === 'object') {
      for (const [k, v] of Object.entries(formObj.system.equipment)) {
        if (i != k) {
          v.items = foundry.utils.duplicate(this.document.system.equipment[k]?.items ?? []);
          formObj.system.equipment[i] = v;
          delete formObj.system.equipment[k];
          deletedKeys.push(`equipment.${k}`);
        }
        i++;
      }
    }

    i = 0;
    if (typeof formObj.system?.races === 'object') {
      for (const [k, v] of Object.entries(formObj.system.races)) {
        if (i != k) {
          formObj.system.races[i] = v;
          delete formObj.system.races[k];
          deletedKeys.push(`races.${k}`);
        }
        i++;
      }
    }

    i = 0;
    if (typeof formObj.system?.alignments === 'object') {
      for (const [k, v] of Object.entries(formObj.system.alignments)) {
        if (i != k) {
          formObj.system.alignments[i] = v;
          delete formObj.system.alignments[k];
          deletedKeys.push(`alignments.${k}`);
        }
        i++;
      }
    }

    for (const k of deletedKeys) {
      const keys = k.split('.');
      if (formObj.system[keys[0]][keys[1]] == undefined) {
        formObj.system[keys[0]][keys[1]] = foundry.data.operators.ForcedDeletion;
      }
    }

    const flatData = Object.entries(formData.object)
      .filter(e => !e[0].match(/system\.(equipment|alignments|races)/g))
      .reduce((obj, e) => { obj[e[0]] = e[1]; return obj; }, {
        _id: this.document.id,
        "system.equipment": formObj.system?.equipment,
        "system.races": formObj.system?.races,
        "system.alignments": formObj.system?.alignments
      });

    await this.document.update(flatData);
  }

  async _onSyncFromCompendium(event, target) {
    event.preventDefault();
    await this.document.syncFromCompendium();
  }

  async _onDismissOutdated(event, target) {
    event.preventDefault();
    const modifiedTime = Number(target.dataset.modifiedTime);
    await this.document.dismissOutdatedWarning(modifiedTime);
    this.render();
  }

  _supportsEffects() {
    return ['weapon', 'outfit', 'skill', 'augment', 'tool', 'ammunition'].includes(this.document.type);
  }

  // separated cause effects & EasyEffects are different, though the function is the same currently, may not be the case always
  _supportsEasyEffects() {
    return ['weapon', 'outfit', 'skill', 'augment', 'tool', 'ammunition', 'status', 'effect'].includes(this.document.type);
  }

  async _onRegenerateSlug(event, target) {
    if (!this.isEditable) return;
    event.preventDefault();
    const slug = sluggify(this.document.name ?? "");
    await this.document.update({ "system.slug": slug });
  }

  async _onSyncEasyEffects(event, target) {
    if (!this.isEditable || !this._supportsEffects()) return;
    event.preventDefault();

    const button = target;
    const current = String(this.document.system?.easyEffects ?? "");
    const expectedInner = await buildEasyEffectsFromHostEffects(this.document);
    const dirty = isEasyEffectsSyncDirty(current, expectedInner);
    const now = Date.now();

    if (dirty && !(this._eeSyncArmed && now < (this._eeSyncArmedUntil ?? 0))) {
      this._eeSyncArmed = true;
      this._eeSyncArmedUntil = now + 3000;
      button.classList.remove("synced");
      button.classList.add("armed");
      button.textContent = game.i18n.localize("PMTTRPG.EasyEffectsSyncConfirm");
      clearTimeout(this._eeSyncTimer);
      this._eeSyncTimer = setTimeout(() => {
        this._eeSyncArmed = false;
        if (!button.isConnected) return;
        button.classList.remove("armed");
        button.textContent = game.i18n.localize("PMTTRPG.EasyEffectsSync");
      }, 3000);
      return;
    }

    this._eeSyncArmed = false;
    clearTimeout(this._eeSyncTimer);
    await syncEasyEffectsFromHostEffects(this.document, { force: true });
    await emitItemEquipped(this.document);

    button.classList.remove("armed");
    button.classList.add("synced");
    button.textContent = game.i18n.localize("PMTTRPG.EasyEffectsSynced");
    clearTimeout(this._eeSyncDoneTimer);
    this._eeSyncDoneTimer = setTimeout(() => {
      if (!button.isConnected) return;
      button.classList.remove("synced");
      button.textContent = game.i18n.localize("PMTTRPG.EasyEffectsSync");
    }, 2500);
  }

  // Auto-sync only while the managed region is clean/unmodified.
  async _maybeAutoSyncEasyEffects(previousEffects) {
    if (!this._supportsEffects()) return;
    const opts = { force: false };
    if (previousEffects !== undefined) opts.previousEffects = previousEffects;
    const result = await syncEasyEffectsFromHostEffects(this.document, opts);
    if (result?.dirty) {
      ui.notifications?.warn(game.i18n.localize("PMTTRPG.EasyEffectsSyncDirty"));
    }
    if (!result?.skipped) await emitItemEquipped(this.document);
  }

  _effectHostType() {
    if (this.document.type === 'tool') return 'skill';
    return this.document.type;
  }

  _effectHostSubtype() {
    return [this.document.system.subtype, this.document.system.subsubtype];
  }

  _effectLabel(effect) {
    return PMTTRPGUtility.formatEffectProcLabel(effect);
  }

  _effectSignature(effect) {
    return [
      effect?.effectUuid ?? '',
      effect?.procOn ?? '',
      effect?.procResult ?? '',
      effect?.procChoice ?? '',
      effect?.procStat ?? '',
      effect?.procDice ?? '',
      effect?.procAction ?? '',
      effect?.procCondition ?? '',
      effect?.mode ?? ''
    ].join('|').toLowerCase();
  }

  _getEffectStack(effect) {
    const stackRaw = Number(effect?.stack ?? effect?.count ?? 1);
    const stackMaxRaw = Number(effect?.stackMax ?? 5);
    const stackMax = Math.max(1, Number.isFinite(stackMaxRaw) ? stackMaxRaw : 5);
    return Math.max(1, Math.min(stackMax, Number.isFinite(stackRaw) ? stackRaw : 1));
  }

  _createHostEffectEntry(effectItem, { mode = null } = {}) {
    const system = effectItem?.system ?? {};
    const resolvedMode = mode ?? (Number(system.cost ?? 0) < 0 || (system.canPositive === false && system.canNegative !== false) ? 'negative' : 'positive');

    return {
      effectUuid: effectItem?.uuid || effectItem?.effectUuid || '',
      easyEffectsTemplate: String(system.easyEffects ?? ''),
      name: effectItem?.name ?? '',
      cost: Math.abs(Number(system.cost ?? 0) || 0),
      stack: 1,
      count: 1,
      mode: resolvedMode,
      appliesTo: system.appliesTo ?? effectItem?.type ?? this._effectHostType(),
      canPositive: system.canPositive !== false,
      canNegative: system.canNegative !== false,
      allowModeToggle: (system.canPositive !== false) && (system.canNegative !== false),
      procOn: system.procOn ?? 'alwaysActive',
      procResult: system.procResult ?? 'none',
      procResultLocked: system.procResultLocked ?? (['onClash', 'onClashResult', 'onEitherClashResult'].includes(system.procOn) && system.procResult !== 'none'),
      procChoice: system.procChoice ?? 'none',
      procChoiceLocked: system.procChoiceLocked ?? false,
      procStat: system.procStat ?? 'any',
      procDice: system.procDice ?? 'any',
      procAction: system.procAction ?? 'any',
      procCondition: system.procCondition ?? '',
      stackMax: Math.max(1, Number(system.stackMax ?? (system.allowMultiple === false ? 1 : 5)) || 5),
      positive: system.positive ?? '',
      negative: system.negative ?? '',
      macro: { uuid: system?.macro?.uuid ?? '' }
    };
  }

  _mergeHostEffectEntries(existingEffects = [], incomingEffect) {
    const effects = foundry.utils.duplicate(existingEffects ?? []);
    const signature = this._effectSignature(incomingEffect);
    const existingIndex = effects.findIndex(effect => this._effectSignature(effect) === signature);

    if (existingIndex >= 0) {
      const current = effects[existingIndex];
      const currentMax = Math.max(1, Number(current.stackMax ?? incomingEffect.stackMax ?? 5) || 5);
      const incomingMax = Math.max(1, Number(incomingEffect.stackMax ?? currentMax) || currentMax);
      current.stackMax = Math.min(currentMax, incomingMax);
      current.stack = Math.max(1, Math.min(current.stackMax, this._getEffectStack(current) + this._getEffectStack(incomingEffect)));
      current.count = current.stack;
      if (!current.effectUuid && incomingEffect.effectUuid) current.effectUuid = incomingEffect.effectUuid;
      if (!current.easyEffectsTemplate && incomingEffect.easyEffectsTemplate) {
        current.easyEffectsTemplate = incomingEffect.easyEffectsTemplate;
      }
      return effects;
    }

    effects.push(incomingEffect);
    return effects;
  }

  _buildEffectSummaryGroups(effects = []) {
    return buildEffectSummaryGroups(effects);
  }

  async _getEffectCatalog() {
    const hostType = this._effectHostType();
    const hostSubtype = this._effectHostSubtype();
    PMTTRPGItemSheet._effectCatalogCache = PMTTRPGItemSheet._effectCatalogCache || {};
    if (PMTTRPGItemSheet._effectCatalogCache[hostType]) {
      return PMTTRPGItemSheet._effectCatalogCache[hostType];
    }

    const catalog = [];
    const packs = Array.from(game.packs ?? []).filter(pack => pack.documentName === 'Item');

    for (const effect of game.items.filter(item => item.type === 'effect')) {
      const appliesTo = effect.system?.appliesTo ?? hostType;
      if (appliesTo !== hostType) continue;
      if (!(effect.system.subtypeWhitelist.includes(hostSubtype[0])) || !(effect.system.subsubtypeWhitelist.includes(hostSubtype[1]))) continue;
      catalog.push({
        uuid: effect.uuid,
        name: effect.name,
        label: `${effect.name} [${game.i18n.localize(`TYPES.Item.${appliesTo}`)}]`,
        appliesTo,
        canPositive: effect.system?.canPositive !== false,
        canNegative: effect.system?.canNegative !== false,
        effect: { 
          ...effect.toObject(),
          uuid: effect.uuid
        }
      });
    }

    for (const pack of packs) {
      let docs = [];
      try { 
        docs = await pack.getDocuments(); 
      }
      catch (error) { 
        continue; 
      }

      for (const effect of docs.filter(doc => doc.type === 'effect')) {
        const appliesTo = effect.system?.appliesTo ?? hostType;
        if (appliesTo !== hostType) continue;
        catalog.push({
          uuid: effect.uuid,
          name: effect.name,
          icon: effect.img,
          appliesTo,
          canPositive: effect.system?.canPositive !== false,
          canNegative: effect.system?.canNegative !== false,
          effect: {
            ...effect.toObject(),
            uuid: effect.uuid
          }
        });
      }
    }

    catalog.sort((left, right) => left.name.localeCompare(right.name));
    PMTTRPGItemSheet._effectCatalogCache = PMTTRPGItemSheet._effectCatalogCache || {};
    PMTTRPGItemSheet._effectCatalogCache[this._effectHostType()] = catalog;
    return catalog;
  }

  async _mountEffectAutocomplete(container, { signal } = {}) {
    const catalog = await this._getEffectCatalog();

    const effects = catalog.map(entry => ({
      id: entry.uuid,
      name: entry.name,
      icon: entry.icon,
      source: entry.effect?.system.homebrew.source ?? "Your World",
      epCost: entry.effect?.system?.cost ?? null,
      tags:(entry.effect?.system?.tags ?? []).map(t => typeof t === 'string' ? { name: t } : { name: t.value ?? t.name ?? String(t) }),
      _catalogEntry: entry,
    }));

    new EffectAutocomplete(container, {
      effects,
      onSelect: async (picked) => {
        await this._addEffectToHost(picked._catalogEntry);
      },
    });

    signal?.addEventListener('abort', () => {
      container.querySelector('.effect-autocomplete__input')?.blur();
    });
  }

  async _prepareEffectHostContext() {
    const catalog = await this._getEffectCatalog();
    const effects = foundry.utils.duplicate(this.document.system.effects ?? []).map(effect => {
      const stack = this._getEffectStack(effect);
      const showProcResult = ['onClash', 'onClashResult', 'onEitherClashResult'].includes(effect.procOn);
      const showProcChoice = effectShowsProcChoice(effect.procOn);
      const showProcStat = ['onUse', 'onAction'].includes(effect.procOn);
      const showProcAction = ['onUse', 'onAction'].includes(effect.procOn);
      return {
        ...effect,
        stack,
        count: stack,
        stackMax: Math.max(1, Number(effect.stackMax ?? 5) || 5),
        signedCost: (effect.mode === 'negative' ? -1 : 1) * Math.abs(Number(effect.cost ?? 0)),
        displayCost: (effect.mode === 'negative' ? -1 : 1) * Math.abs(Number(effect.cost ?? 0)),
        totalCost: ((effect.mode === 'negative' ? -1 : 1) * Math.abs(Number(effect.cost ?? 0))) * stack,
        allowModeToggle: effect.canPositive !== false && effect.canNegative !== false,
        showProcResult,
        showProcChoice,
        showProcStat,
        showProcAction,
        procResultLocked: effect.procResultLocked ?? (['onClash', 'onClashResult', 'onEitherClashResult'].includes(effect.procOn) && effect.procResult !== 'none'),
        procChoiceLocked: effect.procChoiceLocked ?? false,
        modeLabel: effect.mode === 'negative' ? game.i18n.localize('PMTTRPG.EffectModeNegative') : game.i18n.localize('PMTTRPG.EffectModePositive')
      };
    });

    return {
      effectChoices: catalog,
      effects,
      effectSummary: computeEffectSummary(effects, Number(this.document.system?.epMax ?? 0)),
      effectSummaryGroups: this._buildEffectSummaryGroups(effects),
      effectSearchPlaceholder: game.i18n.localize('PMTTRPG.EffectSearchPlaceholder')
    };
  }


  /**
   * Add tagging widget.
   */
  async _tagify(editable) {
    // Build the tags list.
    const inputEl = this.element?.querySelector('.tags-input-source');
    if (!inputEl) return;
    let tags = game.items.filter(item => item.type === 'tag').map(item => item.name);
    for (const c of game.packs) {
      if (c.metadata.type === 'Item' && c.metadata.name === 'tags') {
        const items = c?.index ? c.index.map(i => i.name) : [];
        tags = tags.concat(items);
      }
    }
    // Sort the tagnames list.
    const tagNames = [...new Set(tags.map(t => t.toLowerCase()))].sort();
    // Tagify!
    if (!editable) inputEl.setAttribute('readonly', 'true');
      // init Tagify script on the above inputs
    this.tagify = new Tagify(inputEl, {
      whitelist: tagNames,
      maxTags: 'Infinity',
      dropdown: {
        maxItems: 20,
        classname: "tags-look",
        enabled: 0,
        closeOnSelect: false
      }
    });
  }

  async _onClickClassControl(event) {
    event.preventDefault();
    const a = event.target.closest('.class-control');
    if (!a) return;
    const action = a.dataset.action;
    const field_type = a.dataset.type;

    const field_types = {
      races: 'race',
      alignments: 'alignment'
    };

    if (action === "create") {
      if (Object.keys(field_types).includes(field_type)) {
        const field_values = this.document.system[field_type] ?? {};
        const nk = Object.keys(field_values).length + 1;
        const update = {};
        update[`system.${field_type}.${nk}`] = { label: '', description: '' };
        await this.document.update(update);
      }
      else if (field_type === 'equipment-groups') {
        const field_values = this.document.system.equipment ?? {};
        const nk = Object.keys(field_values).length + 1;
        const systemCopy = foundry.utils.duplicate(this.document.system);
        systemCopy.equipment[nk] = { label: '', mode: 'radio', items: [], objects: [] };
        await this.document.update({ system: systemCopy });
      }
    }
    else if (action === "delete") {
      if (field_type === 'equipment-groups') {
        const elem = a.closest('.equipment-group');
        const nk = elem?.dataset?.index;
        if (!nk) return;
        const update = {};
        update[`system.equipment.${nk}`] = foundry.data.operators.ForcedDeletion;
        await this.document.update(update);
      }
      else {
        const li = a.closest(".item");
        const nk = li?.dataset?.index;
        if (!nk) return;
        const update = {};
        update[`system.${field_type}.${nk}`] = foundry.data.operators.ForcedDeletion;
        await this.document.update(update);
      }
    }
  }

  async _onEffectControl(event) {
    event.preventDefault();
    if (!this._supportsEffects()) return;

    const button = event.currentTarget;
    const action = button.dataset.action;
    const row = button.closest('.effect-row');
    const index = row ? Number(row.dataset.index ?? -1) : -1;
    const effects = foundry.utils.duplicate(this.document.system.effects ?? []);

    if (action === 'delete' && index >= 0) {
      const previousEffects = foundry.utils.duplicate(this.document.system.effects ?? []);
      effects.splice(index, 1);
      await this.document.update({ 'system.effects': effects });
      await this._maybeAutoSyncEasyEffects(previousEffects);
    }
  }

  async _onEffectPickerChange(event) {
    event.preventDefault();
    event.stopPropagation();
    // Capture the input before any await: event.currentTarget is nulled out by the
    // browser once the event has finished dispatching.
    const input = event.currentTarget;
    const value = `${input?.value ?? ''}`.trim();
    if (!value) return;

    const choice = (await this._getEffectCatalog()).find(entry => entry.label === value || entry.name === value);
    if (!choice) return;

    await this._addEffectToHost(choice);
    if (input?.isConnected) input.value = '';
  }

  async _onEffectPickerKeydown(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    await this._onEffectPickerChange(event);
  }

  async _onEffectStackChange(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this._supportsEffects()) return;

    const row = event.currentTarget.closest('.effect-row');
    const index = Number(row?.dataset?.index ?? -1);
    if (index < 0) return;

    const stackRaw = Number(event.currentTarget.value ?? 1);
    const stackMax = Math.max(1, Number(row?.dataset?.stackMax ?? 5) || 5);
    const stack = Math.max(1, Math.min(stackMax, Number.isFinite(stackRaw) ? stackRaw : 1));
    const previousEffects = foundry.utils.duplicate(this.document.system.effects ?? []);
    const effects = foundry.utils.duplicate(previousEffects);
    if (!effects[index]) return;

    effects[index].stack = stack;
    effects[index].count = stack;
    await this.document.update({ 'system.effects': effects });
    await this._maybeAutoSyncEasyEffects(previousEffects);
  }

  async _onEffectProcResultChange(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this._supportsEffects()) return;

    const row = event.currentTarget.closest('.effect-row');
    const index = Number(row?.dataset?.index ?? -1);
    if (index < 0) return;

    const previousEffects = foundry.utils.duplicate(this.document.system.effects ?? []);
    const effects = foundry.utils.duplicate(previousEffects);
    if (!effects[index] || effects[index].procResultLocked) return;

    effects[index].procResult = `${event.currentTarget.value ?? 'none'}`;
    await this.document.update({ 'system.effects': effects });
    await this._maybeAutoSyncEasyEffects(previousEffects);
  }

  async _onEffectProcChoiceChange(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this._supportsEffects()) return;

    const row = event.currentTarget.closest('.effect-row');
    const index = Number(row?.dataset?.index ?? -1);
    if (index < 0) return;

    const previousEffects = foundry.utils.duplicate(this.document.system.effects ?? []);
    const effects = foundry.utils.duplicate(previousEffects);
    if (!effects[index] || effects[index].procChoiceLocked) return;

    effects[index].procChoice = `${event.currentTarget.value ?? 'none'}`;
    await this.document.update({ 'system.effects': effects });
    await this._maybeAutoSyncEasyEffects(previousEffects);
  }

  async _onEffectProcStatChange(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this._supportsEffects()) return;

    const row = event.currentTarget.closest('.effect-row');
    const index = Number(row?.dataset?.index ?? -1);
    if (index < 0) return;

    const effects = foundry.utils.duplicate(this.document.system.effects ?? []);
    if (!effects[index]) return;

    effects[index].procStat = `${event.currentTarget.value ?? 'any'}`;
    await this.document.update({ 'system.effects': effects });
  }

  async _onEffectProcActionChange(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this._supportsEffects()) return;

    const row = event.currentTarget.closest('.effect-row');
    const index = Number(row?.dataset?.index ?? -1);
    if (index < 0) return;

    const effects = foundry.utils.duplicate(this.document.system.effects ?? []);
    if (!effects[index]) return;

    effects[index].procAction = `${event.currentTarget.value ?? 'any'}`;
    await this.document.update({ 'system.effects': effects });
  }

  async _onEffectModeChange(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this._supportsEffects()) return;

    const row = event.currentTarget.closest('.effect-row');
    const index = Number(row?.dataset?.index ?? -1);
    if (index < 0) return;

    const previousEffects = foundry.utils.duplicate(this.document.system.effects ?? []);
    const effects = foundry.utils.duplicate(previousEffects);
    if (!effects[index]) return;

    effects[index].mode = `${event.currentTarget.value ?? 'positive'}`;
    await this.document.update({ 'system.effects': effects });
    await this._maybeAutoSyncEasyEffects(previousEffects);
  }

  _onEffectDragOver(event) {
    if (!this._supportsEffects()) return;
    event.preventDefault();
  }

  _normalizeSubmittedEffects(submittedEffects = [], currentEffects = []) {
    const submitted = Array.isArray(submittedEffects)
      ? submittedEffects
      : (submittedEffects && typeof submittedEffects === 'object')
        ? Object.keys(submittedEffects)
          .sort((a, b) => Number(a) - Number(b))
          .map(key => submittedEffects[key])
          .filter(entry => entry != null)
        : [];

    if (!submitted.length) {
      return foundry.utils.duplicate(currentEffects ?? []);
    }

    return submitted.map((entry, index) => {
      const merged = foundry.utils.mergeObject(currentEffects[index] ?? {}, entry ?? {}, {
        inplace: false, overwrite: true
      });

      const stackMaxRaw = Number(merged?.stackMax ?? (merged?.allowMultiple === false ? 1 : 5));
      const stackMax = Math.max(1, Number.isFinite(stackMaxRaw) ? stackMaxRaw : 5);
      const stackRaw = Number(merged?.stack ?? merged?.count ?? 1);
      const stack = Math.max(1, Math.min(stackMax, Number.isFinite(stackRaw) ? stackRaw : 1));

      merged.effectUuid = merged?.effectUuid ?? merged?.uuid ?? '';
      merged.stackMax = stackMax;
      merged.stack = stack;
      merged.count = stack;

      return merged;
    });
  }

  async _addEffectToHost(effectChoice) {
    const effectData = effectChoice?.effect;
    if (!effectData || effectData.type !== 'effect') return;
    if ((effectData.system?.appliesTo ?? this._effectHostType()) !== this._effectHostType()) return;

    const incoming = this._createHostEffectEntry(effectData, {
      mode: effectData.system?.cost < 0 || effectData.system?.canPositive === false ? 'negative' : 'positive'
    });
    incoming.effectUuid = incoming.effectUuid || effectChoice.uuid || effectChoice.effect?.uuid || '';
    if (!incoming.easyEffectsTemplate) {
      incoming.easyEffectsTemplate = String(effectChoice.effect?.system?.easyEffects ?? '');
    }

    const previousEffects = foundry.utils.duplicate(this.document.system.effects ?? []);
    const effects = this._mergeHostEffectEntries(previousEffects, incoming);
    await this.document.update({ 'system.effects': effects });
    await this._maybeAutoSyncEasyEffects(previousEffects);
  }

  async _onDrop(event) {
    const rawData = event.dataTransfer?.getData('text/plain');
    if (!rawData) return false;

    let dropData = null;
    try { dropData = JSON.parse(rawData); }
    catch (err) { return false; }

    if (dropData?.type !== 'Item' || !this._supportsEffects()) return false;

    const droppedItem = await Item.fromDropData(dropData);
    if (!droppedItem || droppedItem.type !== 'effect') return false;

    if ((droppedItem.system?.appliesTo ?? this._effectHostType()) !== this._effectHostType()) return false;

    const previousEffects = foundry.utils.duplicate(this.document.system.effects ?? []);
    const effects = this._mergeHostEffectEntries(
      previousEffects,
      this._createHostEffectEntry(droppedItem, {
        mode: droppedItem.system?.cost < 0 || droppedItem.system?.canPositive === false ? 'negative' : 'positive'
      })
    );
    await this.document.update({ 'system.effects': effects });
    await this._maybeAutoSyncEasyEffects(previousEffects);
    return false;
  }
}
