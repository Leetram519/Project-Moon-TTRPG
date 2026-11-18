# canvas

> **JSDoc coverage: -1588/197 symbols (-806%)**

## `src/module/canvas/token.js`

### Class: `TokenPMTTRPG` *(extends `foundry`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `tick()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `refreshTokenActionStateBadgesForCombatant(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `refreshTokenActionStateBadgesForCombat(combat)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |

---

### Function: `refreshAllTokenActionStateBadges()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `registerTokenActionStateBadges()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `registerTokenStatusBadges()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `registerTokenStatusBadgeSettings()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `showWeaponRange(tokenId, weaponRange)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenId` | — | — |
| `weaponRange` | — | — |

---

### Function: `hideWeaponRange(tokenId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenId` | — | — |

---

### Function: `refreshAllTokenStatusBadges()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `refreshTokenStatusBadgesForItem(item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |

---

## `src/module/canvas/token-ruler.js`

### Function: `isCurrentTurn(token)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |

---

### Function: `accruedCost(waypoint)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `waypoint` | — | — |

---

### Function: `squareBudget(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Class: `TokenRulerPMTTRPG` *(extends `foundry`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/canvas/token-hud.js`

### Function: `refusalKey(result)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `result` | — | — |

---

### Function: `warnFallRefused(result)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `result` | — | — |

---

### Function: `proneIconSrc()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `fallButton(availability)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `availability` | — | — |

---

### Function: `registerTokenHUDPMTTRPG()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Class: `TokenHUDPMTTRPG` *(extends `Current`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/canvas/token-document.js`

### Function: `startsNewMovement(options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `options = {}` | — | — |

---

### Function: `refuseGrappledMovement(tokenDoc, options)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |
| `options` | — | — |

---

### Function: `registerTokenDocumentPMTTRPG()`

TokenDocument subclass so we see Foundry v14 movement before the private
`#preUpdateMovement` freezes the waypoints. Drag, keyboard and `move()` all still
end up in `_preUpdate` with `options.movement`, which is where the later checks run.

---

### Class: `TokenDocumentPMTTRPG` *(extends `Current`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/canvas/status-tooltip.js`

### Function: `preloadStatusTooltip()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `getElement()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `showStatusTooltip(status, rect)`

@param {object} status  Grouped status (name, img, count, description, showCount, pending, showHoverDetails)

**@param** — {{left:number, top:number, width:number, height:number}} rect  Client-space rect of the badge

---

### Function: `hideStatusTooltip()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/canvas/spatial.js`

### Function: `tokenCenter(token)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |

---

### Function: `tokenIdOf(token)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |

---

### Function: `normalizeToken(token)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |

---

### Function: `tokenActor(token)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |

---

### Function: `tokenBelongsToActor(token, actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |
| `actor` | — | — |

---

### Function: `resolveOriginatingToken(actor, provided = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `provided = null` | — | — |

---

### Function: `gridForToken(token)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |

---

### Function: `tokenGridOffset(token)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |

---

### Function: `gridSpan(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `gridSpanGap(startA, spanA, startB, spanB)`

Squares between two spans on one axis. Overlapping is 0 and touching is 1.

---

### Function: `gridBoxAt(grid, { x, y, width = 1, height = 1 } = {})`

Turns a top-left pixel and a size in squares into `{ row, col, rows, cols }` (`i` is the row).
On square grids we read the offset at the center of the top-left square (since the exact corner can land on the neighbouring square).

---

### Function: `tokenGridBox(token)`

The squares a token takes up, from its committed position and size. Reads
`_source` because Token#animate merges every frame into the TokenDocument (so
`x` and `width` are in-between values while it slides or resizes).

---

### Function: `gridBoxGap(a, b)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `a` | — | — |
| `b` | — | — |

---

### Function: `tokenDistanceSquares(fromToken, toToken)`

Squares between two tokens' occupied squares (adjacent is 1).

---

## `src/module/canvas/point-picker.js`

### Function: `offsetOf(point, grid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `point` | — | — |
| `grid` | — | — |

---

### Function: `pointFromOffset(offset, grid, elevation)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `offset` | — | — |
| `grid` | — | — |
| `elevation` | — | — |

---

### Function: `snapPointToCell(point, grid, elevation = 0)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `point` | — | — |
| `grid` | — | — |
| `elevation = 0` | — | — |

---

### Function: `gridSpacesBetween(a, b, grid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `a` | — | — |
| `b` | — | — |
| `grid` | — | — |

---

### Function: `cellsInReach(origin, maxSpaces, grid, measure, elevation = origin?.elevation ?? 0)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `origin` | — | — |
| `maxSpaces` | — | — |
| `grid` | — | — |
| `measure` | — | — |
| `elevation = origin?.elevation ?? 0` | — | — |

---

### Function: `pickerElevationForKey(elevation, key, grid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `elevation` | — | — |
| `key` | — | — |
| `grid` | — | — |

---

### Function: `editableTarget(target)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `target` | — | — |

---

### Function: `keyStep(event)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `event` | — | — |

---

### Function: `cellKey(cell)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `cell` | — | — |

---

### Function: `cellCenter(cell, grid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `cell` | — | — |
| `grid` | — | — |

---

### Function: `claim(event)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `event` | — | — |

---

### Function: `labelText(description)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `description` | — | — |

---

### Function: `withLines(description, extra)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `description` | — | — |
| `extra` | — | — |

---

### Function: `shownDescription(description, { changed = false } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `description` | — | — |
| `{ changed = false } = {}` | — | — |

---

### Function: `invalidDescription(reasonKey = "PMTTRPG.PlannedMovement.PickOutOfRange")`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `reasonKey = "PMTTRPG.PlannedMovement.PickOutOfRange"` | — | — |

---

### Function: `makeGraphics()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `drawPolyline(graphics, points)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `graphics` | — | — |
| `points` | — | — |

---

### Function: `drawDot(graphics, x, y, radius, color)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `graphics` | — | — |
| `x` | — | — |
| `y` | — | — |
| `radius` | — | — |
| `color` | — | — |

---

### Function: `drawCross(graphics, x, y, size)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `graphics` | — | — |
| `x` | — | — |
| `y` | — | — |
| `size` | — | — |

---

### Function: `clearContainer(container)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `container` | — | — |

---

### Function: `ghostSprite(token, ghost, grid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |
| `ghost` | — | — |
| `grid` | — | — |

---

### Function: `labelNode(text, cell, grid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `text` | — | — |
| `cell` | — | — |
| `grid` | — | — |

---

### Function: `labelBackdrop(label)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `label` | — | — |

---

### Function: `closePick(target, value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `target` | — | — |
| `value` | — | — |

---

### Function: `currentCell()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `token()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `paintReach()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `paintOverlay(cell, description)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `cell` | — | — |
| `description` | — | — |

---

### Function: `paintHover(cell, description)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `cell` | — | — |
| `description` | — | — |

---

### Function: `outOfReach(cell)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `cell` | — | — |

---

### Function: `fitHeight(cell)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `cell` | — | — |

---

### Function: `applyElevation(next)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `next` | — | — |

---

### Function: `nudge(row, column)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `row` | — | — |
| `column` | — | — |

---

### Function: `worldPoint(event)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `event` | — | — |

---

### Function: `onMove(event)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `event` | — | — |

---

### Function: `onDown(event)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `event` | — | — |

---

### Function: `onKey(event)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `event` | — | — |

---

### Function: `onWheel(event)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `event` | — | — |

---

### Function: `onTearDown()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `onDelete(doc)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `doc` | — | — |

---

### Function: `listen(type, handler)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `type` | — | — |
| `handler` | — | — |

---

### Function: `swallow(event)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `event` | — | — |

---

## `src/module/canvas/landing-resolve.js`

### Function: `num(value, fallback = 0)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |
| `fallback = 0` | — | — |

---

### Function: `readGrid(snapshot)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |

---

### Function: `additiveSquares(from, to, grid)`

Flat Chebyshev distance plus the height, in squares (keeps the fractional square).

---

### Function: `pointAtFraction(from, to, fraction)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `from` | — | — |
| `to` | — | — |
| `fraction` | — | — |

---

### Function: `pointAlong(from, to, total, squares)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `from` | — | — |
| `to` | — | — |
| `total` | — | — |
| `squares` | — | — |

---

### Function: `aimPoint(origin, destination, requested, grid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `origin` | — | — |
| `destination` | — | — |
| `requested` | — | — |
| `grid` | — | — |

---

### Function: `completedSquares(distance)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `distance` | — | — |

---

### Function: `fallingDice(squares, rank)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `squares` | — | — |
| `rank` | — | — |

---

### Function: `diceResult(squares)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `squares` | — | — |

---

### Function: `pose(point, token)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `point` | — | — |
| `token` | — | — |

---

### Function: `tokenOf(motion, origin)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `motion` | — | — |
| `origin` | — | — |

---

### Function: `uniqueSorted(values)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `values` | — | — |

---

### Function: `levelBases(snapshot)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |

---

### Function: `floorPlanes(snapshot)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |

---

### Function: `surfacePlanes(snapshot)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |

---

### Function: `supportAt(snapshot, position, elevation)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |
| `position` | — | — |
| `elevation` | — | — |

---

### Function: `surfaceAt(snapshot, position, elevation)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |
| `position` | — | — |
| `elevation` | — | — |

---

### Function: `firstSurface(snapshot, from, to, token)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |
| `from` | — | — |
| `to` | — | — |
| `token` | — | — |

---

### Function: `transitionAt(snapshot, position)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |
| `position` | — | — |

---

### Function: `transitionFractions(snapshot, from, to, token, total)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |
| `from` | — | — |
| `to` | — | — |
| `token` | — | — |
| `total` | — | — |

---

### Function: `firstTransition(snapshot, from, to, token, grid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |
| `from` | — | — |
| `to` | — | — |
| `token` | — | — |
| `grid` | — | — |

---

### Function: `kindAt(fraction)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `fraction` | — | — |

---

### Function: `blankRest(elevation, basis)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `elevation` | — | — |
| `basis` | — | — |

---

### Function: `knownRest(floor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `floor` | — | — |

---

### Function: `fallFrom(apex, restElevation, grid, rank, reportFalling, basis)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `apex` | — | — |
| `restElevation` | — | — |
| `grid` | — | — |
| `rank` | — | — |
| `reportFalling` | — | — |
| `basis` | — | — |

---

### Function: `surfaceContact(snapshot, segment = {})`

First floor or ceiling the segment runs into. `elevation` is the feet at contact (not snapped to a square).

---

### Function: `transitionEntry(snapshot, segment = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |
| `segment = {}` | — | — |

---

### Function: `settleDown(snapshot, from, floor, token, grid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |
| `from` | — | — |
| `floor` | — | — |
| `token` | — | — |
| `grid` | — | — |

---

### Function: `returnDown(snapshot, from, origin, token)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |
| `from` | — | — |
| `origin` | — | — |
| `token` | — | — |

---

### Function: `resolveLanding(snapshot, motion = {})`

If `landing` isn't "none" then settling can add a vertical leg (it doesn't count toward the actual or unspent squares).

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | `object` | Floor snapshot from `snapshotFromScene`. |
| `motion` | `object` | Plain throw: origin, destination, requestedSpaces, token size and depth, rank, landing, plus the surfaces ("ignore"), transitions ("allow") and reportFalling switches. |

---

## `src/module/canvas/floor-snapshot.js`

### Function: `firstNumber(...values)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `...values` | — | — |

---

### Function: `firstPositive(...values)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `...values` | — | — |

---

### Function: `gridKind(grid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `grid` | — | — |

---

### Function: `gridFromScene(scene)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `scene` | — | — |

---

### Function: `pairPoints(points)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `points` | — | — |

---

### Function: `rectPoints(x, y, width, height)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `x` | — | — |
| `y` | — | — |
| `width` | — | — |
| `height` | — | — |

---

### Function: `roundCoord(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `rotateRect(x, y, width, height, degrees)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `x` | — | — |
| `y` | — | — |
| `width` | — | — |
| `height` | — | — |
| `degrees` | — | — |

---

### Function: `normalizeShape(shape)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `shape` | — | — |

---

### Function: `holeRing(shape)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `shape` | — | — |

---

### Function: `groupShapes(shapes)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `shapes` | — | — |

---

### Function: `shapesFromRegion(region)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `region` | — | — |

---

### Function: `levelIdsFrom(region)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `region` | — | — |

---

### Function: `elevationBand(region)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `region` | — | — |

---

### Function: `levelsFromScene(scene, state)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `scene` | — | — |
| `state` | — | — |

---

### Function: `surfacesFromScene(scene, state)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `scene` | — | — |
| `state` | — | — |

---

### Function: `transitionsFromScene(scene)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `scene` | — | — |

---

### Function: `snapshotFromScene(scene)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `scene` | — | — |

---

### Function: `queryFloorForToken(tokenDoc)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |

---

## `src/module/canvas/floor-query.js`

### `const EPS`

Works out the floor under a token from a plain scene snapshot.
An upper level's base only counts as a floor when the level has no move surface right at its base.
A floor on a shared boundary goes to the upper level (same as Foundry).
Support uses the footprint inset by a quarter space, but Change Level and Teleport Token regions use the full footprint.
(this also contains a piece of suffering)

---

### Function: `readNumber(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `readBound(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `spaces(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `gridOf(grid = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `grid = {}` | — | — |

---

### Function: `signedArea(ring)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `ring` | — | — |

---

### Function: `clockwise(ring)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `ring` | — | — |

---

### Function: `samePoint(a, b)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `a` | — | — |
| `b` | — | — |

---

### Function: `orient(a, b, c)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `a` | — | — |
| `b` | — | — |
| `c` | — | — |

---

### Function: `onSegment(a, b, point)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `a` | — | — |
| `b` | — | — |
| `point` | — | — |

---

### Function: `pointInRing(point, ring)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `point` | — | — |
| `ring` | — | — |

---

### Function: `properIntersect(a, b, c, d)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `a` | — | — |
| `b` | — | — |
| `c` | — | — |
| `d` | — | — |

---

### Function: `edgesCross(left, right)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `left` | — | — |
| `right` | — | — |

---

### Function: `ringContains(outer, inner)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `outer` | — | — |
| `inner` | — | — |

---

### Function: `ringsOverlap(left, right)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `left` | — | — |
| `right` | — | — |

---

### Function: `rectRing(shape)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `shape` | — | — |

---

### Function: `pointInCircle(point, shape)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `point` | — | — |
| `shape` | — | — |

---

### Function: `pointInEllipse(point, shape)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `point` | — | — |
| `shape` | — | — |

---

### Function: `distanceToSegment(point, a, b)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `point` | — | — |
| `a` | — | — |
| `b` | — | — |

---

### Function: `shapeRing(shape)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `shape` | — | — |

---

### Function: `shapeContains(shape, footprint)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `shape` | — | — |
| `footprint` | — | — |

---

### Function: `shapeOverlaps(shape, footprint)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `shape` | — | — |
| `footprint` | — | — |

---

### Function: `lineIntersect(first, second)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `first` | — | — |
| `second` | — | — |

---

### Function: `centroid(ring)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `ring` | — | — |

---

### Function: `insetConvex(ring, margin)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `ring` | — | — |
| `margin` | — | — |

---

### Function: `convexHull(points)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `points` | — | — |

---

### Function: `cross(origin, a, b)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `origin` | — | — |
| `a` | — | — |
| `b` | — | — |

---

### Function: `rectangularFootprint(position, size)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `position` | — | — |
| `size` | — | — |

---

### Function: `hexVertices(cx, cy, radius, columns)`

Foundry's hex size is the flat-to-flat span, so center to vertex is size / sqrt(3)
(a pointy hex ends up `size` wide and a flat one `size` tall).

---

### Function: `hexCenters(position, size, columns, even)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `position` | — | — |
| `size` | — | — |
| `columns` | — | — |
| `even` | — | — |

---

### Function: `occupiedRing(position, grid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `position` | — | — |
| `grid` | — | — |

---

### Function: `levelIds(surface)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `surface` | — | — |

---

### Function: `finiteBases(levels)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `levels` | — | — |

---

### Function: `usableSurfaces(surfaces)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `surfaces` | — | — |

---

### Function: `implicitGround(snapshot)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |

---

### Function: `trustworthyScene(snapshot)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |

---

### Function: `bandEnds(level)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `level` | — | — |

---

### Function: `inLevelBand(level, elevation)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `level` | — | — |
| `elevation` | — | — |

---

### Function: `startsAt(level, elevation)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `level` | — | — |
| `elevation` | — | — |

---

### Function: `levelAmong(ids, byId, elevation, tokenLevelId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `ids` | — | — |
| `byId` | — | — |
| `elevation` | — | — |
| `tokenLevelId` | — | — |

---

### Function: `highestLevel(ids, byId, elevation, tokenLevelId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `ids` | — | — |
| `byId` | — | — |
| `elevation` | — | — |
| `tokenLevelId` | — | — |

---

### Function: `levelsById(snapshot)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |

---

### Function: `containingIds(byId, elevation)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `byId` | — | — |
| `elevation` | — | — |

---

### Function: `levelForElevation(snapshot, elevation, candidateIds, tokenLevelId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |
| `elevation` | — | — |
| `candidateIds` | — | — |
| `tokenLevelId` | — | — |

---

### Function: `pathLevelAt(snapshot, elevation, moverLevelId)`

Which level's walls apply at a point on a path. It stays the mover's level while
the elevation is inside it, and past that it's whatever level a floor at that
elevation would get.

---

### Function: `ownsBase(surface, level)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `surface` | — | — |
| `level` | — | — |

---

### Function: `baseChoice(lowest, snapshot, tokenLevelId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `lowest` | — | — |
| `snapshot` | — | — |
| `tokenLevelId` | — | — |

---

### Function: `cleanRing(points)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `points` | — | — |

---

### Function: `lineSide(a, b, point)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `a` | — | — |
| `b` | — | — |
| `point` | — | — |

---

### Function: `segmentHit(p, q, a, b)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `p` | — | — |
| `q` | — | — |
| `a` | — | — |
| `b` | — | — |

---

### Function: `chordOnSegment(ring, a, b)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `ring` | — | — |
| `a` | — | — |
| `b` | — | — |

---

### Function: `splitConvexByLine(ring, a, b)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `ring` | — | — |
| `a` | — | — |
| `b` | — | — |

---

### Function: `unionCovers(footprint, shapes, depth = 0)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `footprint` | — | — |
| `shapes` | — | — |
| `depth = 0` | — | — |

---

### Function: `surfaceFloor(group, footprint, snapshot, tokenLevelId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `group` | — | — |
| `footprint` | — | — |
| `snapshot` | — | — |
| `tokenLevelId` | — | — |

---

### Function: `surfaceFloors(surfaces, footprint, snapshot, tokenLevelId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `surfaces` | — | — |
| `footprint` | — | — |
| `snapshot` | — | — |
| `tokenLevelId` | — | — |

---

### Function: `floorsAt(snapshot, footprint, tokenLevelId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | — | — |
| `footprint` | — | — |
| `tokenLevelId` | — | — |

---

### Function: `highestAtOrBelow(floors, elevation)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `floors` | — | — |
| `elevation` | — | — |

---

### Function: `inBand(elevation, region)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `elevation` | — | — |
| `region` | — | — |

---

### Function: `shapesOverlap(shapes, footprint)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `shapes` | — | — |
| `footprint` | — | — |

---

### Function: `transitionFlags(regions, footprint, elevation)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `regions` | — | — |
| `footprint` | — | — |
| `elevation` | — | — |

---

### Function: `emptyResult(transitions = { changeLevel: false, teleportToken: false })`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `transitions = { changeLevel: false` | — | — |
| `teleportToken: false }` | — | — |

---

### Function: `queryFloor(snapshot, position = {})`

`floor` is the highest floor at or below the token (null if there isn't one or we
can't read the scene's floors). `supported` just means the token is standing right on it.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `snapshot` | `object` | Plain scene copy from `snapshotFromScene`. |
| `position` | `object` | Token top-left in pixels, size in grid spaces, elevation, and level id. |

**Returns** `{
  trustworthy: boolean,
  supported: boolean,
  floor: { elevation: number, levelId: string|null, owner: string|null, kind: "ground"|"base"|"surface"` — |null,
  transitions: { changeLevel: boolean, teleportToken: boolean }
}}
