/**
 * Registry for querying enabled modules in the current world.
 * Use after `game` is initialized (e.g., in `init` or `ready`).
 */
export class ModuleRegistry {

  /**
   * @returns {Map<string, foundry.Module>} All modules (active + inactive)
   */
  static getAll() {
    return game.modules;
  }

  /**
   * @returns {foundry.Module[]} Only the enabled (active) modules
   */
  static getEnabled() {
    return [...game.modules.values()].filter(m => m.active);
  }

  /**
   * @returns {string[]} IDs of all enabled modules
   */
  static getEnabledIds() {
    return this.getEnabled().map(m => m.id);
  }

  /**
   * Check whether a specific module is enabled.
   * @param {string} moduleId - e.g. "midi-qol"
   * @returns {boolean}
   */
  static isEnabled(moduleId) {
    const mod = game.modules.get(moduleId);
    return mod ? mod.active : false;
  }

  /**
   * Get the module object by id (regardless of active state).
   * @param {string} moduleId
   * @returns {foundry.Module | undefined}
   */
  static get(moduleId) {
    return game.modules.get(moduleId);
  }

  /**
   * Get version of an enabled module, or null if not enabled.
   * @param {string} moduleId
   * @returns {string | null}
   */
  static getVersion(moduleId) {
    const mod = this.get(moduleId);
    return (mod && mod.active) ? mod.version : null;
  }

  /**
   * Check if a module is enabled and meets a minimum version.
   * @param {string} moduleId
   * @param {string} minVersion - e.g. "1.2.0"
   * @returns {boolean}
   */
  static isVersionAtLeast(moduleId, minVersion) {
    const version = this.getVersion(moduleId);
    if (!version) return false;
    return foundry.utils.versionMeetsMinimum(version, minVersion);
  }

  /**
   * Log a table of all enabled modules to the console.
   */
  static log() {
    const mods = this.getEnabled();
    console.group(`Enabled Modules (${mods.length})`);
    for (const m of mods) {
      console.log(`  ${m.id}  v${m.version}  ${m.title}`);
    }
    console.groupEnd();
  }
}   