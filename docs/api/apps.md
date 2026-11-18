# apps

> **JSDoc coverage: -345/45 symbols (-767%)**

## `src/module/apps/status-tray.js`

### Class: `StatusTray` *(extends `HandlebarsApplicationMixin`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `registerStatusTraySettings()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `peekItemType(uuid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `uuid` | — | — |

---

### Function: `tokenAtPoint(x, y)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `x` | — | — |
| `y` | — | — |

---

### Function: `showStatusScrollingText(actor, statusName, added, amount = 1)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `statusName` | — | — |
| `added` | — | — |
| `amount = 1` | — | — |

---

### Function: `registerStatusCanvasDrop()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `statusTextSilent(options)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `options` | — | — |

---

### Function: `statusTextDelta(options, fallback = 0)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `options` | — | — |
| `fallback = 0` | — | — |

---

### Function: `flushStatusDeltaText(key)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `key` | — | — |

---

### Function: `queueStatusDeltaText(actor, statusName, delta)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `statusName` | — | — |
| `delta` | — | — |

---

### Function: `registerStatusScrollingText()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `registerStatusTray()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `refresh()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/apps/status-drop-dialog.js`

### Function: `readResult(button, dialog)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `button` | — | — |
| `dialog` | — | — |

---

### Function: `promptStatusDropDialog({ name, stacks = 1 } = {})`

@returns {Promise<{ stacks: number, timing: "now"|"round"|"turn" }|null>}

---

### Function: `isAltHeld(event)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `event` | — | — |

---

### Function: `applyStatusFromDrop(actor, item, event)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `item` | — | — |
| `event` | — | — |

---

## `src/module/apps/reactive-dialog.js`

### Class: `ReactiveDialog` *(extends `HandlebarsApplicationMixin`)*

A dialog that keeps the user's choices as state and rebuilds the
whole view from that state on every render. Use it when what the dialog shows
depends on the choices so far or on documents that can change while it's open.

Subclasses set `PARTS` and implement `_prepareView(selection)`, which returns
the template context plus the `selection` to keep and the `submit` value we
resolve with. `submit` is null while nothing can be submitted.

---

## `src/module/apps/game-pause.js`

### Class: `PMTTRPGGamePause` *(extends `foundry`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/apps/ee-flag-inspector.js`

### Function: `isInspectorHost(doc)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `doc` | — | — |

---

### Function: `inspectorAppId(uuid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `uuid` | — | — |

---

### Function: `flagValueType(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `parseFlagInput(type, raw)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `type` | — | — |
| `raw` | — | — |

---

### Function: `eeMetaTouched(changed)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `changed` | — | — |

---

### Function: `defaultDraftValue(type)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `type` | — | — |

---

### Function: `forgetInspector(app)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `app` | — | — |

---

### Function: `openEEFlagInspector(doc)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `doc` | — | — |

---

### Class: `EEFlagInspector` *(extends `HandlebarsApplicationMixin`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const eeFlagsAPI`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/apps/easy-effects-editor.js`

### Class: `EasyEffectsEditor` *(extends `HandlebarsApplicationMixin`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `normalize(text)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `text` | — | — |

---

### Function: `refreshSyncedActors()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `registerWorldEasyEffectsSettings()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/apps/dialog-wait.js`

### Function: `unwrap(result)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `result` | — | — |

---

### Function: `guardButton(button)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `button` | — | — |

---

### Function: `waitForChoice(config = {})`

Basically the same as `DialogV2.wait`, except a button callback that returns nothing will
resolve to null. Foundry resolves `callback() ?? action`, so otherwise a Cancel
callback returning null comes back as "cancel" and gets past the caller's null check.

---

### Function: `cancelButton()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `confirmButton(callback, { label = null, icon = "fa-solid fa-check" } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `callback` | — | — |
| `{ label = null` | — | — |
| `icon = "fa-solid fa-check" } = {}` | — | — |

---

### Function: `themeButtonOrder(buttons)`

We move the default button (the one marked `default`, else the first) to the end
so it sits on the right. The others become `type="button"` so Enter would still press
the default one (implicit submission uses the form's first submit button).

---

### Function: `waitForWindowChoice({ classes = [], position = {}, buttons = [], ...config } = {})`

`waitForChoice` but in the pm-window theme.

---

### Function: `itemPickerRows(items, tag, checkedId = items[0]?.id)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `items` | — | — |
| `tag` | — | — |
| `checkedId = items[0]?.id` | — | — |

---

### Function: `pickRadioRow({ title, hint, inputName, rows })`

Shows one radio list and resolves the checked row's id (or null if they cancel or close it).

---

## `src/module/apps/dialog-classes.js`

### Function: `pmttrpgDialogClasses()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `pmttrpgDialogPosition(extra = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `extra = {}` | — | — |

---

### Function: `pmWindowClasses(...extra)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `...extra` | — | — |
