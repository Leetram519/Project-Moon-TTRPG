import { getInitiativeFormulaParts } from "../targeting.js";
import { readTiebreak } from "./turn-order.js";

const TIEBREAK_PATH = "flags.projectmoonttrpg.turnTiebreak";

export function registerCombatantDocument() {
  const Base = CONFIG.Combatant.documentClass;

  class CombatantPMTTRPG extends Base {
    /**
     * Roll All / Roll NPCs use this.
     * @override
     */
    _getInitiativeFormula() {
      const actor = this.actor;
      if (!actor) return super._getInitiativeFormula();
      return getInitiativeFormulaParts(actor).formula;
    }

    /**
     * super only writes initiative. A new roll resets turnTiebreak to 0.
     * @override
     */
    async rollInitiative(formula) {
      const result = await super.rollInitiative(formula);
      if (readTiebreak(this) === 0) return result;
      return this.update({ [TIEBREAK_PATH]: 0 });
    }
  }

  CONFIG.Combatant.documentClass = CombatantPMTTRPG;
}
