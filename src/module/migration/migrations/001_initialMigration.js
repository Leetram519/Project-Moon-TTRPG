import { MigrationBase } from "../base.js";

export class Schema001Migration extends MigrationBase {
  static version = 0.01;

  async updateActor(actor) {
    const updated = foundry.utils.deepClone(actor);

    updated.system ??= {};
    updated.system.attributes ??= {};
    updated.system.attributes.speed ??= { dice: "1d6", bonus: 0 };
    updated.system.attributes.attackModifier ??= { value: 0, min: 0 };
    updated.system.attributes.evadeModifier ??= { value: 0, min: 0 };
    updated.system.attributes.blockModifier ??= { value: 0, min: 0 };

    if (updated.system.details?.biography && typeof updated.system.details.biography === "object") {
      updated.system.details.biography ??= {};
      for (const key of ["occupation", "age", "height", "birthplace", "residence", "description", "background", "personality", "ahn", "relationships", "notes", "notableHistory"]) {
        if (updated.system.details.biography[key] === undefined) {
          updated.system.details.biography[key] = key === "ahn" ? 0 : "";
        }
      }
    }

    return updated;
  }

  async updateItem(item) {
    const updated = foundry.utils.deepClone(item);

    if (updated.type === "tool" && updated.system) {
      updated.system.inventoryTag ??= "tool";
      updated.system.quantity ??= 1;
      updated.system.usesMax ??= 3;
      updated.system.usesRemaining ??= updated.system.usesMax;
    }

    return updated;
  }
}