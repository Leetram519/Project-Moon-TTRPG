import { PMTTRPGItemSheet } from "./item-sheet.js";

export class PMTTRPGAugmentItemSheet extends PMTTRPGItemSheet {

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    PMTTRPGItemSheet.DEFAULT_OPTIONS,
    {
      classes: ["projectmoonttrpg", "sheet", "item", "augment"],
      position: { width: 620, height: 800 },
    },
    { inplace: false }
  );

  static PARTS = {
    body: { template: "systems/projectmoonttrpg/templates/items/augment-sheet.html", scrollable: [".sheet-body"] }
  };
}
