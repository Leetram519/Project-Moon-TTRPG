import { MigrationBase } from "../base.js";

const OLD_ON_LOSE = `[On Lose]
require (self.flag.overcharge_enabled) == 1 then
  require (self.flag.charge_decay) == 0 then
    increase flag "charge_consumed" on self by (-changed.amount);
    require (self.flag.charge_consumed) >= 10 then
      gain ((self.flag.charge_consumed) // 10) Overcharge and
      reduce flag "charge_consumed" on self by (((self.flag.charge_consumed) // 10) * 10);`;

const NEW_ON_LOSE = `[On Lose]
require (self.flag.overcharge_enabled) == 1 then
  increase flag "charge_consumed" on self by (-changed.amount);
require (self.flag.charge_consumed) >= 10 then
  gain ((self.flag.charge_consumed) // 10) Overcharge and
  reduce flag "charge_consumed" on self by (((self.flag.charge_consumed) // 10) * 10);`;

const OLD_END_OF_ROUND = `[End of Round]
require (Charge) > 15 then
  set flag "charge_decay" on self to 1;
  lose (3 * (((Charge - 1) // 15))) Charge;
  clear flag "charge_decay" on self;`;

const NEW_END_OF_ROUND = `[End of Round]
require (Charge) > 15 then lose (3 * (((Charge - 1) // 15))) Charge;`;

// Match the old script text. If that text is gone, leave the script unchanged.
export function patchChargeRuleItem(item) {
  const script = item?.system?.easyEffects;
  if (typeof script !== "string" || !script) return item;

  const normalized = script.replace(/\r\n?/g, "\n");
  let next = normalized;

  if (next.includes("[Turn Start]") && next.includes("proc ChargeBarrierProc")) {
    next = next.replace("[Turn Start]", "[Start of Round]");
  }
  if (next.includes(OLD_ON_LOSE)) next = next.replace(OLD_ON_LOSE, NEW_ON_LOSE);
  if (next.includes(OLD_END_OF_ROUND)) next = next.replace(OLD_END_OF_ROUND, NEW_END_OF_ROUND);

  if (next === normalized) return item;
  item.system.easyEffects = next;
  return item;
}

export class Schema003ChargeRuleMigration extends MigrationBase {
  static version = 0.026;

  async updateActor(actor) {
    const updated = foundry.utils.deepClone(actor);
    for (const item of updated.items ?? []) patchChargeRuleItem(item);
    return updated;
  }

  async updateItem(item) {
    const updated = foundry.utils.deepClone(item);
    patchChargeRuleItem(updated);
    return updated;
  }
}
