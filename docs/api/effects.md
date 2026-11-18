# effects

> **JSDoc coverage: -112/14 symbols (-800%)**

## `src/module/effects/effect-summary.js`

### Function: `effectShowsProcChoice(procOn = "alwaysActive")`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `procOn = "alwaysActive"` | — | — |

---

### Function: `toCssToken(value = "")`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value = ""` | — | — |

---

### Function: `getGroupSort(effect = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `effect = {}` | — | — |

---

### Function: `getEffectStack(effect = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `effect = {}` | — | — |

---

### Function: `buildEffectSummaryGroups(effects = [])`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `effects = []` | — | — |

---

### Function: `addLine(groupKey, groupLabel, groupSort, subKey, subLabel, lineText)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `groupKey` | — | — |
| `groupLabel` | — | — |
| `groupSort` | — | — |
| `subKey` | — | — |
| `subLabel` | — | — |
| `lineText` | — | — |

---

### Function: `renderLines(lines = [])`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `lines = []` | — | — |

---

### Function: `renderGroup(group)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `group` | — | — |

---

### Function: `getEffectTriggerClass(effect = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `effect = {}` | — | — |

---

### Function: `stripOuterBlockTags(html = "")`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `html = ""` | — | — |

---

### Function: `buildInlineEffectSummary(effect = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `effect = {}` | — | — |

---

### Function: `computeEffectSummary(entries = [], epMax = 0)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `entries = []` | — | — |
| `epMax = 0` | — | — |

---

### Function: `normalizeEffectEntries(rawEffects = [])`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `rawEffects = []` | — | — |

---

## `src/module/effects/effect-autocomplete.js`

### Class: `EffectAutocomplete`

EffectAutocomplete — single-select, close-on-pick.

Each effect object:
{
  id:          string,
  name:        string,
  icon:        string,          // must be a src link
  source:      string,
  epCost:      number | null,   // null is displayed as "not specified" and has a value of 0.
  tags: [{ name: string, icon?: string }]
}

Usage:
  const ac = new EffectAutocomplete(el, {
    effects: [...],
    onSelect: (effect) => { ... }   // called with the full effect object
  });
