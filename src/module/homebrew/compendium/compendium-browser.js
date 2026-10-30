import { CompendiumFlags } from "./compendium-flags.js";

const LOG = "[CompendiumBrowserOverride]";

export class CompendiumBrowserOverride extends foundry.applications.sidebar.tabs.CompendiumDirectory {
  static init() {
    const Base = foundry.applications?.sidebar?.tabs?.CompendiumDirectory;
    if (!Base) {
      console.error(`${LOG} foundry.applications.sidebar.tabs.CompendiumDirectory not found.`);
      console.error(`${LOG} Available sidebar tabs:`, Object.keys(foundry.applications?.sidebar?.tabs ?? {}));
      return;
    }

    const prev = CONFIG.ui.compendium;
    CONFIG.ui.compendium = CompendiumBrowserOverride;

    Hooks.on("updateSetting", (setting) => {
      if (setting.key !== "projectmoonttrpg.compendiumPackConfigs") return;
      ui.compendium?.render({ parts: ["directory"] });
    });
  }

  /** @override */
  async _prepareDirectoryContext(context, options) {
    await super._prepareDirectoryContext(context, options);
    const visibleSet = new Set(CompendiumFlags.visiblePacks());
    this._filterContext(context, visibleSet);
    console.groupEnd();
  }

  /** @override */
  _preparePackContext(pack) {
    const ctx = super._preparePackContext(pack);
    const cfg = CompendiumFlags.get(pack.collection);

    ctx.pmttrpg = {
      hidden:   cfg.hidden,
      active:   cfg.active,
      priority: cfg.priority,
    };

    return ctx;
  }

  /**
   * @param {ApplicationRenderContext} context
   * @param {Set<string>} visibleSet
   */
  _filterContext(context, visibleSet) {
    if (context.packContext && typeof context.packContext === "object") {
      const before = Object.keys(context.packContext).length;
      const filtered = {};
      
      for (const [key, packCtx] of Object.entries(context.packContext)) {
        if (visibleSet.has(key)) {
          filtered[key] = packCtx;
        } else {
          console.log(`${LOG}   hiding pack: ${key}`);
        }
      }
      
      context.packContext = filtered;
      const after = Object.keys(filtered).length;
    }
  }

  /**
   * @param {object[]} nodes
   * @param {Set<string>} visibleSet
   * @returns {object[]}
   */
  _filterTree(nodes, visibleSet) {
    if (!Array.isArray(nodes)) {
      console.warn(`${LOG} _filterTree called with non-array:`, nodes);
      return nodes;
    }

    return nodes.reduce((acc, node) => {
      if (!node) return acc;

      if (Array.isArray(node.entries)) {
        const before = node.entries.length;
        node.entries = node.entries.filter(e => {
          const key = e.collection ?? e.id ?? e;
          const keep = visibleSet.has(key);
          return keep;
        });
      }

      if (Array.isArray(node.children)) {
        node.children = this._filterTree(node.children, visibleSet);
      }

      const hasEntries  = (node.entries?.length  ?? 0) > 0;
      const hasChildren = (node.children?.length ?? 0) > 0;

      if (hasEntries || hasChildren) {
        acc.push(node);
      }

      return acc;
    }, []);
  }

  /**
   * @param {object[]} entries
   * @returns {object[]}
   */
  static filterAndPrioritise(entries) {
    const activePacks = new Set(CompendiumFlags.activePacks());

    const active = entries.filter(e => {
      const key = e.pack ?? e.compendium;
      return !key || activePacks.has(key);
    });

    const byName = new Map();
    for (const entry of active) {
      const name = entry.name?.toLowerCase() ?? entry._id;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(entry);
    }

    const resolved = [...byName.values()].map(group => CompendiumFlags.resolveByPriority(group));
    return resolved;
  }
}