import { MigrationBase } from "../base.js";
import {
  SYSTEM_ID,
  WORLD_SCRIPT_SETTING,
} from "../../easy-effects/actor-scripts.js";

const APPEND_WORLD_EASY_EFFECTS = `

# CR 3.x : Clear overcharge flags on self at combat end.
[On Combat End]
clear flag "charge_decision" on self;
clear flag "overcharge_enabled" on self;
clear flag "charge_consumed" on self;
clear flag "charge_decay" on self;
`;

export class Schema002WorldEasyEffectsMigration extends MigrationBase {
  static version = 0.022;

  async migrate() {
    const currentScript = String(game.settings?.get(SYSTEM_ID, WORLD_SCRIPT_SETTING) ?? "").replace(/\r\n?/g, "\n");
    const updatedScript = `${currentScript.trimEnd()}${APPEND_WORLD_EASY_EFFECTS}`.trimStart();

    await game.settings.set(SYSTEM_ID, WORLD_SCRIPT_SETTING, updatedScript);
    return true;
  }
}