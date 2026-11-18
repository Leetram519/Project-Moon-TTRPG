# actor

> **JSDoc coverage: -331/38 symbols (-871%)**

## `src/module/actor/progression.js`

### Function: `getRankFromLevel(level)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `level` | — | — |

---

### Function: `isRankUpLevel(level)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `level` | — | — |

---

### Function: `getStatCap(rank)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `rank` | — | — |

---

### `const ACTION_ECONOMY_BY_RANK`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `getActionEconomyFromRank(rank)`

Actions/Reactions from rank. Movement is always 1 (tactical SQR pool is separate).

---

### `const RANK_UP_LEVELS`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const XP_PER_LEVEL`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const TACTICAL_SQUARES_BASE`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `squareTurnCap(squares)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `squares` | — | — |

---

## `src/module/actor/character-sheet.js`

### Function: `actorInCombat(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `canEditReactionCredits(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `sheetActionStates(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `registerSheetCombatRefresh()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `renderSheets(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `renderCombat(combat)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |

---

### Class: `PMTTRPGCharacterSheet` *(extends `HandlebarsApplicationMixin`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `buildRow(pool, key, title)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `pool` | — | — |
| `key` | — | — |
| `title` | — | — |

---

### Function: `resize()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `seedMotes()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `draw(t)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `t` | — | — |

---

### Function: `frame(t)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `t` | — | — |

---

### Function: `buildGroupsFor(item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |

---

## `src/module/actor/carry-menu.js`

### Function: `isWornItem(item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |

---

### Function: `carryStateOf(item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |

---

### Function: `carryStateLabelKey(item, state = carryStateOf(item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |
| `state = carryStateOf(item` | — | — |

---

### Function: `carryOptions(item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |

---

### Function: `carryUpdate(item, state)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |
| `state` | — | — |

---

### Function: `optionButton(option)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `option` | — | — |

---

### Function: `moveFocus(menu, step)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `menu` | — | — |
| `step` | — | — |

---

### Function: `openCarryMenu(anchor, item, onPick)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `anchor` | — | — |
| `item` | — | — |
| `onPick` | — | — |

---

### Function: `close()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/actor/actor.js`

### Function: `push(item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |

---

### Function: `sourceSystemNumber(actorData, path)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actorData` | — | — |
| `path` | — | — |

---

### Function: `statusMutationOptions(options = {}, delta = 0)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `options = {}` | — | — |
| `delta = 0` | — | — |

---

### Function: `withStatusLock(actor, statusName, task)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `statusName` | — | — |
| `task` | — | — |

---

### Function: `statusChange(value = [], events = [])`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value = []` | — | — |
| `events = []` | — | — |

---

### Class: `ActorPMTTRPG` *(extends `Actor`)*

Extends the basic Actor class for Project Moon TTRPG.

**@extends** — {Actor}

---

## `src/module/actor/actor-npc-sheet.js`

### Class: `PMTTRPGActorNpcSheet` *(extends `PMTTRPGCharacterSheet`)*

GM-facing NPC sheet
Extends the character sheet for shared trackers, rolls, and item actions.
