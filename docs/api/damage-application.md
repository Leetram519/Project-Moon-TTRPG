# damage-application

> **JSDoc coverage: -121/19 symbols (-637%)**

## `src/module/damage-application.js`

### `const SELECTABLE_DAMAGE_TYPES`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `isSelectableDamageType(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### `const DAMAGE_POOLS`

@type {ReadonlyArray<"hp"|"st"|"sp">}

---

### `const APPLY_POOLS`

@type {ReadonlyArray<"hp"|"st"|"sp"|"light">}

---

### Function: `normalizePools(pool)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `pool` | — | — |

---

### Function: `poolValuePath(pool)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `pool` | — | — |

---

### Function: `poolTempPath(pool)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `pool` | — | — |

---

### Function: `tempPoolKey(pool)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `pool` | — | — |

---

### Function: `poolLabel(pool)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `pool` | — | — |

---

### Function: `damageTypeLabel(damageType)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `damageType` | — | — |

---

### Function: `getActorWeaponDamageType(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `getEquippedOutfit(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `resolveResistance(actor, pool, damageType)`

Resolve HP/ST resistance for a damage type on the target.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | `Actor` | — |
| `pool` | `"hp"|"st"|"sp"` | — |
| `damageType` | `string|null` | — |

**Returns** `{ key: string, multiplier: number, reason: string, cause?: string|null, damageType: string|null` — |null}

---

### Function: `buildEffectiveResistanceDisplay(actor)`

@param {Actor} actor

**Returns** `{ hp: Record<string, string>, st: Record<string, string>` — }

---

### Function: `buildAppliedDamage(actor, applied, breakdown = [])`

Build the chat statement and undo payload after a successful apply.

**@param** — {{ pool: string, path: string, pre: number, post: number }[]} applied

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | `Actor` | — |
| `breakdown` *(optional)* | `object[]` | — |

**Returns** `{ uuid: string, isHealing: boolean, updates: object[], changes: object[], breakdown: object[], isReverted: boolean` — |null}

---

### Function: `formatBreakdownRows(breakdown = [])`

Turn stored damage steps into localized tooltip rows.

---

### Function: `formatPools(raw)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `raw` | — | — |

---

### Function: `enhanceDamageTakenCard(message, html)`

Attach the damage breakdown for GMs and owners.

---

### Function: `postDamageTakenMessage(actor, appliedDamage)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `appliedDamage` | — | — |
