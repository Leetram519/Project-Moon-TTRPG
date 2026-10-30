import { BaseHomebrew } from "./base-homebrew.js";

export class BoiHomebrew extends BaseHomebrew {
    static onInit() {}
    static onSetup() {}
    static onReady() {}

    static onEffectSheetContextPrepare(context) {
        context.selects.effectSubtypeWhitelist.augment.boi_shin = "PMTTRPG.BOI.Sheet.EffectSubtype.Shin";
        return context;
    }
}