import { PMTTRPGItemSheet } from "./item-sheet.js";

export class PMTTRPGAmmunitionItemSheet extends PMTTRPGItemSheet {

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    PMTTRPGItemSheet.DEFAULT_OPTIONS,
    {
      classes: ["projectmoonttrpg", "sheet", "item", "ammunition"],
      position: { width: 620, height: 800 },
    },
    { inplace: false }
  );

  static PARTS = {
    body: { template: "systems/projectmoonttrpg/templates/items/ammunition-sheet.html", scrollable: [".sheet-body"] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.selects = context.selects || {};

    context.selects.ammoTypes = {
      standard: "PMTTRPG.AmmoStandard",
      specialized: "PMTTRPG.AmmoSpecialized"
    };
    context.selects.damageTypes = {
      slash: "PMTTRPG.DamageTypeSlash",
      pierce: "PMTTRPG.DamageTypePierce",
      blunt: "PMTTRPG.DamageTypeBlunt"
    };
    context.selects.inventoryPools = {
      tool: "PMTTRPG.InventoryPoolTool",
      stock: "PMTTRPG.InventoryPoolStock"
    };

    return context;
  }
}
