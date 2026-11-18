# easy-effects

> **JSDoc coverage: -2322/336 symbols (-691%)**

## `src/module/easy-effects/sync-from-effects.js`

### `const SYNC_START`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const SYNC_END`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `resolveClashResultTrigger(trigger, resultWord)`

@returns {{ trigger: string|null, usesResult: boolean }}

---

### Function: `stripChoiceFromTrigger(trigger)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `trigger` | — | — |

---

### Function: `resolveChoiceText(text, choiceWord, { inTrigger = false } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `text` | — | — |
| `choiceWord` | — | — |
| `{ inTrigger = false } = {}` | — | — |

---

### Function: `resolveEffectDocument(entry)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `entry` | — | — |

---

### Function: `normalizeEasyEffectsText(text)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `text` | — | — |

---

### Function: `splitManagedRegion(script)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `script` | — | — |

---

### Function: `wrapSyncedRegion(body)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `body` | — | — |

---

### Function: `joinScriptParts(before, wrappedRegion, after)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `before` | — | — |
| `wrappedRegion` | — | — |
| `after` | — | — |

---

### Function: `isEasyEffectsSyncDirty(script, expectedInner, previousInner = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `script` | — | — |
| `expectedInner` | — | — |
| `previousInner = null` | — | — |

---

### Function: `pendingStampHint(template, { procResult = "none" } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `template` | — | — |
| `{ procResult = "none" } = {}` | — | — |

---

### Function: `buildEasyEffectsFromEffects(effects = [])`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `effects = []` | — | — |

---

### Function: `buildEasyEffectsFromHostEffects(hostItem)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `hostItem` | — | — |

---

## `src/module/easy-effects/resistances.js`

### `const DAMAGE_TYPES`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const RESISTANCE_DAMAGE_TYPES`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const WEAPON_DAMAGE_TYPE_CHOICES`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const RESISTANCE_DAMAGE_TYPE_CHOICES`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const RESISTANCE_MULTIPLIERS`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const RESISTANCE_LEVELS`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `normalizeResistanceLevel(raw)`

@param {string} raw

---

### Function: `normalizeDamageType(raw)`

@param {string} raw

---

### Function: `normalizeResistanceDamageType(raw)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `raw` | — | — |

---

### Function: `isResistanceNoun(raw)`

@param {string} raw

---

### Function: `buildResistanceOverrideMap({ pools, damageTypes, level } = {})`

@returns {Record<string, string>|null}

**@param** — {{ pools?: string[], damageTypes?: string[], level: string }} spec

---

### Function: `mergeResistanceOverrideMaps(into, from)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `into` | — | — |
| `from` | — | — |

---

### Function: `formatResistanceMultiplier(multiplier)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `multiplier` | — | — |

---

## `src/module/easy-effects/registry.js`

### Function: `emptyClashSideBonuses()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `createClashContext(attackerRoll = 0, defenderRoll = 0)`

Creates a fresh clash context object for one clash.
Pass the same reference through every hook in that clash so bonuses
accumulate correctly across [On Clash Start] → [On Damage Calc] etc.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `attackerRoll` | `number` | — |
| `defenderRoll` | `number` | — |

**Returns** `object` — —

---

### Function: `getAST(item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |

---

### Function: `documentId(doc)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `doc` | — | — |

---

### Function: `sameDocument(a, b)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `a` | — | — |
| `b` | — | — |

---

### Function: `resolveOwnedItem(actor, item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `item` | — | — |

---

### Function: `isPassiveClashItem(item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |

---

### Function: `itemIsLoadoutActive(item, actor)`

Weapon/outfit/tool equipped, augment on, or NPC skill. Tools also need quantity > 0.

---

### Function: `addUniqueItem(out, seen, item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `out` | — | — |
| `seen` | — | — |
| `item` | — | — |

---

### Function: `collectSideClashItems(actor, usedItem, appliedTool, declaredSkill, ammo)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `usedItem` | — | — |
| `appliedTool` | — | — |
| `declaredSkill` | — | — |
| `ammo` | — | — |

---

### Function: `usedStatBlockItems(usedItem, appliedTool, declaredSkill, ammo)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `usedItem` | — | — |
| `appliedTool` | — | — |
| `declaredSkill` | — | — |
| `ammo` | — | — |

---

### Function: `isDesignatedClashWeapon(item, payload = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |
| `payload = {}` | — | — |

---

### Function: `buildClashStartedContext(payload, item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload` | — | — |
| `item` | — | — |

---

### Function: `clashStartedActors({ attacker = null, defender = null, side = "all" } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ attacker = null` | — | — |
| `defender = null` | — | — |
| `side = "all" } = {}` | — | — |

---

### Function: `buildClashStartedActorContext(payload, self)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload` | — | — |
| `self` | — | — |

---

### Function: `isOneSidedRetaliation(payload)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload` | — | — |

---

### Function: `attackerWonClash({ winner, attacker } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ winner` | — | — |
| `attacker } = {}` | — | — |

---

### Function: `onHitItems({ item, appliedTool, attacker, attackerSkill, ammo })`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ item` | — | — |
| `appliedTool` | — | — |
| `attacker` | — | — |
| `attackerSkill` | — | — |
| `ammo }` | — | — |

---

### Function: `onHitContext({ attacker, defender, clash, attackerSkill })`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ attacker` | — | — |
| `defender` | — | — |
| `clash` | — | — |
| `attackerSkill }` | — | — |

---

### Function: `onBeingHitItems({ defender })`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ defender }` | — | — |

---

### Function: `onBeingHitContext({ attacker, defender, clash, attackerSkill })`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ attacker` | — | — |
| `defender` | — | — |
| `clash` | — | — |
| `attackerSkill }` | — | — |

---

### Function: `onHealItems({ healer, item } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ healer` | — | — |
| `item } = {}` | — | — |

---

### Function: `onHealContext(payload = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload = {}` | — | — |

---

### Function: `onBeingHealedItems({ actor } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ actor } = {}` | — | — |

---

### Function: `onBeingHealedContext(payload = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload = {}` | — | — |

---

### Function: `buildClashWinContext(payload = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload = {}` | — | — |

---

### Function: `buildClashLoseContext(payload = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload = {}` | — | — |

---

### Function: `clashStartedActorContexts(payload)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload` | — | — |

---

### Function: `combatLifecycleItems({ actor } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ actor } = {}` | — | — |

---

### Function: `allOwnedEasyEffectItems({ actor } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ actor } = {}` | — | — |

---

### Function: `combatLifecycleContext({ actor, combat } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ actor` | — | — |
| `combat } = {}` | — | — |

---

### Function: `allowsClashWeapon(hookName)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `hookName` | — | — |

---

### Function: `isHookEmitting(hookName)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `hookName` | — | — |

---

### Function: `registerEasyEffectsHooks()`

One `Hooks.on` per unique Foundry hook name. Several TRIGGER_HOOKS defs
can share that listener and run in array order.

Call once at init: `Hooks.once("init", () => registerEasyEffectsHooks());`

---

### Function: `runItemEasyEffects(item, triggerName, context = {})`

Skip pending statuses. Returns whether a script actually ran.

---

### Function: `emitActorAction(payload)`

[On Action]. Clash callers should pass `clash`, `attacker`, and `defender`.

---

### Function: `emitTurnStart(payload)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload` | — | — |

---

### Function: `emitEndOfTurn(payload)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload` | — | — |

---

### Function: `emitEndOfRound(payload)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload` | — | — |

---

### Function: `emitStartOfRound(payload)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload` | — | — |

---

### Function: `emitCombatStart(payload)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload` | — | — |

---

### Function: `emitCombatEnd(payload)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload` | — | — |

---

### Function: `emitTokenMoved(payload)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload` | — | — |

---

### Function: `emitAttackConnected(payload)`

[On Hit] then [On Being Hit] share one emission (`event.flags` and overlay).
Public hook `pmttrpg.attackConnected` fires after both slices.

---

### Function: `emitHeal(payload)`

[On Heal] then [On Being Healed] share one `heal` bag and one emission.
`applyDamage({ op: "heal" })` must call this before writing pools.

---

### Function: `emitDamageCalc(payload)`

[On Damage Calc], then the public `pmttrpg.damageCalc` hook.

---

### Function: `emitToolUsed(payload)`

[On Use] for a tool, then `pmttrpg.toolUsed`.

---

### Function: `emitClashStarted(payload = {})`

[On Clash] / [On Clash Start] for one side.

---

### Function: `emitClashResolved(payload = {}, { fireHook = true } = {})`

Clash Win/Lose. Pause statuses resolve here, before [On Being Hit] burst checks.

---

### Function: `sideUsedClashKit(payload = {}, side)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload = {}` | — | — |
| `side` | — | — |

---

### Function: `usedKitSideOfItem(item, payload = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |
| `payload = {}` | — | — |

---

### Function: `instantNamesForUsedItem(item, payload = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |
| `payload = {}` | — | — |

---

### Function: `collectInstantStatusNames(items)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `items` | — | — |

---

### Function: `instantStatusFilter(names, mode)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `names` | — | — |
| `mode` | — | — |

---

### Function: `emitStatusEasyEffects(hookName, payload)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `hookName` | — | — |
| `payload` | — | — |

---

### Function: `emitClashOutcome(resolvedPayload, hitPayload = null)`

Always Active `instant <Status>` on the used weapon/tool/skill/ammo copies that
side's matching Clash Result gain/inflict/set live first, then
[On Clash Win Before Results], then Specified status, then one Clash Win/Lose pass
that skips those applies on the Instant kit only.

---

### Function: `collectBurstListenerItems(burster, burstee, skipItem, usedSkills = [])`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `burster` | — | — |
| `burstee` | — | — |
| `skipItem` | — | — |
| `usedSkills = []` | — | — |

---

### Function: `emitRoll(context = {})`

Fires `[On Roll]` after the named roll resolves, before its bind is stored.
The producing item can still listen. Listener `self` is the item owner, while
`target` remains the rolling script's target.

---

### Function: `findStatusItem(actor, statusName)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `statusName` | — | — |

---

### Function: `emitItemEquipped(item)`

[On Equip] scripts. Call after a weapon, outfit, augment, or tool is equipped.

---

### Function: `emitItemUnequipped(item)`

[On Unequip]. Needs an owning actor so `self` resolves. Loadout-active is not
required: after an unequip update it is already false, and on delete it is
still true.

---

### Function: `isAlwaysActiveParticipant(item, actor)`

Owned content whose rules apply while the actor has it: statuses that aren't
pending (shelved counts as pending too) and loadout-active gear. Stacks don't matter.

---

### Function: `applyAlwaysActiveModifiers(actor)`

Collects `[Always Active]` modifiers from the actor, equipped items, and
active statuses into one merged result.

Weapon, outfit, and skill combat dice modifiers stay item-local. Clash rolls
add the used skill separately, which prevents unused skills from affecting
standing Attack, Block, or Evade modifiers.

---

### Function: `getItemAlwaysActiveCombatMods(item, actor)`

Always Active Power / Max for this weapon, outfit, or skill.
Other item types contribute those through `applyAlwaysActiveModifiers`.

---

### Function: `mergeAlwaysActiveMods(merged, mods, sourceName)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `merged` | — | — |
| `mods` | — | — |
| `sourceName` | — | — |

---

### Function: `runDepletedEasyEffects(actor, depleted)`

[On Depleted] / [On Depleted HP] etc. Actor script first, then live statuses.
Re-entry for the same actor+pool is ignored (heal/damage from the script
must not retrigger depletion).

---

### Function: `queueDepletedEasyEffects(actor, jobs)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `jobs` | — | — |

---

### Function: `settleDepletedEasyEffects()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `runOnTakingDamage(actor, damage, options = {})`

Fire `[On Taking Damage]` on the actor, then equipped items and live statuses.

`applyDamage` already built `damage` and keeps using that same object.
Scripts can change amount, before/after flats, or convert pool / type.
After this returns, `applyDamage` writes those to each pool.

---

### Function: `runBeforeDealingDamage(actor, damage, options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `damage` | — | — |
| `options = {}` | — | — |

---

### Function: `runOnDealingDamage(actor, damage, options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `damage` | — | — |
| `options = {}` | — | — |

---

### Function: `collectDealerItems(actor, sourceItems = [])`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `sourceItems = []` | — | — |

---

### Function: `getEquippedItems(actor)`

Returns all equipped weapons, outfits, skills, tools, and augments on an actor.

---

## `src/module/easy-effects/proc.js`

### `const RESERVED_PROC_BIND_NAMES`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `canonicalizeProcName(name)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |

---

### Function: `isReservedProcName(name)`

Lifecycle trigger names cannot be used as `proc <Name>`.

---

### Function: `isReservedProcBindName(name)`

Bind names that would collide with path roots (`self`, `heal`, `event`, …).

---

### Function: `normalizeProcTrigger(raw)`

`[On <Name>]` when `<Name>` is not a reserved lifecycle trigger.
Dialog / Roll / Burst mids are left unmatched so those parsers own them.

---

## `src/module/easy-effects/parser.js`

### Function: `packConditions(conditions)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `conditions` | — | — |

---

### Function: `parse(source)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `source` | — | — |

---

### Class: `Parser`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `_canStartExprFactor(tok)`

Next token can start a factor, so a following `%` is modulo, not postfix percent.

---

### Function: `parseAccessorExpression(raw)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `raw` | — | — |

---

### Class: `ExprParser`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Class: `ParseError` *(extends `Error`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/easy-effects/numeric-expr.js`

### Function: `applyMathOp(op, left, right)`

One binary EE op. Applies the operator to the left and right operands.
`//` / `//f` floor, `//c` ceil.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `op` | `string` | — |
| `left` | `number` | — |
| `right` | `number` | — |

**Returns** `number` — —

---

### Function: `applyMathCall(name, args)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |
| `args` | — | — |

---

### Function: `isNumericAst(node)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `node` | — | — |

---

### Function: `evalNumericAst(node, effectN)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `node` | — | — |
| `effectN` | — | — |

---

### Function: `evaluateNumericExpression(source, { effectN } = {})`

Parse and eval a math string that is only numbers, `N`, and ops.
Used for effect description `[…]` so we share the EE op table.
Dice, paths, `$vars`, and parse errors return `null`.

**@param** — {{ effectN?: number }} [options]

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `source` | `string` | — |

**Returns** `number|null` — —

---

## `src/module/easy-effects/nouns.js`

### `const NOUNS`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `lookupNoun(name)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |

---

### Function: `isResourceNoun(name)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |

---

### Function: `isAlwaysActiveResource(name)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |

---

### Function: `isRuntimeResource(name)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |

---

### Function: `readActorSystemPath(actor, path)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `path` | — | — |

---

### Function: `applyRuntimeResourceLocal(actor, nounId, { mode, amount } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `nounId` | — | — |
| `{ mode` | — | — |
| `amount } = {}` | — | — |

---

### Function: `applyRuntimeResource(actor, nounId, { mode, amount } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `nounId` | — | — |
| `{ mode` | — | — |
| `amount } = {}` | — | — |

---

### Function: `nounAllowsOp(name, op)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |
| `op` | — | — |

---

### Function: `isReservedNoun(name)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |

---

### Function: `isBonusNoun(name)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |

---

### Function: `isRegenNoun(name)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |

---

### Function: `isApplyPoolNoun(name)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |

---

### Function: `resolveApplyPool(name)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |

---

### Function: `getPowerFields(name)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |

---

### Function: `getMaxFields(name)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |

---

### Function: `getAmountFields(name)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |

---

### Function: `emptyDiceFormulas()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `cloneDiceFormulas(src)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `src` | — | — |

---

### Function: `resolveDiceFormula(die, ...sources)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `die` | — | — |
| `...sources` | — | — |

---

### Function: `applyDiceFormulaMod(mods, die, formula)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `mods` | — | — |
| `die` | — | — |
| `formula` | — | — |

---

### Function: `getRegenField(name)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |

---

### Function: `recoverPoolLocal(actor, name, amount)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `name` | — | — |
| `amount` | — | — |

---

### Function: `recoverPool(actor, name, amount)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `name` | — | — |
| `amount` | — | — |

---

### Function: `resolvePathShorthand(actor, segment, options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `segment` | — | — |
| `options = {}` | — | — |

---

### `const COMBAT_DICE_KEYS`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `emptyAlwaysActiveMods()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `pickCombatDiceMods(mods)`

Combat power, max, amount, and formula slots. Weapon and outfit [Always Active] effects keep these on the item.

---

### Function: `zeroCombatDiceMods(mods)`

Copy the modifiers, but reset combat dice modifiers and formula slots.

---

### Function: `addCombatDiceMods(a, b)`

Combine the combat dice modifiers from two sets of modifiers.

---

### Function: `applyResourceMod(mods, nounId, signedAmount)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `mods` | — | — |
| `nounId` | — | — |
| `signedAmount` | — | — |

---

### Function: `applyResourceOverride(mods, nounId, value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `mods` | — | — |
| `nounId` | — | — |
| `value` | — | — |

---

### Function: `applyResourceModsToSystem(systemData, eeMods)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `systemData` | — | — |
| `eeMods` | — | — |

---

### Function: `applyResourceOverridesToSystem(systemData, eeMods)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `systemData` | — | — |
| `eeMods` | — | — |

---

### Function: `formatOverrideSourceNames(names)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `names` | — | — |

---

## `src/module/easy-effects/lexer.js`

### `const KEYWORDS`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `readVariable(source, index)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `source` | — | — |
| `index` | — | — |

---

### Function: `readFloorOperator(source, index)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `source` | — | — |
| `index` | — | — |

---

### Function: `readDiceSoNiceFlavorSuffix(source, index)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `source` | — | — |
| `index` | — | — |

---

### Function: `readKeepDropSuffixes(source, index)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `source` | — | — |
| `index` | — | — |

---

### Function: `readNumberOrDice(source, index, diceError)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `source` | — | — |
| `index` | — | — |
| `diceError` | — | — |

---

### Function: `tokenize(source)`

Top-level EasyEffects tokens. Accessor interiors stay opaque until `tokenizeExpression`.

---

### Function: `tokenizeExpression(source)`

Tokenizes the interior of an accessor for math-expression parsing.

---

### Class: `LexError` *(extends `Error`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/easy-effects/interpreter.js`

### Function: `skipNestedApply(context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context` | — | — |

---

### Function: `rejectIfDamageReadOnly(context, verb)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context` | — | — |
| `verb` | — | — |

---

### Function: `lookupVariable(context, name)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context` | — | — |
| `name` | — | — |

---

### Function: `declareVariable(context, name, value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context` | — | — |
| `name` | — | — |
| `value` | — | — |

---

### Function: `readAmountSnapshot(context, node)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context` | — | — |
| `node` | — | — |

---

### Function: `writeAmountSnapshot(context, node, value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context` | — | — |
| `node` | — | — |
| `value` | — | — |

---

### Function: `evaluateExprSync(node, context)`

Synchronous version — used for [Always Active] (no dice allowed).

---

### Function: `resolvePercentExpr(inner, context, evalFn)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `inner` | — | — |
| `context` | — | — |
| `evalFn` | — | — |

---

### Function: `resolvePathPoolPercent(segments, context)`

HP/ST/SP/Light as 0-100. Null if this isn't a pool percent path.

---

### Function: `ensureRollsBag(context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context` | — | — |

---

### Function: `finiteNumber(value, fallback = 0)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |
| `fallback = 0` | — | — |

---

### Function: `applyRollToContext(formula, context, bind = null)`

Statement `on roll` / completed bind. Doesn't trigger [On Roll].

---

### Function: `applyPendingRollDelta(context, delta, verb)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context` | — | — |
| `delta` | — | — |
| `verb` | — | — |

---

### Function: `evaluateDiceFormula(formula, context = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `formula` | — | — |
| `context = null` | — | — |

---

### Function: `resolveActorFromUuid(uuid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `uuid` | — | — |

---

### Function: `resolveOriginator(context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context` | — | — |

---

### Function: `resolveContextActor(name, context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |
| `context` | — | — |

---

### Function: `resolveEffectSourceLabel(context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context` | — | — |

---

### Function: `resolveEncounterCombat(context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context` | — | — |

---

### Function: `resolveCombatRound(context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context` | — | — |

---

### Function: `flagKeyFromSegments(segments, flagIndex)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `segments` | — | — |
| `flagIndex` | — | — |

---

### Function: `resolveFlagHost(host, context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `host` | — | — |
| `context` | — | — |

---

### Function: `readFlagValue(host, key, context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `host` | — | — |
| `key` | — | — |
| `context` | — | — |

---

### Function: `resolveFlagPathValue(host, key, context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `host` | — | — |
| `key` | — | — |
| `context` | — | — |

---

### Function: `resolvePath(segments, context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `segments` | — | — |
| `context` | — | — |

---

### Function: `walkObjectPath(root, segments)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `root` | — | — |
| `segments` | — | — |

---

### Function: `walkActorPath(actor, segments)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `segments` | — | — |

---

### Function: `coerceActorPathValue(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `resolveAmountSync(amountNode, context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `amountNode` | — | — |
| `context` | — | — |

---

### Function: `_resolveClashBonusSide(context, actionTarget)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context` | — | — |
| `actionTarget` | — | — |

---

### Function: `_clashBonusBagForSelf(context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context` | — | — |

---

### Function: `_applyClashBonus(context, field, delta, actionTarget = "self")`

Writes N into the named field of clash.bonuses (attacker/defender bag when sided).
delta can be positive (up) or negative (down).

---

### Function: `statusApplyFilterFromContext(context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context` | — | — |

---

### Function: `statusApplyFilterNames(filter)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `filter` | — | — |

---

### Function: `statusApplyFilterVerbs(filter)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `filter` | — | — |

---

### Function: `actionStatusName(action)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `action` | — | — |

---

### Function: `actionAllowedByStatusFilter(action, filter)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `action` | — | — |
| `filter` | — | — |

---

### Function: `statementAllowedByStatusFilter(stmt, filter)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `stmt` | — | — |
| `filter` | — | — |

---

### Function: `instantApplyIsLive(context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context` | — | — |

---

### Function: `resolveHasFlag(flagNode, context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `flagNode` | — | — |
| `context` | — | — |

---

### Function: `resolveFlag(flagNode, context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `flagNode` | — | — |
| `context` | — | — |

---

### Function: `resolveRhsSync(rhs, context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `rhs` | — | — |
| `context` | — | — |

---

### Function: `compareValues(operator, lhs, rhs)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `operator` | — | — |
| `lhs` | — | — |
| `rhs` | — | — |

---

### Function: `evaluateConditionSync(condition, context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `condition` | — | — |
| `context` | — | — |

---

### Function: `resolveTargets(targetName, context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `targetName` | — | — |
| `context` | — | — |

---

### Function: `tokenDisposition(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `_isEnemy(other, self)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `other` | — | — |
| `self` | — | — |

---

### Function: `resolveProcTargetActor(procTarget, context)`

Actor passed as `target` in a nested proc.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `procTarget` | `string|null|undefined` | — |
| `context` | `object` | — |

**Returns** `Actor|null` — —

---

### Function: `execute(ast, trigger, context)`

Runs matching trigger blocks inside an existing emission.
Registry emitters already provide the shared event state and overlay.

---

### Function: `warnGrantOnce(actor, reason)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `reason` | — | — |

---

### Function: `isCreditGrant(action)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `action` | — | — |

---

### Function: `runLetStatementSync(stmt, context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `stmt` | — | — |
| `context` | — | — |

---

### Function: `resolveDialogAudience(audience, context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `audience` | — | — |
| `context` | — | — |

---

### Function: `escapeHtml(text)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `text` | — | — |

---

### Function: `formatMessageValue(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `interpolateMessageTemplate(template, context)`

Fill `(…)` slots in a message string. `\(` `\)` `\\` escape literals.

**Returns** `Promise<string>` — —

---

### Function: `executeAlwaysActive(ast, prepareContext)`

Runs all [Always Active] blocks in the AST synchronously.
Returns a modifier object to be merged by prepareData().
Dice and async operations are NOT allowed here.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `ast` | `object` | — |
| `prepareContext` | `object` | — { self: actor, item? } (no clash, no target) |

**Returns** `Record<string, number>` — —

---

### Class: `InterpretError` *(extends `Error`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/easy-effects/highlight.js`

### Function: `escapeHtml(text)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `text` | — | — |

---

### Function: `span(cls, text)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `cls` | — | — |
| `text` | — | — |

---

### Function: `highlightEasyEffects(source)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `source` | — | — |

---

### Function: `bindEasyEffectsHighlighter(root, { signal } = {})`

Keeps the syntax layer aligned with each EasyEffects textarea. AbortSignal
lets a re-render tear down the binding without leaving stale listeners.

---

### Function: `paint()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `syncScroll()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/easy-effects/gm-route.js`

### `const _pending`

@type {Map<string, { resolve: (v: any) => void, reject: (e: Error) => void }>}

---

### Function: `canMutateActor(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `sanitizeActorUpdate(update)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `update` | — | — |

---

### Function: `sanitizeItemUpdate(update)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `update` | — | — |

---

### Function: `gmRouteSocketResult(result)`

Plain data for the socket reply. A Document (or anything we can't serialize) just goes back as `true`.

---

### Function: `uuidFromDocOrString(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `pushUuid(out, seen, value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `out` | — | — |
| `seen` | — | — |
| `value` | — | — |

---

### Function: `sanitizeDamageOptions(options = {})`

Socket payload for applyDamage.

---

### Function: `getPrimaryGM()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `isPrimaryGM()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `getTurnEventGM()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `isTurnEventGM()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `runAsOwnerOrGM(actor, op, payload = {})`

Routes actor mutations through an owner or active GM.
Persistent EE metadata uses `runEEMetaPatch` instead

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | `Actor` | — |
| `op` | `string` | — |
| `payload` *(optional)* | `object` | — |

**Returns** `Promise<any>` — —

---

### Function: `runAsCombatantOwnerOrGM(combatant, op, payload = {})`

Players can only update a Combatant if they can modify its Actor. A write to someone
else's Combatant (like an Assist) goes through the GM instead.

---

### Function: `runOnPrimaryGM(op, payload = {})`

Runs `op` on the primary GM (locally if that's us). Handlers get `{ fromUserId }` as a second argument.

---

### Function: `runOnTurnEventGM(op, payload = {})`

Same socket as `runOnPrimaryGM`, but `game.users.activeGM` is the one that answers
`delayForwardAdvance`. The Delay mask has to go on the client that runs Foundry's turn events.

---

### Function: `dispatchToPrimaryGM(op, wirePayload)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `op` | — | — |
| `wirePayload` | — | — |

---

### Function: `combatOfCombatant(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `registerGmRouteSocket()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `runEEMetaPatch(doc, patch = {})`

Persistent EE metadata on Actor, Item, Combat, or Combatant
Calls local applyEEMetaPatch when the user can mutate the host, otherwise asks
the primary GM to patch it.

---

### Function: `ensureGmRouteSocket()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/easy-effects/filters.js`

### Function: `splitDamageFilterTokens(mid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `mid` | — | — |

---

### Function: `isAttackDamage(damage)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `damage` | — | — |

---

### Function: `filterPoolValue(filter)`

Pool named on a taking-damage filter, if any. Compound filters keep it on `.pool`.

---

### Function: `normalizePoolList(raw)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `raw` | — | — |

---

### Function: `pendingDamagePools(damage)`

Returns the pools this hit is about to touch.

Missing pool defaults to HP.

**@param** — {{ pool?: string|string[] }|null|undefined} damage

**Returns** `string[]` — —

---

### Function: `applyPendingDamageDelta(damage, delta, options = {})`

Apply one `reduce/increase` modifier to the pending hit.

Negative delta reduces damage while positive delta increases it.

After-resistance changes are always tracked per pool.

Before resistance, a modifier that affects the whole hit can update
`damage.amount` directly. Pool-specific changes use `beforeDeltaByPool`.

**@param** — {{
  damageFilter?: object|null,
  actionPool?: string|string[]|null,
  timing?: "before"|"after",
}} [options]

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `damage` | `object` | Pending hit from `applyDamage`. |
| `delta` | `number` | Signed amount. |

---

### Function: `matchesPoolFilter(want, damage)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `want` | — | — |
| `damage` | — | — |

---

### Function: `matchesSourceOrTypeFilter(want, damage)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `want` | — | — |
| `damage` | — | — |

---

### Function: `normalizeTakingDamageTrigger(raw)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `raw` | — | — |

---

### Function: `buildDamageFilterAst(pool, attack, sourceOrType)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `pool` | — | — |
| `attack` | — | — |
| `sourceOrType` | — | — |

---

### Function: `normalizeDealingDamageTrigger(raw)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `raw` | — | — |

---

### Function: `matchesDamageFilter(filter, damage)`

Should this `[On Taking … Damage]` block run for the pending hit?
HP matches when HP is anywhere on the hit, including HP+ST attacks.
That is "does the block fire".

---

### Function: `normalizeDepletedTrigger(raw)`

@param {string} raw

**Returns** `{ matched: boolean, trigger: string, depletedFilter: { pool: string` — |null }}

---

### Function: `matchesDepletedFilter(filter, depleted)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `filter` | — | — |
| `depleted` | — | — |

---

### Function: `normalizeBurstTrigger(raw)`

@param {string} raw

**Returns** `{ matched: boolean, trigger: string, burstFilter: { status: string` — |null }}

---

### Function: `matchesBurstFilter(filter, { statusName = "", phase = "local" } = {})`

@param {{ status?: string }|null|undefined} filter

**@param** — {{ statusName?: string, phase?: "local"|"global" }} opts

---

### Function: `shouldExecuteBurstBlock(block, execContext)`

Actor [On X Burst] waits for the global pass so it doesn't also fire locally.

---

### Function: `resolveDefenderClashStance(retaliationType, defenderItem = null, defenderSkill = null)`

@param {string|null|undefined} retaliationType

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `defenderItem` | `Item|null|undefined` | — |
| `defenderSkill` *(optional)* | `Item|null|undefined` | — |

**Returns** `"counter"|"block"|"evade"|null` — —

---

### Function: `resolveActorClashStance(actor, payload = {})`

@param {Actor|null|undefined} actor

**@param** — {{
  attacker?: Actor|null,
  defender?: Actor|null,
  side?: "attacker"|"defender"|"all"|null,
  retaliationType?: string|null,
  defenderItem?: Item|null,
  defenderSkill?: Item|null,
}} payload

**Returns** `"attack"|"counter"|"block"|"evade"|null` — —

---

### Function: `defenderStance()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `normalizeClashStanceTrigger(raw)`

@param {string} raw

**Returns** `{ matched: boolean, trigger: string, clashStanceFilter: { stance: "attack"|"counter"|"block"|"evade"|"defense"` — |null }}

---

### Function: `matchesClashStanceFilter(filter, clashStance)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `filter` | — | — |
| `clashStance` | — | — |

---

### `const HEAL_TRIGGER_ORDER`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `snapshotPools(raw)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `raw` | — | — |

---

### Function: `createHealBag({ amount = 0, pool = "hp", source = "" } = {})`

Pending restore for one `applyDamage({ op: "heal" })`.
`originalPool` is snapshotted here and `pool` is whatever `convert` last wrote.

---

### Function: `parseHealPoolMid(mid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `mid` | — | — |

---

### Function: `normalizeHealTrigger(raw)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `raw` | — | — |

---

### Function: `normalizeBeingHealedTrigger(raw)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `raw` | — | — |

---

### Function: `matchesHealFilter(filter, heal)`

Matches `originalPool`. This makes it so that a later `convert` doesn't skip this slice.

---

### Function: `collectUniqueHealItems(items = [], extraItem = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `items = []` | — | — |
| `extraItem = null` | — | — |

---

### Function: `push(item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |

---

### Function: `buildHealSliceContexts(payload = {})`

Healer and patient share this `heal` object. No healer means no `[On Heal]`.

---

### Function: `planHealSlices(payload = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload = {}` | — | — |

---

### Function: `pendingRollTags(pendingRoll)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `pendingRoll` | — | — |

---

### Function: `normalizeOnRollTrigger(raw)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `raw` | — | — |

---

### Function: `matchesRollFilter(filter, pendingRoll)`

Case-insensitive match on `pendingRoll.tags`.

---

## `src/module/easy-effects/ee-meta.js`

### Function: `encodeFlagKey(key)`

Foundry treats dots in update paths as nesting. Author-defined keys are
stored as UTF-8 hex so they remain safe inside `doc.update` paths.

---

### Function: `decodeFlagKey(encoded)`

Throws if the value is not one of our encoded keys.

---

### Function: `isValidFlagValue(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `isApprovedEEMetaHost(doc)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `doc` | — | — |

---

### Function: `canMutateEEMetaHost(doc)`

Combat metadata is GM-only. Other supported documents follow their normal
ownership rules, including embedded Items whose owning Actor is writable.

---

### Function: `createEEEmission()`

Event flags and staged persistent writes live for one logical emission.
Every script participating in that emission shares this state.

---

### Function: `attachEmitState(context, emission)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context` | — | — |
| `emission` | — | — |

---

### Function: `runLogicalEmission(fn)`

Persistent changes flush when the logical emission ends, even if execution
exits through an exception.

---

### Function: `overlayRow(emission, doc)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `emission` | — | — |
| `doc` | — | — |

---

### Function: `getEventFlag(emission, key)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `emission` | — | — |
| `key` | — | — |

---

### Function: `setEventFlag(emission, key, value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `emission` | — | — |
| `key` | — | — |
| `value` | — | — |

---

### Function: `clearEventFlag(emission, key)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `emission` | — | — |
| `key` | — | — |

---

### Function: `storedFlagMap(doc)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `doc` | — | — |

---

### Function: `listPersistentFlags(doc)`

Persisted EE flags only.

---

### Function: `getPersistentFlag(emission, doc, key)`

The emission overlay wins over persisted metadata. That makes staged writes
visible immediately and staged clears behave as missing before Foundry is
updated. A stored value of `0` is still present.

---

### Function: `hasPersistentFlag(emission, doc, key)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `emission` | — | — |
| `doc` | — | — |
| `key` | — | — |

---

### Function: `stagePersistentFlag(emission, doc, key, value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `emission` | — | — |
| `doc` | — | — |
| `key` | — | — |
| `value` | — | — |

---

### Function: `stageClearPersistentFlag(emission, doc, key)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `emission` | — | — |
| `doc` | — | — |
| `key` | — | — |

---

### Function: `flushEEEmission(emission)`

Clear the overlay before applying patches so nested execution cannot flush
the same staged rows twice.

---

### Function: `eeMetaUpdatePath(encodedKey)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `encodedKey` | — | — |

---

### Function: `applyEEMetaPatch(doc, { set = {}, unset = [] } = {})`

Applies an EE metadata patch directly to the document. This is the low-level
write path and does not perform permission checks or GM routing.

Updates are sent as per-key diffs so the surrounding metadata blob is left
intact.

---

## `src/module/easy-effects/dice-formula.js`

### Function: `applyDiceMaxFloor(baseSides, maxDelta = 0)`

Max that would drop a die below d1 becomes a Power penalty instead.

---

### Function: `parseSimpleDiceFormula(formula)`

`NdX+P` only. Keep/drop and other Foundry syntax return null.

---

### Function: `parseDiceFormulaOverride(formula)`

`2d10+8[slash]` and `2d10[slash]+8` both parse. Two flavors return null.
A count or a face count below 1 also returns null.

---

### Function: `formatDiceFormula(count, sides, power)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `count` | — | — |
| `sides` | — | — |
| `power` | — | — |

---

### Function: `expandSimpleDiceByMultiplier(formula, times)`

`deal 1d10 per N` becomes one `Nd10` roll. Flat Power is not multiplied.

---

### Function: `resolveDiceBonuses(baseFormula, bonuses = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `baseFormula` | — | — |
| `bonuses = {}` | — | — |

---

### Function: `applyDiceBonuses(baseFormula, bonuses = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `baseFormula` | — | — |
| `bonuses = {}` | — | — |

---

## `src/module/easy-effects/choice-dialog.js`

### `const _pending`

@type {Map<string, { resolve: (id: string|null) => void }>}

---

### Function: `resolvePromptUser(actor, tokenId = null)`

Active non-GM owner of the token or actor, else the current user if they
can act, else an active GM.

---

### Function: `requestRemoteChoice({ userId, prompt, choices, title = null, cancel = true, windowStyle = false, timeoutMs = CHOICE_TIMEOUT_MS, timeoutValue = null })`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ userId` | — | — |
| `prompt` | — | — |
| `choices` | — | — |
| `title = null` | — | — |
| `cancel = true` | — | — |
| `windowStyle = false` | — | — |
| `timeoutMs = CHOICE_TIMEOUT_MS` | — | — |
| `timeoutValue = null }` | — | — |

---

### Function: `registerChoiceDialogSocket()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `ensureChoiceSocket()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/easy-effects/burst-roles.js`

### Function: `actorIdentityKey(actor)`

Unlinked token actors can share a world actor's id so we use uuid as the the real key.

---

### Function: `sameActor(a, b)`

True when both refs are the same token actor

---

### Function: `selectRelativeActors(actors, self, kind, isEnemy)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actors` | — | — |
| `self` | — | — |
| `kind` | — | — |
| `isEnemy` | — | — |

---

### Function: `itemIdentityKey(item)`

Same embedded item id can exist on two different actors.

---

### Function: `resolveBurstBurster(context)`

Dialog answerer if we're in one, else self

---

### Function: `uniqueBurstOwners(...actors)`

First occurrence of each actor, keyed by `actorIdentityKey`.

---

### Function: `itemBelongsToActor(item, owner)`

Owned by `owner`, including unlinked token copies of the same item.

---

### Function: `rememberBurstListenerItem(seenKeys, item, skipItemKey)`

Dedupes burst/proc listeners. False if the item was skipped or already seen.

---

### Function: `collectUsedSkills(owner, usedSkills)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `owner` | — | — |
| `usedSkills` | — | — |

---

## `src/module/easy-effects/actor-scripts.js`

### `const SYSTEM_ID`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const WORLD_SCRIPT_SETTING`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const DEFAULT_WORLD_EASY_EFFECTS`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `getWorldEasyEffects()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `isActorWorldSynced(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `resolveActorEasyEffects(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `clearActorScriptCache(actorOrKey = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actorOrKey = null` | — | — |

---

### Function: `getActorAST(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `actorHasTrigger(actor, triggerName)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `triggerName` | — | — |

---

### Function: `registerActorScriptHooks()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `runActorEasyEffects(actor, triggerName, context = {})`

Returns false if there is no matching block or nesting overflowed.

---

### Function: `runActorEasyEffectsFor(actors, triggerName, buildContext)`

One pass per actor uuid. `buildContext` returning falsy skips that actor.
