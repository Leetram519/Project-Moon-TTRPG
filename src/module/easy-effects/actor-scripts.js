import { parse }   from "./parser.js";
import { execute } from "./interpreter.js";

export const SYSTEM_ID = "projectmoonttrpg";
export const WORLD_SCRIPT_SETTING = "worldEasyEffects";

export const DEFAULT_WORLD_EASY_EFFECTS = `
# CR 3.x: at 0 ST you are Staggered until the end of the Next Round.
[On Depleted ST]
inflict Staggered on self;

# CR 3.x: at 0 HP you leave combat.
[On Depleted HP]
inflict Defeated on self;

# CR 3.x: at 0 SP you roll 1d4 for the Panic type.
[On Depleted SP]
roll 1d4 as panic;
require (panic) == 1 then inflict "Panic [Fight]" on self;
require (panic) == 2 then inflict "Panic [Flight]" on self;
require (panic) == 3 then inflict "Panic [Fawn]" on self;
require (panic) == 4 then inflict "Panic [Freeze]" on self;

# CR 3.x : Clear overcharge flags on self at combat end.
[On Combat End]
clear flag "charge_decision" on self;
clear flag "overcharge_enabled" on self;
clear flag "charge_consumed" on self;
clear flag "charge_decay" on self;
`;

export function getWorldEasyEffects() {
  try {
    const raw = game.settings?.get(SYSTEM_ID, WORLD_SCRIPT_SETTING);
    if (typeof raw === "string") return raw;
  } catch {
    return DEFAULT_WORLD_EASY_EFFECTS;
  }
  return DEFAULT_WORLD_EASY_EFFECTS;
}

export function isActorWorldSynced(actor) {
  return actor?.system?.easyEffectsWorldSync !== false;
}

export function resolveActorEasyEffects(actor) {
  if (!actor) return "";
  if (isActorWorldSynced(actor)) return getWorldEasyEffects();
  return actor.system?.easyEffects ?? "";
}

const _actorAstCache = new Map();

export function clearActorScriptCache(actorId = null) {
  if (actorId) _actorAstCache.delete(actorId);
  else _actorAstCache.clear();
}

export function getActorAST(actor) {
  if (!actor) return null;
  const source = resolveActorEasyEffects(actor);
  if (!source.trim()) return null;

  const cached = _actorAstCache.get(actor.id);
  if (cached?.source === source) return cached.ast;

  try {
    const ast = parse(source);
    _actorAstCache.set(actor.id, { source, ast });
    return ast;
  } catch (err) {
    console.error(`[EasyEffects] Parse error on actor script '${actor.name}':`, err.message);
    ui.notifications?.warn(`EasyEffects parse error on '${actor.name}': ${err.message}`);
    return null;
  }
}

export function actorHasTrigger(actor, triggerName) {
  const ast = getActorAST(actor);
  if (!ast) return false;
  return ast.blocks.some(b => b.trigger === triggerName);
}

export function registerActorScriptHooks() {
  Hooks.on("updateActor", (actor) => clearActorScriptCache(actor.id));
  Hooks.on("deleteActor", (actor) => clearActorScriptCache(actor.id));
}

// Status damage can recurse into actor script triggers (found out the hard way).
const ACTOR_SCRIPT_MAX_DEPTH = 8;
let _actorScriptDepth = 0;

/**
 * Returns false if there is no matching block or nesting overflowed.
 */
export async function runActorEasyEffects(actor, triggerName, context = {}) {
  if (!actor || !triggerName) return false;

  const ast = getActorAST(actor);
  if (!ast) return false;
  if (!ast.blocks.some(b => b.trigger === triggerName)) return false;

  if (_actorScriptDepth >= ACTOR_SCRIPT_MAX_DEPTH) {
    console.warn(
      `[EasyEffects] Actor script nesting limit hit on '${actor.name}' (${triggerName}), stopping.`
    );
    return false;
  }

  _actorScriptDepth++;
  try {
    await execute(ast, triggerName, { ...context, self: actor, item: null });
  } catch (err) {
    console.error(`[EasyEffects] Actor script '${triggerName}' failed on '${actor.name}':`, err);
  } finally {
    _actorScriptDepth--;
  }
  return true;
}

/**
 * One pass per unique actor id. `buildContext` returning falsy skips that actor.
 */
export async function runActorEasyEffectsFor(actors, triggerName, buildContext) {
  const seen = new Set();
  for (const actor of actors ?? []) {
    if (!actor || seen.has(actor.id)) continue;
    seen.add(actor.id);
    const context = buildContext ? buildContext(actor) : {};
    if (!context) continue;
    await runActorEasyEffects(actor, triggerName, context);
  }
}
