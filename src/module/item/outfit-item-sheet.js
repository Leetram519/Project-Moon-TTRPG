import { PMTTRPGItemSheet } from "./item-sheet.js";

export class PMTTRPGOutfitItemSheet extends PMTTRPGItemSheet {

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    PMTTRPGItemSheet.DEFAULT_OPTIONS,
    {
      classes: ["projectmoonttrpg", "sheet", "item", "outfit"],
      position: { width: 620, height: 800 },
    },
    { inplace: false }
  );

  static PARTS = {
    body: { template: "systems/projectmoonttrpg/templates/items/outfit-sheet.html", scrollable: [".sheet-body"] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.selects = context.selects || {};

    context.selects.outfitProperties = {
      none: "PMTTRPG.OutfitPropertyNone",
      armored: "PMTTRPG.OutfitPropertyArmored",
      swift: "PMTTRPG.OutfitPropertySwift",
      balanced: "PMTTRPG.OutfitPropertyBalanced"
    };
    context.selects.resistanceLevels = {
      fatal: "PMTTRPG.ResistanceFatal",
      weak: "PMTTRPG.ResistanceWeak",
      normal: "PMTTRPG.ResistanceNormal",
      endured: "PMTTRPG.ResistanceEndured",
      ineffective: "PMTTRPG.ResistanceIneffective",
      immune: "PMTTRPG.ResistanceImmune"
    };
    context.selects.damageTypes = {
      slash: "PMTTRPG.DamageTypeSlash",
      pierce: "PMTTRPG.DamageTypePierce",
      blunt: "PMTTRPG.DamageTypeBlunt"
    };

    return context;
  }
}
