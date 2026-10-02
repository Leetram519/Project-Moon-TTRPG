import { MigrationBase } from "../base.js";

export class Schema004SubtypesMigration extends MigrationBase {
  static version = 0.027;

  async updateItem(item) {
    const updated = foundry.utils.deepClone(item);

    console.log(updated);

    if (updated.system) {
      updated.system.homebrew ??= {};
      updated.system.homebrew.source ??= "world";
      updated.system.subtype ??= "regular";
      updated.system.subsubtype ??= "regular";

      if(updated.type === "effect") {
        updated.system.subtypeWhitelist = ["regular"];
        updated.system.subsubtypeWhitelist = ["regular"];

        if(updated.system.appliesTo === "weapon") {
          updated.system.subtypeWhitelist = ["melee", "ranged"];
        }
      }
    }

    return updated;
  }
}