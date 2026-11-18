# item

> **JSDoc coverage: -482/53 symbols (-909%)**

## `src/module/item/weapon-properties.js`

### `const MELEE_FORMS`

Weapon dropdowns should always have a valid value.

If a form or hand property is blank, or doesn't belong to the current
weapon type, the UI can look correct while the stored value is still wrong.
That can also prevent the expected bonus from being applied.

These helpers keep weapon type, form, and hand values in sync so
prepareData, clash rolls, and melee/ranged switching all behave the same way.

---

### `const DEFAULT_WEAPON_HAND_PROPERTY`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const DEFAULT_MELEE_FORM_PROPERTY`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const DEFAULT_RANGED_FORM_PROPERTY`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `normalizeWeaponType(weaponType)`

Normalizes a weapon type.

Melee is the default, so only an explicit `"ranged"` value is treated
as ranged. Blank, null, or unknown values fall back to melee.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `weaponType` | `string|null|undefined` | — |

**Returns** `"melee"|"ranged"` — —

---

### Function: `defaultFormProperty(weaponType)`

Returns the default form property for a weapon type.

Melee weapons default to Small, while ranged weapons default to Low Caliber.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `weaponType` | `string|null|undefined` | — |

**Returns** `string` — —

---

### Function: `normalizeWeaponFormProperty(weaponType, formProperty)`

Makes sure the form property is valid for the current weapon type.

If it isn't, the weapon falls back to the default form for that type.
This also prevents stale values when switching between melee and ranged,
such as keeping Small stored after changing a weapon to ranged.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `weaponType` | `string|null|undefined` | — |
| `formProperty` | `string|null|undefined` | — |

**Returns** `string` — —

---

### Function: `normalizeWeaponHandProperty(weaponType, handProperty)`

Makes sure the hand property is valid for the current weapon type.

Ranged weapons currently only support Offensive 1H and Offensive 2H. If a weapon
has an invalid or blank hand value, it falls back to Offensive 1H.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `weaponType` | `string|null|undefined` | — |
| `handProperty` | `string|null|undefined` | — |

**Returns** `string` — —

---

### Function: `normalizeWeaponProperties(system = {})`

Normalizes all weapon properties in one pass.

This keeps the weapon type, form, and hand values valid together.
Used by prepareData, migrateData, clash rolls, and _preUpdate when
switching a weapon between melee and ranged.

**@param** — {{
  weaponType?: string|null,
  formProperty?: string|null,
  handProperty?: string|null
}|null|undefined} system

**Returns** `{
  weaponType: "melee"|"ranged",
  formProperty: string,
  handProperty: string` — }

---

## `src/module/item/weapon-item-sheet.js`

### Class: `PMTTRPGWeaponItemSheet` *(extends `PMTTRPGItemSheet`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/item/tool-use.js`

### Function: `getToolUsesRemaining(tool)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tool` | — | — |

---

### Function: `isToolUsable(tool)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tool` | — | — |

---

### Function: `toolConsumesByDefault(tool)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tool` | — | — |

---

### Function: `canUseTool(tool)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tool` | — | — |

---

### Function: `consumeToolUse(tool, { consume = true } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tool` | — | — |
| `{ consume = true } = {}` | — | — |

---

### Function: `getPreferredToolTargetActor()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/item/tool-item-sheet.js`

### Class: `PMTTRPGToolItemSheet` *(extends `PMTTRPGItemSheet`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/item/standalone-tool.js`

### Function: `getActorStatValue(actor, statKey)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `statKey` | — | — |

---

### Function: `abilityLabel(statKey)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `statKey` | — | — |

---

### Function: `effectLines(tool, mode)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tool` | — | — |
| `mode` | — | — |

---

## `src/module/item/skill-item-sheet.js`

### Class: `PMTTRPGSkillItemSheet` *(extends `PMTTRPGItemSheet`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/item/outfit-item-sheet.js`

### Class: `PMTTRPGOutfitItemSheet` *(extends `PMTTRPGItemSheet`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/item/item.js`

### Function: `attackerAssistContext(actor, tokenId)`

The attacker's Combatant and its Assist choices.

---

### Function: `attackerIdentityTemplateData(assistCtx, chosenTarget)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `assistCtx` | — | — |
| `chosenTarget` | — | — |

---

### Function: `blockUnheldWeaponAttack(item, path)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |
| `path` | — | — |

---

### Function: `weaponAttackTiming(item, { combatant = null, tokenId = null, timing = null } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |
| `{ combatant = null` | — | — |
| `tokenId = null` | — | — |
| `timing = null } = {}` | — | — |

---

### Function: `blockUnaffordableWeaponAttack(item, { consumeAction = true, combatant = null, tokenId = null, timing = null } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |
| `{ consumeAction = true` | — | — |
| `combatant = null` | — | — |
| `tokenId = null` | — | — |
| `timing = null } = {}` | — | — |

---

### Function: `blockOffTurnWeaponAttack(item, { combatant = null, tokenId = null, timing = null } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |
| `{ combatant = null` | — | — |
| `tokenId = null` | — | — |
| `timing = null } = {}` | — | — |

---

### Function: `consumeActionChoice(item, consumeAction, timingOptions = {})`

The target dialog's Consume default and label (Consume Reaction when the Attack is taken off turn).

---

### Function: `sameOwnedItem(actor, item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `item` | — | — |

---

### Function: `getEffectSignature(entry)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `entry` | — | — |

---

### Class: `ItemPMTTRPG` *(extends `Item`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `formatMultiplier(m)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `m` | — | — |

---

## `src/module/item/item-types.js`

### `const subTypes`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/item/item-sheet.js`

### Function: `normalizeReduceStatusType(raw)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `raw` | — | — |

---

### Function: `normalizeReduceStatusBlocks(blocks)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `blocks` | — | — |

---

### Class: `PMTTRPGItemSheet` *(extends `HandlebarsApplicationMixin`)*

Extend the basic ItemSheet with some very simple modifications

**@extends** — {ItemSheetV2}

---

### Function: `add(name)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `name` | — | — |

---

## `src/module/item/effect-item-sheet.js`

### Class: `PMTTRPGEffectItemSheet` *(extends `PMTTRPGItemSheet`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/item/declare-skill.js`

### Function: `getDeclareSkillOptions(actor, skillType = "attack")`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `skillType = "attack"` | — | — |

---

### Function: `buildDeclaredSkillTemplateData(skill, consumeLight = true)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `skill` | — | — |
| `consumeLight = true` | — | — |

---

## `src/module/item/augment-item-sheet.js`

### Class: `PMTTRPGAugmentItemSheet` *(extends `PMTTRPGItemSheet`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/item/applied-tool.js`

### Function: `isAppliedToolEligible(tool, applyTo)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tool` | — | — |
| `applyTo` | — | — |

---

### Function: `getAppliedToolOptions(actor, applyTo)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `applyTo` | — | — |

---

### Function: `buildAppliedToolTemplateData(tool)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tool` | — | — |

---

### Function: `maybeConsumeAppliedTool(tool, { consume = true } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tool` | — | — |
| `{ consume = true } = {}` | — | — |

---

### Function: `canConsumeAppliedTool(tool, consume = true)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tool` | — | — |
| `consume = true` | — | — |

---

### Function: `damageTypeLabel(type)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `type` | — | — |

---

## `src/module/item/ammunition.js`

### Function: `listReadyAmmunition(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `peekFirstReadyAmmunition(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `weaponRequiresAmmunition(weapon)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `weapon` | — | — |

---

### Function: `consumeAmmunitionCharge(ammo, { actor } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `ammo` | — | — |
| `{ actor } = {}` | — | — |

---

## `src/module/item/ammunition-item-sheet.js`

### Class: `PMTTRPGAmmunitionItemSheet` *(extends `PMTTRPGItemSheet`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*
