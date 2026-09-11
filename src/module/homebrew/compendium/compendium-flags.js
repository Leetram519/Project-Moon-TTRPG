import { HOMEBREW_REGISTRY } from "../homebrew-registry.js";

/**
 * @typedef {Object} CompendiumPackConfig
 * @property {boolean} hidden   - Whether this pack is hidden from the compendium browser
 * @property {boolean} active   - Whether this pack's content is included in lookups/merges
 * @property {number}  priority - Higher = wins when two packs define the same item name.
 *                                System packs default to 0; homebrew packs start at 10.
 */
export class CompendiumFlags {

  static register() {
    game.settings.register("projectmoonttrpg", "compendiumPackConfigs", {
      name:    "Compendium Pack Configurations",
      hint:    "Per-pack hidden/active flags and priority values.",
      scope:   "world",
      config:  false,         // managed via HomebrewMenuDialog, not the settings UI
      type:    Object,
      default: {},
    });
  }
  
  static getAll() {
    const stored = game.settings.get("projectmoonttrpg", "compendiumPackConfigs") ?? {};
    const result = {};

    for (const pack of game.packs) {
      result[pack.collection] = {
        hidden:   false,
        active:   true,
        priority: 0,
        ...(stored[pack.collection] ?? {}),
      };
    }

    return result;
  }

  static get(packKey) {
    return this.getAll()[packKey] ?? { hidden: false, active: true, priority: 0 };
  }

  /**
   * Merges a partial update into the stored config for one pack.
   * @param {string} packKey
   * @param {Partial<CompendiumPackConfig>} update
   */
  static async set(packKey, update) {
    const all = game.settings.get("projectmoonttrpg", "compendiumPackConfigs") ?? {};
    all[packKey] = foundry.utils.mergeObject(all[packKey] ?? {}, update);
    await game.settings.set("projectmoonttrpg", "compendiumPackConfigs", all);
  }

  /**
   * Bulk-saves an entire config map (used by the dialog on submit).
   * @param {Record<string, CompendiumPackConfig>} configs
   */
  static async saveAll(configs) {
    console.log(`[CompendiumBrowserOverride] Saved All! ${JSON.stringify(configs)}`);
    await game.settings.set("projectmoonttrpg", "compendiumPackConfigs", configs);
  }

  /** Returns all pack keys that are NOT hidden. */
  static visiblePacks() {
    const all = this.getAll();
    return Object.entries(all)
      .filter(([, cfg]) => !cfg.hidden)
      .map(([key]) => key);
  }

  /** Returns all pack keys that ARE active (participate in merges). */
  static activePacks() {
    const all = this.getAll();
    return Object.entries(all)
      .filter(([, cfg]) => cfg.active)
      .map(([key]) => key);
  }

  /**
   * Given an array of compendium entries that share the same item name,
   * returns only the one from the highest-priority pack.
   * If priorities tie, the first entry wins (respects array order).
   *
   * @param {CompendiumIndexEntry[]} entries
   * @returns {CompendiumIndexEntry}
   */
  static resolveByPriority(entries) {
    if (entries.length === 1) return entries[0];

    const all = this.getAll();
    return entries.reduce((best, current) => {
      const bestPrio    = all[best.pack]?.priority    ?? 0;
      const currentPrio = all[current.pack]?.priority ?? 0;
      return currentPrio > bestPrio ? current : best;
    });
  }

  /**
   * Called whenever a homebrew toggle changes state.
   * Marks the homebrew's compendium packs as hidden=false, active=true (or the reverse)
   * and sets their priority to 10 (above system packs at 0).
   *
   * @param {string}   homebrewId - id from HOMEBREW_REGISTRY
   * @param {boolean}  enabled
   */
  static async applyHomebrewState(homebrewId, enabled) {
    const def = HOMEBREW_REGISTRY.find(h => h.id === homebrewId);
    if (!def) return;

    const all = game.settings.get("projectmoonttrpg", "compendiumPackConfigs") ?? {};

    for (const packKey of def.compendiumPacks) {
      all[packKey] = foundry.utils.mergeObject(all[packKey] ?? {}, {
        hidden:   !enabled,
        active:   enabled,
        priority: enabled ? 10 : 0,
      });
    }

    await game.settings.set("projectmoonttrpg", "compendiumPackConfigs", all);
  }
}