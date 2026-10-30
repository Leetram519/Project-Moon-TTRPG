import { PMTTRPGItemSheet } from "./item-sheet.js";

export class PMTTRPGToolItemSheet extends PMTTRPGItemSheet {

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    PMTTRPGItemSheet.DEFAULT_OPTIONS,
    {
      classes: ["projectmoonttrpg", "sheet", "item", "item-tool"],
      position: { width: 620, height: 800 },
    },
    { inplace: false }
  );

  static PARTS = {
    body: { template: "systems/projectmoonttrpg/templates/items/tool-sheet.html", scrollable: [".sheet-body"] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.selects = context.selects || {};

    context.selects.toolForms = {
      none: "PMTTRPG.ToolFormNone",
      consumable: "PMTTRPG.ToolFormConsumable",
      reusable: "PMTTRPG.ToolFormReusable"
    };
    context.selects.toolHands = {
      handless: "PMTTRPG.ToolHandHandless",
      oneHanded: "PMTTRPG.ToolHandOneHanded",
      twoHanded: "PMTTRPG.ToolHandTwoHanded"
    };
    context.selects.toolKinds = {
      standalone: "PMTTRPG.ToolKindStandalone",
      applied: "PMTTRPG.ToolKindApplied",
      market: "PMTTRPG.ToolKindMarket"
    };
    context.selects.toolApplyTo = {
      "": "PMTTRPG.ToolApplyToNone",
      weapon: "PMTTRPG.ToolApplyToWeapon",
      outfit: "PMTTRPG.ToolApplyToOutfit"
    };
    context.selects.damageTypes = {
      slash: "PMTTRPG.DamageTypeSlash",
      pierce: "PMTTRPG.DamageTypePierce",
      blunt: "PMTTRPG.DamageTypeBlunt"
    };
    context.selects.toolInventoryTags = {
      tool: "PMTTRPG.ToolInventoryTool",
      narrative: "PMTTRPG.ToolInventoryNarrative",
      stock: "PMTTRPG.ToolInventoryStock"
    };
    context.selects.toolPackingTypes = {
      none: "PMTTRPG.ToolPackingNone",
      ammunition: "PMTTRPG.ToolPackingAmmunition"
    };
    context.selects.abilities = {
      for: "PMTTRPG.AbilityFor",
      pru: "PMTTRPG.AbilityPru",
      jus: "PMTTRPG.AbilityJus",
      cha: "PMTTRPG.AbilityCha",
      ins: "PMTTRPG.AbilityIns",
      tem: "PMTTRPG.AbilityTem"
    };

    context.isReusable = context.system?.form === "reusable";
    context.isFormNone = context.system?.form === "none";
    context.isStandalone = context.system?.toolKind === "standalone";
    context.isApplied = context.system?.toolKind === "applied";
    context.isPackingContainer = (context.system?.packing?.accepts ?? "none") !== "none";

    return context;
  }
}
