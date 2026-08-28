import { parse }                                    from "./parser.js";
import { execute, executeAlwaysActive }             from "./interpreter.js";
import { emptyAlwaysActiveMods, pickCombatDiceMods, zeroCombatDiceMods } from "./nouns.js";
import { isToolPresent }                            from "../inventory/slots.js";
import { uniqueStatusItems }                        from "../status/group-statuses.js";
import { isPendingStatus }                          from "../status/pending.js";
import { getActorAST, runActorEasyEffects }         from "./actor-scripts.js";
import { resolveActorClashStance }                  from "./damage-filter.js";
import { normalizeResistanceLevel, RESISTANCE_MULTIPLIERS } from "./resistances.js";
import {
  actorIdentityKey,
  itemBelongsToActor,
  itemIdentityKey,
  rememberBurstListenerItem,
  sameActor,
  uniqueBurstOwners,
} from "./burst-roles.js";

// ── Clash context factory ─────────────────────────────────────────────────────

export function emptyClashSideBonuses() {
  return {
    attackPower: 0,
    blockPower:  0,
    evadePower:  0,
    damagePower: 0,
    attackMax:   0,
    blockMax:    0,
    evadeMax:    0,
    damageMax:   0,
    regenHP:     0,
    regenST:     0,
    advantage: 0,
    disadvantage: 0,
  };
}

/**
 * Creates a fresh clash context object for one clash.
 * Pass the same reference through every hook in that clash so bonuses
 * accumulate correctly across [On Clash Start] → [On Damage Calc] etc.
 *
 * @param {number} attackerRoll
 * @param {number} defenderRoll
 * @returns {object}
 */
export function createClashContext(attackerRoll = 0, defenderRoll = 0) {
  return {
    attackerRoll,
    defenderRoll,
    margin: attackerRoll - defenderRoll,
    damageType: null,
    bonuses: {
      attacker: emptyClashSideBonuses(),
      defender: emptyClashSideBonuses(),
    },
  };
}

// ── AST cache ─────────────────────────────────────────────────────────────────

const _astCache = new Map(); // item.id → { source: string, ast: object }

function getAST(item) {
  const source = item.system?.easyEffects ?? "";
  if (!source.trim()) return null;

  const cached = _astCache.get(item.id);
  if (cached?.source === source) return cached.ast;

  try {
    const ast = parse(source);
    _astCache.set(item.id, { source, ast });
    return ast;
  } catch (err) {
    console.error(`[EasyEffects] Parse error on '${item.name}':`, err.message);
    ui.notifications?.warn(`EasyEffects parse error on '${item.name}': ${err.message}`);
    return null;
  }
}

Hooks.on("updateItem", (item) => _astCache.delete(item.id));

function documentId(doc) {
  return doc?.id ?? doc?._id ?? null;
}

function sameDocument(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const au = String(a.uuid ?? "").trim();
  const bu = String(b.uuid ?? "").trim();
  if (au && bu) return au === bu;
  const id = documentId(a);
  return !!id && id === documentId(b);
}

function resolveOwnedItem(actor, item) {
  if (!item) return null;
  const id = documentId(item);
  if (id && actor?.items?.get) {
    const owned = actor.items.get(id);
    if (owned) return owned;
  }
  return item;
}

function isPassiveClashItem(item) {
  if (!item) return false;
  if (item.type === "weapon" || item.type === "skill") return false;
  if (item.type === "augment") return item.system?.active === true;
  if (item.type === "outfit") return item.system?.equipped === true;
  return false;
}

function itemIsLoadoutActive(item, actor) {
  if (!item) return false;
  if (item.type === "augment") return item.system?.active === true;
  if (item.type === "tool") return !!item.system?.equipped && isToolPresent(item);
  if (item.type === "skill") return actor?.type === "npc" || item.system?.equipped === true;
  if (item.type === "weapon" || item.type === "outfit") return item.system?.equipped === true;
  return false;
}

function addUniqueItem(out, seen, item) {
  if (!item) return;
  const key = item.id || item.uuid;
  if (!key || seen.has(key)) return;
  seen.add(key);
  out.push(item);
}

function collectSideClashItems(actor, usedItem, appliedTool, declaredSkill, ammo) {
  const used = resolveOwnedItem(actor, usedItem);
  const tool = resolveOwnedItem(actor, appliedTool);
  const skill = resolveOwnedItem(actor, declaredSkill);
  const usedAmmo = resolveOwnedItem(actor, ammo);
  const out = [];
  const seen = new Set();
  addUniqueItem(out, seen, used);
  addUniqueItem(out, seen, tool);
  addUniqueItem(out, seen, skill);
  addUniqueItem(out, seen, usedAmmo);
  if (actor?.items) {
    for (const item of actor.items) {
      if (isPassiveClashItem(item)) addUniqueItem(out, seen, item);
    }
    for (const item of uniqueStatusItems(actor.items)) {
      addUniqueItem(out, seen, item);
    }
  }
  return out.filter((item) => item.type !== "weapon" || sameDocument(item, used));
}

function usedStatBlockItems(usedItem, appliedTool, declaredSkill, ammo) {
  const out = [];
  const seen = new Set();
  addUniqueItem(out, seen, usedItem);
  addUniqueItem(out, seen, appliedTool);
  addUniqueItem(out, seen, declaredSkill);
  addUniqueItem(out, seen, ammo);
  return out.filter((item) => item.type !== "weapon" || sameDocument(item, usedItem));
}

function isDesignatedClashWeapon(item, payload = {}) {
  if (item?.type !== "weapon") return true;
  return sameDocument(item, payload.attackerItem) || sameDocument(item, payload.defenderItem);
}

function clashUsedStatBlocks({
  attackerItem,
  defenderItem,
  appliedTool,
  defenderAppliedTool,
  attackerSkill,
  defenderSkill,
  attackerAmmo,
  defenderAmmo,
  side = "all",
} = {}) {
  const attackerSide = usedStatBlockItems(attackerItem, appliedTool, attackerSkill, attackerAmmo);
  const defenderSide = usedStatBlockItems(defenderItem, defenderAppliedTool, defenderSkill, defenderAmmo);
  if (side === "attacker") return attackerSide;
  if (side === "defender") return defenderSide;
  return [...attackerSide, ...defenderSide];
}

function clashStartedItems({
  attacker = null,
  defender = null,
  attackerItem,
  defenderItem,
  appliedTool,
  defenderAppliedTool,
  attackerSkill,
  defenderSkill,
  attackerAmmo,
  defenderAmmo,
  side = "all",
} = {}) {
  const attackerSide = collectSideClashItems(attacker, attackerItem, appliedTool, attackerSkill, attackerAmmo);
  const defenderSide = collectSideClashItems(defender, defenderItem, defenderAppliedTool, defenderSkill, defenderAmmo);
  if (side === "attacker") return attackerSide;
  if (side === "defender") return defenderSide;
  return [...attackerSide, ...defenderSide];
}

function buildClashStartedContext(payload, item) {
  const {
    attacker = null,
    defender = null,
    clash = null,
  } = payload ?? {};

  let self = item?.actor ?? null;
  if (!self && item) {
    if (
      sameDocument(item, payload?.attackerItem)
      || sameDocument(item, payload?.appliedTool)
      || sameDocument(item, payload?.attackerSkill)
      || sameDocument(item, payload?.attackerAmmo)
    ) self = attacker;
    else if (
      sameDocument(item, payload?.defenderItem)
      || sameDocument(item, payload?.defenderAppliedTool)
      || sameDocument(item, payload?.defenderSkill)
      || sameDocument(item, payload?.defenderAmmo)
    ) self = defender;
  }
  if (!self) self = attacker;

  const target = sameActor(self, defender) ? attacker : defender;

  return {
    self,
    target,
    attacker,
    defender,
    ally: null,
    clash: clash ?? createClashContext(),
    clashStance: resolveActorClashStance(self, payload),
  };
}

function clashStartedActors({ attacker = null, defender = null, side = "all" } = {}) {
  const actors = [];
  if (side !== "defender" && attacker) actors.push(attacker);
  if (side !== "attacker" && defender) actors.push(defender);
  return actors;
}

function buildClashStartedActorContext(payload, self) {
  const { attacker = null, defender = null, clash = null } = payload ?? {};
  const target = sameActor(self, defender) ? attacker : defender;
  return {
    self,
    target,
    attacker,
    defender,
    ally: null,
    clash: clash ?? createClashContext(),
    clashStance: resolveActorClashStance(self, payload),
  };
}

function isOneSidedRetaliation(payload) {
  return String(payload?.retaliationType ?? "").toLowerCase() === "onesided";
}

function attackerWonClash({ winner, attacker } = {}) {
  return sameDocument(winner, attacker);
}

function clashWinItems({
  winner,
  attacker,
  defender,
  attackerItem,
  defenderItem,
  appliedTool,
  defenderAppliedTool,
  attackerSkill,
  defenderSkill,
  attackerAmmo,
  defenderAmmo,
} = {}) {
  return attackerWonClash({ winner, attacker })
    ? collectSideClashItems(attacker, attackerItem, appliedTool, attackerSkill, attackerAmmo)
    : collectSideClashItems(defender, defenderItem, defenderAppliedTool, defenderSkill, defenderAmmo);
}

function onHitItems({ item, appliedTool, attacker, attackerSkill, ammo }) {
  const out = [item, appliedTool, attackerSkill, ammo].filter(Boolean);
  if (attacker) out.push(...uniqueStatusItems(attacker.items));
  return out;
}

function onHitContext({ attacker, defender, clash, attackerSkill }) {
  return {
    self: attacker,
    target: defender,
    attacker: attacker ?? null,
    attackerSkill: attackerSkill ?? clash?.attackerSkill ?? null,
    ally: null,
    clash: clash ?? createClashContext(),
  };
}

function onBeingHitItems({ defender }) {
  return defender ? uniqueStatusItems(defender.items) : [];
}

function onBeingHitContext({ attacker, defender, clash, attackerSkill }) {
  if (!defender) return null;
  return {
    self: defender,
    target: attacker ?? null,
    attacker: attacker ?? null,
    attackerSkill: attackerSkill ?? clash?.attackerSkill ?? null,
    ally: null,
    clash: clash ?? createClashContext(),
  };
}

function clashLoseItems({
  winner,
  attacker,
  defender,
  attackerItem,
  defenderItem,
  appliedTool,
  defenderAppliedTool,
  attackerSkill,
  defenderSkill,
  attackerAmmo,
  defenderAmmo,
  retaliationType,
} = {}) {
  if (isOneSidedRetaliation({ retaliationType })) return [];
  return attackerWonClash({ winner, attacker })
    ? collectSideClashItems(defender, defenderItem, defenderAppliedTool, defenderSkill, defenderAmmo)
    : collectSideClashItems(attacker, attackerItem, appliedTool, attackerSkill, attackerAmmo);
}

function buildClashWinContext(payload = {}) {
  const { winner, loser, attacker, defender, attackerRoll, defenderRoll, clash } = payload;
  return {
    self: winner,
    target: loser,
    attacker: attacker ?? null,
    defender: defender ?? null,
    ally: null,
    clash: clash ?? createClashContext(attackerRoll, defenderRoll),
    clashStance: resolveActorClashStance(winner, payload),
  };
}

function buildClashLoseContext(payload = {}) {
  if (isOneSidedRetaliation(payload)) return null;
  const { winner, loser, attacker, defender, attackerRoll, defenderRoll, clash } = payload;
  return {
    self: loser,
    target: winner,
    attacker: attacker ?? null,
    defender: defender ?? null,
    ally: null,
    // margin from loser's POV
    clash: clash
      ? { ...clash, margin: (defenderRoll ?? 0) - (attackerRoll ?? 0) }
      : createClashContext(defenderRoll, attackerRoll),
    clashStance: resolveActorClashStance(loser, payload),
  };
}

function clashStartedActorContexts(payload) {
  return clashStartedActors(payload).map((actor) => ({
    actor,
    context: buildClashStartedActorContext(payload, actor),
  }));
}

// ── Trigger definitions ───────────────────────────────────────────────────────
//
// Each entry:
//   hook         — Foundry hook name (native or custom pmttrpg.*)
//   triggerName  — the [Trigger Name] string in EasyEffects source
//   getItems     — (payload) => Item[]
//   buildContext — (payload, item?) => { self, target, ally, clash } | null
//   (registry adds `item` per effect Item before execute)

const TRIGGER_HOOKS = [

  // ── [On Clash] ──────────────────────────────────────────────────────────────
  // Fires when a clash begins, for both parties' items.
  {
    hook: "pmttrpg.clashStarted",
    triggerName: "On Clash",
    getItems: clashStartedItems,
    buildContext: buildClashStartedContext,
    getActorContexts: clashStartedActorContexts,
  },
  // ── [On Clash Start] ────────────────────────────────────────────────────────
  // Alias for [On Clash] — kept separate so authors can distinguish
  // "setup" effects (On Clash Start) from "resolution" effects (Clash Win/Lose).
  {
    hook: "pmttrpg.clashStarted",
    triggerName: "On Clash Start",
    getItems: clashStartedItems,
    buildContext: buildClashStartedContext,
    getActorContexts: clashStartedActorContexts,
  },

  // ── [Clash Win] ─────────────────────────────────────────────────────────────
  {
    hook: "pmttrpg.clashResolved",
    triggerName: "Clash Win",
    getItems: clashWinItems,
    buildContext: buildClashWinContext,
  },
  // ── [On Clash Win] ──────────────────────────────────────────────────────────
  {
    hook: "pmttrpg.clashResolved",
    triggerName: "On Clash Win",
    getItems: clashWinItems,
    buildContext: buildClashWinContext,
  },

  // ── [Clash Lose] ────────────────────────────────────────────────────────────
  {
    hook: "pmttrpg.clashResolved",
    triggerName: "Clash Lose",
    getItems: clashLoseItems,
    buildContext: buildClashLoseContext,
  },
  // ── [On Clash Lose] ─────────────────────────────────────────────────────────
  {
    hook: "pmttrpg.clashResolved",
    triggerName: "On Clash Lose",
    getItems: clashLoseItems,
    buildContext: buildClashLoseContext,
  },

  // ── [On Hit] / [On Hit Before Results] ──────────────────────────────────────
  {
    hook: "pmttrpg.attackConnected",
    triggerName: "On Hit",
    getItems: onHitItems,
    buildContext: onHitContext,
  },
  {
    hook: "pmttrpg.hitBeforeResults",
    triggerName: "On Hit Before Results",
    getItems: onHitItems,
    buildContext: onHitContext,
  },

  // ── [On Being Hit] / [On Being Hit Before Results] ──────────────────────────
  {
    hook: "pmttrpg.attackConnected",
    triggerName: "On Being Hit",
    getItems: onBeingHitItems,
    buildContext: onBeingHitContext,
  },
  {
    hook: "pmttrpg.hitBeforeResults",
    triggerName: "On Being Hit Before Results",
    getItems: onBeingHitItems,
    buildContext: onBeingHitContext,
  },

  // ── [On Clash Win Before Results] ───────────────────────────────────────────
  {
    hook: "pmttrpg.clashBeforeResults",
    triggerName: "On Clash Win Before Results",
    getItems: clashWinItems,
    buildContext: buildClashWinContext,
  },
  {
    hook: "pmttrpg.clashBeforeResults",
    triggerName: "Clash Win Before Results",
    getItems: clashWinItems,
    buildContext: buildClashWinContext,
  },
  {
    hook: "pmttrpg.clashBeforeResults",
    triggerName: "Before Clash Results",
    getItems: clashWinItems,
    buildContext: buildClashWinContext,
  },

  // ── [On Damage Calc] ────────────────────────────────────────────────────────
  // Fires during damage calculation. Effects here write into clash.bonuses,
  // which your damage-calc code reads immediately after.
  {
    hook: "pmttrpg.damageCalc",
    triggerName: "On Damage Calc",
    getItems: ({ attackerItem, appliedTool, attackerSkill, attackerAmmo }) =>
      [attackerItem, appliedTool, attackerSkill, attackerAmmo].filter(Boolean),
    buildContext: ({ attacker, defender, clash }) => ({
      self:   attacker,
      target: defender,
      ally:   null,
      clash:  clash ?? createClashContext(),
    }),
  },

  // ── [On Use] ────────────────────────────────────────────────────────────────
  {
    hook: "pmttrpg.toolUsed",
    triggerName: "On Use",
    getItems: ({ item }) => item ? [item] : [],
    buildContext: ({ actor, target }) => ({
      self:   actor,
      target: target ?? null,
      ally:   null,
      clash:  null,
    }),
  },
  {
    hook: "pmttrpg.clashStarted",
    triggerName: "On Use",
    getItems: clashUsedStatBlocks,
    buildContext: buildClashStartedContext,
    getActorContexts: () => [],
  },

  // ── [On Action] ─────────────────────────────────────────────────────────────
  // Fires whenever the actor uses an action or reaction with this item.
  {
    hook: "pmttrpg.actorAction",
    triggerName: "On Action",
    getItems: ({ actor, item }) => {
      if (item) return [item];
      if (!actor) return [];
      return [...getEquippedItems(actor), ...uniqueStatusItems(actor.items)];
    },
    buildContext: ({ actor, target }) => {
      if (!actor) return null;
      return {
        self:   actor,
        target: target ?? null,
        ally:   null,
        clash:  null,
      };
    },
  },

  // ── [On Stagger] ────────────────────────────────────────────────────────────
  {
    hook: "pmttrpg.actorStaggered",
    triggerName: "On Stagger",
    getItems: ({ actor }) => getEquippedItems(actor),
    buildContext: ({ actor, attacker }) => ({
      self:   actor,
      target: attacker ?? null,
      ally:   null,
      clash:  null,
    }),
  },

  // ── [On Applied] ────────────────────────────────────────────────────────────
  // Fires when the status effect is applied.
  {
    hook: "pmttrpg.statusApplied",
    triggerName: "On Applied",
    getItems: ({ item }) => item ? [item] : [],
    buildContext: ({ actor }) => ({
      self:   actor,
      target: null,
      ally:   null,
      clash:  null,
    }),
  },

  // ── [On Gain] ───────────────────────────────────────────────────────────────
  {
    hook: "pmttrpg.statusGained",
    triggerName: "On Gain",
    getItems: ({ item }) => item ? [item] : [],
    buildContext: ({ actor, before, after, amount }) => ({
      self: actor,
      target: null,
      ally: null,
      clash: null,
      changed: { before, after, amount },
    }),
  },

  // ── [On Lose] ───────────────────────────────────────────────────────────────
  {
    hook: "pmttrpg.statusLost",
    triggerName: "On Lose",
    getItems: ({ item }) => item ? [item] : [],
    buildContext: ({ actor, before, after, amount }) => ({
      self: actor,
      target: null,
      ally: null,
      clash: null,
      changed: { before, after, amount: -Math.abs(amount) },
    }),
  },

  // ── [On Removed] ────────────────────────────────────────────────────────────
  // Fires when the status effect is removed.
  {
    hook: "pmttrpg.statusRemoved",
    triggerName: "On Removed",
    getItems: ({ item }) => item ? [item] : [],
    buildContext: ({ actor }) => ({
      self:   actor,
      target: null,
      ally:   null,
      clash:  null,
    }),
  },

  // ── [Turn Start] ────────────────────────────────────────────────────────────
  {
    hook: "pmttrpg.turnStart",
    triggerName: "Turn Start",
    getItems: ({ actor }) => actor ? getEquippedItems(actor) : [],
    buildContext: ({ actor, combat }) => {
      if (!actor) return null;
      return { self: actor, target: null, ally: null, clash: null, combat: combat ?? null };
    },
  },

  // ── [End of Round] ──────────────────────────────────────────────────────────
  // Fired from combat.js when the round counter advances (once per combatant).
  {
    hook: "pmttrpg.endOfRound",
    triggerName: "End of Round",
    getItems: ({ actor }) => {
      if (!actor) return [];
      return [...getEquippedItems(actor), ...uniqueStatusItems(actor.items)];
    },
    buildContext: ({ actor, combat }) => {
      if (!actor) return null;
      return { self: actor, target: null, ally: null, clash: null, combat: combat ?? null };
    },
  },

  // ── [Start of Round] ────────────────────────────────────────────────────────
  // Fired from combat.js when the round number increases (once per combatant).
  {
    hook: "pmttrpg.startOfRound",
    triggerName: "Start of Round",
    getItems: ({ actor }) => {
      if (!actor) return [];
      return [...getEquippedItems(actor), ...uniqueStatusItems(actor.items)];
    },
    buildContext: ({ actor, combat }) => {
      if (!actor) return null;
      return { self: actor, target: null, ally: null, clash: null, combat: combat ?? null };
    },
  },

  // ── [On Move] ───────────────────────────────────────────────────────────────
  {
    hook: "pmttrpg.tokenMoved",
    triggerName: "On Move",
    getItems: ({ actor }) => {
      if (!actor) return [];
      return [...getEquippedItems(actor), ...uniqueStatusItems(actor.items)];
    },
    buildContext: ({ actor, moved }) => {
      if (!actor) return null;
      return {
        self: actor,
        target: null,
        ally: null,
        clash: null,
        moved: moved ?? null,
      };
    },
  },

];

// Prevent hook listeners from rerunning awaited emitters.
let _emittingAttackConnected = false;
let _emittingClashStarted = false;
let _emittingClashResolved = false;
let _emittingClashBeforeResults = false;
let _emittingHitBeforeResults = false;
let _emittingActorAction = false;
let _emittingTokenMoved = false;

async function runActorScriptsForDef(def, payload) {
  let entries;
  if (def.getActorContexts) {
    entries = def.getActorContexts(payload) ?? [];
  } else {
    const context = def.buildContext(payload, null);
    entries = context?.self ? [{ actor: context.self, context }] : [];
  }

  const seen = new Set();
  for (const entry of entries) {
    const actor = entry?.actor;
    if (!actor || !entry.context || seen.has(actor.id)) continue;
    seen.add(actor.id);
    try {
      await runActorEasyEffects(actor, def.triggerName, entry.context);
    } catch (err) {
      console.error(`[EasyEffects] Actor script ${def.triggerName} failed on '${actor.name}':`, err);
    }
  }
}

// ── Hook registration ─────────────────────────────────────────────────────────

/**
 * Call once during system init:
 *   Hooks.once("init", () => registerEasyEffectsHooks());
 */
export function registerEasyEffectsHooks() {
  for (const def of TRIGGER_HOOKS) {
    Hooks.on(def.hook, async (...hookArgs) => {
      if (def.hook === "pmttrpg.attackConnected" && _emittingAttackConnected) return;
      if (def.hook === "pmttrpg.clashStarted" && _emittingClashStarted) return;
      if (def.hook === "pmttrpg.clashResolved" && _emittingClashResolved) return;
      if (def.hook === "pmttrpg.clashBeforeResults" && _emittingClashBeforeResults) return;
      if (def.hook === "pmttrpg.hitBeforeResults" && _emittingHitBeforeResults) return;
      if (def.hook === "pmttrpg.actorAction" && _emittingActorAction) return;
      if (def.hook === "pmttrpg.tokenMoved" && _emittingTokenMoved) return;

      const payload = hookArgs[0] ?? {};
      const items = def.getItems(payload);
      for (const item of items) {
        if (
          (def.hook === "pmttrpg.clashStarted"
            || def.hook === "pmttrpg.clashResolved"
            || def.hook === "pmttrpg.clashBeforeResults")
          && !isDesignatedClashWeapon(item, payload)
        ) continue;
        const context = def.buildContext(payload, item);
        if (!context) continue;
        await runItemEasyEffects(item, def.triggerName, context);
      }
      await runActorScriptsForDef(def, payload);
    });
  }

  console.log(
    "[EasyEffects] Registered triggers:",
    [...new Set(TRIGGER_HOOKS.map(d => d.triggerName))].join(", ")
  );
}

/**
 * @param {Item} item
 * @param {string} triggerName
 * @param {object} context
 * @returns {Promise<boolean>} true if a script ran
 */
export async function runItemEasyEffects(item, triggerName, context = {}) {
  if (!item || !triggerName) return false;
  // Pending statuses do not run scripts.
  if (isPendingStatus(item)) return false;
  const ast = getAST(item);
  if (!ast) return false;
  await execute(ast, triggerName, { ...context, item });
  return true;
}

/**
 * @param {object} payload
 * @returns {Promise<void>}
 */
export async function emitActorAction(payload) {
  _emittingActorAction = true;
  try {
    const eeDefs = TRIGGER_HOOKS.filter((d) => d.hook === "pmttrpg.actorAction");
    for (const def of eeDefs) {
      const items = def.getItems(payload);
      for (const item of items) {
        const context = def.buildContext(payload, item);
        if (!context) continue;
        try {
          await runItemEasyEffects(item, def.triggerName, context);
        } catch (err) {
          console.error(
            `[EasyEffects] ${def.triggerName} failed on '${item?.name}':`,
            err
          );
        }
      }
      await runActorScriptsForDef(def, payload);
    }
    Hooks.callAll("pmttrpg.actorAction", payload);
  } finally {
    _emittingActorAction = false;
  }
}

/**
 * @param {object} payload
 * @returns {Promise<void>}
 */
export async function emitTokenMoved(payload) {
  _emittingTokenMoved = true;
  try {
    const eeDefs = TRIGGER_HOOKS.filter((d) => d.hook === "pmttrpg.tokenMoved");
    for (const def of eeDefs) {
      const items = def.getItems(payload);
      for (const item of items) {
        const context = def.buildContext(payload, item);
        if (!context) continue;
        try {
          await runItemEasyEffects(item, def.triggerName, context);
        } catch (err) {
          console.error(
            `[EasyEffects] ${def.triggerName} failed on '${item?.name}':`,
            err
          );
        }
      }
      await runActorScriptsForDef(def, payload);
    }
    Hooks.callAll("pmttrpg.tokenMoved", payload);
  } finally {
    _emittingTokenMoved = false;
  }
}

/**
 * @param {object} payload
 * @returns {Promise<void>}
 */
export async function emitAttackConnected(payload) {
  _emittingAttackConnected = true;
  try {
    const eeDefs = TRIGGER_HOOKS.filter((d) => d.hook === "pmttrpg.attackConnected");
    for (const def of eeDefs) {
      const items = def.getItems(payload);
      for (const item of items) {
        const context = def.buildContext(payload, item);
        if (!context) continue;
        try {
          await runItemEasyEffects(item, def.triggerName, context);
        } catch (err) {
          console.error(
            `[EasyEffects] ${def.triggerName} failed on '${item?.name}':`,
            err
          );
        }
      }
      await runActorScriptsForDef(def, payload);
    }
    Hooks.callAll("pmttrpg.attackConnected", payload);
  } finally {
    _emittingAttackConnected = false;
  }
}

/**
 * @param {object} payload
 * @param {"attacker"|"defender"|"all"} [payload.side="all"]
 * @returns {Promise<object>} the clash context (same reference as payload.clash)
 */
export async function emitClashStarted(payload = {}) {
  const clash = payload.clash ?? createClashContext();
  const full = { ...payload, clash, side: payload.side ?? "all" };

  _emittingClashStarted = true;
  try {
    const eeDefs = TRIGGER_HOOKS.filter((d) => d.hook === "pmttrpg.clashStarted");
    for (const def of eeDefs) {
      for (const item of def.getItems(full)) {
        if (!isDesignatedClashWeapon(item, full)) continue;
        const context = def.buildContext(full, item);
        if (!context) continue;
        try {
          await runItemEasyEffects(item, def.triggerName, context);
        } catch (err) {
          console.error(
            `[EasyEffects] ${def.triggerName} failed on '${item?.name}':`,
            err
          );
        }
      }
      await runActorScriptsForDef(def, full);
    }
    Hooks.callAll("pmttrpg.clashStarted", full);
  } finally {
    _emittingClashStarted = false;
  }

  return clash;
}

/**
 * Pause resolves before [On Being Hit] burst checks.
 * @param {object} payload
 * @returns {Promise<void>}
 */
export async function emitClashResolved(payload = {}, { fireHook = true } = {}) {
  const clash = payload.clash;
  _emittingClashResolved = true;
  try {
    const eeDefs = TRIGGER_HOOKS.filter((d) => d.hook === "pmttrpg.clashResolved");
    for (const def of eeDefs) {
      for (const item of def.getItems(payload)) {
        if (!isDesignatedClashWeapon(item, payload)) continue;
        const context = def.buildContext(payload, item);
        if (!context) continue;
        const instantNames = instantNamesForUsedItem(item, payload);
        if (clash) {
          clash.statusApplyFilter = instantNames.size
            ? instantStatusFilter(instantNames, "except")
            : null;
        }
        try {
          await runItemEasyEffects(item, def.triggerName, context);
        } catch (err) {
          console.error(
            `[EasyEffects] ${def.triggerName} failed on '${item?.name}':`,
            err
          );
        } finally {
          if (clash) clash.statusApplyFilter = null;
        }
      }
      await runActorScriptsForDef(def, payload);
    }
    if (fireHook) Hooks.callAll("pmttrpg.clashResolved", payload);
  } finally {
    _emittingClashResolved = false;
    if (clash) clash.statusApplyFilter = null;
  }
}

function sideUsedClashKit(payload = {}, side) {
  if (side === "attacker") {
    return usedStatBlockItems(payload.attackerItem, payload.appliedTool, payload.attackerSkill, payload.attackerAmmo);
  }
  if (side === "defender") {
    return usedStatBlockItems(payload.defenderItem, payload.defenderAppliedTool, payload.defenderSkill, payload.defenderAmmo);
  }
  return [];
}

function usedKitSideOfItem(item, payload = {}) {
  if (!item) return null;
  if (sideUsedClashKit(payload, "attacker").some((it) => sameDocument(it, item))) return "attacker";
  if (sideUsedClashKit(payload, "defender").some((it) => sameDocument(it, item))) return "defender";
  return null;
}

function instantNamesForUsedItem(item, payload = {}) {
  const side = usedKitSideOfItem(item, payload);
  if (!side) return new Set();
  return collectInstantStatusNames(sideUsedClashKit(payload, side));
}

function collectInstantStatusNames(items) {
  const names = new Set();
  for (const item of items ?? []) {
    const ast = getAST(item);
    if (!ast) continue;
    for (const block of ast.blocks) {
      if (block.trigger !== "Always Active") continue;
      for (const stmt of block.statements ?? []) {
        if (stmt.polarity === "negative") continue;
        for (const action of stmt.actions ?? []) {
          if (action.verb !== "instant") continue;
          const raw = action.argument;
          const list = Array.isArray(raw) ? raw : [raw];
          for (const name of list) {
            const key = String(name ?? "").trim().toLowerCase();
            if (key) names.add(key);
          }
        }
      }
    }
  }
  return names;
}

const INSTANT_STATUS_VERBS = ["add", "set"];

function instantStatusFilter(names, mode) {
  return {
    mode,
    names,
    verbs: INSTANT_STATUS_VERBS,
    forceLive: mode === "only",
  };
}

/** Clash Win/Lose gain/inflict/set of Instant-tagged statuses on the used kit only. */
async function applyInstantClashStatuses(payload) {
  const clash = payload?.clash;
  if (!clash) return;
  const eeDefs = TRIGGER_HOOKS.filter((d) => d.hook === "pmttrpg.clashResolved");
  for (const def of eeDefs) {
    for (const item of def.getItems(payload)) {
      if (!isDesignatedClashWeapon(item, payload)) continue;
      const names = instantNamesForUsedItem(item, payload);
      if (!names.size) continue;
      const context = def.buildContext(payload, item);
      if (!context) continue;
      clash.statusApplyFilter = instantStatusFilter(names, "only");
      try {
        await runItemEasyEffects(item, def.triggerName, context);
      } catch (err) {
        console.error(`[EasyEffects] instant ${def.triggerName} failed on '${item?.name}':`, err);
      } finally {
        clash.statusApplyFilter = null;
      }
    }
  }
}

async function emitNamedHook(hookName, payload, { fireHook = true } = {}) {
  if (hookName === "pmttrpg.clashBeforeResults") _emittingClashBeforeResults = true;
  if (hookName === "pmttrpg.hitBeforeResults") _emittingHitBeforeResults = true;
  try {
    const eeDefs = TRIGGER_HOOKS.filter((d) => d.hook === hookName);
    for (const def of eeDefs) {
      const items = def.getItems(payload) ?? [];
      for (const item of items) {
        if (
          hookName === "pmttrpg.clashBeforeResults"
          && !isDesignatedClashWeapon(item, payload)
        ) continue;
        const context = def.buildContext(payload, item);
        if (!context) continue;
        try {
          await runItemEasyEffects(item, def.triggerName, context);
        } catch (err) {
          console.error(`[EasyEffects] ${def.triggerName} failed on '${item?.name}':`, err);
        }
      }
      await runActorScriptsForDef(def, payload);
    }
    if (fireHook) Hooks.callAll(hookName, payload);
  } finally {
    if (hookName === "pmttrpg.clashBeforeResults") _emittingClashBeforeResults = false;
    if (hookName === "pmttrpg.hitBeforeResults") _emittingHitBeforeResults = false;
  }
}

/**
 * Always Active `instant <Status>` on the used weapon/tool/skill/ammo copies that
 * side's matching Clash Result gain/inflict/set live first, then
 * [On Clash Win Before Results], then Specified status, then one Clash Win/Lose pass
 * that skips those applies on the Instant kit only.
 */
export async function emitClashOutcome(resolvedPayload, hitPayload = null) {
  await applyInstantClashStatuses(resolvedPayload);

  await emitNamedHook("pmttrpg.clashBeforeResults", resolvedPayload);

  if (hitPayload) {
    await emitNamedHook("pmttrpg.hitBeforeResults", hitPayload);
  }

  await emitClashResolved(resolvedPayload);
}

const BURST_NEST_MAX_DEPTH = 8;

function usedSkillsFromContext({
  sourceItem = null,
  attackerSkill = null,
  defenderSkill = null,
  clash = null,
} = {}) {
  return [sourceItem, attackerSkill, defenderSkill, clash?.attackerSkill, clash?.defenderSkill]
    .filter((item) => item?.type === "skill");
}

function collectUsedSkills(owner, usedSkills) {
  if (!owner) return [];
  const out = [];
  const seen = new Set();
  for (const item of usedSkills ?? []) {
    if (item?.type !== "skill") continue;
    const key = itemIdentityKey(item);
    if (!key || seen.has(key)) continue;
    if (!itemBelongsToActor(item, owner)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function collectBurstListenerItems(burster, burstee, skipItem, usedSkills = []) {
  const out = [];
  const seen = new Set();
  const skipItemKey = itemIdentityKey(skipItem);
  for (const owner of uniqueBurstOwners(burster, burstee)) {
    if (!owner?.items) continue;
    for (const item of [
      ...getEquippedItems(owner).filter((i) => i.type !== "skill"),
      ...collectUsedSkills(owner, usedSkills),
      ...uniqueStatusItems(owner.items),
    ]) {
      if (!rememberBurstListenerItem(seen, item, skipItemKey)) continue;
      out.push({ item, owner });
    }
  }
  return out;
}

// ── [On Burst] ────────────────────────────────────────────────────────────────
// Fires when a Rupture/Tremor/other burst triggers.
// Burst state lives on context.burst (status / amount / before / after).

/**
 * @param {{
 *   statusName: string,
 *   actor: Actor,
 *   burster?: Actor|null,
 *   attacker?: Actor|null,
 *   clash?: object|null,
 *   sourceItem?: Item|null,
 *   depth?: number,
 * }} opts
 * @returns {Promise<boolean>}
 */
export async function emitStatusBurst({
  statusName,
  actor,
  burster = null,
  attacker = null,
  clash = null,
  sourceItem = null,
  attackerSkill = null,
  defenderSkill = null,
  depth = 0,
} = {}) {
  const name = String(statusName ?? "").trim();
  const burstee = actor;
  if (!burstee || !name) return false;

  if (depth >= BURST_NEST_MAX_DEPTH) {
    console.warn(
      `[EasyEffects] Skipping burst ${name} (depth ${depth}): nested bursts exceeded limit`
    );
    return false;
  }

  const statusItem = findStatusItem(burstee, name);
  if (!statusItem) {
    console.warn(`[EasyEffects] burst '${name}': no status item on ${burstee.name}`);
    return false;
  }

  const stacksBefore = Number(burstee.getStatusStacks?.(name) ?? statusItem.system?.stacks ?? 0) || 0;
  if (stacksBefore <= 0) return false;

  const burst = {
    status: statusItem.name || name,
    amount: stacksBefore,
    before: stacksBefore,
    after: null,
  };

  const resolvedAttackerSkill = attackerSkill ?? clash?.attackerSkill ?? null;
  const resolvedDefenderSkill = defenderSkill ?? clash?.defenderSkill ?? null;

  const localCtx = {
    self: burstee,
    target: burstee,
    attacker: attacker ?? null,
    burster: burster ?? null,
    burstee,
    attackerSkill: resolvedAttackerSkill,
    defenderSkill: resolvedDefenderSkill,
    ally: null,
    clash: clash ?? null,
    item: statusItem,
    burst,
    burstPhase: "local",
    _burstDepth: depth + 1,
  };

  try {
    await runItemEasyEffects(statusItem, "On Burst", localCtx);
  } catch (err) {
    console.error(`[EasyEffects] Local burst failed on '${statusItem.name}':`, err);
  }

  await runActorEasyEffects(burstee, "On Burst", {
    ...localCtx,
    item: null,
    _actorBurstLocal: true,
  });

  burst.after = Number(burstee.getStatusStacks?.(name) ?? 0) || 0;

  const usedSkills = usedSkillsFromContext({
    sourceItem,
    attackerSkill: resolvedAttackerSkill,
    defenderSkill: resolvedDefenderSkill,
    clash,
  });
  const listeners = collectBurstListenerItems(burster, burstee, statusItem, usedSkills);
  for (const { item, owner } of listeners) {
    const globalCtx = {
      self: owner,
      target: burstee,
      attacker: attacker ?? null,
      burster: burster ?? null,
      burstee,
      attackerSkill: resolvedAttackerSkill,
      defenderSkill: resolvedDefenderSkill,
      ally: null,
      clash: clash ?? null,
      item,
      burst: { ...burst },
      burstPhase: "global",
      _burstDepth: depth + 1,
    };
    try {
      await runItemEasyEffects(item, "On Burst", globalCtx);
    } catch (err) {
      console.error(`[EasyEffects] Global On ${burst.status} Burst failed on '${item?.name}':`, err);
    }
  }

  for (const owner of uniqueBurstOwners(burster, burstee)) {
    await runActorEasyEffects(owner, "On Burst", {
      self: owner,
      target: burstee,
      attacker: attacker ?? null,
      burster: burster ?? null,
      burstee,
      attackerSkill: resolvedAttackerSkill,
      defenderSkill: resolvedDefenderSkill,
      ally: null,
      clash: clash ?? null,
      item: null,
      burst: { ...burst },
      burstPhase: "global",
      _burstDepth: depth + 1,
    });
  }

  Hooks.callAll("pmttrpg.burstTriggered", {
    actor: burstee,
    target: burstee,
    attacker: attacker ?? null,
    burster: burster ?? null,
    burstee,
    statusName: burst.status,
    burst,
    item: statusItem,
    sourceItem: sourceItem ?? null,
    clash: clash ?? null,
  });

  return true;
}

const PROC_NEST_MAX_DEPTH = 8;

// ── [On <Proc>] ───────────────────────────────────────────────────────────────
// Dynamic trigger: `On ${procName}` (e.g. On Tremor).

/**
 * @param {{
 *   procName: string,
 *   focusActor: Actor,
 *   proccer?: Actor|null,
 *   attacker?: Actor|null,
 *   target?: Actor|null,  // listener `target` role
 *   clash?: object|null,
 *   sourceItem?: Item|null,
 *   binds?: Record<string, unknown>,
 *   depth?: number,
 * }} opts
 * @returns {Promise<boolean>}
 */
export async function emitProc({
  procName,
  focusActor,
  proccer = null,
  attacker = null,
  target = null,
  clash = null,
  sourceItem = null,
  attackerSkill = null,
  defenderSkill = null,
  binds = {},
  depth = 0,
} = {}) {
  const name = String(procName ?? "").trim();
  if (!focusActor || !name) return false;

  if (depth >= PROC_NEST_MAX_DEPTH) {
    console.warn(
      `[EasyEffects] Skipping proc ${name} (depth ${depth}): nested procs exceeded limit`
    );
    return false;
  }

  const triggerName = `On ${name}`;
  const proc = {
    name,
    binds: { ...(binds && typeof binds === "object" ? binds : {}) },
  };

  const clashTarget = target ?? null;
  const statusItem = findStatusItem(focusActor, name);

  if (statusItem) {
    const localCtx = {
      self: focusActor,
      target: clashTarget,
      attacker: attacker ?? null,
      ally: null,
      clash: clash ?? null,
      item: statusItem,
      proc: { ...proc, binds: { ...proc.binds } },
      _procDepth: depth + 1,
    };
    try {
      await runItemEasyEffects(statusItem, triggerName, localCtx);
    } catch (err) {
      console.error(`[EasyEffects] Local proc failed on '${statusItem.name}':`, err);
    }
    await runActorEasyEffects(focusActor, triggerName, { ...localCtx, item: null });
  }

  const listeners = collectBurstListenerItems( proccer, focusActor, statusItem, usedSkillsFromContext({ sourceItem, attackerSkill, defenderSkill, clash }) );
  for (const { item, owner } of listeners) {
    const globalCtx = {
      self: owner,
      target: clashTarget,
      attacker: attacker ?? null,
      ally: null,
      clash: clash ?? null,
      item,
      proc: { ...proc, binds: { ...proc.binds } },
      _procDepth: depth + 1,
    };
    try {
      await runItemEasyEffects(item, triggerName, globalCtx);
    } catch (err) {
      console.error(`[EasyEffects] Global ${triggerName} failed on '${item?.name}':`, err);
    }
  }

  const globalOwners = [proccer, focusActor].filter(Boolean);
  const seenOwners = new Set();
  for (const owner of globalOwners) {
    const ownerKey = actorIdentityKey(owner);
    if (!ownerKey || seenOwners.has(ownerKey)) continue;
    seenOwners.add(ownerKey);
    if (statusItem && sameActor(owner, focusActor)) continue;
    await runActorEasyEffects(owner, triggerName, {
      self: owner,
      target: clashTarget,
      attacker: attacker ?? null,
      ally: null,
      clash: clash ?? null,
      item: null,
      proc: { ...proc, binds: { ...proc.binds } },
      _procDepth: depth + 1,
    });
  }

  Hooks.callAll("pmttrpg.procTriggered", {
    procName: name,
    proc,
    focus: focusActor,
    proccer: proccer ?? null,
    attacker: attacker ?? null,
    target: clashTarget,
    item: statusItem ?? null,
    sourceItem: sourceItem ?? null,
    clash: clash ?? null,
  });

  return true;
}

function findStatusItem(actor, statusName) {
  const want = String(statusName).trim().toLowerCase();
  if (!want) return null;
  return uniqueStatusItems(actor.items).find(
    (i) => String(i.name ?? "").trim().toLowerCase() === want
  ) ?? null;
}

// ── [Always Active] integration ───────────────────────────────────────────────

/**
 * Call at the END of _prepareCharacterData(), after all base values are set.
 * Iterates all equipped items, runs their [Always Active] blocks synchronously,
 * and returns a merged modifier object.
 *
 * Combat dice (power / max) from weapons and outfits stay on that item
 * (see getItemAlwaysActiveCombatMods).
 *
 * Usage in actor.js:
 *
 *   // At the end of _prepareCharacterData():
 *   const eeMods = applyAlwaysActiveModifiers(actorData);
 *   data.attributes.attackModifier.value  += eeMods.attackPower;
 *   data.attributes.evadeModifier.value   += eeMods.evadePower;
 *   data.attributes.blockModifier.value   += eeMods.blockPower;
 *   applyResourceModsToSystem(data, eeMods);
 *
 * @param {ActorPMTTRPG} actor
 * @returns {object} merged modifier object
 */
export function applyAlwaysActiveModifiers(actor) {
  const merged = emptyAlwaysActiveMods();

  const actorAst = getActorAST(actor);
  if (actorAst?.blocks.some(b => b.trigger === "Always Active")) {
    mergeAlwaysActiveMods(
      merged,
      executeAlwaysActive(actorAst, { self: actor, item: null }),
      actor.name || actor.id
    );
  }

  for (const item of actor.items) {
    const isStatus = item.type === "status";
    if (!isStatus && !["weapon", "outfit", "augment", "skill", "tool"].includes(item.type)) continue;
    if (isStatus) {
      if (isPendingStatus(item)) continue;
    } else if (!itemIsLoadoutActive(item, actor)) {
      continue;
    }

    const ast = getAST(item);
    if (!ast) continue;

    // Check if this item even has an [Always Active] block before running
    const hasAlwaysActive = ast.blocks.some(b => b.trigger === "Always Active");
    if (!hasAlwaysActive) continue;

    const mods = executeAlwaysActive(ast, { self: actor, item });
    const toMerge = (item.type === "weapon" || item.type === "outfit")
      ? zeroCombatDiceMods(mods)
      : mods;
    mergeAlwaysActiveMods(merged, toMerge, item.name || item.id);
  }

  return merged;
}

/**
 * Always Active power / dice max on this weapon or outfit only.
 * @param {Item} item
 * @param {Actor} [actor]
 * @returns {Record<string, number>}
 */
export function getItemAlwaysActiveCombatMods(item, actor) {
  if (!item) return pickCombatDiceMods();
  const ast = getAST(item);
  if (!ast?.blocks.some(b => b.trigger === "Always Active")) return pickCombatDiceMods();
  const self = actor?.system ? actor : (item.actor ?? null);
  if (!self) return pickCombatDiceMods();
  return pickCombatDiceMods(executeAlwaysActive(ast, { self, item }));
}

function mergeAlwaysActiveMods(merged, mods, sourceName) {
  for (const key of Object.keys(mods)) {
    if (key === "overrides") {
      for (const [k, v] of Object.entries(mods.overrides ?? {})) {
        const n = Math.max(0, Math.round(Number(v) || 0));
        const cur = merged.overrides[k];
        if (cur === undefined || n < cur) {
          merged.overrides[k] = n;
          merged.overrideSources[k] = [sourceName];
        } else if (n === cur) {
          const list = merged.overrideSources[k] ?? (merged.overrideSources[k] = []);
          if (!list.includes(sourceName)) list.push(sourceName);
        }
      }
      continue;
    }
    if (key === "overrideSources") continue;
    if (key === "resistanceOverrideSources") continue;
    if (key === "resistanceOverrides") {
      if (!merged.resistanceOverrides) merged.resistanceOverrides = {};
      if (!merged.resistanceOverrideSources) merged.resistanceOverrideSources = {};
      for (const [cell, level] of Object.entries(mods.resistanceOverrides ?? {})) {
        const next = normalizeResistanceLevel(level);
        if (!next) continue;
        const cur = normalizeResistanceLevel(merged.resistanceOverrides[cell]);
        const nextMult = RESISTANCE_MULTIPLIERS[next] ?? 1;
        const curMult = cur != null ? (RESISTANCE_MULTIPLIERS[cur] ?? 1) : -Infinity;
        if (cur == null || nextMult > curMult) {
          merged.resistanceOverrides[cell] = next;
          merged.resistanceOverrideSources[cell] = [sourceName];
        } else if (nextMult === curMult) {
          const list = merged.resistanceOverrideSources[cell]
            ?? (merged.resistanceOverrideSources[cell] = []);
          if (!list.includes(sourceName)) list.push(sourceName);
        }
      }
      continue;
    }
    merged[key] = (merged[key] ?? 0) + (mods[key] ?? 0);
  }
}

// ── [On Depleted] runner ──────────────────────────────────────────────────────
// World/Actor EasyEffects first, then unique active Statuses.
const _depletingPools = new Set();

/**
 * @param {Actor} actor
 * @param {{ pool: string, before: number, max: number }} depleted
 */
export async function runDepletedEasyEffects(actor, depleted) {
  if (!actor || !depleted?.pool) return;

  const key = `${actorIdentityKey(actor)}:${depleted.pool}`;
  if (_depletingPools.has(key)) return;
  _depletingPools.add(key);
  try {
    const context = {
      self: actor,
      target: null,
      ally: null,
      clash: null,
      depleted,
    };
    await runActorEasyEffects(actor, "On Depleted", context);
    for (const item of uniqueStatusItems(actor.items)) {
      await runItemEasyEffects(item, "On Depleted", context);
    }
  } finally {
    _depletingPools.delete(key);
  }
}

// ── [On Taking Damage] runner ─────────────────────────────────────────────────

/**
 * Fire `[On Taking Damage]` on the actor, then equipped items and live statuses.
 *
 * `applyDamage` already built `damage` and keeps using that same object.
 * Scripts can change the shared `amount`, per-pool before/after flats,
 * or convert `pool` / `damageType`. After this returns, `applyDamage`
 * applies those to each pool and posts the chat breakdown.
 *
 * @param {Actor} actor who is taking the hit
 * @param {{
 *   amount: number,
 *   pool: string|string[],
 *   source: string,
 *   damageType: string,
 *   fromAttack?: boolean,
 *   afterDeltaByPool?: Record<string, number>,
 *   beforeDeltaByPool?: Record<string, number>,
 * }} damage pending hit; mutated in place
 * @param {{ attacker?: Actor|null }} [options]
 */
export async function runOnTakingDamage(actor, damage, options = {}) {
  if (!actor || !damage) return;

  const baseCtx = {
    self: actor,
    target: options.attacker ?? null,
    attacker: options.attacker ?? null,
    ally: null,
    clash: null,
    damage,
  };

  await runActorEasyEffects(actor, "On Taking Damage", baseCtx);

  const items = [
    ...getEquippedItems(actor),
    ...uniqueStatusItems(actor.items),
  ];
  const seen = new Set();
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    await runItemEasyEffects(item, "On Taking Damage", baseCtx);
  }

  Hooks.callAll("pmttrpg.takingDamage", { actor, damage, attacker: options.attacker ?? null });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns all equipped weapons, outfits, skills, tools, and augments on an actor.
 */
function getEquippedItems(actor) {
  return actor.items.filter(i => {
    if (!["weapon", "outfit", "skill", "augment", "tool"].includes(i.type)) return false;
    return itemIsLoadoutActive(i, actor);
  });
}
