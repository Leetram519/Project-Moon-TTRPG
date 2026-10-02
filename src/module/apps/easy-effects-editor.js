import { parse } from "../easy-effects/parser.js";
import { bindEasyEffectsHighlighter } from "../easy-effects/highlight.js";
import { actorIdentityKey } from "../easy-effects/burst-roles.js";
import {
  SYSTEM_ID,
  WORLD_SCRIPT_SETTING,
  DEFAULT_WORLD_EASY_EFFECTS,
  getWorldEasyEffects,
  isActorWorldSynced,
  clearActorScriptCache,
} from "../easy-effects/actor-scripts.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class EasyEffectsEditor extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @type {Actor|null} */
  #actor = null;

  /** @type {AbortController|null} */
  #highlightAbort = null;

  /**
   * @param {object} [options]
   * @param {Actor|null} [options.actor]
   */
  constructor(options = {}) {
    const { actor = null, ...appOptions } = options;
    const identity = actor ? actorIdentityKey(actor) : "";
    const safeId = identity ? identity.replace(/[^A-Za-z0-9_-]/g, "-") : "";
    appOptions.id = safeId
      ? `pmttrpg-easy-effects-editor-${safeId}`
      : "pmttrpg-easy-effects-editor-world";
    super(appOptions);
    this.#actor = actor ?? null;
  }

  static DEFAULT_OPTIONS = {
    id: "pmttrpg-easy-effects-editor-world",
    classes: ["projectmoonttrpg", "pm-ee-editor"],
    tag: "form",
    position: { width: 620, height: 640 },
    window: {
      title: "PMTTRPG.EasyEffectsEditor.EditorTitle",
      icon: "fa-solid fa-code",
      resizable: true,
      contentClasses: ["standard-form"],
    },
    form: {
      handler: EasyEffectsEditor.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false,
    },
    actions: {
      syncFromWorld: EasyEffectsEditor.#onSyncFromWorld,
      restoreDefault: EasyEffectsEditor.#onRestoreDefault,
    },
  };

  static PARTS = {
    main: {
      template: "systems/projectmoonttrpg/templates/apps/easy-effects-editor.hbs",
      root: true,
    },
  };

  /** @override */
  get title() {
    if (!this.#actor) return game.i18n.localize("PMTTRPG.EasyEffectsEditor.EditorTitleWorld");
    return game.i18n.format("PMTTRPG.EasyEffectsEditor.EditorTitleActor", { name: this.#actor.name });
  }

  get actor() {
    return this.#actor;
  }

  get isWorldMode() {
    return !this.#actor;
  }

  /** @override */
  async _prepareContext(_options) {
    const worldSource = getWorldEasyEffects();
    const synced = this.isWorldMode ? false : isActorWorldSynced(this.#actor);
    const source = this.isWorldMode
      ? worldSource
      : (synced ? worldSource : (this.#actor.system?.easyEffects ?? ""));

    return {
      source,
      isWorldMode: this.isWorldMode,
      synced,
      editable: game.user.isGM,
      statusKey: this.isWorldMode
        ? "PMTTRPG.EasyEffectsEditor.StatusWorld"
        : (synced ? "PMTTRPG.EasyEffectsEditor.StatusSynced" : "PMTTRPG.EasyEffectsEditor.StatusDetached"),
      statusClass: this.isWorldMode ? "world" : (synced ? "synced" : "detached"),
    };
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#highlightAbort?.abort();
    this.#highlightAbort = new AbortController();
    bindEasyEffectsHighlighter(this.element, { signal: this.#highlightAbort.signal });
  }

  /** @override */
  async _onClose(options) {
    this.#highlightAbort?.abort();
    this.#highlightAbort = null;
    return super._onClose(options);
  }

  #showError(message) {
    const box = this.element?.querySelector(".pm-ee-editor__error");
    if (!box) return;
    box.textContent = message ?? "";
    box.hidden = !message;
  }

  static async #onSubmit(_event, _form, formData) {
    if (!game.user.isGM) return;

    const text = String(formData.object?.source ?? "");

    if (text.trim()) {
      try {
        parse(text);
      } catch (err) {
        this.#showError(err.message);
        ui.notifications?.error(
          game.i18n.format("PMTTRPG.EasyEffectsEditor.ParseError", { error: err.message })
        );
        return;
      }
    }
    this.#showError(null);

    if (this.isWorldMode) {
      await game.settings.set(SYSTEM_ID, WORLD_SCRIPT_SETTING, text);
      ui.notifications?.info(game.i18n.localize("PMTTRPG.EasyEffectsEditor.SavedWorld"));
      await this.render();
      return;
    }

    const matchesWorld = normalize(text) === normalize(getWorldEasyEffects());
    await this.actor.update({
      "system.easyEffects": matchesWorld ? "" : text,
      "system.easyEffectsWorldSync": matchesWorld,
    });
    clearActorScriptCache(this.actor);
    ui.notifications?.info(game.i18n.localize("PMTTRPG.EasyEffectsEditor.SavedActor"));
    await this.render();
  }

  static async #onSyncFromWorld() {
    if (!game.user.isGM || this.isWorldMode) return;

    if (!isActorWorldSynced(this.actor)) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("PMTTRPG.EasyEffectsEditor.SyncConfirmTitle") },
        content: `<p>${game.i18n.localize("PMTTRPG.EasyEffectsEditor.SyncConfirm")}</p>`,
        rejectClose: false,
        modal: true,
      });
      if (!confirmed) return;
    }

    await this.actor.update({
      "system.easyEffects": "",
      "system.easyEffectsWorldSync": true,
    });
    clearActorScriptCache(this.actor);
    this.#showError(null);
    await this.render();
  }

  static async #onRestoreDefault() {
    if (!game.user.isGM || !this.isWorldMode) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("PMTTRPG.EasyEffectsEditor.RestoreConfirmTitle") },
      content: `<p>${game.i18n.localize("PMTTRPG.EasyEffectsEditor.RestoreConfirm")}</p>`,
      rejectClose: false,
      modal: true,
    });
    if (!confirmed) return;

    await game.settings.set(SYSTEM_ID, WORLD_SCRIPT_SETTING, DEFAULT_WORLD_EASY_EFFECTS);
    this.#showError(null);
    await this.render();
  }
}

function normalize(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n").trim();
}

function refreshSyncedActors() {
  clearActorScriptCache();
  if (!game.ready) return;
  for (const actor of game.actors ?? []) {
    if (!isActorWorldSynced(actor)) continue;
    try {
      actor.reset();
      if (actor.sheet?.rendered) actor.sheet.render(false);
    } catch (err) {
      console.error(`[EasyEffects] Failed to refresh actor '${actor.name}' after world script change:`, err);
    }
  }
}

export function registerWorldEasyEffectsSettings() {
  game.settings.register(SYSTEM_ID, WORLD_SCRIPT_SETTING, {
    name: "PMTTRPG.Settings.worldEasyEffects.name",
    hint: "PMTTRPG.Settings.worldEasyEffects.hint",
    scope: "world",
    config: false,
    type: String,
    default: DEFAULT_WORLD_EASY_EFFECTS,
    onChange: refreshSyncedActors,
  });

  game.settings.registerMenu(SYSTEM_ID, "worldEasyEffectsMenu", {
    name: "PMTTRPG.Settings.worldEasyEffects.name",
    hint: "PMTTRPG.Settings.worldEasyEffects.hint",
    label: "PMTTRPG.Settings.worldEasyEffects.label",
    icon: "fa-solid fa-code",
    type: EasyEffectsEditor,
    restricted: true,
  });
}
