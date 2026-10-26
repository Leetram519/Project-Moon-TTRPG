import { PMTTRPGItemSheet } from "./item-sheet.js";

export class PMTTRPGSkillItemSheet extends PMTTRPGItemSheet {

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    PMTTRPGItemSheet.DEFAULT_OPTIONS,
    {
      classes: ["projectmoonttrpg", "item-sheet-prototype", "skill"],
      position: { width: 620, height: 800 },
    },
    { inplace: false }
  );

  static PARTS = {
    body: { template: "systems/projectmoonttrpg/templates/items/skill-sheet.html", scrollable: [".sheet-body"] }
  };
}
