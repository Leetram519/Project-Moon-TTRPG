const LOG = "[BaseHomebrew]";

export class BaseHomebrew {
  static register() {
    const className = this.name;
    console.log(`${LOG} Registering ${className}`);

    Hooks.once("init", () => {
      this.onInit();
    });

    Hooks.once("setup", () => {
      this.onSetup();
    });

    Hooks.once("ready", () => {
      this.onReady();
    });

    Hooks.on("pmttrpg.sheet.effect.onContextPrepare", (context) => {
      this.onEffectSheetContextPrepare(context);
    });

    console.log(`${LOG} ${className} registered`);
  }

  static onInit() {}
  static onSetup() {}
  static onReady() {}
  static onEffectSheetContextPrepare(context) {}
}