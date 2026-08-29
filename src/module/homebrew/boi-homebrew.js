export class BoiHomebrew {
  static ID = "boi-homebrew";
  static PACK_ID = "projectmoonttrpg.boi-homebrew";
  static SETTING_KEY = "enableBoiHomebrew";

  static registerSetting() {
    game.settings.register("projectmoonttrpg", BoiHomebrew.SETTING_KEY, {
      name: "Enable Boi's Homebrew",
      hint: "Enables Boi's Statuses & Effects compendium.",
      scope: "world",
      config: false,       // hidden from default settings — shown in Homebrew Menu instead
      type: Boolean,
      default: false,
      onChange: (enabled) => BoiHomebrew.toggle(enabled),
    });
  }

  static isEnabled() {
    return game.settings.get("projectmoonttrpg", BoiHomebrew.SETTING_KEY);
  }

  static applyState() {
    BoiHomebrew.toggle(BoiHomebrew.isEnabled());
  }

  static toggle(enabled) {
    const pack = game.packs.get(BoiHomebrew.PACK_ID);
    if (!pack) {
      console.warn(`[BoiHomebrew] Pack not found: ${BoiHomebrew.PACK_ID}`);
      return;
    }

    const baseLabel = "Boi's Homebrew Effects List";

    pack.metadata.label = (enabled ? baseLabel : `[DISABLED] ${baseLabel}`)
    pack.configure({
      sort: enabled ? 0 : 999999,
    });

    ui.compendium?.render();

    console.log(`[BoiHomebrew] ${enabled ? "Enabled" : "Disabled"}`);
  }
}


