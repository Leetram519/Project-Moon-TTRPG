# action-economy

> **JSDoc coverage: -841/109 symbols (-772%)**

## `src/module/action-economy/declare.js`

### `const processors`

@type {{ id: string, order: number, seq: number, fn: Function }[]}

---

### Function: `actorDeclarationLockKey(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `withActorDeclarationLock(actor, task, owner)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `task` | — | — |
| `owner` | — | — |

---

### Function: `isActorDeclarationBusy(actor, owner = null)`

Is some other declaration still running for the actor? (one with this owner doesn't count)

---

### Function: `fail(reason)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `reason` | — | — |

---

### Function: `isActorDocument(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `isItemDocument(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `normalizeKind(kind)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `kind` | — | — |

---

### Function: `normalizeCost(cost)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `cost` | — | — |

---

### Function: `resolveTarget(raw)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `raw` | — | — |

---

### Function: `tokenOnOtherScene(combat, tokenId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `tokenId` | — | — |

---

### Function: `resolveCombatContext(actor, options = {})`

A token with no Combatant only declares without one if this Actor has no Combatant
in the combat or the token is on another scene. Otherwise it would skip that
Combatant's credit ledger.

---

### Function: `sortedProcessors()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `registerActionDeclarationProcessor({ id, order = 0, fn } = {})`

Adds a processor that gets awaited after every successful declaration (cost 0 too),
lower `order` first. Registering the same `id` again replaces the old one. Processors
also run when `triggersActionEffects` is false.

---

### Function: `unregisterActionDeclarationProcessor(id)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `id` | — | — |

---

### Function: `listActionDeclarationProcessors()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `canPayActionCost(actor, cost = 1)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `cost = 1` | — | — |

---

### Function: `resolveDeclarationPayment({ economyType, cost, asReaction = false } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ economyType` | — | — |
| `cost` | — | — |
| `asReaction = false } = {}` | — | — |

---

### Function: `reactionPaymentRequest({ kind, itemId, cost, asReaction, acceptKinds = null, paymentOrder = null })`

An Action taken as a Reaction and the sheet's Used Reaction only take Universal credits
and the pool. Used Reaction starts with the pool so its number drops first.

---

### Function: `canPayReactionCost(actor, { combat, combatant, tokenId, ...request })`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `{ combat` | — | — |
| `combatant` | — | — |
| `tokenId` | — | — |
| `...request }` | — | — |

---

### Function: `warnCannotPay(actor, { reaction = false, offTurn = false, reactionMessageKey = null } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `{ reaction = false` | — | — |
| `offTurn = false` | — | — |
| `reactionMessageKey = null } = {}` | — | — |

---

### Function: `applyDeclaredActorUpdate(actor, update)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `update` | — | — |

---

### Function: `applyDeclaredOwnedItemUpdate(actor, item, update)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `item` | — | — |
| `update` | — | — |

---

### Function: `declareActorAction(options = {})`

Commits one Action or Reaction: validate, turn rule, spend, processors, then the `pmttrpg.actionDeclared` hook.

Off turn an `ownTurn` kind like Dash or Ready gets refused with `not-active-turn`.
Other Actions are taken as a Reaction and pay one Reaction no matter their cost, but a
Free Action stays free. Pass `asReaction: true` when the caller already decided that
(like an attack card made off turn that resolves later). `timing: { mode: "anytime", source }`
skips the turn rule at the normal cost. Out of combat it's always cost 0.

Calls for the same Actor run one at a time, even at cost 0. `precheck` and `apply` run in
that same queue so no other declaration of this Actor can get in between. `precheck`
refuses on `false` or `{ ok: false, reason }`. Keep `apply` to writes. A dialog in there
would block every later declaration of this Actor.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `options` | `object` | — |
| `options.actor` | `Actor` | the Actor taking it |
| `options.economyType` | `string` | "action" or "reaction" |
| `options.kind` | `string` | one of `game.projectmoonttrpg.actions.ACTION_KINDS` |
| `options.cost` *(optional, default: `1`)* | `number` | a whole number, 0 for a free one |
| `options.consume` *(optional, default: `true`)* | `boolean` | false declares at cost 0, but processors, [On Action] and the hook still run |
| `options.asReaction` *(optional, default: `false`)* | `boolean` | pay an Action with a Reaction |
| `options.timing` *(optional)* | `object` | `{ mode: "anytime", source }` skips the turn rule |
| `options.item` *(optional)* | `Item` | the Item it was taken with |
| `options.target` *(optional)* | `Actor` | the target, or `{ actor }` or `{ actorId }` |
| `options.combat` *(optional)* | `Combat` | defaults to the Combatant's combat, then `game.combat` |
| `options.combatant` *(optional)* | `Combatant` | the acting Combatant, whose Reaction credits get used |
| `options.token` *(optional)* | `TokenDocument` | the acting token (or pass `tokenId`) |
| `options.metadata` *(optional)* | `object` | copied onto the declaration for processors and hook listeners |
| `options.triggersActionEffects` *(optional)* | `boolean` | overrides whether [On Action] runs, otherwise the kind decides |
| `options.warn` *(optional, default: `true`)* | `boolean` | false hides the turn and pool warnings |
| `options.precheck` *(optional)* | `Function` | gets `{ actor, combat, combatant }` before anything is spent |
| `options.apply` *(optional)* | `Function` | gets the declaration after the processors |
| `options.acceptKinds` *(optional)* | `string[]` | credit kinds a Reaction may be paid with, by default just `kind` if it's a typed Reaction |
| `options.paymentOrder` *(optional)* | `string` | `restrictedFirst`, `poolFirst` or `any`: how Reaction credits and the pool get picked |

**Returns** `Promise<object>` — `{ ok: true, declaration }`, or `{ ok: false, reason }` when it's refused

---

### Function: `declarationActionType(declaration)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `declaration` | — | — |

---

### Function: `buildDeclarationActionPayload(declaration)`

`[On Action]` treats a truthy `item` as a scope and only runs that item's scripts.
A declaration is the whole actor acting so the weapon, outfit or tool goes in
`usedItem` and `item` stays null.

---

### Function: `registerDeclarationOnActionEmit()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/action-economy/custom-actions.js`

### `const CUSTOM_ACTION_ROW_PREFIX`

Custom Action Menu rows that content and modules add through providers. Core only
reads the descriptor. The provider and its executor decide what the Action does.

A provider returns one object per Action:

  id              unique within that source
  sourceUuid      the document that grants the Action
  source          optional live document, otherwise resolved from sourceUuid
  label, img      just for display, never used as identity
  category        Action Menu category id, unknown ids fall back to "other"
  order           sort within the category
  economy         { type: "action", cost: integer >= 0 }
  targeting       { mode: "none" | "single", allowSelf: boolean }
  timing          "reactionOffTurn" is the default and costs one Reaction off turn, or nothing at
                  cost 0. "ownTurn" can't be used off turn and "anytime" can at the usual cost
  family          optional { key: "namespace.family", label, img }, same key means one shared row
  variant         optional { key, label, img }, key is local to the source
  bindings        optional { namespace, capacity, scope: "combat" | "persistent" }
  executor        { type: registered executor id, data: plain data }
  disabledReason  optional, the row stays visible but you can't use it
  detail          optional short text under the label

---

### Function: `plainData(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `logWarning(message, data)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `message` | — | — |
| `data` | — | — |

---

### `const categories`

@type {Map<string, { id: string, labelKey: string|null, label: string|null, order: number, builtIn: boolean }>}

---

### Function: `seedCategories()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `registerActionMenuCategory({ id, labelKey = null, label = null, order = 500 } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ id` | — | — |
| `labelKey = null` | — | — |
| `label = null` | — | — |
| `order = 500 } = {}` | — | — |

---

### Function: `unregisterActionMenuCategory(id)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `id` | — | — |

---

### Function: `listActionMenuCategories()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `hasActionMenuCategory(id)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `id` | — | — |

---

### `const executors`

@type {Map<string, { availability?: Function, execute: Function }>}

---

### Function: `registerCustomActionExecutor(type, handler)`

`handler` can be just `execute(descriptor, context)` or an object with `execute`
and an optional `availability(descriptor, context)`. Availability runs before the
declaration and returns `{ available, reason, detail }`.

---

### Function: `unregisterCustomActionExecutor(type)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `type` | — | — |

---

### Function: `hasCustomActionExecutor(type)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `type` | — | — |

---

### Function: `executeCustomAction(descriptor, context = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `descriptor` | — | — |
| `context = {}` | — | — |

---

### Function: `bindingSpec(descriptor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `descriptor` | — | — |

---

### Function: `targetBindingUuid(target)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `target` | — | — |

---

### `const providers`

@type {Map<string, { id: string, order: number, seq: number, getActions: Function }>}

---

### Function: `registerActionProvider({ id, order = 0, getActions } = {})`

Registering the same id again just replaces the old one.

---

### Function: `unregisterActionProvider(id)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `id` | — | — |

---

### Function: `listActionProviders()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `customActionIdentity(descriptor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `descriptor` | — | — |

---

### Function: `normalizeCustomActionDescriptor(raw, { providerId } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `raw` | — | — |
| `{ providerId } = {}` | — | — |

---

### Function: `reject(reason)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `reason` | — | — |

---

### Function: `resolveSourceDocument(uuid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `uuid` | — | — |

---

### Function: `sourceIsLive(source)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `source` | — | — |

---

### Function: `collectProvidedActions(context = {})`

Duplicates and entries whose source document is gone get dropped.

---

### Function: `customActionRowId(descriptor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `descriptor` | — | — |

---

### Function: `isCustomActionRowId(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `descriptorsForRow(descriptors, rowId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `descriptors` | — | — |
| `rowId` | — | — |

---

### Function: `costLabel(cost, { asReaction = false } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `cost` | — | — |
| `{ asReaction = false } = {}` | — | — |

---

### Function: `descriptorLabel(descriptor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `descriptor` | — | — |

---

### Function: `customActionTiming(descriptor)`

The `timing` option for declareActorAction. Null keeps the kind's default, reactionOffTurn.

---

### Function: `customTimingCheck(descriptor, context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `descriptor` | — | — |
| `context` | — | — |

---

### Function: `canPay(actor, cost, { combat = null, combatant = null, timing = null } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `cost` | — | — |
| `{ combat = null` | — | — |
| `combatant = null` | — | — |
| `timing = null } = {}` | — | — |

---

### Function: `buildCustomActionMenuRows(descriptors, context = {})`

A family is always one row no matter how many sources add variants, and a row
with nothing usable behind it gets disabled instead of hidden.

---

### Function: `sameIdentity(a, b)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `a` | — | — |
| `b` | — | — |

---

### Function: `targetActor(target)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `target` | — | — |

---

### Function: `isSelfTarget(target, context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `target` | — | — |
| `context` | — | — |

---

### Function: `warnUser(message)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `message` | — | — |

---

### Function: `notify(key, data)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `key` | — | — |
| `data` | — | — |

---

### Function: `runCustomActionMenuChoice(rowId, context = {})`

We only trust `rowId` from the menu and collect the descriptors again before spending
anything. If the executor fails after the declaration whatever it cost stays spent.

---

### Function: `sourceName(descriptor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `descriptor` | — | — |

---

## `src/module/action-economy/kinds.js`

### `const ECONOMY_TYPES`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const ACTION_KINDS`

Anything not in this list gets refused before it spends anything. Content-specific actions use `custom`.

---

### `const KINDS_WITHOUT_ACTION_EFFECTS`

Kinds that still spend but don't emit [On Action] by default.

---

### `const DECLARATION_FAILURE_REASONS`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const ACTION_DECLARED_HOOK`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const ACTION_TIMING`

When a declaration can be made in a started combat.

---

### Function: `actionEconomyApplies(combat, combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `combatant` | — | — |

---

### Function: `defaultTimingFor(economyType, kind)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `economyType` | — | — |
| `kind` | — | — |

---

### Function: `kindTriggersActionEffects(kind, explicit)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `kind` | — | — |
| `explicit` | — | — |

---

## `src/module/movement/movement-processors.js`

### `const MOVEMENT_PHASES`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `registerMovementProcessor({ id, order = 0, phase, claims = null, process } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ id` | — | — |
| `order = 0` | — | — |
| `phase` | — | — |
| `claims = null` | — | — |
| `process } = {}` | — | — |

---

### Function: `unregisterMovementProcessor(id)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `id` | — | — |

---

### Function: `listMovementProcessors()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `sorted()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `movementProcessorClaims(context = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `context = {}` | — | — |

---

### Function: `runMovementPhase(phase, pending)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `phase` | — | — |
| `pending` | — | — |

---

## `src/module/rules/rule-contributions.js`

### `const RULE_MERGES`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const subjects`

@type {Map<string, { roles: Set<string>, fields: Map<string, object> }>}

---

### `const providers`

@type {{ id: string, order: number, seq: number, getContributions: Function }[]}

---

### Function: `warnOnce(key, message, extra)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `key` | — | — |
| `message` | — | — |
| `extra` | — | — |

---

### Function: `readPath(target, path)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `target` | — | — |
| `path` | — | — |

---

### Function: `writePath(target, path, value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `target` | — | — |
| `path` | — | — |
| `value` | — | — |

---

### Function: `normalizeFieldSpec(field, spec)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `field` | — | — |
| `spec` | — | — |

---

### Function: `defineRuleSubject(subject, { roles = [], fields = {} } = {})`

Core only. Redefining a subject just replaces it.

**@param** — {{ roles: string[], fields: Record<string, { type: string, merge: string, values?: any[], prefer?: any, min?: number }> }} definition

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `subject` | `string` | — |

---

### Function: `getRuleSubject(subject)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `subject` | — | — |

---

### Function: `registerRuleContributionProvider({ id, order = 0, getContributions } = {})`

Registering the same `id` again replaces the earlier one. `getContributions(context)`
has to be synchronous and return an array of entries.

---

### Function: `unregisterRuleContributionProvider(id)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `id` | — | — |

---

### Function: `listRuleContributionProviders()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `sortedProviders()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `validFieldValue(spec, value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `spec` | — | — |
| `value` | — | — |

---

### Function: `collectRuleContributions(subject, context = {})`

Entries for other subjects get skipped quietly so one provider can serve several subjects.

**Returns** `{ entries: object[], warnings: string[]` — }

---

### Function: `mergeField(spec, field, baseValue, values, warnings)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `spec` | — | — |
| `field` | — | — |
| `baseValue` | — | — |
| `values` | — | — |
| `warnings` | — | — |

---

### Function: `resolveRuleProfile(subject, baseline = {}, context = {})`

The baseline plus every valid contribution. `changed` is false if the result matches the baseline field by field.

**Returns** `{ profile: object, sources: object[], warnings: string[], changed: boolean` — }

---

### `const OWNED_CONTENT_PROVIDER_ID`

The built-in rule-contribution provider for owned content. Content opts in with
`flags.projectmoonttrpg.ruleContributions`, an array of `{ subject, role, changes }` entries.
Only entries matching the participant's role count (a status on the Grappler only counts as `grappler` content).
A participant can also name an Item, which counts even if it isn't active on anyone.

---

### Function: `readItemRuleContributions(item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |

---

### Function: `listActiveOwnedContent(actor, { isActive } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `{ isActive } = {}` | — | — |

---

### Function: `participantsOf(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `entriesFromItem(item, { subject, role, actor })`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |
| `{ subject` | — | — |
| `role` | — | — |
| `actor }` | — | — |

---

### Function: `ownedContentRuleContributions(context = {}, { isActive } = {})`

@param {object} context `{ subject, roles }`, where each role is a participant
  `{ actor, item? }` or an array of them

---

### Function: `registerOwnedContentRuleProvider({ isActive, order = 0 } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ isActive` | — | — |
| `order = 0 } = {}` | — | — |
