# targeting

> **JSDoc coverage: -189/21 symbols (-900%)**

## `src/module/targeting.js`

### Function: `getInitiativeMisc(actor, miscType)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `miscType` | — | — |

---

### Function: `computeInitiativeFormulaParts(actor, { macroMisc = null, manualMisc = null } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `{ macroMisc = null` | — | — |
| `manualMisc = null } = {}` | — | — |

---

### Function: `getCombatants(combat = game.combat)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat = game.combat` | — | — |

---

### Function: `getCombatantImage(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `getCombatantInitiative(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `isCombatantVisible(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `resolveSelfTokenDocument(actor, tokenDocument = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `tokenDocument = null` | — | — |

---

### Function: `isRangeEvaluated(weaponRange)`

`weaponRange: null` means no range restriction. Despite its name, `outOfRange` is the one that holds the in-range result.

---

### Function: `buildCombatantTarget(combatant, { actorId = null, selfTokenDocument = null, weaponRange = 1 } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |
| `{ actorId = null` | — | — |
| `selfTokenDocument = null` | — | — |
| `weaponRange = 1 } = {}` | — | — |

---

### Function: `getUserTargetedTokens()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `getTokenId(token)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |

---

### Function: `resolveCombatantForToken(token, combat = game.combat)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |
| `combat = game.combat` | — | — |

---

### Function: `buildTargetFromToken(token, { actorId = null, selfTokenDocument = null, combat = game.combat, weaponRange = 1 } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |
| `{ actorId = null` | — | — |
| `selfTokenDocument = null` | — | — |
| `combat = game.combat` | — | — |
| `weaponRange = 1 } = {}` | — | — |

---

### Function: `getUserTargetCombatantIds(options = [], combat = game.combat)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `options = []` | — | — |
| `combat = game.combat` | — | — |

---

### Function: `getSelectedCombatantId(options = [], preferredCombatantId = null, combat = game.combat)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `options = []` | — | — |
| `preferredCombatantId = null` | — | — |
| `combat = game.combat` | — | — |

---

### Function: `hideRange()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `rollInitiative(actor, { macroMisc = null, manualMisc = null, combatant = null } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `{ macroMisc = null` | — | — |
| `manualMisc = null` | — | — |
| `combatant = null } = {}` | — | — |

---

### Function: `buildAttackContextPayload({ actor = null, item = null, roll = null, templateData = {}, target = null } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ actor = null` | — | — |
| `item = null` | — | — |
| `roll = null` | — | — |
| `templateData = {}` | — | — |
| `target = null } = {}` | — | — |

---

### Function: `getInitiativeFormulaParts(actor, options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `options = {}` | — | — |

---

### Function: `setInitiativeMisc(actor, options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `options = {}` | — | — |

---

### `const PMTTRPGTargetingAPI`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*
