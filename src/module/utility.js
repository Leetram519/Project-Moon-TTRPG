import { evaluateNumericExpression } from "./easy-effects/numeric-expr.js";

export class PMTTRPGUtility {
  static isEmpty(arg) {
    return [null, false, undefined, 0, ''].includes(arg);
  }

  static getRollFormula(defaultFormula = '2d6') {
    // TODO: Add support for adv/dis/ongoing/forward.
    return defaultFormula;
  }

  static getAbilityMod(abilityScore, force=false) {
    return abilityScore;
  }

  static getAbilityScore(abilityMod, force=false) {
    return abilityMod;
  }

  static expandEffectText(text, stack = 1) {
    if (!text) return '';

    const stackValue = Number(stack);
    if (!Number.isFinite(stackValue)) {
      return `${text}`;
    }

    return `${text}`.replace(/\[([^\]]+)\]/g, (match, expression) => {
      const value = evaluateNumericExpression(expression, { effectN: stackValue });
      if (value == null) return match;
      return Number.isInteger(value) ? `${value}` : `${value}`;
    });
  }

  static formatEffectProcLabel(effect = {}) {
    const procOn = `${effect?.procOn ?? 'alwaysActive'}`;
    const procResult = `${effect?.procResult ?? 'none'}`;
    const procStat = `${effect?.procStat ?? 'any'}`;
    const procCondition = `${effect?.procCondition ?? ''}`.trim();

    const resultLabel = procResult === 'lose'
      ? game.i18n.localize('PMTTRPG.EffectProcResultLose')
      : procResult === 'win'
        ? game.i18n.localize('PMTTRPG.EffectProcResultWin')
        : '';
    const procChoice = `${effect?.procChoice ?? 'none'}`;
    const choiceLabel = procChoice === 'defense'
      ? game.i18n.localize('PMTTRPG.EffectProcChoiceDefense')
      : procChoice === 'attack'
        ? game.i18n.localize('PMTTRPG.EffectProcChoiceAttack')
        : '';

    const clashResultHeading = resultLabel ? `Clash ${resultLabel}` : game.i18n.localize('PMTTRPG.EffectProcOnClash');
    const labels = {
      alwaysActive: game.i18n.localize('PMTTRPG.EffectProcAlwaysActive'),
      onCondition: procCondition ? `${game.i18n.localize('PMTTRPG.EffectProcOnCondition')} ${procCondition}` : game.i18n.localize('PMTTRPG.EffectProcOnCondition'),
      onClash: clashResultHeading,
      onClashResult: clashResultHeading,
      onEitherClashResult: resultLabel ? `${game.i18n.localize('PMTTRPG.EffectProcOnEitherClashResult').replace('[Result]', resultLabel)}` : game.i18n.localize('PMTTRPG.EffectProcOnEitherClashResult').replace(' [Result]', ''),
      onUse: game.i18n.localize('PMTTRPG.EffectProcOnUse'),
      onBurst: game.i18n.localize('PMTTRPG.EffectProcOnBurst'),
      onCritical: game.i18n.localize('PMTTRPG.EffectProcOnCritical'),
      onDevastating: game.i18n.localize('PMTTRPG.EffectProcOnDevastating'),
      onAction: game.i18n.localize('PMTTRPG.EffectProcOnAction')
    };

    let heading = labels[procOn] ?? procOn;
    if (choiceLabel) heading = `${heading} with ${choiceLabel}`;

    if (['onUse', 'onAction'].includes(procOn) && procStat !== 'any' && procStat !== 'offensive' && procStat !== 'defensive') {
      const statLabel = effect?.procStat === 'for' ? game.i18n.localize('PMTTRPG.AbilityFor') : effect?.procStat === 'pru' ? game.i18n.localize('PMTTRPG.AbilityPru') : effect?.procStat === 'jus' ? game.i18n.localize('PMTTRPG.AbilityJus') : effect?.procStat === 'cha' ? game.i18n.localize('PMTTRPG.AbilityCha') : effect?.procStat === 'ins' ? game.i18n.localize('PMTTRPG.AbilityIns') : effect?.procStat === 'tem' ? game.i18n.localize('PMTTRPG.AbilityTem') : procStat;
      heading = `${heading}, ${statLabel}`;
    }

    return heading;
  }

  static getProgressCircle({ current = 100, max = 100, radius = 16, _sector = 'full', _strokeWidth = 4, _color = 'red' }) {
    let circumference = radius * 2 * Math.PI;
    let percent = current < max ? current / max : 1;
    let percentNumber = percent * 100;
    let offset = circumference - (percent * circumference);
    let strokeWidth = _strokeWidth;
    let diameter = (radius * 2) + strokeWidth;
    let colorClass = Math.round((percent * 100) / 10) * 10;
    let color = _color;

    return {
      radius: radius,
      diameter: diameter,
      strokeWidth: strokeWidth,
      circumference: circumference,
      offset: offset,
      position: diameter / 2,
      color: color,
      class: colorClass,
    };
  }

  static async loadCompendia(slug) {

    const compendium = [];

    const pack_id = `projectmoonttrpg.${slug}`;
    const pack = game.packs.get(pack_id);
    compendium.push(...(pack ? await pack.getDocuments() : []));

    return compendium

  }

  static isRangedWeapon(weapon) {
    return weapon?.system?.weaponType === "ranged";
  }

  /**
   * Effective weapon range in squares.
   * Melee 1, Long melee 2, Ranged 10.
   * @param {Item|null} weapon
   * @returns {number}
   */
  static getWeaponRangeSquares(weapon) {
    return weapon?.system?.range || 1;
  }

  /**
   * Grid distance in squares between two tokens.
   * @param {Token|null} tokenA
   * @param {Token|null} tokenB
   * @returns {number|null}
   */
  static tokenDistanceSquares(tokenA, tokenB) {
    if (!tokenA || !tokenB || !canvas?.grid) return null;
  
    const a = canvas.grid.getOffset(tokenA.center);
    const b = canvas.grid.getOffset(tokenB.center);
    if (!a || !b) return null;
  
    return Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j));
  }
  
  static isTargetInWeaponRange(fromTokenId, toTokenId, { weapon = null, weaponRange = 1 }) {    
    const from = fromTokenId ? canvas.tokens.get(fromTokenId) : null;
    const to   = toTokenId ? canvas.tokens.get(toTokenId) : null;
    const distance = PMTTRPGUtility.tokenDistanceSquares(from, to);
    if (distance == null) return true;
    if(weapon) return distance <= PMTTRPGUtility.getWeaponRangeSquares(weapon);
    else return distance <= weaponRange;
  }

  /**
 * Reliably retrieves the Token and Actor from a Combatant
 *
 * @param {Combatant} combatant - The combatant document
 * @returns {{ token: TokenDocument|null, actor: Actor|null }}
 */
  static resolveTokenAndActor(combatant) {
    const token = combatant.token ?? canvas.scene?.tokens.get(combatant.tokenId) ?? null;

    if (!token) {
      const fallbackActor = game.actors.get(combatant.actorId) ?? null;
      return { token: null, actor: fallbackActor };
    }

    const actor = token.actor ?? null;

    return { token, actor };
  }

  static get nightmode() {
    return document.querySelector('body').classList.contains('theme-dark');
  }
}
