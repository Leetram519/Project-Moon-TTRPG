import { PMTTRPGItemSheet } from "./item-sheet.js";

export class PMTTRPGWeaponItemSheet extends PMTTRPGItemSheet {

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    PMTTRPGItemSheet.DEFAULT_OPTIONS,
    {
      classes: ["projectmoonttrpg", "sheet", "item", "weapon"],
      position: { width: 620, height: 800 },
    },
    { inplace: false }
  );

  static PARTS = {
    body: { template: "systems/projectmoonttrpg/templates/items/weapon-sheet.html", scrollable: [".sheet-body"] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.selects = context.selects || {};

    context.selects.weaponTypes = {
      melee: "PMTTRPG.WeaponTypeMelee",
      ranged: "PMTTRPG.WeaponTypeRanged"
    };
    context.selects.damageTypes = {
      none: "PMTTRPG.DamageTypeNone",
      slash: "PMTTRPG.DamageTypeSlash",
      pierce: "PMTTRPG.DamageTypePierce",
      blunt: "PMTTRPG.DamageTypeBlunt"
    };
    context.selects.formPropertiesMelee = {
      small: "PMTTRPG.FormPropertySmall",
      medium: "PMTTRPG.FormPropertyMedium",
      long: "PMTTRPG.FormPropertyLong",
      sturdy: "PMTTRPG.FormPropertySturdy",
      hybrid: "PMTTRPG.FormPropertyHybridMelee",
      versatile: "PMTTRPG.FormPropertyVersatile",
      innate: "PMTTRPG.FormPropertyInnateMelee"
    };
    context.selects.formPropertiesRanged = {
      lowCaliber: "PMTTRPG.FormPropertyLowCaliber",
      highCaliber: "PMTTRPG.FormPropertyHighCaliber",
      reactive: "PMTTRPG.FormPropertyReactive",
      hybrid: "PMTTRPG.FormPropertyHybridRanged",
      recoil: "PMTTRPG.FormPropertyRecoil",
      innate: "PMTTRPG.FormPropertyInnateRanged"
    };
    context.selects.handPropertiesMelee = {
      off1h: "PMTTRPG.HandPropertyOff1H",
      off2h: "PMTTRPG.HandPropertyOff2H",
      def1h: "PMTTRPG.HandPropertyDef1H",
      def2h: "PMTTRPG.HandPropertyDef2H"
    };
    context.selects.handPropertiesRanged = {
      off1h: "PMTTRPG.HandPropertyOff1H",
      off2h: "PMTTRPG.HandPropertyOff2H"
    };

    return context;
  }
}
