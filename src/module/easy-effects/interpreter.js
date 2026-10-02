import {
  applyDiceFormulaMod,
  applyResourceMod,
  applyResourceOverride,
  applyRuntimeResource,
  emptyAlwaysActiveMods,
  getAmountFields,
  getMaxFields,
  getPowerFields,
  getRegenField,
  isRuntimeResource,
  resolvePathShorthand,
} from "./nouns.js";
import { expandSimpleDiceByMultiplier } from "./dice-formula.js";
import { applyPendingDamageDelta, matchesClashStanceFilter, matchesDamageFilter, matchesDepletedFilter, matchesHealFilter, matchesRollFilter, shouldExecuteBurstBlock, createPendingRoll } from "./filters.js";
import {
  flushEEEmission,
  getEventFlag,
  setEventFlag,
  clearEventFlag,
  getPersistentFlag,
  hasPersistentFlag,
  stagePersistentFlag,
  stageClearPersistentFlag,
  isValidFlagValue,
} from "./ee-meta.js";
import { mergeResistanceOverrideMaps } from "./resistances.js";
import { promptChoiceDialog } from "./choice-dialog.js";
import { runAsOwnerOrGM, runEEMetaPatch } from "./gm-route.js";
import { parseAccessorExpression } from "./parser.js";
import { applyMathOp, applyMathCall } from "./numeric-expr.js";
import { clampPoolValue } from "../pool-clamp.js";
import { resolveBurstBurster, sameActor, selectRelativeActors } from "./burst-roles.js";
import { showDiceForRoll } from "../utility.js";

// Me and the boi's hate infinite recursion
const DIALOG_NEST_MAX_DEPTH = 8;
// These verbs mutate Foundry docs. Flush first or nested EE still sees the overlay.
const EE_MUTATION_BARRIER_VERBS = new Set([
  "add", "remove", "deal", "heal", "set", "clear", "regen", "burst", "proc", "pause", "roll",
]);
const FLAG_ACTOR_HOSTS = new Set([
  "self", "target", "ally", "attacker", "originator", "burster", "burstee", "healer",
]);

function skipNestedApply(context) {
  return !!(context?.damage || context?.heal);
}

function rejectIfDamageReadOnly(context, verb) {
  if (context?.damageMutable !== false) return false;
  console.warn(
    `[EasyEffects] \`${verb} damage\` is not allowed during [On Dealing Damage] because the damage transaction has already been applied.`
  );
  return true;
}

async function flushContextEmission(context) {
  await flushEEEmission(context?._eeEmission);
}

function lookupVariable(context, name) {
  const vars = context?._eeVars;
  if (!(vars instanceof Map) || !vars.has(name)) {
    throw new InterpretError(`Undefined variable '$${name}'`);
  }
  return vars.get(name);
}

function declareVariable(context, name, value) {
  if (!(context._eeVars instanceof Map)) context._eeVars = new Map();
  if (context._eeVars.has(name)) {
    throw new InterpretError(`Variable '$${name}' is already declared`);
  }
  context._eeVars.set(name, value);
}

function readAmountSnapshot(context, node) {
  if (!node?.snapshot) return undefined;
  const cache = context?._amountSnapshots;
  if (!(cache instanceof WeakMap) || !cache.has(node)) return undefined;
  return cache.get(node);
}

function writeAmountSnapshot(context, node, value) {
  if (!node?.snapshot) return;
  if (!(context._amountSnapshots instanceof WeakMap)) context._amountSnapshots = new WeakMap();
  context._amountSnapshots.set(node, value);
}

async function evaluateExpr(node, context) {
  switch (node.type) {
    case "Num":   return node.value;
    case "Dice":
      return evaluateDiceFormula(node.formula, context);
    case "Path":  return resolvePath(node.segments, context);
    case "Variable": return lookupVariable(context, node.name);
    case "Percent": return await resolvePercentExpr(node.expr, context, evaluateExpr);
    case "EffectN":
      return Math.max(0, Number(context.effectN) || 0);
    case "BinOp": {
      const [left, right] = await Promise.all([
        evaluateExpr(node.left, context),
        evaluateExpr(node.right, context),
      ]);
      return applyMathOp(node.op, left, right);
    }
    case "Call": {
      const args = await Promise.all(node.args.map((arg) => evaluateExpr(arg, context)));
      return applyMathCall(node.name, args);
    }
    default:
      console.warn(`[EasyEffects] Unknown expr node type '${node.type}'`);
      return 0;
  }
}

/** Synchronous version — used for [Always Active] (no dice allowed). */
function evaluateExprSync(node, context) {
  switch (node.type) {
    case "Num":  return node.value;
    case "Dice":
      console.warn("[EasyEffects] Dice expressions are not allowed in [Always Active]; returning 0.");
      return 0;
    case "Path": return resolvePath(node.segments, context);
    case "Variable": return lookupVariable(context, node.name);
    case "Percent": return resolvePercentExpr(node.expr, context, evaluateExprSync);
    case "EffectN":
      return Math.max(0, Number(context.effectN) || 0);
    case "BinOp":
      return applyMathOp(
        node.op,
        evaluateExprSync(node.left, context),
        evaluateExprSync(node.right, context)
      );
    case "Call":
      return applyMathCall(
        node.name,
        node.args.map((arg) => evaluateExprSync(arg, context))
      );
    default: return 0;
  }
}

const POOL_PERCENT_KEYS = new Set(["hp", "st", "sp", "light"]);

function resolvePercentExpr(inner, context, evalFn) {
  if (inner?.type === "Path") {
    const pct = resolvePathPoolPercent(inner.segments, context);
    if (pct !== null) return pct;
  }
  const value = evalFn(inner, context);
  if (value && typeof value.then === "function") {
    return value.then((n) => Number(n) || 0);
  }
  return Number(value) || 0;
}

/** HP/ST/SP/Light as 0-100. Null if this isn't a pool percent path. */
function resolvePathPoolPercent(segments, context) {
  if (!Array.isArray(segments) || segments.length < 2) return null;
  const root = segments[0];
  const actor = resolveContextActor(root, context);
  if (!actor) return null;

  let poolKey = null;
  if (segments.length === 2 && POOL_PERCENT_KEYS.has(String(segments[1]).toLowerCase())) {
    poolKey = String(segments[1]).toLowerCase();
  } else if (
    segments.length === 3
    && segments[1] === "attr"
    && POOL_PERCENT_KEYS.has(String(segments[2]).toLowerCase())
  ) {
    poolKey = String(segments[2]).toLowerCase();
  }
  if (!poolKey) return null;

  const attr = actor.system?.attributes?.[poolKey];
  const value = Number(attr?.value) || 0;
  const max = Number(attr?.max) || 0;
  if (max <= 0) return 0;
  return (value / max) * 100;
}

const ITEM_PATH_FIELDS = new Set(["rank", "lightCost"]);

export function ensureRollsBag(context) {
  if (!context.rolls || typeof context.rolls !== "object") {
    context.rolls = { last: null, named: {} };
  } else {
    if (!context.rolls.named || typeof context.rolls.named !== "object") context.rolls.named = {};
    if (!("last" in context.rolls)) context.rolls.last = null;
  }
  return context.rolls;
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Statement `on roll` / completed bind. Doesn't trigger [On Roll]. */
export async function applyRollToContext(formula, context, bind = null) {
  const bag = ensureRollsBag(context);
  const total = await evaluateDiceFormula(String(formula), context);
  bag.last = total;
  if (bind) bag.named[bind] = total;
  return total;
}

/**
 * Named `roll`. Flushes the parent overlay, then [On Roll] runs in its own emission.
 * We keep the previous pendingRoll and put it back when this returns.
 */
export async function commitNamedRoll(context, {
  formula = null,
  bind = null,
  tag = null,
  total,
} = {}) {
  const bag = ensureRollsBag(context);
  const rolled = finiteNumber(total, 0);
  const previous = context.pendingRoll;
  const pending = createPendingRoll({
    rolledValue: rolled,
    value: rolled,
    bind: bind ?? null,
    tag: tag ?? null,
    formula: formula ?? null,
    producerActor: context.self ?? null,
    producerItem: context.item ?? null,
  });
  context.pendingRoll = pending;
  try {
    await flushContextEmission(context);
    const emit = typeof context._emitPendingRoll === "function"
      ? context._emitPendingRoll
      : (await import("./registry.js")).emitRoll;
    await emit(context);
    const effective = finiteNumber(pending.value, rolled);
    bag.last = effective;
    if (bind) bag.named[bind] = effective;
  } finally {
    context.pendingRoll = previous;
  }
  return bag.last;
}

function applyPendingRollDelta(context, delta, verb) {
  const pending = context.pendingRoll;
  if (!pending) {
    console.warn(`[EasyEffects] '${verb} roll' used outside [On Roll]; ignored.`);
    return;
  }
  pending.value = finiteNumber(pending.value) + finiteNumber(delta);
}

export async function evaluateDiceFormula(formula, context = null) {
  const raw = String(formula ?? "").trim();
  if (!raw || raw === "0") return 0;

  const roll = new Roll(raw);
  await roll.evaluate({ allowInteractive: false });

  const speaker = (typeof ChatMessage !== "undefined" && context?.self)
    ? ChatMessage.getSpeaker?.({ actor: context.self })
    : undefined;
  await showDiceForRoll(roll, { speaker });

  return Number(roll.total) || 0;
}

function resolveActorFromUuid(uuid) {
  const id = String(uuid ?? "").trim();
  if (!id) return null;
  try {
    const doc = globalThis.fromUuidSync?.(id) ?? null;
    if (!doc) return null;
    if (doc.documentName === "Actor") return doc;
    if (doc.actor) return doc.actor;
  } catch (_) { /* ignore */ }
  return null;
}

function resolveOriginator(context) {
  if (context?.originator) return context.originator;

  const item = context?.item;
  const uuid = item?.type === "status"
    ? String(item.system?.origin ?? "").trim()
    : "";
  if (!uuid) {
    console.warn("[EasyEffects] 'originator' used but the host status has no origin.");
    return null;
  }

  const actor = resolveActorFromUuid(uuid);
  if (!actor) {
    console.warn(`[EasyEffects] originator UUID '${uuid}' did not resolve to an Actor.`);
    return null;
  }
  context.originator = actor;
  return actor;
}

function resolveContextActor(name, context) {
  if (!name) return null;
  if (name === "attacker") return context.attacker ?? null;
  if (name === "healer") return context.healer ?? null;
  if (name === "originator") return resolveOriginator(context);
  return context[name] ?? null;
}

function resolveEffectSourceLabel(context) {
  const name = String(context?.item?.name ?? "").trim();
  if (name) return name;
  // Actor scripts have no host item but still need a source label.
  if (context && context.item == null && context.self) {
    return globalThis.game?.i18n?.localize?.("PMTTRPG.DamageTaken.Breakdown.WorldScript")
      || "World EasyEffects";
  }
  return null;
}

function resolveEncounterCombat(context) {
  return context?.combat ?? globalThis.game?.combat ?? null;
}

function resolveCombatRound(context) {
  const combat = resolveEncounterCombat(context);
  if (!combat) return 0;
  return Math.max(0, Number(combat.round) || 0);
}

function flagKeyFromSegments(segments, flagIndex) {
  if (!Array.isArray(segments) || segments.length <= flagIndex + 1) return "";
  return segments.slice(flagIndex + 1).join(".");
}

function resolveFlagHost(host, context) {
  if (host === "event") return { kind: "event" };
  if (host === "item") return { kind: "doc", doc: context?.item ?? null, label: "item" };
  if (host === "combat") {
    return { kind: "doc", doc: resolveEncounterCombat(context), label: "combat" };
  }
  if (FLAG_ACTOR_HOSTS.has(host)) {
    return { kind: "doc", doc: resolveContextActor(host, context), label: host };
  }
  return null;
}

function readFlagValue(host, key, context) {
  const resolved = resolveFlagHost(host, context);
  if (!resolved) return undefined;
  if (resolved.kind === "event") {
    const emission = context?._eeEmission;
    if (!emission?.event?.flags) return undefined;
    return getEventFlag(emission, key);
  }
  if (!resolved.doc) return undefined;
  return getPersistentFlag(context?._eeEmission ?? null, resolved.doc, key);
}

// Missing flags warn and become 0 here. The getters themselves return undefined.
function resolveFlagPathValue(host, key, context) {
  if (!key) {
    console.warn(`[EasyEffects] Missing flag key on ${host}`);
    return 0;
  }
  if (host === "event" && !context?._eeEmission?.event?.flags) {
    console.warn("[EasyEffects] 'event.flag' is not available in this trigger.");
    return 0;
  }
  const value = readFlagValue(host, key, context);
  if (value !== undefined) return value;
  console.warn(`[EasyEffects] Missing flag '${key}' on ${host}`);
  return 0;
}

async function resolveFlagValueNode(amountNode, context) {
  if (!amountNode) return undefined;
  switch (amountNode.type) {
    case "NUMBER": return amountNode.value;
    case "STRING": return amountNode.value;
    case "BOOLEAN": return amountNode.value;
    case "EFFECT_N": {
      const n = Number(context.effectN);
      return Number.isFinite(n) ? n : 0;
    }
    case "ACCESSOR": return evaluateExpr(amountNode.expr, context);
    default:
      console.warn(`[EasyEffects] Unknown flag value type '${amountNode.type}'`);
      return undefined;
  }
}

async function writeFlagValue(resolved, context, key, value) {
  if (resolved.kind === "event") {
    const emission = context?._eeEmission;
    if (!emission?.event?.flags) {
      console.warn("[EasyEffects] 'event.flag' is not available in this trigger.");
      return;
    }
    setEventFlag(emission, key, value);
    return;
  }
  if (!resolved.doc) {
    console.warn(`[EasyEffects] Flag host '${resolved.label}' is not in context.`);
    return;
  }
  const emission = context?._eeEmission;
  if (emission) stagePersistentFlag(emission, resolved.doc, key, value);
  else await runEEMetaPatch(resolved.doc, { set: { [key]: value } });
}

// set, clear, increase, and reduce all share this write path.
// Two clients can still race so this is not an atomic increment.
async function applyFlagAction(action, context, mode) {
  const key = action.argument;
  const host = action.target;
  if (!key) {
    console.warn("[EasyEffects] Flag action missing key");
    return;
  }
  const resolved = resolveFlagHost(host, context);
  if (!resolved) {
    console.warn(`[EasyEffects] Unknown flag host '${host}'`);
    return;
  }

  if (mode === "increase" || mode === "reduce") {
    const delta = await resolveFlagValueNode(action.amount ?? { type: "NUMBER", value: 1 }, context);
    if (typeof delta !== "number" || !Number.isFinite(delta)) {
      console.warn(`[EasyEffects] Ignored non-numeric ${mode} for flag '${key}'`);
      return;
    }
    let current;
    if (resolved.kind === "event") {
      const emission = context?._eeEmission;
      if (!emission?.event?.flags) {
        console.warn("[EasyEffects] 'event.flag' is not available in this trigger.");
        return;
      }
      current = getEventFlag(emission, key);
    } else {
      if (!resolved.doc) {
        console.warn(`[EasyEffects] Flag host '${resolved.label}' is not in context.`);
        return;
      }
      current = getPersistentFlag(context?._eeEmission ?? null, resolved.doc, key);
    }
    if (current !== undefined && typeof current !== "number") {
      console.warn(`[EasyEffects] Cannot ${mode} non-numeric flag '${key}'`);
      return;
    }
    const value = (current === undefined ? 0 : current) + (mode === "reduce" ? -delta : delta);
    if (!isValidFlagValue(value)) {
      console.warn(`[EasyEffects] Ignored invalid flag value for '${key}'`);
      return;
    }
    await writeFlagValue(resolved, context, key, value);
    return;
  }

  if (mode === "set") {
    const value = await resolveFlagValueNode(action.amount, context);
    if (!isValidFlagValue(value)) {
      console.warn(`[EasyEffects] Ignored invalid flag value for '${key}'`);
      return;
    }
    await writeFlagValue(resolved, context, key, value);
    return;
  }

  if (resolved.kind === "event") {
    const emission = context?._eeEmission;
    if (!emission?.event?.flags) {
      console.warn("[EasyEffects] 'event.flag' is not available in this trigger.");
      return;
    }
    clearEventFlag(emission, key);
    return;
  }
  if (!resolved.doc) {
    console.warn(`[EasyEffects] Flag host '${resolved.label}' is not in context.`);
    return;
  }
  const emission = context?._eeEmission;
  if (emission) stageClearPersistentFlag(emission, resolved.doc, key);
  else await runEEMetaPatch(resolved.doc, { unset: [key] });
}

function resolvePath(segments, context) {
  const root = segments[0];

  if (root === "round") {
    const n = resolveCombatRound(context);
    if (segments.length === 1) return n;
    const key = segments[1];
    if (key === "number" || key === "value") return n;
    console.warn(`[EasyEffects] Unknown round path 'round.${key}'`);
    return 0;
  }

  if (root === "combat") {
    if (segments.length === 1) return resolveCombatRound(context);
    const key = segments[1];
    if (key === "round") return resolveCombatRound(context);
    if (key === "flag") return resolveFlagPathValue("combat", flagKeyFromSegments(segments, 1), context);
    console.warn(`[EasyEffects] Unknown combat path 'combat.${key}'`);
    return 0;
  }

  if (root === "event") {
    if (segments[1] !== "flag") {
      console.warn(`[EasyEffects] Unknown event path '${segments.join(".")}'`);
      return 0;
    }
    return resolveFlagPathValue("event", flagKeyFromSegments(segments, 1), context);
  }

  if (root === "pendingRoll") {
    const pending = context.pendingRoll;
    if (!pending) {
      console.warn("[EasyEffects] 'pendingRoll' used outside [On Roll].");
      return 0;
    }
    if (segments.length === 1) return finiteNumber(pending.value);
    const key = segments[1];
    if (key === "value") return finiteNumber(pending.value);
    if (key === "rolledValue") return finiteNumber(pending.rolledValue);
    console.warn(`[EasyEffects] Unknown pendingRoll path 'pendingRoll.${key}'`);
    return 0;
  }

  if (root === "roll") {
    const bag = context.rolls;
    if (!bag) {
      console.warn("[EasyEffects] 'roll' used before any 'roll' / 'on roll' in this trigger.");
      return 0;
    }
    if (segments.length === 1) return finiteNumber(bag.last);
    const key = segments[1];
    if (key in (bag.named ?? {})) return finiteNumber(bag.named[key]);
    console.warn(`[EasyEffects] Unknown named roll 'roll.${key}'`);
    return 0;
  }

  if (segments.length === 1) {
    const bag = context.rolls;
    if (bag?.named && Object.prototype.hasOwnProperty.call(bag.named, root)) {
      return finiteNumber(bag.named[root]);
    }
    const procBinds = context.proc?.binds;
    if (procBinds && Object.prototype.hasOwnProperty.call(procBinds, root)) {
      return procBinds[root];
    }
    if (root === "self" || root === "target" || root === "ally"
      || root === "attacker" || root === "originator"
      || root === "burster" || root === "burstee" || root === "healer") {
      const actorRoot = resolveContextActor(root, context);
      if (!actorRoot) {
        console.warn(`[EasyEffects] Path root '${root}' not in context.`);
        return "";
      }
      return actorRoot.name ?? "";
    }
    const self = context.self;
    if (self?.getStatusStacks) return self.getStatusStacks(root);
    if (self) {
      console.warn(`[EasyEffects] Path '${root}' looks like a status but self has no getStatusStacks.`);
      return 0;
    }
    console.warn(`[EasyEffects] Path root '${root}' not in context.`);
    return 0;
  }

  if (root === "clash") {
    const clash = context.clash;
    if (!clash) { console.warn("[EasyEffects] 'clash.*' used outside clash context."); return 0; }
    const key = segments[1];
    if (key === "margin") return clash.margin ?? 0;
    if (key === "attackerRoll") return clash.attackerRoll ?? 0;
    if (key === "defenderRoll") return clash.defenderRoll ?? 0;

    const sideBag = _clashBonusBagForSelf(context);
    const map = {
      // bonus reads (for conditions)
      attackPower: sideBag.attackPower ?? 0,
      blockPower:  sideBag.blockPower  ?? 0,
      evadePower:  sideBag.evadePower  ?? 0,
      damagePower: sideBag.damagePower ?? 0,
      attackMax:   sideBag.attackMax   ?? 0,
      blockMax:    sideBag.blockMax    ?? 0,
      evadeMax:    sideBag.evadeMax    ?? 0,
      damageMax:   sideBag.damageMax   ?? 0,
      attackAmount: sideBag.attackAmount ?? 0,
      blockAmount:  sideBag.blockAmount  ?? 0,
      evadeAmount:  sideBag.evadeAmount  ?? 0,
      damageAmount: sideBag.damageAmount ?? 0,
      rangeBonus:  sideBag.rangeBonus  ?? 0,
      regenHP:     sideBag.regenHP     ?? 0,
      regenST:     sideBag.regenST     ?? 0,
    };
    if (!(key in map)) { console.warn(`[EasyEffects] Unknown clash path 'clash.${key}'`); return 0; }
    return map[key];
  }

  if (root === "item") {
    const item = context.item;
    if (!item) { console.warn("[EasyEffects] 'item.*' used but no item in context."); return 0; }
    const key = segments[1];
    if (key === "flag") return resolveFlagPathValue("item", flagKeyFromSegments(segments, 1), context);
    if (key === "origin") return item.system?.origin ?? "";
    if (!ITEM_PATH_FIELDS.has(key)) {
      console.warn(`[EasyEffects] Unknown item path 'item.${key}'`);
      return 0;
    }
    return Number(item.system?.[key] ?? 0);
  }

  if (root === "heal") {
    const pending = context.heal;
    if (!pending) {
      console.warn("[EasyEffects] 'heal.*' used outside [On Heal] / [On Being Healed] context.");
      return 0;
    }
    const key = segments[1];
    if (key === "amount") return Number(pending.amount) || 0;
    if (key === "source") return pending.source ?? "";
    if (key === "pool" || key === "originalPool") {
      const raw = key === "originalPool" ? (pending.originalPool ?? pending.pool) : pending.pool;
      if (Array.isArray(raw)) return raw[0] ?? "";
      return raw ?? "";
    }
    console.warn(`[EasyEffects] Unknown heal path 'heal.${key}'`);
    return 0;
  }

  // incoming.* == damage.*
  if (root === "damage" || root === "incoming") {
    const dmg = context.damage;
    if (!dmg) {
      console.warn(`[EasyEffects] '${root}.*' used outside a damage trigger.`);
      return 0;
    }
    const key = segments[1];
    if (key === "amount") return Number(dmg.amount) || 0;
    if (key === "requestedAmount" || key === "finalAmount" || key === "appliedAmount") {
      return Number(dmg[key]) || 0;
    }
    if (key === "beforeValue" || key === "afterValue") return Number(dmg[key]) || 0;
    if (key === "source" || key === "damageType") return dmg[key] ?? "";
    if (key === "attack") return dmg.fromAttack === true ? 1 : 0;
    if (key === "pool") {
      const raw = dmg.pool;
      if (Array.isArray(raw)) return raw[0] ?? "";
      return raw ?? "";
    }
    console.warn(`[EasyEffects] Unknown ${root} path '${root}.${key}'`);
    return 0;
  }

  if (root === "changed") {
    const ch = context.changed;
    if (!ch) {
      console.warn("[EasyEffects] 'changed.*' used outside [On Gain] / [On Lose] context.");
      return 0;
    }
    const key = segments[1];
    if (key === "amount" || key === "before" || key === "after") {
      return Number(ch[key]) || 0;
    }
    console.warn(`[EasyEffects] Unknown changed path 'changed.${key}'`);
    return 0;
  }

  if (root === "depleted") {
    const dep = context.depleted;
    if (!dep) {
      console.warn("[EasyEffects] 'depleted.*' used outside [On Depleted] context.");
      return 0;
    }
    const key = segments[1];
    if (key === "pool") return dep.pool ?? "";
    if (key === "before" || key === "max") return Number(dep[key]) || 0;
    console.warn(`[EasyEffects] Unknown depleted path 'depleted.${key}'`);
    return 0;
  }

  if (root === "moved") {
    const moved = context.moved;
    if (!moved) {
      console.warn("[EasyEffects] 'moved.*' used outside [On Move] context.");
      return 0;
    }
    const key = segments[1];
    if (key === "squares" || key === "spaces" || key === "movement") {
      return Number(moved[key] ?? moved.squares ?? moved.spaces) || 0;
    }
    if (key === "forced") return moved.forced ? 1 : 0;
    if (key === "method") return moved.method ?? "";
    console.warn(`[EasyEffects] Unknown moved path 'moved.${key}'`);
    return 0;
  }

  if (root === "burst") {
    const burst = context.burst;
    if (!burst) {
      console.warn("[EasyEffects] 'burst.*' used outside Burst context.");
      return 0;
    }
    const key = segments[1];
    if (key === "amount" || key === "before" || key === "after") {
      return Number(burst[key]) || 0;
    }
    if (key === "status") return burst.status ?? "";
    console.warn(`[EasyEffects] Unknown burst path 'burst.${key}'`);
    return 0;
  }

  if (root === "proc") {
    const proc = context.proc;
    if (!proc) {
      console.warn("[EasyEffects] 'proc.*' used outside Proc context.");
      return 0;
    }
    const key = segments[1];
    if (key === "name") return proc.name ?? "";
    if (proc.binds && Object.prototype.hasOwnProperty.call(proc.binds, key)) {
      return proc.binds[key];
    }
    console.warn(`[EasyEffects] Unknown proc path 'proc.${key}'`);
    return 0;
  }

  const actor = resolveContextActor(root, context);
  if (!actor) { console.warn(`[EasyEffects] Path root '${root}' not in context.`); return 0; }

  const sub = segments.slice(1);
  if (!sub.length) return actor.name ?? "";

  if (sub[0] === "flag") {
    return resolveFlagPathValue(root, flagKeyFromSegments(segments, 1), context);
  }

  if (sub[0] === "status" && sub[1]) {
    if (sub[2] === "origin") {
      return typeof actor.getStatusOrigin === "function"
        ? actor.getStatusOrigin(sub[1])
        : "";
    }
    if (sub.length === 2) return actor.getStatusStacks(sub[1]);
  }

  if (sub.length === 1) {
    if (sub[0] === "uuid") return actor.uuid ?? "";
    if (sub[0] === "id") return actor.id ?? "";
    if (sub[0] === "name") return actor.name ?? "";
    const shorthand = resolvePathShorthand(actor, sub[0]);
    if (shorthand !== null) return shorthand;
  }

  if (sub[0] === "stat" && sub[1]) {
    if (sub.length === 2) return actor.system.abilities?.[sub[1]]?.value ?? 0;
    const walkedStat = walkObjectPath(actor.system?.abilities?.[sub[1]], sub.slice(2));
    if (walkedStat !== undefined) return coerceActorPathValue(walkedStat);
  }

  if (sub[0] === "attr" && sub[1]) {
    const bag = actor.system?.attributes?.[sub[1]];
    if (sub.length === 2) return Number(bag?.value) || 0;
    const walkedAttr = walkObjectPath(bag, sub.slice(2));
    if (walkedAttr !== undefined) return coerceActorPathValue(walkedAttr);
  }

  const walked = walkActorPath(actor, sub);
  if (walked !== undefined) return coerceActorPathValue(walked);

  console.warn(`[EasyEffects] Unknown path: '${segments.join(".")}'`);
  return 0;
}

function walkObjectPath(root, segments) {
  if (root == null || !segments?.length) return undefined;
  let cur = root;
  for (const seg of segments) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[seg];
  }
  if (typeof cur === "function") return undefined;
  return cur;
}

function walkActorPath(actor, segments) {
  const fromActor = walkObjectPath(actor, segments);
  if (fromActor !== undefined) return fromActor;
  const fromSystem = walkObjectPath(actor.system, segments);
  if (fromSystem !== undefined) return fromSystem;
  return walkObjectPath(actor.system?.attributes, segments);
}

function coerceActorPathValue(value) {
  if (value == null) return 0;
  if (typeof value === "function") return 0;
  if (typeof value === "number" || typeof value === "boolean") return Number(value);
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.value !== undefined && typeof value.value !== "object") {
    return coerceActorPathValue(value.value);
  }
  return 0;
}

// ── Amount resolution ─────────────────────────────────────────────────────────

async function resolveAmount(amountNode, context) {
  if (!amountNode) return 1;
  const cached = readAmountSnapshot(context, amountNode);
  if (cached !== undefined) return cached;
  let value;
  switch (amountNode.type) {
    case "NUMBER":   value = amountNode.value; break;
    case "DICE":     value = await evaluateDiceFormula(amountNode.value, context); break;
    case "ACCESSOR": value = Number(await evaluateExpr(amountNode.expr, context)) || 0; break;
    case "EFFECT_N": value = Math.max(0, Number(context.effectN) || 0); break;
    case "POOL_MAX": value = 0; break; // resolved per-actor in set handler
    case "MULTIPLIEDPATH":
      value = resolvePath(amountNode.path.segments, context)
        * await resolveAmount(amountNode.multiplier, context);
      break;
    default:
      console.warn(`[EasyEffects] Unknown amount type '${amountNode.type}'`);
      value = 1;
      break;
  }
  writeAmountSnapshot(context, amountNode, value);
  return value;
}

/**
 * `1d10 per N` expands to `Nd10` before rolling. Other formulas roll once, then multiply.
 */
async function resolveActionAmount(action, context) {
  const amountNode = action.amount;
  const perNode = action.per;

  if (amountNode?.type === "DICE" && perNode) {
    const times = Math.max(0, Math.round(await resolveAmount(perNode, context)));
    if (times <= 0) return { amount: 0, formula: null };
    const expanded = expandSimpleDiceByMultiplier(amountNode.value, times);
    if (expanded != null) {
      if (expanded === "0") return { amount: 0, formula: null };
      const amount = Math.max(0, Math.round(await evaluateDiceFormula(expanded, context)));
      return { amount, formula: expanded };
    }
    const once = await evaluateDiceFormula(amountNode.value, context);
    return {
      amount: Math.max(0, Math.round(once * times)),
      formula: `${amountNode.value}×${times}`,
    };
  }

  const formula = amountNode?.type === "DICE" ? String(amountNode.value) : null;
  let amount = await resolveAmount(amountNode, context);
  if (perNode) amount *= await resolveAmount(perNode, context);
  return { amount: Math.max(0, Math.round(amount)), formula };
}

function resolveAmountSync(amountNode, context) {
  if (!amountNode) return 1;
  const cached = readAmountSnapshot(context, amountNode);
  if (cached !== undefined) return cached;
  let value;
  switch (amountNode.type) {
    case "NUMBER":   value = amountNode.value; break;
    case "DICE":
      console.warn("[EasyEffects] Dice not allowed in [Always Active]");
      value = 0;
      break;
    case "ACCESSOR": value = Number(evaluateExprSync(amountNode.expr, context)) || 0; break;
    case "EFFECT_N": value = Math.max(0, Number(context.effectN) || 0); break;
    case "POOL_MAX": value = 0; break;
    case "MULTIPLIEDPATH":
      value = resolvePath(amountNode.path.segments, context)
        * resolveAmountSync(amountNode.multiplier, context);
      break;
    default: value = 1; break;
  }
  writeAmountSnapshot(context, amountNode, value);
  return value;
}

// ── Action handlers ───────────────────────────────────────────────────────────

function _resolveClashBonusSide(context, actionTarget) {
  const wantTarget = (actionTarget ?? "self") === "target";
  const actor = wantTarget ? context.target : context.self;
  const attacker = context.attacker ?? null;
  const defender = context.defender ?? null;

  if (actor && attacker && sameActor(actor, attacker)) return "attacker";
  if (actor && defender && sameActor(actor, defender)) return "defender";
  if (context.self && attacker && sameActor(context.self, attacker)) {
    return wantTarget ? "defender" : "attacker";
  }
  if (context.self && defender && sameActor(context.self, defender)) {
    return wantTarget ? "attacker" : "defender";
  }
  return wantTarget ? "defender" : "attacker";
}

function _clashBonusBagForSelf(context) {
  const clash = context.clash;
  if (!clash?.bonuses) return {};
  if (clash.bonuses.attacker && clash.bonuses.defender) {
    const side = _resolveClashBonusSide(context, "self");
    return clash.bonuses[side] ?? {};
  }
  return clash.bonuses;
}

/**
 * Writes N into the named field of clash.bonuses (attacker/defender bag when sided).
 * delta can be positive (up) or negative (down).
 */
function _applyClashBonus(context, field, delta, actionTarget = "self") {
  if (!context.clash?.bonuses) {
    console.warn(`[EasyEffects] Clash bonus '${field}' used outside a clash context — ignored.`);
    return;
  }
  const bonuses = context.clash.bonuses;
  if (bonuses.attacker && bonuses.defender) {
    const side = _resolveClashBonusSide(context, actionTarget);
    const bag = bonuses[side];
    if (!bag) {
      console.warn(`[EasyEffects] Clash bonus side '${side}' missing; ignored.`);
      return;
    }
    bag[field] = (bag[field] ?? 0) + delta;
    return;
  }
  bonuses[field] = (bonuses[field] ?? 0) + delta;
}

function statusApplyFilterFromContext(context) {
  return context?.clash?.statusApplyFilter ?? null;
}

function statusApplyFilterNames(filter) {
  const raw = filter?.names;
  if (raw instanceof Set) {
    return new Set([...raw].map((n) => String(n ?? "").trim().toLowerCase()).filter(Boolean));
  }
  if (Array.isArray(raw)) {
    return new Set(raw.map((n) => String(n ?? "").trim().toLowerCase()).filter(Boolean));
  }
  return new Set();
}

const STATUS_APPLY_VERBS = ["add", "remove", "set"];

function statusApplyFilterVerbs(filter) {
  const raw = filter?.verbs;
  if (Array.isArray(raw) && raw.length) {
    return new Set(raw.map((v) => String(v ?? "").trim().toLowerCase()).filter(Boolean));
  }
  return new Set(STATUS_APPLY_VERBS);
}

function actionStatusName(action) {
  if (!action || action.noun !== "status") return null;
  if (!STATUS_APPLY_VERBS.includes(action.verb)) return null;
  const name = String(action.argument ?? "").trim().toLowerCase();
  return name || null;
}

function actionAllowedByStatusFilter(action, filter) {
  if (!filter?.mode) return true;
  const names = statusApplyFilterNames(filter);
  if (!names.size) return true;
  const statusName = actionStatusName(action);
  if (!statusName) return filter.mode !== "only";
  if (!statusApplyFilterVerbs(filter).has(action.verb)) return filter.mode !== "only";
  const listed = names.has(statusName);
  return filter.mode === "only" ? listed : !listed;
}

function statementAllowedByStatusFilter(stmt, filter) {
  if (!filter?.mode) return true;
  if (stmt.type === "DialogStatement" || stmt.type === "MessageStatement" || stmt.type === "RollStatement") {
    return filter.mode !== "only";
  }
  return true;
}

function instantApplyIsLive(context) {
  const filter = statusApplyFilterFromContext(context);
  return filter?.mode === "only" && filter.forceLive === true;
}

const ACTION_HANDLERS = {
  // ── Status / resource ──────────────────────────────────────────────────────
  add: async (action, context, amount) => {
    if (action.noun === "resource") {
      if (isRuntimeResource(action.argument)) {
        for (const actor of resolveTargets(action.target, context)) {
          await applyRuntimeResource(actor, action.argument, { mode: "add", amount });
        }
        return;
      }
      console.warn(`[EasyEffects] Resource gain/lose ('${action.argument}') only applies in [Always Active].`);
      return;
    }
    if (action.noun !== "status") throw new InterpretError(`'add' only supports noun 'status'`);
    const originUuid = context.self?.uuid ?? null;
    for (const actor of resolveTargets(action.target, context)) {
      if (action.timing && !instantApplyIsLive(context)) {
        await runAsOwnerOrGM(actor, "addPendingStatusStacks", {
          statusName: action.argument,
          amount,
          arrival: action.timing,
          originUuid,
        });
      } else {
        await runAsOwnerOrGM(actor, "addStatusStacks", {
          statusName: action.argument,
          amount,
          originUuid,
        });
      }
    }
  },

  remove: async (action, context, amount) => {
    if (action.noun === "resource") {
      if (isRuntimeResource(action.argument)) {
        for (const actor of resolveTargets(action.target, context)) {
          await applyRuntimeResource(actor, action.argument, { mode: "remove", amount });
        }
        return;
      }
      console.warn(`[EasyEffects] Resource gain/lose ('${action.argument}') only applies in [Always Active].`);
      return;
    }
    if (action.noun !== "status") throw new InterpretError(`'remove' only supports noun 'status'`);
    for (const actor of resolveTargets(action.target, context)) {
      await runAsOwnerOrGM(actor, "removeStatusStacks", {
        statusName: action.argument,
        amount,
      });
    }
  },

  // ── HP / ST / SP / Light ───────────────────────────────────────────────────
  deal: async (action, context, amount, meta = {}) => {
    if (action.noun !== "damage") throw new InterpretError(`'deal' only supports noun 'damage'`);
    const host = context.item;
    // Status damage uses the item name as its source.
    const source = host?.type === "status" ? (host.name || null) : null;
    // Reflected damage keeps the pending pool(s) and type unless overridden.
    const inheritedPool = context.damage?.pool;
    const pool = action.pool
      || (Array.isArray(inheritedPool)
        ? (inheritedPool.length ? inheritedPool : null)
        : (inheritedPool ? String(inheritedPool) : null))
      || "hp";
    const damageType = action.damageType
      || (context.damage?.damageType ? String(context.damage.damageType) : null)
      // Status procs should not inherit the clash weapon type.
      || (host?.type !== "status" && context.clash?.damageType
        ? String(context.clash.damageType)
        : null)
      || null;
    const skipEasyEffects = skipNestedApply(context);
    const resistanceTiming = action.resistanceTiming === "before" ? "before" : "after";
    const formula = typeof meta.formula === "string" && meta.formula.trim()
      ? meta.formula.trim()
      : null;
    const isStatusHost = host?.type === "status";
    const attacker = isStatusHost ? null : (context.attacker ?? context.self ?? null);
    const attackerItem = isStatusHost ? null : (context.item ?? null);
    for (const actor of resolveTargets(action.target, context)) {
      await runAsOwnerOrGM(actor, "applyDamage", {
        amount,
        options: {
          op: "full",
          pool,
          source,
          damageType,
          formula,
          skipEasyEffects,
          skipResistance: resistanceTiming !== "before",
          attacker,
          attackerItem,
        },
      });
    }
  },

  heal: async (action, context, amount, meta = {}) => {
    if (action.noun !== "damage") throw new InterpretError(`'heal' only supports noun 'damage'`);
    const pool = action.pool || "hp";
    const formula = typeof meta.formula === "string" && meta.formula.trim()
      ? meta.formula.trim()
      : null;
    const sourceLabel = resolveEffectSourceLabel(context);
    for (const actor of resolveTargets(action.target, context)) {
      await runAsOwnerOrGM(actor, "applyDamage", {
        amount,
        options: {
          op: "heal",
          pool,
          formula,
          sourceLabel,
          skipEasyEffects: skipNestedApply(context),
          healer: context.self ?? null,
          item: context.item ?? null,
        },
      });
    }
  },

  reduce: async (action, context, amount) => {
    if (action.noun === "flag") {
      await applyFlagAction(action, context, "reduce");
      return;
    }
    if (action.noun === "roll") {
      applyPendingRollDelta(context, -amount, "reduce");
      return;
    }
    if (action.noun === "heal") {
      if (!context.heal) {
        console.warn("[EasyEffects] 'reduce heal' used outside [On Heal] / [On Being Healed]; ignored.");
        return;
      }
      if (action.resistanceTiming === "after") {
        console.warn("[EasyEffects] 'after resistances' cannot be used with heal; ignored.");
        return;
      }
      applyPendingDamageDelta(context.heal, -amount, {
        actionPool: action.pool,
        timing: "before",
      });
      return;
    }
    if (action.noun !== "damage") throw new InterpretError(`'reduce' only supports noun 'damage', 'heal', or 'roll'`);
    if (!context.damage) {
      console.warn("[EasyEffects] 'reduce damage' used outside [Before Dealing Damage] / [On Taking Damage]; ignored.");
      return;
    }
    if (rejectIfDamageReadOnly(context, "reduce")) return;
    applyPendingDamageDelta(context.damage, -amount, {
      damageFilter: context._blockDamageFilter,
      actionPool: action.pool,
      timing: action.resistanceTiming === "after" ? "after" : "before",
    });
  },

  increase: async (action, context, amount) => {
    if (action.noun === "flag") {
      await applyFlagAction(action, context, "increase");
      return;
    }
    if (action.noun === "roll") {
      applyPendingRollDelta(context, amount, "increase");
      return;
    }
    if (action.noun === "heal") {
      if (!context.heal) {
        console.warn("[EasyEffects] 'increase heal' used outside [On Heal] / [On Being Healed]; ignored.");
        return;
      }
      if (action.resistanceTiming === "after") {
        console.warn("[EasyEffects] 'after resistances' cannot be used with heal; ignored.");
        return;
      }
      applyPendingDamageDelta(context.heal, amount, {
        actionPool: action.pool,
        timing: "before",
      });
      return;
    }
    if (action.noun !== "damage") throw new InterpretError(`'increase' only supports noun 'damage', 'heal', or 'roll'`);
    if (!context.damage) {
      console.warn("[EasyEffects] 'increase damage' used outside [Before Dealing Damage] / [On Taking Damage]; ignored.");
      return;
    }
    if (rejectIfDamageReadOnly(context, "increase")) return;
    applyPendingDamageDelta(context.damage, amount, {
      damageFilter: context._blockDamageFilter,
      actionPool: action.pool,
      timing: action.resistanceTiming === "after" ? "after" : "before",
    });
  },

  // Conversion changes the pending hit without applying new damage.
  convert: async (action, context, amount) => {
    if (action.noun === "heal") {
      if (!context.heal) {
        console.warn("[EasyEffects] 'convert heal' used outside [On Heal] / [On Being Healed]; ignored.");
        return;
      }
      if (action.setAmount) {
        context.heal.amount = Math.max(0, amount);
      }
      if (action.convertKind === "pool") {
        context.heal.pool = action.convertTo;
      }
      return;
    }
    if (action.noun !== "damage") throw new InterpretError(`'convert' only supports noun 'damage' or 'heal'`);
    if (!context.damage) {
      console.warn("[EasyEffects] 'convert damage' used outside [Before Dealing Damage] / [On Taking Damage]; ignored.");
      return;
    }
    if (rejectIfDamageReadOnly(context, "convert")) return;
    if (action.setAmount) {
      context.damage.amount = Math.max(0, amount);
    }
    if (action.convertKind === "pool") {
      context.damage.pool = action.convertTo;
    } else if (action.convertKind === "damageType") {
      context.damage.damageType = action.convertTo;
    }
  },

  set: async (action, context, amount) => {
    if (action.noun === "flag") {
      await applyFlagAction(action, context, "set");
      return;
    }
    if (action.noun === "resistance") {
      const map = action.resistanceOverrides;
      if (!map || typeof map !== "object") {
        console.warn("[EasyEffects] 'set resistance' missing override map");
        return;
      }
      for (const actor of resolveTargets(action.target ?? "self", context)) {
        await runAsOwnerOrGM(actor, "setOutfitResistances", { overrides: map });
      }
      return;
    }
    if (action.noun === "status") {
      const statusName = action.argument;
      if (!statusName) {
        console.warn("[EasyEffects] 'set' status missing name");
        return;
      }
      const stacks = Math.max(0, Math.round(Number(amount) || 0));
      for (const actor of resolveTargets(action.target ?? "self", context)) {
        await runAsOwnerOrGM(actor, "setStatusStacks", {
          statusName,
          amount: stacks,
        });
      }
      return;
    }
    if (action.noun === "pool") {
      const pool = action.argument || action.pool;
      if (!pool) {
        console.warn("[EasyEffects] 'set' pool missing name");
        return;
      }
      for (const actor of resolveTargets(action.target ?? "self", context)) {
        const poolData = actor.system?.attributes?.[pool];
        if (!poolData) continue;
        const max = Number(poolData.max) || 0;
        const current = Number(poolData.value) || 0;
        const targetVal = action.amount?.type === "POOL_MAX"
          ? max
          : clampPoolValue(pool, Math.round(Number(amount)), max);
        const delta = targetVal - current;
        if (delta === 0) continue;
        const sourceLabel = resolveEffectSourceLabel(context);
        if (delta > 0) {
          await runAsOwnerOrGM(actor, "applyDamage", {
            amount: delta,
            options: {
              op: "heal",
              pool,
              sourceLabel,
              skipEasyEffects: skipNestedApply(context),
              healer: context.self ?? null,
              item: context.item ?? null,
            },
          });
        } else {
          await runAsOwnerOrGM(actor, "applyDamage", {
            amount: -delta,
            options: {
              op: "full",
              pool,
              sourceLabel,
              skipResistance: true,
              skipEasyEffects: true,
            },
          });
        }
      }
      return;
    }
    if (action.noun === "resource") {
      if (isRuntimeResource(action.argument)) {
        for (const actor of resolveTargets(action.target ?? "self", context)) {
          await applyRuntimeResource(actor, action.argument, { mode: "set", amount });
        }
        return;
      }
      console.warn("[EasyEffects] 'set maxHp/maxSt/maxSp/maxLight' only applies in [Always Active]; ignored.");
      return;
    }
    if (action.noun !== "stat") {
      throw new InterpretError(`'set' only supports noun 'stat', 'status', 'pool', 'resource', or 'resistance'`);
    }
    for (const actor of resolveTargets(action.target, context)) {
      const name = action.argument;
      if (!name) continue;
      await runAsOwnerOrGM(actor, "setStat", { statName: name, amount });
    }
  },

  // ── Clash bonus verbs ─────────────────────────────────────────────────────
  //
  // "power up attack 2"        → clash.bonuses.attackPower  += 2
  // "power down evade 1"       → clash.bonuses.evadePower   -= 1
  // "dice max up damage 3"     → clash.bonuses.damageMax    += 3
  // "dice amount up attack 1"  → clash.bonuses.attackAmount += 1
  // "regen hp 5"               → clash.bonuses.regenHP      += 5
  //
  // noun can be: attack | block | evade | defense | damage (for power/dice max/dice amount)
  //              hp | st | sp | light (for regen)

  "power up": async (action, context, amount) => {
    const fields = getPowerFields(action.noun);
    if (!fields.length) { console.warn(`[EasyEffects] Unknown noun for power up/down: '${action.noun}'`); return; }
    for (const field of fields) _applyClashBonus(context, field, +amount, action.target ?? "self");
  },

  "power down": async (action, context, amount) => {
    const fields = getPowerFields(action.noun);
    if (!fields.length) { console.warn(`[EasyEffects] Unknown noun for power up/down: '${action.noun}'`); return; }
    for (const field of fields) _applyClashBonus(context, field, -amount, action.target ?? "self");
  },

  advantage: async (action, context, amount) => {
    const n = Math.max(1, Math.round(Number(amount) || 1));
    _applyClashBonus(context, "advantage", n, action.target ?? "self");
  },

  disadvantage: async (action, context, amount) => {
    const n = Math.max(1, Math.round(Number(amount) || 1));
    _applyClashBonus(context, "disadvantage", n, action.target ?? "self");
  },

  "dice max up": async (action, context, amount) => {
    const fields = getMaxFields(action.noun);
    if (!fields.length) { console.warn(`[EasyEffects] Unknown noun for dice max up/down: '${action.noun}'`); return; }
    for (const field of fields) _applyClashBonus(context, field, +amount, action.target ?? "self");
  },

  "dice max down": async (action, context, amount) => {
    const fields = getMaxFields(action.noun);
    if (!fields.length) { console.warn(`[EasyEffects] Unknown noun for dice max up/down: '${action.noun}'`); return; }
    for (const field of fields) _applyClashBonus(context, field, -amount, action.target ?? "self");
  },

  "dice amount up": async (action, context, amount) => {
    const fields = getAmountFields(action.noun);
    if (!fields.length) { console.warn(`[EasyEffects] Unknown noun for dice amount up/down: '${action.noun}'`); return; }
    for (const field of fields) _applyClashBonus(context, field, +amount, action.target ?? "self");
  },

  "dice amount down": async (action, context, amount) => {
    const fields = getAmountFields(action.noun);
    if (!fields.length) { console.warn(`[EasyEffects] Unknown noun for dice amount up/down: '${action.noun}'`); return; }
    for (const field of fields) _applyClashBonus(context, field, -amount, action.target ?? "self");
  },

  "range up": async (action, context, amount) => {
    const fields = getPowerFields(action.noun);
    if (!fields.length) { console.warn(`[EasyEffects] Unknown noun for range up/down: '${action.noun}'`); return; }
    for (const field of fields) _applyClashBonus(context, field, +amount, action.target ?? "self");
  },

  "range down": async (action, context, amount) => {
    const fields = getPowerFields(action.noun);
    if (!fields.length) { console.warn(`[EasyEffects] Unknown noun for range up/down: '${action.noun}'`); return; }
    for (const field of fields) _applyClashBonus(context, field, -amount, action.target ?? "self");
  },

  regen: async (action, context, amount) => {
    const field = getRegenField(action.noun);
    if (field && context.clash) {
      _applyClashBonus(context, field, +amount, action.target ?? "self");
      return;
    }

    const pool = String(action.noun ?? "").toLowerCase();
    if (pool === "hp" || pool === "st" || pool === "sp" || pool === "light") {
      const sourceLabel = resolveEffectSourceLabel(context);
      for (const actor of resolveTargets(action.target, context)) {
        await runAsOwnerOrGM(actor, "applyDamage", {
          amount,
          options: {
            op: "heal",
            pool,
            sourceLabel,
            createMessage: pool === "hp" || pool === "st" ? false : undefined,
            skipEasyEffects: skipNestedApply(context),
            healer: context.self ?? null,
            item: context.item ?? null,
          },
        });
      }
      return;
    }

    console.warn(`[EasyEffects] Unknown regen pool '${action.noun}'`);
  },

  burst: async (action, context) => {
    if (action.noun !== "status") throw new InterpretError(`'burst' only supports a status name`);
    const statusName = action.argument;
    if (!statusName) {
      console.warn("[EasyEffects] 'burst' missing status name");
      return;
    }
    const targets = resolveTargets(action.target ?? "self", context);
    if (!targets.length) {
      console.warn("[EasyEffects] 'burst' has no target actor");
      return;
    }
    const { emitStatusBurst } = await import("./registry.js");
    const burster = resolveBurstBurster(context);
    for (const actor of targets) {
      await emitStatusBurst({
        statusName,
        actor,
        burster,
        attacker: context.attacker ?? null,
        clash: context.clash ?? null,
        sourceItem: context.item ?? null,
        attackerSkill: context.attackerSkill ?? context.clash?.attackerSkill ?? null,
        defenderSkill: context.defenderSkill ?? context.clash?.defenderSkill ?? null,
        depth: Number(context._burstDepth) || 0,
      });
    }
  },

  proc: async (action, context) => {
    if (action.noun !== "proc") throw new InterpretError(`'proc' only supports a proc name`);
    const procName = action.argument;
    if (!procName) {
      console.warn("[EasyEffects] 'proc' missing name");
      return;
    }
    const targets = resolveTargets(action.target ?? "self", context);
    if (!targets.length) {
      console.warn("[EasyEffects] 'proc' has no focus actor");
      return;
    }

    const binds = {};
    for (const bind of action.binds ?? []) {
      if (!bind?.name) continue;
      binds[bind.name] = await resolveAmount(bind.amount, context);
    }

    const procTarget = resolveProcTargetActor(action.procTarget, context);

    const { emitProc } = await import("./registry.js");
    for (const focusActor of targets) {
      await emitProc({
        procName,
        focusActor,
        proccer: context.self ?? null,
        attacker: context.attacker ?? null,
        target: procTarget,
        clash: context.clash ?? null,
        sourceItem: context.item ?? null,
        attackerSkill: context.attackerSkill ?? context.clash?.attackerSkill ?? null,
        defenderSkill: context.defenderSkill ?? context.clash?.defenderSkill ?? null,
        binds,
        depth: Number(context._procDepth) || 0,
        _emitPendingRoll: context._emitPendingRoll,
      });
    }
  },

  message: async (action, context) => {
    await postChatMessage(action.argument, action.target ?? "self", context);
  },

  dialog: async (action, context) => {
    const ast = context._scriptAst;
    if (!ast) {
      console.warn("[EasyEffects] Dialog action missing script AST");
      return;
    }
    await runDialogStatement({
      prompt: action.argument,
      audience: action.audience,
      choices: action.choices,
    }, ast, context, Number(context._dialogDepth) || 0);
  },

  roll: async (action, context, resolvedAmount) => {
    await commitNamedRoll(context, {
      formula: action.amount?.type === "DICE" ? action.amount.value : null,
      bind: action.bind ?? action.argument ?? null,
      tag: action.tag ?? null,
      total: resolvedAmount,
    });
  },

  clear: async (action, context) => {
    if (action.noun !== "flag") throw new InterpretError(`'clear' only supports noun 'flag'`);
    await applyFlagAction(action, context, "clear");
  },

  pause: async (action, context) => {
    if (action.noun !== "status") throw new InterpretError(`'pause' only supports a status name`);
    const statusName = action.argument;
    if (!statusName) {
      console.warn("[EasyEffects] 'pause' missing status name");
      return;
    }
    for (const actor of resolveTargets(action.target ?? "self", context)) {
      await runAsOwnerOrGM(actor, "pauseStatusToPending", {
        statusName,
        arrival: action.timing ?? "round",
      });
    }
  },
};

// ── Flag and condition ────────────────────────────────────────────────────────

function resolveHasFlag(flagNode, context) {
  const key = flagNode.statusName;
  const host = flagNode.target ?? "self";
  if (!key) return 0;
  if (host === "event") {
    const emission = context?._eeEmission;
    if (!emission?.event?.flags) {
      console.warn("[EasyEffects] 'event.flag' is not available in this trigger.");
      return 0;
    }
    return Object.prototype.hasOwnProperty.call(emission.event.flags, key) ? 1 : 0;
  }
  const resolved = resolveFlagHost(host, context);
  if (!resolved?.doc) return 0;
  return hasPersistentFlag(context?._eeEmission ?? null, resolved.doc, key) ? 1 : 0;
}

function resolveFlag(flagNode, context) {
  if (flagNode.flag === "hasFlag") return resolveHasFlag(flagNode, context);
  const actor = resolveContextActor(flagNode.target, context);
  if (!actor) return 0;
  switch (flagNode.flag) {
    case "isStaggered": return actor.system.attributes?.staggered?.value ? 1 : 0;
    case "isPanicking": return actor.system.attributes?.panicking?.value ? 1 : 0;
    case "hasStatus":   return actor.getStatusStacks(flagNode.statusName) > 0 ? 1 : 0;
    default: console.warn(`[EasyEffects] Unknown flag '${flagNode.flag}'`); return 0;
  }
}

async function resolveLhs(lhs, context) {
  if (lhs.type === "ACCESSOR") return evaluateExpr(lhs.expr, context);
  if (lhs.type === "FLAG")     return resolveFlag(lhs, context);
  return 0;
}

async function resolveRhs(rhs, context) {
  if (!rhs) return 0;
  if (rhs.snapshot) return resolveAmount(rhs, context);
  if (rhs.type === "NUMBER")   return rhs.value;
  if (rhs.type === "BOOLEAN")  return rhs.value;
  if (rhs.type === "EFFECT_N") return Math.max(0, Number(context.effectN) || 0);
  if (rhs.type === "ACCESSOR") return evaluateExpr(rhs.expr, context);
  if (rhs.type === "DICE")     return evaluateDiceFormula(rhs.value, context);
  if (rhs.type === "IDENT" || rhs.type === "STRING") return rhs.value;
  return 0;
}

function resolveRhsSync(rhs, context) {
  if (!rhs) return 0;
  if (rhs.snapshot) return resolveAmountSync(rhs, context);
  if (rhs.type === "NUMBER")   return rhs.value;
  if (rhs.type === "BOOLEAN")  return rhs.value;
  if (rhs.type === "EFFECT_N") return Math.max(0, Number(context.effectN) || 0);
  if (rhs.type === "ACCESSOR") return evaluateExprSync(rhs.expr, context);
  if (rhs.type === "IDENT" || rhs.type === "STRING") return rhs.value;
  if (rhs.type === "DICE") {
    console.warn("[EasyEffects] Dice not allowed in [Always Active]");
    return 0;
  }
  return 0;
}

function compareValues(operator, lhs, rhs) {
  switch (operator) {
    case ">":  return lhs >  rhs;
    case "<":  return lhs <  rhs;
    case ">=": return lhs >= rhs;
    case "<=": return lhs <= rhs;
    case "==": return lhs === rhs;
    case "!=": return lhs !== rhs;
    default: throw new InterpretError(`Unknown operator '${operator}'`);
  }
}

async function evaluateCondition(condition, context) {
  if (!condition) return true;
  if (condition.type === "And") {
    for (const inner of condition.conditions) {
      if (!(await evaluateCondition(inner, context))) return false;
    }
    return true;
  }
  const lhs = await resolveLhs(condition.lhs, context);
  const rhs = await resolveRhs(condition.rhs, context);
  return compareValues(condition.operator, lhs, rhs);
}

function evaluateConditionSync(condition, context) {
  if (!condition) return true;
  if (condition.type === "And") {
    return condition.conditions.every((inner) => evaluateConditionSync(inner, context));
  }
  const lhs = condition.lhs.type === "ACCESSOR"
    ? evaluateExprSync(condition.lhs.expr, context)
    : resolveFlag(condition.lhs, context);
  const rhs = resolveRhsSync(condition.rhs, context);
  try {
    return compareValues(condition.operator, lhs, rhs);
  } catch {
    return false;
  }
}

// ── Target resolution ─────────────────────────────────────────────────────────

const SINGLE_TARGETS = new Set(["self", "target", "ally", "attacker", "originator", "burster", "burstee", "healer"]);

function resolveTargets(targetName, context) {
  if (SINGLE_TARGETS.has(targetName)) {
    const actor = resolveContextActor(targetName, context);
    if (!actor) { console.warn(`[EasyEffects] Target '${targetName}' not in context.`); return []; }
    return [actor];
  }
  const combat = game.combat;
  if (!combat) { console.warn("[EasyEffects] Multi-target used but no active combat."); return []; }
  const self = context.self;
  const all = combat.combatants.map(c => c.actor).filter(Boolean);
  const grouped = selectRelativeActors(all, self, targetName, _isEnemy);
  if (!grouped) {
    console.warn(`[EasyEffects] Unknown target '${targetName}'`);
    return [];
  }
  return grouped;
}

function tokenDisposition(actor) {
  if (!actor) return null;
  if (actor.isToken) return actor.token?.disposition ?? null;
  const token = actor.getActiveTokens?.(true)?.[0] ?? null;
  return token?.document?.disposition ?? null;
}

function _isEnemy(other, self) {
  const selfDisposition = tokenDisposition(self);
  const otherDisposition = tokenDisposition(other);
  if (selfDisposition == null || otherDisposition == null) return false;
  return otherDisposition !== selfDisposition;
}

/**
 * Actor passed as `target` in a nested proc.
 * @param {string|null|undefined} procTarget
 * @param {object} context
 * @returns {Actor|null}
 */
function resolveProcTargetActor(procTarget, context) {
  if (!procTarget) return context.target ?? null;
  return resolveTargets(procTarget, context)[0] ?? null;
}


// ── Main async entry point ────────────────────────────────────────────────────

/*
 * Runs matching trigger blocks inside an existing emission.
 * Registry emitters already provide the shared event state and overlay.
 */
export async function execute(ast, trigger, context) {
  const dialogDepth = Number(context?._dialogDepth) || 0;
  ensureRollsBag(context);
  // Each execute call gets its own locals and amount snapshots.
  const execContext = { ...context, _eeVars: new Map(), _scriptAst: ast, _amountSnapshots: new WeakMap() };

  for (const block of ast.blocks) {
    if (block.trigger !== trigger) continue;
    if (block.damageFilter && !matchesDamageFilter(block.damageFilter, execContext.damage)) continue;
    if (block.depletedFilter && !matchesDepletedFilter(block.depletedFilter, execContext.depleted)) continue;
    if (block.clashStanceFilter && !matchesClashStanceFilter(block.clashStanceFilter, execContext.clashStance)) continue;
    if (block.rollFilter && !matchesRollFilter(block.rollFilter, execContext.pendingRoll)) continue;
    if (block.healFilter && !matchesHealFilter(block.healFilter, execContext.heal)) continue;
    if (trigger === "On Burst" && execContext.burstPhase) {
      if (!shouldExecuteBurstBlock(block, execContext)) continue;
    }

    execContext._blockDamageFilter = block.damageFilter ?? null;

    const statusFilter = statusApplyFilterFromContext(execContext);

    for (const stmt of block.statements) {
      try {
        if (stmt.polarity && stmt.polarity !== execContext.effectMode) continue;
        if (!statementAllowedByStatusFilter(stmt, statusFilter)) continue;

        const actions = stmt.actions ?? [];
        const allowedActions = actions.filter((action) => actionAllowedByStatusFilter(action, statusFilter));
        if (actions.length && !allowedActions.length) continue;

        if (stmt.type === "LetStatement") {
          await runLetStatement(stmt, execContext);
          continue;
        }

        if (stmt.type === "DialogStatement") {
          await runDialogStatement(stmt, ast, execContext, dialogDepth);
          continue;
        }

        if (stmt.type === "MessageStatement") {
          await runMessageStatement(stmt, execContext);
          continue;
        }

        if (stmt.type === "RollStatement") {
          const total = await evaluateDiceFormula(stmt.formula, execContext);
          await commitNamedRoll(execContext, {
            formula: stmt.formula,
            bind: stmt.bind ?? null,
            tag: stmt.tag ?? null,
            total,
          });
          continue;
        }

        if (stmt.condition && !(await evaluateCondition(stmt.condition, execContext))) continue;

        if (stmt.roll) {
          await applyRollToContext(stmt.roll.formula, execContext, stmt.roll.bind ?? null);
        }

        if (stmt.postCondition && !(await evaluateCondition(stmt.postCondition, execContext))) continue;

        let inheritedTarget = "self";
        for (const action of allowedActions) {
          const isFlagAction = action.noun === "flag";
          const effectiveTarget = action.target ?? inheritedTarget;
          if (action.target && !isFlagAction) inheritedTarget = action.target;

          const handler = ACTION_HANDLERS[action.verb];
          if (!handler) { console.warn(`[EasyEffects] Unknown verb '${action.verb}'`); continue; }
          if (EE_MUTATION_BARRIER_VERBS.has(action.verb)) {
            await flushContextEmission(execContext);
          }
          if (isFlagAction) {
            await handler({ ...action, target: action.target }, execContext);
            continue;
          }

          const { amount, formula } = await resolveActionAmount(action, execContext);
          await handler({ ...action, target: effectiveTarget }, execContext, amount, { formula });
        }
      } catch (err) {
        console.error(`[EasyEffects] Error in statement:`, stmt, err);
        ui.notifications?.error(`EasyEffects error: ${err.message}`);
      }
    }
  }
}

async function runLetStatement(stmt, context) {
  const value = await evaluateExpr(stmt.expr, context);
  declareVariable(context, stmt.name, value);
}

function runLetStatementSync(stmt, context) {
  const value = evaluateExprSync(stmt.expr, context);
  declareVariable(context, stmt.name, value);
}

async function runDialogStatement(stmt, ast, context, dialogDepth) {
  if (dialogDepth >= DIALOG_NEST_MAX_DEPTH) {
    console.warn(
      `[EasyEffects] Skipping dialog (depth ${dialogDepth}): nested dialog answers exceeded limit`
    );
    return;
  }

  const audienceActor = resolveDialogAudience(stmt.audience, context);
  const answerId = await promptChoiceDialog({
    prompt: stmt.prompt,
    choices: stmt.choices,
    actor: audienceActor,
  });
  if (!answerId) return;

  // [On Dialog Answer] reuses this emission. Flush first so Foundry has the overlay.
  await flushContextEmission(context);
  await execute(ast, `On Dialog Answer ${answerId}`, {
    ...context,
    _dialogDepth: dialogDepth + 1,
    _dialogResponder: audienceActor ?? null,
  });
}

function resolveDialogAudience(audience, context) {
  if (!audience) return null;
  if (audience === "attacker") {
    return context.attacker ?? context.target ?? null;
  }
  return resolveContextActor(audience, context);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMessageValue(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  }
  if (value == null) return "";
  return String(value);
}

/**
 * Fill `(…)` slots in a message string. `\(` `\)` `\\` escape literals.
 * @returns {Promise<string>}
 */
export async function interpolateMessageTemplate(template, context) {
  const src = String(template ?? "");
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src[i] === "\\" && i + 1 < src.length) {
      const next = src[i + 1];
      if (next === "(" || next === ")" || next === "\\") {
        out += next;
        i += 2;
        continue;
      }
    }
    if (src[i] !== "(") {
      out += src[i++];
      continue;
    }
    let depth = 1;
    let j = i + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === "\\" && j + 1 < src.length && (src[j + 1] === "(" || src[j + 1] === ")")) {
        j += 2;
        continue;
      }
      if (src[j] === "(") depth++;
      else if (src[j] === ")") depth--;
      if (depth > 0) j++;
    }
    if (depth !== 0) {
      out += src[i++];
      continue;
    }
    const raw = src.slice(i + 1, j).trim();
    try {
      const expr = parseAccessorExpression(raw);
      const value = await evaluateExpr(expr, context);
      out += formatMessageValue(value);
    } catch (err) {
      console.warn(`[EasyEffects] Bad message value '(${raw})':`, err);
      out += `(${raw})`;
    }
    i = j + 1;
  }
  return out;
}

async function postChatMessage(template, speakerName, context) {
  const speakerActor = resolveDialogAudience(speakerName ?? "self", context) ?? context.self ?? null;
  const text = await interpolateMessageTemplate(template, context);
  if (!text.trim()) {
    console.warn("[EasyEffects] Skipping empty chat message after interpolation.");
    return;
  }

  const speaker = speakerActor && typeof ChatMessage !== "undefined"
    ? ChatMessage.getSpeaker({ actor: speakerActor })
    : (typeof ChatMessage !== "undefined" ? ChatMessage.getSpeaker() : {});

  try {
    await ChatMessage.create({
      content: `<div class="pmttrpg-ee-message">${escapeHtml(text)}</div>`,
      speaker,
    });
  } catch (err) {
    console.error("[EasyEffects] Failed to create chat message:", err);
    ui.notifications?.error?.(`EasyEffects message failed: ${err.message}`);
  }
}

async function runMessageStatement(stmt, context) {
  await postChatMessage(stmt.template, stmt.speaker ?? "self", context);
}

// ── [Always Active] synchronous entry point ───────────────────────────────────

/**
 * Runs all [Always Active] blocks in the AST synchronously.
 * Returns a modifier object to be merged by prepareData().
 * Dice and async operations are NOT allowed here.
 *
 * @param {object} ast
 * @param {object} prepareContext — { self: actor, item? } (no clash, no target)
 * @returns {Record<string, number>}
 */
export function executeAlwaysActive(ast, prepareContext) {
  const mods = emptyAlwaysActiveMods();

  // [Always Active] context has no clash and no target
  const context = {
    self: prepareContext.self,
    target: null,
    ally: null,
    item: prepareContext.item ?? null,
    clash: null,
    combat: prepareContext.combat ?? globalThis.game?.combat ?? null,
    _eeVars: new Map(),
    _amountSnapshots: new WeakMap(),
  };

  for (const block of ast.blocks) {
    if (block.trigger !== "Always Active") continue;
    for (const stmt of block.statements) {
      try {
        if (stmt.type === "LetStatement") {
          runLetStatementSync(stmt, context);
          continue;
        }

        // Condition (sync eval only — no dice)
        if (stmt.condition && !evaluateConditionSync(stmt.condition, context)) continue;

        for (const action of stmt.actions ?? []) {
          let rawAmount = resolveAmountSync(action.amount, context);
          if (action.per) rawAmount *= resolveAmountSync(action.per, context);
          const amount = Math.max(0, Math.round(rawAmount));

          switch (action.verb) {
            case "power up": {
              const fields = getPowerFields(action.noun);
              if (fields.length) {
                for (const f of fields) mods[f] = (mods[f] ?? 0) + amount;
              } else console.warn(`[EasyEffects] Unknown noun for power up: '${action.noun}'`);
              break;
            }
            case "power down": {
              const fields = getPowerFields(action.noun);
              if (fields.length) {
                for (const f of fields) mods[f] = (mods[f] ?? 0) - amount;
              } else console.warn(`[EasyEffects] Unknown noun for power down: '${action.noun}'`);
              break;
            }
            case "dice max up": {
              const fields = getMaxFields(action.noun);
              if (fields.length) {
                for (const f of fields) mods[f] = (mods[f] ?? 0) + amount;
              } else console.warn(`[EasyEffects] Unknown noun for dice max up: '${action.noun}'`);
              break;
            }
            case "dice max down": {
              const fields = getMaxFields(action.noun);
              if (fields.length) {
                for (const f of fields) mods[f] = (mods[f] ?? 0) - amount;
              } else console.warn(`[EasyEffects] Unknown noun for dice max down: '${action.noun}'`);
              break;
            }
            case "dice amount up": {
              const fields = getAmountFields(action.noun);
              if (fields.length) {
                for (const f of fields) mods[f] = (mods[f] ?? 0) + amount;
              } else console.warn(`[EasyEffects] Unknown noun for dice amount up: '${action.noun}'`);
              break;
            }
            case "dice amount down": {
              const fields = getAmountFields(action.noun);
              if (fields.length) {
                for (const f of fields) mods[f] = (mods[f] ?? 0) - amount;
              } else console.warn(`[EasyEffects] Unknown noun for dice amount down: '${action.noun}'`);
              break;
            }
            case "range up": {
              const fields = getPowerFields(action.noun);
              if (fields.length) {
                for (const f of fields) mods[f] = (mods[f] ?? 0) + amount;
              } else console.warn(`[EasyEffects] Unknown noun for range up: '${action.noun}'`);
              break;
            }
            case "range down": {
              const fields = getPowerFields(action.noun);
              if (fields.length) {
                for (const f of fields) mods[f] = (mods[f] ?? 0) - amount;
              } else console.warn(`[EasyEffects] Unknown noun for range down: '${action.noun}'`);
              break;
            }
            case "add":
              if (action.noun === "resource") {
                if (!applyResourceMod(mods, action.argument, +amount))
                  console.warn(`[EasyEffects] [Always Active] unknown resource '${action.argument}'`);
              } else {
                console.warn(`[EasyEffects] Verb '${action.verb}' is not supported in [Always Active] for noun '${action.noun}'.`);
              }
              break;
            case "remove":
              if (action.noun === "resource") {
                if (!applyResourceMod(mods, action.argument, -amount))
                  console.warn(`[EasyEffects] [Always Active] unknown resource '${action.argument}'`);
              } else {
                console.warn(`[EasyEffects] Verb '${action.verb}' is not supported in [Always Active] for noun '${action.noun}'.`);
              }
              break;
            case "set":
              if (action.noun === "diceFormula") {
                const die = action.argument
                  ?? (context.item?.type === "outfit" ? "defense" : "attack");
                if (!applyDiceFormulaMod(mods, die, action.formula)) {
                  console.warn(`[EasyEffects] [Always Active] cannot set dice formula for '${die}'`);
                }
              } else if (action.noun === "resistance") {
                const map = action.resistanceOverrides;
                if (map && typeof map === "object") {
                  if (!mods.resistanceOverrides) mods.resistanceOverrides = {};
                  mergeResistanceOverrideMaps(mods.resistanceOverrides, map);
                } else {
                  console.warn("[EasyEffects] [Always Active] set resistance missing override map");
                }
              } else if (action.noun === "resource") {
                if (!applyResourceOverride(mods, action.argument, amount))
                  console.warn(`[EasyEffects] [Always Active] cannot set '${action.argument}' (use maxHp/maxSt/maxSp/maxLight)`);
              } else {
                console.warn(`[EasyEffects] Verb 'set' in [Always Active] only supports resource maxes, resistances, or a dice formula.`);
              }
              break;
            case "regen": {
              console.warn(
                `[EasyEffects] [Always Active] regen '${action.noun}' is not a derived mod; `
                + "use gain on a resource noun (e.g. gain 1 maxLight)."
              );
              break;
            }
            case "instant":
              break;
            default:
              console.warn(`[EasyEffects] Verb '${action.verb}' is not supported in [Always Active].`);
          }
        }
      } catch (err) {
        console.error("[EasyEffects] Error in [Always Active] statement:", stmt, err);
      }
    }
  }

  return mods;
}

export class InterpretError extends Error {
  constructor(message) {
    super(`[EasyEffects Interpreter] ${message}`);
  }
}