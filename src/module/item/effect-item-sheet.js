import { PMTTRPGItemSheet } from "./item-sheet.js";

export class PMTTRPGEffectItemSheet extends PMTTRPGItemSheet {

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    PMTTRPGItemSheet.DEFAULT_OPTIONS,
    {
      classes: ["projectmoonttrpg", "sheet", "item", "effect"],
      position: { width: 560, height: 620 },
    },
    { inplace: false }
  );

  static PARTS = {
    body: {
      template: "systems/projectmoonttrpg/templates/items/effect-sheet.html",
      scrollable: [".sheet-body"]
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.selects = context.selects || {};

    context.selects.effectAppliesTo = {
      weapon: "TYPES.Item.weapon",
      outfit: "TYPES.Item.outfit",
      skill: "TYPES.Item.skill",
      augment: "TYPES.Item.augment",
      ammunition: "TYPES.Item.ammunition",
    };

    context.selects.effectSubtypeWhitelist = {
      weapon: {
        melee: "PMTTRPG.Sheet.EffectSubtype.Melee",
        ranged: "PMTTRPG.Sheet.EffectSubType.Ranged"
      },

      outfit: {
        regular: "PMTTRPG.Sheet.EffectSubtype.Regular",
      },

      skill: {
        regular: "PMTTRPG.Sheet.EffectSubtype.Regular",
      },

      augment: {
        regular: "PMTTRPG.Sheet.EffectSubtype.Regular",
      },

      ammunition: {
        regular: "PMTTRPG.Sheet.EffectSubtype.Regular",
      },
    };

    this._normalizeEffectWhitelists(context);
    this._prepareEffectWhitelistContext(context);

    Hooks.callAll("pmttrpg.sheet.effect.onContextPrepare", context);

    return context;
  }

  _normalizeEffectWhitelists(context) {
    const system = context.system;
    const hierarchy = context.selects.effectSubtypeWhitelist?.[system.appliesTo] ?? {};

    if (!Array.isArray(system.subtypeWhitelist)) system.subtypeWhitelist = [];
    if (!Array.isArray(system.subsubtypeWhitelist)) system.subsubtypeWhitelist = [];

    const validSubtypes = new Set(Object.keys(hierarchy));

    system.subtypeWhitelist = system.subtypeWhitelist.filter(subtype => validSubtypes.has(subtype));

    const validSubsubtypes = new Set();
    for (const subtype of system.subtypeWhitelist) {
      const subtypeData = hierarchy[subtype];
      if (!subtypeData || typeof subtypeData !== "object") continue;

      for (const subsubtype of Object.keys(subtypeData)) 
        validSubsubtypes.add(`${subtype}.${subsubtype}`);
    }

    system.subsubtypeWhitelist = system.subsubtypeWhitelist.filter(subsubtype => validSubsubtypes.has(subsubtype));
  }

  _prepareEffectWhitelistContext(context) {
    const system = context.system;
    const hierarchy = context.selects.effectSubtypeWhitelist?.[system.appliesTo] ?? {};
    const subtypeEntries = Object.entries(hierarchy);

    // A single "regular" subtype should not produce a whitelist
    context.hasSubtypeChoices = subtypeEntries.length > 1;
    context.subtypeOptions = subtypeEntries.map( ([subtype, value]) => {
      const hasSubsubtypes = value !== null && typeof value === "object" && !Array.isArray(value);

      const subsubtypeOptions = hasSubsubtypes ? Object.entries(value).map(([subsubtype, label]) => {
        const path = `${subtype}.${subsubtype}`;

        return {
          key: path,
          label,
          selected:
            system.subsubtypeWhitelist.includes(path),
        };
      }) : [];

      return {
        key: subtype,
        label: hasSubsubtypes ? subtype : value,
        selected: system.subtypeWhitelist.includes(subtype),
        hasSubsubtypes,
        subsubtypeOptions,
      };
    });

    context.hasSubsubtypeChoices = context.subtypeOptions.some(subtype => subtype.hasSubsubtypes);
  }

  async _onSubmit(event, options = {}) {
    const formData = new FormData(event.currentTarget);

    const subtypeWhitelist = formData.getAll("system.subtypeWhitelist");
    const subsubtypeWhitelist = formData.getAll("system.subsubtypeWhitelist");

    formData.delete("system.subtypeWhitelist");
    formData.delete("system.subsubtypeWhitelist");

    formData.set("system.subtypeWhitelist", JSON.stringify(subtypeWhitelist));
    formData.set("system.subsubtypeWhitelist", JSON.stringify(subsubtypeWhitelist));

    return super._onSubmit(event, options);
  }
}