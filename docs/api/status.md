# status

> **JSDoc coverage: -113/15 symbols (-753%)**

## `src/module/status/pending.js`

### Function: `isPendingStatus(item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |

---

### Function: `normalizeArrival(arrival)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `arrival` | — | — |

---

## `src/module/status/lifecycle-pass.js`

### `const removedKeys`

Foundry may leave deleted statuses in `actor.items` until `updateCombat`
finishes. Keep their identities here so later lifecycle phases do not
collect them again.

Overlapping updateCombat handlers share the same set since Foundry does not
await async hook listeners.

---

### Function: `beginCombatLifecyclePass()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `endCombatLifecyclePass()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `noteRemovedStatusItem(item)`

Record the key before deletion while the item's uuid and owner are still
available.

---

### Function: `wasRemovedThisLifecyclePass(item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |

---

## `src/module/status/group-statuses.js`

### Function: `statusAppliedAt(item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |

---

### Function: `sortByName(statuses)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `statuses` | — | — |

---

### Function: `sortByPriorityThenApplied(statuses)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `statuses` | — | — |

---

### Function: `sortByDisplay(statuses)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `statuses` | — | — |

---

### Function: `groupStatuses(actor, { sort = "display" } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `{ sort = "display" } = {}` | — | — |

---

### Function: `uniqueStatusItems(items = [])`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `items = []` | — | — |

---

### Function: `onStatusItemChange(listener)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `listener` | — | — |

---

### Function: `notify(item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |
