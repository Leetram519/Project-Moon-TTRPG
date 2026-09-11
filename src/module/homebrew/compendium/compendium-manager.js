import { CompendiumFlags } from "./compendium-flags.js";

const LOG = "[CompendiumManager]";

export class CompendiumManager {
  static getPack(packKey) {
    const pack = game.packs.get(packKey);
    if (!pack) {
      console.warn(`${LOG} Pack not found: ${packKey}`);
      return null;
    }

    const flags = CompendiumFlags.get(packKey);
    return {
      pack,
      flags,
      isVisible: !flags.hidden,
      isActive: flags.active,
      priority: flags.priority,
    };
  }

  static getActivePacks() {
    const activePacks = new Set(CompendiumFlags.activePacks());
    const result = [];

    for (const pack of game.packs) {
      if (activePacks.has(pack.collection)) {
        const flags = CompendiumFlags.get(pack.collection);
        result.push({
          pack,
          flags,
          isVisible: !flags.hidden,
          isActive: flags.active,
          priority: flags.priority,
        });
      }
    }

    return result.sort((a, b) => b.priority - a.priority);
  }

  static getVisiblePacks() {
    const visiblePacks = new Set(CompendiumFlags.visiblePacks());
    const result = [];

    for (const pack of game.packs) {
      if (visiblePacks.has(pack.collection)) {
        const flags = CompendiumFlags.get(pack.collection);
        result.push({
            pack,
            flags,
            isVisible: !flags.hidden,
            isActive: flags.active,
            priority: flags.priority,
        });
      }
    }

    return result.sort((a, b) => b.priority - a.priority);
  }

  static getAllPacks() {
    const result = [];

    for (const pack of game.packs) {
      const flags = CompendiumFlags.get(pack.collection);
      result.push({
        pack,
        flags,
        isVisible: !flags.hidden,
        isActive: flags.active,
        priority: flags.priority,
      });
    }

    return result.sort((a, b) => b.priority - a.priority);
  }

  static async searchDocument(documentName, options = {}) {
    const searchPacks = options.packs ?? this.getActivePacks();
    const searchableDocument = game.documentIndex.documentType(documentName);

    if (!searchableDocument) {
      console.warn(`${LOG} Unknown document type: ${documentName}`);
      return [];
    }

    const results = [];
    const seen = new Set();

    for (const { pack } of searchPacks) {
      for (const entry of pack.index.filter(idx => idx.type === documentName)) {
        const name = entry.name.toLowerCase();
        if (seen.has(name)) continue;

        seen.add(name);
        results.push({
          pack: pack.collection,
          name: entry.name,
          uuid: entry.uuid,
          type: entry.type,
        });
      }
    }

    console.log(`${LOG} searchDocument(${documentName}): found ${results.length} unique entries across ${searchPacks.length} active packs`);
    return results;
  }

  static async getDocument(uuid) {
    return await fromUuid(uuid);
  }

  static getDocumentByName(documentType, name, options = {}) {
    const searchPacks = options.packs ?? this.getActivePacks();
    const nameLower = name.toLowerCase();

    for (const { pack, priority } of searchPacks) {
      const found = pack.index.find(idx => idx.type === documentType && idx.name.toLowerCase() === nameLower);
      if (found) {
        return {
          pack: pack.collection,
          priority,
          name: found.name,
          uuid: found.uuid,
          type: found.type,
        };
      }
    }

    console.warn(`${LOG} getDocumentByName: ${documentType} "${name}" not found in active packs`);
    return null;
  }
}