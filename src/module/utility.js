import { evaluateNumericExpression } from "./easy-effects/numeric-expr.js";
import { resolveTokenDocument } from "./acting-user.js";

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
   * Reads prepared `system.range`. `0` is a valid range.
   * Missing or non-numeric values fall back to 1.
   */
  static getWeaponRangeSquares(weapon) {
    const raw = weapon?.system?.range;
    if (raw == null || raw === "") return 1;
    const range = Number(raw);
    return Number.isFinite(range) ? range : 1;
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

  /**
   * Compares grid distance to a square count.
   * Uses the weapon's prepared range when `weapon` is passed, otherwise `weaponRange`.
   * Missing tokens or a missing grid return `inRange` true.
   */
  static getWeaponRangeCheck(fromTokenId, toTokenId, { weapon = null, weaponRange = null } = {}) {
    const from = fromTokenId ? canvas.tokens.get(fromTokenId) : null;
    const to = toTokenId ? canvas.tokens.get(toTokenId) : null;
    const distance = PMTTRPGUtility.tokenDistanceSquares(from, to);
    const range = weapon != null
      ? PMTTRPGUtility.getWeaponRangeSquares(weapon)
      : (Number.isFinite(Number(weaponRange)) ? Number(weaponRange) : 1);
    if (distance == null) return { inRange: true, distance: null, range };
    return { inRange: distance <= range, distance, range };
  }

  static isTargetInWeaponRange(fromTokenId, toTokenId, options = {}) {
    return PMTTRPGUtility.getWeaponRangeCheck(fromTokenId, toTokenId, options).inRange;
  }

  /**
 * Reliably retrieves the Token and Actor from a Combatant
 *
 * @param {Combatant} combatant - The combatant document
 * @returns {{ token: TokenDocument|null, actor: Actor|null }}
 */
  static resolveTokenAndActor(combatant) {
    if (!combatant) return { token: null, actor: null };
    const tokenId = combatant.tokenId ?? combatant.token?.id ?? null;
    const token = combatant.token ?? resolveTokenDocument(tokenId) ?? null;
    if (token?.actor) return { token, actor: token.actor };
    if (tokenId) {
      const actor = combatant.actor?.isToken ? combatant.actor : null;
      return { token: token ?? actor?.token ?? null, actor };
    }
    return {
      token: null,
      actor: combatant.actor ?? game.actors.get(combatant.actorId) ?? null,
    };
  }

  static get nightmode() {
    return document.querySelector('body').classList.contains('theme-dark');
  }
}

const DSN_TIMEOUT_MS = 8_000;

function isDiceSoNiceBusy(dice3d) {
  if (!dice3d) return false;
  if (dice3d.box?.rolling) return true;
  if (dice3d.queue?.length) return true;
  const acc = dice3d.nextAnimation;
  if (!acc) return false;
  if (acc._isProcessing) return true;
  if (acc._timeoutId) return true;
  return (acc._items?.length ?? 0) > 0;
}

function waitForDiceSoNiceIdle(dice3d, timeoutMs) {
  const budget = Math.max(0, Number(timeoutMs) || 0);
  if (!dice3d || budget <= 0 || !isDiceSoNiceBusy(dice3d)) return Promise.resolve();

  const deadline = Date.now() + budget;
  return new Promise((resolve) => {
    const tick = () => {
      if (!isDiceSoNiceBusy(dice3d) || Date.now() >= deadline) {
        resolve();
        return;
      }
      if (typeof globalThis.requestAnimationFrame === "function") {
        globalThis.requestAnimationFrame(tick);
      } else {
        setTimeout(tick, 16);
      }
    };
    tick();
  });
}

export async function showDiceForRoll(roll, { speaker, timeoutMs = DSN_TIMEOUT_MS } = {}) {
  const dice3d = globalThis.game?.dice3d;
  if (typeof dice3d?.showForRoll !== "function" || !roll) return;

  const started = Date.now();
  let timer;
  try {
    await Promise.race([
      (async () => {
        await Promise.resolve(
          dice3d.showForRoll(
            roll,
            globalThis.game.user,
            true,
            null,
            false,
            null,
            speaker ?? undefined,
          ),
        ).catch((err) => {
          console.warn("[PMTTRPG] Dice So Nice showForRoll failed; continuing.", err);
        });
        await waitForDiceSoNiceIdle(dice3d, timeoutMs - (Date.now() - started));
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Dice So Nice timed out")), timeoutMs);
      }),
    ]);
  } catch (err) {
    console.warn("[PMTTRPG] Dice So Nice showForRoll failed; continuing.", err);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
