# combat

> **JSDoc coverage: -3544/453 symbols (-782%)**

## `src/module/combat/turn-stamps.js`

### Function: `readTurnStamp(combatant, combat)`

`endedStarted` is the `started` count of the last turn whose End of Turn ran.

---

### Function: `nextTurnStamp(combatant, combat, round = combat?.round)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |
| `combat` | — | — |
| `round = combat?.round` | — | — |

---

### Function: `recordTurnStart(combat, combatant, round = combat?.round)`

Only the GM running the turn lifecycle should call this.

---

### Function: `isTurnStartDue(combatant, combat, round = combat?.round)`

Due if the incoming Combatant's stamp is missing or from an earlier round.
One from this round or later means their Turn Start already ran, like when a
rewind replays the turn.

---

### Function: `isTurnEndDue(combatant, combat)`

Due unless the stamped turn already ended. Unstamped Combatants are always due.

---

### Function: `recordTurnEnd(combat, combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `combatant` | — | — |

---

### Function: `readRoundStamp(combat)`

`reached` is the highest round whose start already ran in this combat (0 if there's none).

---

### Function: `isRoundWorkDue(combat, round)`

End of Round, Combat Start and Start of Round are only due for a round we haven't reached before.

---

### Function: `recordRoundReached(combat, round)`

Only the GM running the turn lifecycle should call this.

---

### Function: `currentTurnIdentity(combat, combatant)`

Null if it isn't their turn. A missing stamp or one from an earlier round means
the Turn Start write is still in flight, so we count this turn as `started + 1`.

---

### Function: `latestTurnIdentity(combat, combatant)`

The Combatant's current turn, or the last one they started if it's off turn.
Before their first turn `started` is 0 and `round` is null.

---

### Function: `sameTurnIdentity(a, b)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `a` | — | — |
| `b` | — | — |

---

### Function: `makeFutureTurnObligation(combat, combatant)`

Obligation that lasts until the end of this Combatant's next actual turn.

---

### Function: `isNextTurnStarted(obligation, combat)`

A Turn Start still in flight counts as started, and so does a missing Combatant.

---

### Function: `isFutureTurnObligationSatisfied(obligation, combat)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `obligation` | — | — |
| `combat` | — | — |

---

### Function: `queueTurnLifecycle(combat, task)`

Turn changes for one combat run one at a time on this client, in the order that they happened.

---

### Function: `turnLifecyclesSettled(combat)`

Resolves once the turn changes already queued for this combat are done here. Never await it from inside one, it would wait on itself.

---

## `src/module/combat/turn-order.js`

### Function: `isRolledCombatant(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `readTiebreak(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `canControlCombatantOrder(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `playerCharacterRank(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `compareCombatants(a, b)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `a` | — | — |
| `b` | — | — |

---

### Function: `joinInitiativeGroup(initiative, { above, below })`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `initiative` | — | — |
| `{ above` | — | — |
| `below }` | — | — |

---

### Function: `placementForSlot({ above = null, below = null, dropped = null } = {})`

If the neighbors differ by 2 or more, return an integer between them.
If they match or differ by 1, keep an integer Speed and set turnTiebreak.

---

### Function: `neighborsFromDrop(combat, dropped, target, placeBefore)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `dropped` | — | — |
| `target` | — | — |
| `placeBefore` | — | — |

---

### Function: `sameNeighbor(left, right)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `left` | — | — |
| `right` | — | — |

---

### Function: `isAlreadyInSlot(combat, combatant, above, below)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `combatant` | — | — |
| `above` | — | — |
| `below` | — | — |

---

### Function: `resequenceGroupUpdates(combat, dropped, initiative, above)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `dropped` | — | — |
| `initiative` | — | — |
| `above` | — | — |

---

### Function: `applyCombatantPlacement(combat, combatant, placement, operation = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `combatant` | — | — |
| `placement` | — | — |
| `operation = {}` | — | — |

---

### Function: `planCombatantPlacement(combat, combatant, { above = null, below = null } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `combatant` | — | — |
| `{ above = null` | — | — |
| `below = null } = {}` | — | — |

---

### Function: `placeCombatantInOrder(combat, combatant, { above = null, below = null } = {}, operation = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `combatant` | — | — |
| `{ above = null` | — | — |
| `below = null } = {}` | — | — |
| `operation = {}` | — | — |

---

### Function: `applyManualInitiative(combat, combatant, value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `combatant` | — | — |
| `value` | — | — |

---

## `src/module/combat/recycled-evade.js`

### Function: `recycledEvadeStep(outfit)`

if the outfit has the swift property, the penalty is 1 instead of 2

---

### Function: `getRecycledEvade(actor)`

@param {Actor|null|undefined} actor

**Returns** `{ active: boolean, penalty: number` — |null}

---

### Function: `grantRecycledEvadeLocal(actor, outfit = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `outfit = null` | — | — |

---

### Function: `bumpRecycledEvadeLocal(actor, outfit = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `outfit = null` | — | — |

---

### Function: `clearRecycledEvadeLocal(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `grantRecycledEvade(actor, outfit = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `outfit = null` | — | — |

---

### Function: `bumpRecycledEvade(actor, outfit = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `outfit = null` | — | — |

---

### Function: `clearRecycledEvade(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `recycledPowerPenalty(actor)`

@param {Actor|null|undefined} actor

**Returns** `number` — —

---

## `src/module/combat/movement.js`

### Function: `combatantForToken(tokenDoc)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |

---

### Function: `actorCombatToken(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `isMeasureGrid(grid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `grid` | — | — |

---

### Function: `readMeasuredSpaces(measured, grid)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `measured` | — | — |
| `grid` | — | — |

---

### Function: `chebyshevSpaces(waypoints, size)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `waypoints` | — | — |
| `size` | — | — |

---

### Function: `measureWaypointSpaces(tokenDoc, waypoints)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |
| `waypoints` | — | — |

---

### Function: `paidWaypoints(waypoints)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `waypoints` | — | — |

---

### Function: `chunkSpaceCost(tokenDoc, chunk)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |
| `chunk` | — | — |

---

### Function: `tokenHistorySquareCost(tokenDoc)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |

---

### Function: `actorHistorySquareCost(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `actorSquaresExhausted(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `exhaustRemainingSquares(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `refreshActorFromToken(tokenDoc)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |

---

### Function: `isUndoMovement(movement, operation)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `movement` | — | — |
| `operation` | — | — |

---

### Function: `isFreeMovement(movement)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `movement` | — | — |

---

### Function: `isCombatantCollection(collection)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `collection` | — | — |

---

### Function: `registerCombatDocument()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Class: `CombatPMTTRPG` *(extends `Base`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `registerCombatantDocument()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Class: `CombatantPMTTRPG` *(extends `Base`)*

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `registerCombatMovement()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/combat/interception.js`

### `const sources`

@type {{ id: string, order: number, seq: number, listCandidates: Function }[]}

---

### Function: `registerInterceptorSource({ id, order = 0, listCandidates } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ id` | — | — |
| `order = 0` | — | — |
| `listCandidates } = {}` | — | — |

---

### Function: `unregisterInterceptorSource(id)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `id` | — | — |

---

### Function: `sortedSources()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `interceptionContextFromClash(state, { combat = null, attackerItem = null } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |
| `{ combat = null` | — | — |
| `attackerItem = null } = {}` | — | — |

---

### Function: `validCandidate(raw)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `raw` | — | — |

---

### Function: `listInterceptors(ctx)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `ctx` | — | — |

---

### Function: `buildInterceptionMetadata(state, candidate, ctx = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |
| `candidate` | — | — |
| `ctx = null` | — | — |

---

### Function: `readInterception(state)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |

---

## `src/module/combat/combatant-match.js`

### Function: `entryTokenId(entry)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `entry` | — | — |

---

### Function: `entryActorId(entry)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `entry` | — | — |

---

### Function: `listCombatants(combatants)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatants` | — | — |

---

### Function: `turnsOf(combat)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |

---

### Function: `currentTurnCombatant(combat)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |

---

### Function: `combatantName(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `combatantOf(combat, id)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `id` | — | — |

---

### Function: `exactCombatantForToken(combat, tokenId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `tokenId` | — | — |

---

### Function: `findCombatant({ combatants, tokenId = null, actorId = null } = {})`

A token id matches that combatant only.
An actor id matches only when one combatant has it.

---

### Function: `uniqueActorEntries(entries, actorOf = (entry)`

Keeps the first entry for each actor uuid.

---

### Function: `hasAnotherCombatantForActor(combatants, actor, exceptCombatantId = null)`

True when another entry has this actor's uuid.

---

## `src/module/combat/combat.js`

### Function: `combatHasBegun(combat)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |

---

### Function: `identitySet(map, combat)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `map` | — | — |
| `combat` | — | — |

---

### Function: `rememberCombatStart(combat, key)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `key` | — | — |

---

### Function: `forgetCombatStart(combat, key)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `key` | — | — |

---

### Function: `rememberCombatEnd(combat, key)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `key` | — | — |

---

### Function: `forgetCombatEnd(combat, key)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `key` | — | — |

---

### Function: `actorFields(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `resolveCombatUserId(userId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `userId` | — | — |

---

### Function: `emitCombatStartForCombatant(combat, combatant, userId, { beginCombat = false } = {})`

[On Combat Start] for one person in the fight.
Does nothing until Begin Combat, and skips anyone who already got it.
Refills the Combatant's Action Economy first.

---

### Function: `emitCombatEndForCombatant(combat, combatant, userId)`

[On Combat End] when someone is pulled out of a fight that's still going.

---

### Function: `emitCombatEndForEncounter(combat, userId)`

[On Combat End] for everyone still in the fight, right before Combat is deleted.

---

### Function: `eachCombatActor(fn)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `fn` | — | — |

---

### Function: `runQueuedTurnLifecycle(combat, snapshot, after, context)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `snapshot` | — | — |
| `after` | — | — |
| `context` | — | — |

---

### Function: `isWorldTrackerRevealAll()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `trackerElement(target)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `target` | — | — |

---

### Function: `trackerRevealRaw(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `isBulkTrackerReveal(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `getRevealMap(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `isStatRevealed(combatant, key)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |
| `key` | — | — |

---

### Function: `isAnyStatRevealed(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `revealKeyFromTarget(target)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `target` | — | — |

---

### Function: `trackerRevealUpdate(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `statRevealLabel(key)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `key` | — | — |

---

### Function: `combatantFromTrackerCard(target)`

Combatant for a tracker card. `data-combatant-id` is the Combatant id,
not the Actor (unlinked tokens share a world actor).

---

### Function: `combatantIdFromDrag(event)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `event` | — | — |

---

### Function: `clearTrackerDropState()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `combatantCanvasToken(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `canPingOrPanCombatant(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `trackerActionStates(combatant, combat)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |
| `combat` | — | — |

---

### Function: `delayControlFor(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `returnsNextRound(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Class: `CombatSidebarPMTTRPG`

Custom combat tracker. Context menu is bound once on document.body.

---

### Function: `showStat(key)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `key` | — | — |

---

### Function: `showRevealEye(key)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `key` | — | — |

---

### Function: `showHiddenEye(key)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `key` | — | — |

---

### Function: `gmCanReveal(target)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `target` | — | — |

---

## `src/module/combat/clashing.js`

### Function: `initiateAttack(attackPayload)`

Called when an actor makes an attack with a weapon.
Posts the attack card and waits for a retaliator (rolls happen in _executeClash).
Nothing gets paid until the clash runs.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `attackPayload` | `AttackPayload` | — |

**Returns** `Promise<{ ok: boolean, state?: ClashStateData, reason?: string` — >}

---

### Function: `handleRetaliateClick(state, { isIntercept = false } = {})`

Handles a click on "Retaliate" or "Intercept" buttons on the attack card.
Retaliate always answers as the clash target. Intercept answers as the
currently selected token.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | `ClashStateData` | — |
| `options` *(optional)* | `object` | — |
| `options.isIntercept` *(optional, default: `false`)* | `boolean` | — |

**Returns** `Promise<void>` — —

---

### Function: `handleProtectClick(state)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |

---

### Function: `_warnClaimWithoutGM()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `_confirmClaim(messageId, claimId)`

Authors and GMs will update the message directly while everyone else relays
through the GM. Unfortunately two claims relayed at the same time can still
race (last write wins).

---

### Function: `judge()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `finish(outcome)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `outcome` | — | — |

---

### Function: `_isRangedWeapon(weapon)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `weapon` | — | — |

---

### Function: `_reactionAppliedToolActionType(type)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `type` | — | — |

---

### Function: `_counterDamageType(counterItem, choice, appliedTool)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `counterItem` | — | — |
| `choice` | — | — |
| `appliedTool` | — | — |

---

### Function: `_rangedAttackConsumesMovement(weapon)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `weapon` | — | — |

---

### Function: `_isEvadeLike(choice)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `choice` | — | — |

---

### Function: `_retaliatorItemLabel(choice)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `choice` | — | — |

---

### Function: `attackTokenId(actor, explicitTokenId = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `explicitTokenId = null` | — | — |

---

### Function: `_getClashTargetRetaliator(state)`

Retaliate answers as the clash target.

---

### Function: `_getSelectedRetaliator()`

Intercept answers as the currently selected token.

**Returns** `{ actor: Actor|null, tokenId: string|null` — }

---

### `const PMTTRPGClashAPI`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/combat/clash-state.js`

### `const CLASH_PHASES`

ClashState is the canonical data object for a single clash lifecycle.
It is created when an attack is initiated, passed through every phase,
serialised into chat message flags for persistence, and rehydrated when
a player clicks a chat button.

Nothing in this file touches Foundry documents directly — it only
describes shape and serialisation. All mutation happens in clash.js.

Phases:
  "pending"   — attack roll posted, waiting for a retaliator
  "rolling"   — retaliator chosen, rolls pending
  "resolved"  — clash winner determined, result card posted
  "closed"    — damage taken / action completed

---

### `const RETALIATION_TYPES`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `retaliationDefenseKind(type)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `type` | — | — |

---

### `const CLASH_RESULTS`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `getClashDamageSourceRef(state)`

Combatant who caused the HP/ST on the result card, if any.
Evade regen and ranged Block exemption have no source.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | `object|null|undefined` | — |

**Returns** `{
  actorId: string|null,
  tokenId: string|null,
  itemId: string|null,
  skillId: string|null,
  appliedToolId: string|null,
  ammoId: string|null,` — |null}

---

### Function: `serialiseClashState(state)`

Serialises a ClashState to a plain object safe to store in message flags.
Currently a no-op (state is already plain) but provides an extension point.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | `ClashStateData` | — |

**Returns** `object` — —

---

### Function: `deserialiseClashState(raw)`

Deserialises a ClashState from message flags.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `raw` | `object` | — |

**Returns** `ClashStateData` — —

---

### `const CLASH_FLAG_SCOPE`

Flag namespace used on ChatMessage documents.

---

### `const CLASH_FLAG_KEY`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/combat/clash-rolls.js`

### Function: `getEquippedOutfit(actor)`

Returns the equipped outfit for an actor, or null.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | `ActorPMTTRPG` | — |

**Returns** `Item|null` — —

---

### Function: `signed(n)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `n` | — | — |

---

### Function: `labeledClashPower(bonuses, field)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `bonuses` | — | — |
| `field` | — | — |

---

### Function: `pushLabeledRows(rows, labeled)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `rows` | — | — |
| `labeled` | — | — |

---

### Function: `pushRow(rows, key, labelKey, detail, extra = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `rows` | — | — |
| `key` | — | — |
| `labelKey` | — | — |
| `detail` | — | — |
| `extra = {}` | — | — |

---

### Function: `formMaxBonus(formProperty)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `formProperty` | — | — |

---

### Function: `handPowerBonus(handProperty)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `handProperty` | — | — |

---

### Function: `formLabel(formProperty)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `formProperty` | — | — |

---

### Function: `handLabel(handProperty)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `handProperty` | — | — |

---

### Function: `itemCombatDiceMods(actor, item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `item` | — | — |

---

### Function: `usedKitCombatDiceMods(actor, hostItem, skillItem)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `hostItem` | — | — |
| `skillItem` | — | — |

---

### Function: `dieBase(die, sources, fallbackSides)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `die` | — | — |
| `sources` | — | — |
| `fallbackSides` | — | — |

---

### Function: `buildOffensiveDiceParts(actor, weaponItem, clashBonuses = {}, skillItem = null)`

Returns the computed evade dice string from the actor's equipped outfit,
falling back to the system default.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | `ActorPMTTRPG` | — |

**Returns** `{ formula: string, breakdown: RollBreakdownRow[]` — }

---

### Function: `buildDefenseDiceParts(actor, kind, clashBonuses = {}, skillItem = null)`

Returns the computed block dice string from the actor's equipped outfit.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | `ActorPMTTRPG` | — |

**Returns** `{ formula: string, breakdown: RollBreakdownRow[]` — }

---

### Function: `resolveClashRollMode(bonuses = {}, options = {})`

Advantage and Disadvantage cancel

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `bonuses` *(optional)* | `object` | — |
| `options` *(optional)* | `object` | — |
| `options.advantage` *(optional)* | `boolean` | — |
| `options.disadvantage` *(optional)* | `boolean` | — |

**Returns** `"normal"|"advantage"|"disadvantage"|"canceled"` — —

---

### Function: `wrapFormulaForRollMode(formula, mode)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `formula` | — | — |
| `mode` | — | — |

---

### Function: `poolSubtotals(roll)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `roll` | — | — |

---

### Function: `walk(terms)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `terms` | — | — |

---

### Function: `rollDataForActor(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `rollAttack(actor, weaponItem, bonuses = {}, options = {})`

@param {ActorPMTTRPG} actor

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `weaponItem` | `Item` | — |
| `bonuses` *(optional)* | `object` | attackPower and attackMax for one clash side |
| `options` *(optional)* | `object` | — |
| `options.advantage` *(optional)* | `boolean` | — |
| `options.disadvantage` *(optional)* | `boolean` | — |
| `options.skillItem` *(optional)* | `Item|null` | — |

**Returns** `Promise<RollResult>` — —

---

### Function: `rollEvade(actor, bonuses = {}, options = {})`

@param {ActorPMTTRPG} actor

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `bonuses` *(optional)* | `object` | — |
| `options` *(optional)* | `object` | — |
| `options.skillItem` *(optional)* | `Item|null` | — |

**Returns** `Promise<RollResult>` — —

---

### Function: `rollBlock(actor, bonuses = {}, options = {})`

@param {ActorPMTTRPG} actor

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `bonuses` *(optional)* | `object` | — |
| `options` *(optional)* | `object` | — |
| `options.skillItem` *(optional)* | `Item|null` | — |

**Returns** `Promise<RollResult>` — —

---

### Function: `rollCounter(actor, weaponItem, bonuses = {}, options = {})`

@param {ActorPMTTRPG} actor

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `weaponItem` | `Item` | — |
| `bonuses` *(optional)* | `object` | — |
| `options` *(optional)* | `object` | — |

**Returns** `Promise<RollResult>` — —

---

### Function: `resolveClash(attackTotal, defenseTotal)`

@param {number} attackTotal

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `defenseTotal` | `number` | — |

**Returns** `{ result: string, margin: number` — }

---

### Function: `resolveBlockWinStDamage(blockTotal, margin, outfitProperty)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `blockTotal` | — | — |
| `margin` | — | — |
| `outfitProperty` | — | — |

---

## `src/module/combat/clash-economy.js`

### Function: `reactionKindForRetaliation(type)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `type` | — | — |

---

### Function: `itemIdOf(item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `item` | — | — |

---

### Function: `currentCombat(options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `options = {}` | — | — |

---

### Function: `clashCombat(state)`

The combat holding this clash's tokens, which isn't always the one this client's tracker is showing.

---

### Function: `holds(combat)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |

---

### Function: `canPayRetaliation(actor, type, item, options = {})`

If you pass `options.state` then a defense this card already paid for counts as affordable.

---

### Function: `defenderIdentityFor(actor, { tokenId = null, kind = null, item = null, combat = null } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `{ tokenId = null` | — | — |
| `kind = null` | — | — |
| `item = null` | — | — |
| `combat = null } = {}` | — | — |

---

### Function: `economyResult(extra)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `extra` | — | — |

---

### Function: `declaredEconomyResult(result, success = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `result` | — | — |
| `success = {}` | — | — |

---

### Function: `clashEconomyAbortKey(reason, cannotPayKey)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `reason` | — | — |
| `cannotPayKey` | — | — |

---

### Function: `clashEconomyNote(declaration)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `declaration` | — | — |

---

### Function: `markAttackerEconomyCommitted(state, declaration = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |
| `declaration = null` | — | — |

---

### Function: `sameId(left, right)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `left` | — | — |
| `right` | — | — |

---

### Function: `defenderCommitmentIdentity({ combatantId = null, tokenId = null, kind = null, itemId = null } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ combatantId = null` | — | — |
| `tokenId = null` | — | — |
| `kind = null` | — | — |
| `itemId = null } = {}` | — | — |

---

### Function: `defenderCommitments(state)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |

---

### Function: `commitmentMatches(saved, identity)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `saved` | — | — |
| `identity` | — | — |

---

### Function: `findDefenderCommitment(state, identity = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |
| `identity = {}` | — | — |

---

### Function: `markDefenderEconomyCommitted(state, { declaration = null, combatantId = null, tokenId = null, kind = null, itemId = null } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |
| `{ declaration = null` | — | — |
| `combatantId = null` | — | — |
| `tokenId = null` | — | — |
| `kind = null` | — | — |
| `itemId = null } = {}` | — | — |

---

### Function: `preflightAttackerResources(state, { attackerAmmo = null } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |
| `{ attackerAmmo = null } = {}` | — | — |

---

### Function: `preflightDefenderResources(choice = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `choice = {}` | — | — |

---

### Function: `claimSide(side, entryId, combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `side` | — | — |
| `entryId` | — | — |
| `combatant` | — | — |

---

### Function: `resolveClashAttackerCombatant(state, attackerActor, combat)`

If combatantForReactionToken has to pick and it's ambiguous we get null and
there's no Assist.

---

### Function: `withClashClaimLock(messageId, task)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `messageId` | — | — |
| `task` | — | — |

---

### `const RETALIATOR_CLAIM_FIELDS`

The fields a claim writes and an unlock clears. The GM only copies these and
`defenderConsume` from a claimant's patch.

---

### Function: `plainPatch(patch)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `patch` | — | — |

---

### Function: `claimingUser(meta)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `meta` | — | — |

---

### Function: `commitClashClaimAsGM(data = {}, meta = {})`

Moves the card from PENDING to ROLLING if the claimant can act for the target, a
valid protector or the token they intercept with (Runs on the Primary GM).

---

### Function: `unlockClashState(state)`

Anything already paid stays marked as paid.

---

## `src/module/combat/clash-dialog.js`

### Function: `canBreakFreeAfterHit(actor, combatant, combat)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `combatant` | — | — |
| `combat` | — | — |

---

### Function: `showInterceptConfirmDialog(actorName = "")`

Shows a two-click "Are you sure you want to intercept?" confirmation.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actorName` *(optional)* | `string` | — |

**Returns** `Promise<boolean>` — —

---

### Function: `affordable(type, item)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `type` | — | — |
| `item` | — | — |

---

### Function: `outfitEntries(type)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `type` | — | — |

---

### Function: `hideRange()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `_skillTypeForRetaliation(type)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `type` | — | — |

---

### Function: `_applyToForRetaliation(type)`

Weapon Applied Tools declare on Attack/Counter.
Outfit Applied Tools declare on Block/Evade.

---

### Function: `_appliedToolEntries(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `map(applyTo)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `applyTo` | — | — |

---

### Function: `_readRetaliationForm(dialog, actor)`

Reads and validates the submitted retaliation form.
Returns a RetaliationChoice or null.

---

### Function: `promptRangedAmmo(actor, weapon, { shootLabel } = {})`

Prompt ammo and dry-fire for ranged attacks.

**@param** — {{ shootLabel?: string }} [options]

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | `ActorPMTTRPG` | — |
| `weapon` | `Item` | — |

**Returns** `Promise<{ ammo: Item|null, consumeAmmo: boolean, dryFire: boolean` — |null>}

---

### Function: `_counterRangeFromOption(src)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `src` | — | — |

---

### Function: `_counterOutOfRangeNotice(check)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `check` | — | — |

---

### Function: `_bindRetaliationDialogListeners(dialog, { retaliatorTokenId = null } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `dialog` | — | — |
| `{ retaliatorTokenId = null } = {}` | — | — |

---

### Function: `consuming()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `refreshAffordability()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `refreshAssist()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `refreshBreakFree()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `fillNoneOption(select, label)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `select` | — | — |
| `label` | — | — |

---

### Function: `refreshToolConsume()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `refreshConsume()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `refreshTools()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `refreshCounterRange()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `refreshPicker()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `_dialogClasses()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/combat/clash-chat.js`

### Function: `emitChatUpdate(messageId, { content, flags = null } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `messageId` | — | — |
| `{ content` | — | — |
| `flags = null } = {}` | — | — |

---

### Function: `isChatUpdatePayload(data)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `data` | — | — |

---

### Function: `flagsToUpdate(flags)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `flags` | — | — |

---

### Function: `applyChatUpdate(data)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `data` | — | — |

---

### Function: `postAttackCard(state, attackRoll = null, messageId = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |
| `attackRoll = null` | — | — |
| `messageId = null` | — | — |

---

### Function: `updateAttackCard(messageId, updatedState)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `messageId` | — | — |
| `updatedState` | — | — |

---

### Function: `postResultCard(state, defenseRoll = null, messageId = null, attackRoll = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |
| `defenseRoll = null` | — | — |
| `messageId = null` | — | — |
| `attackRoll = null` | — | — |

---

### Function: `enhanceClashRollBreakdown(message, html)`

@param {ChatMessage} message

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `html` | `HTMLElement` | — |

---

### `const tips`

/** @type {{ el: Element, rows: object[]|null|undefined }[]}

---

### Function: `enhanceClashRetaliateControls(message, html)`

Only users who can act for the clash target (owners and the GM) see the Retaliate button.

---

### Function: `enhanceClashProtectControls(message, html)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `message` | — | — |
| `html` | — | — |

---

### Function: `registerClashChatListeners()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `getClashStateFromMessage(messageId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `messageId` | — | — |

---

### Function: `getClashApplyTarget(state)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |

---

### Function: `resolveClashCombatant(actorId, tokenId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actorId` | — | — |
| `tokenId` | — | — |

---

### Function: `clashMessageSpeaker(actorId, tokenId, alias = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actorId` | — | — |
| `tokenId` | — | — |
| `alias = null` | — | — |

---

### Function: `_dsnSpeakerForCombatant(actorId, tokenId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actorId` | — | — |
| `tokenId` | — | — |

---

### Function: `_showClashDice(roll, actorId, tokenId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `roll` | — | — |
| `actorId` | — | — |
| `tokenId` | — | — |

---

### Function: `protectingLine(state)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |

---

### Function: `_economyTags({ consumed = true, offTurn = false, source = null, asReaction = false } = {}, economyKey)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ consumed = true` | — | — |
| `offTurn = false` | — | — |
| `source = null` | — | — |
| `asReaction = false } = {}` | — | — |
| `economyKey` | — | — |

---

### Function: `clashEconomyLines(state)`

The economy line under each side. Before the clash it's what was picked on
the attack card, after it's whatever the declarations recorded.

---

### Function: `_attackCardI18n(state)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |

---

### Function: `_resultCardI18n(state, applyTarget = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |
| `applyTarget = null` | — | — |

---

## `src/module/combat/opportunity/opportunity-session.js`

### `const OPPORTUNITY_SESSION_STATES`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const OPPORTUNITY_DECISION_STATES`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const OPPORTUNITY_DECISIONS`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const OPPORTUNITY_DECISION_REASONS`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const OPPORTUNITY_FLAG_SCOPE`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const OPPORTUNITY_FLAG_KEY`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `opportunityIdFor(movementId, pathIndex, reactorCombatantId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `movementId` | — | — |
| `pathIndex` | — | — |
| `reactorCombatantId` | — | — |

---

### Function: `resolveSession(sessionOrId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `sessionOrId` | — | — |

---

### Function: `findDecision(session, opportunityId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |
| `opportunityId` | — | — |

---

### Function: `pathEntryMatchesCell(entry, cell)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `entry` | — | — |
| `cell` | — | — |

---

### Function: `attachPathMeta(cell, path)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `cell` | — | — |
| `path` | — | — |

---

### Function: `buildDecision(movementId, opportunity, path)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `movementId` | — | — |
| `opportunity` | — | — |
| `path` | — | — |

---

### Function: `sessionIsTerminal(session)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |

---

### Function: `sessionWasAbandoned(session)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |

---

### Function: `isOpenAttackState(state)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |

---

### Function: `isOrchestrationResolvedState(state)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |

---

### Function: `isDecisionResolutionComplete(decision)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `decision` | — | — |

---

### Function: `notifySession(session)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |

---

### Function: `refreshSessionState(session)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |

---

### Function: `registerSession(session)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |

---

### Function: `forgetAliases(session)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |

---

### Function: `forgetSession(session)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |

---

### Function: `resolveMovementId(input = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `input = {}` | — | — |

---

### Function: `reject(reason, extra = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `reason` | — | — |
| `extra = {}` | — | — |

---

### Function: `reactorIdsMatch(decision, provided = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `decision` | — | — |
| `provided = {}` | — | — |

---

### Function: `getOpportunitySession(movementId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `movementId` | — | — |

---

### Function: `bindOpportunitySessionMovementId(sessionOrId, foundryMovementId)`

Aliases a later Foundry movement id onto an existing session. Opportunity ids keep the original session id.

---

### Function: `subscribeOpportunitySession(sessionOrId, listener)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `sessionOrId` | — | — |
| `listener` | — | — |

---

### Function: `isCheckpointOrchestrationReady(checkpoint)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `checkpoint` | — | — |

---

### Function: `waitForOpportunityCheckpointResolution(sessionOrId, checkpoint)`

Resolves with `ok: true` once every decision at the checkpoint is done (a
resolution error counts as done), or `ok: false` if the session ends first.

---

### Function: `unsubscribe()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `finish(payload)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `payload` | — | — |

---

### Function: `check()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `getOpportunitySessionByOpportunityId(opportunityId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `opportunityId` | — | — |

---

### Function: `listOpportunitySessions()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `getCurrentCheckpoint(sessionOrId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `sessionOrId` | — | — |

---

### Function: `getOpportunityDecision(sessionOrId, opportunityId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `sessionOrId` | — | — |
| `opportunityId` | — | — |

---

### Function: `getAwaitingAttackDecisions(sessionOrId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `sessionOrId` | — | — |

---

### Function: `createOpportunitySession(input = {})`

Only `analysis.automaticCheckpoints` turn into session checkpoints. The raw ones
and the repeated exits stay on the session for diagnostics.

---

### Function: `createOpportunitySessionFromMovement(input = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `input = {}` | — | — |

---

### Function: `createOpportunitySessionFromCheckpoints(input = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `input = {}` | — | — |

---

### Function: `decideOpportunityPass(sessionOrId, opportunityId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `sessionOrId` | — | — |
| `opportunityId` | — | — |

---

### Function: `decideOpportunityAttack(sessionOrId, opportunityId, options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `sessionOrId` | — | — |
| `opportunityId` | — | — |
| `options = {}` | — | — |

---

### Function: `claimOpportunityAttackResolution(sessionOrId, opportunityId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `sessionOrId` | — | — |
| `opportunityId` | — | — |

---

### Function: `restoreOpportunityAttackIntent(sessionOrId, opportunityId, options = {})`

Only call this for failures before the attack is declared and its cost is paid.

---

### Function: `commitOpportunityAttackDeclaration(sessionOrId, opportunityId, extras = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `sessionOrId` | — | — |
| `opportunityId` | — | — |
| `extras = {}` | — | — |

---

### Function: `failOpportunityAttackResolution(sessionOrId, opportunityId, result = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `sessionOrId` | — | — |
| `opportunityId` | — | — |
| `result = null` | — | — |

---

### Function: `applyOpportunityAttackOutcome(sessionOrId, opportunityId, result = null)`

`movementRisk: false` keeps the previous movement directive, and
`resolutionComplete: false` leaves the checkpoint paused even if the directive is known.

---

### Function: `markOpportunityAttackResolved(sessionOrId, opportunityId, result = null)`

For after the Opportunity Attack clash finishes. The Attack has to be claimed or
committed already. A pending or just chosen one gets rejected.

---

### Function: `advanceCheckpoint(sessionOrId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `sessionOrId` | — | — |

---

### Function: `finishSession(sessionOrId, state)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `sessionOrId` | — | — |
| `state` | — | — |

---

### Function: `completeOpportunitySession(sessionOrId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `sessionOrId` | — | — |

---

### Function: `cancelOpportunitySession(sessionOrId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `sessionOrId` | — | — |

---

### Function: `expireOpportunitySession(sessionOrId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `sessionOrId` | — | — |

---

### Function: `forcePassPendingOpportunities(sessionOrId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `sessionOrId` | — | — |

---

### Function: `opportunityFlagsOnMessage(message)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `message` | — | — |

---

### Function: `sessionForOpportunityFlags(flags)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `flags` | — | — |

---

### Function: `forcePassOpportunitiesForRemovedChat(message, options = {})`

Deleting the card or flushing the log removes the only control for a pending
Opportunity. Attacks that are already resolving are left alone.

---

### Function: `expirePendingOpportunityDecision(sessionOrId, opportunityId, extras = {})`

Expires a pending Opportunity without recording it as a voluntary Pass.

---

### Function: `serializeOpportunityDecision(decision, extras = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `decision` | — | — |
| `extras = {}` | — | — |

---

### Function: `hydrateOpportunitySessionFromFlags(flags)`

Rebuilds a pending Opportunity from chat flags after a reload, but not the paused movement.

---

### Function: `applyFlagFields(decision, flags)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `decision` | — | — |
| `flags` | — | — |

---

### Function: `applyOpportunityFlagsToSession(flags)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `flags` | — | — |

---

## `src/module/combat/opportunity/opportunity-prompt.js`

### Function: `isOpportunityActingUser({ actor, tokenId, user = game.user } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ actor` | — | — |
| `tokenId` | — | — |
| `user = game.user } = {}` | — | — |

---

### Function: `canAnswerOpportunity({ actor, tokenId, user = game.user } = {})`

The prompt goes to one user, but anyone who can act as the reactor (its owners and the GM) can answer it.

---

### Function: `mirrorOpportunityDecision(session, decision, extras = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |
| `decision` | — | — |
| `extras = {}` | — | — |

---

### Function: `reasonLocalization(reason)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `reason` | — | — |

---

### Function: `presentOpportunitySession(session)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |

---

### Function: `expireOpportunityPromptSurface(session, extras = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |
| `extras = {}` | — | — |

---

### Function: `handleOpportunityForcePass({ movementId, messageId } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ movementId` | — | — |
| `messageId } = {}` | — | — |

---

### Function: `enhanceOpportunityCard(message, html)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `message` | — | — |
| `html` | — | — |

---

### Function: `releaseOpportunitiesForRemovedChat(message, options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `message` | — | — |
| `options = {}` | — | — |

---

### Function: `registerOpportunityPromptListeners()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `weaponChoices(actor, eligibleWeaponIds)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `eligibleWeaponIds` | — | — |

---

### Function: `opportunityCardControlsEnabled(flags, session)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `flags` | — | — |
| `session` | — | — |

---

### Function: `buildOpportunityDecisionView(session, decision, extras = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |
| `decision` | — | — |
| `extras = {}` | — | — |

---

## `src/module/combat/opportunity/opportunity-preferences.js`

### Function: `normalizePreference(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `getOpportunityPromptPreference(user)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `user` | — | — |

---

### Function: `isOpportunityPromptingEnabledForUser(user)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `user` | — | — |

---

### Function: `actingUserForOpportunity(opportunity)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `opportunity` | — | — |

---

### Function: `filterAutomaticCheckpointsByPromptPreference(checkpoints)`

Drops the automatic Opportunities whose acting user set the prompt preference
to Off, before a session can pause for them (Ask is the default).

---

### Function: `currentUserIsGM()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `readAdminSetting()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `isAdministrativeMovementActive(options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `options = {}` | — | — |

---

### Function: `setAdministrativeMovementHeld(held)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `held` | — | — |

---

### Function: `ensureAdminBadge()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `refreshAdministrativeMovementBadge()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `registerOpportunityPreferenceSettings()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `registerOpportunityKeybindings()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### Function: `registerOpportunityClientControls()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/combat/opportunity/opportunity-path.js`

### `const ANALYSIS_ORIGIN_SOURCE_INDEX`

`sourcePathIndex` for the origin cell we prepend (it isn't on the Foundry path).

---

### Function: `asPointList(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `serializeRawWaypoint(point)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `point` | — | — |

---

### Function: `resolveSourcePoints({ token, waypoints, completePath, origin } = {})`

Uses `completePath` if we have it, otherwise `getCompleteMovementPath` fills
in the steps between the waypoints, and the raw waypoints are the last fallback.

---

### Function: `recordedElevationsDiffer(a, b)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `a` | — | — |
| `b` | — | — |

---

### Function: `sameCell(a, b)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `a` | — | — |
| `b` | — | — |

---

### Function: `matchUserWaypointIndex(cell, userCells)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `cell` | — | — |
| `userCells` | — | — |

---

### Function: `segmentWaypointIndex(pathIndex, userCells, cells)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `pathIndex` | — | — |
| `userCells` | — | — |
| `cells` | — | — |

---

### Function: `samePoint(a, b)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `a` | — | — |
| `b` | — | — |

---

### Function: `inferOpportunityOrigin(token, explicit)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |
| `explicit` | — | — |

---

### Function: `expanderInputFor(waypoints, origin)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `waypoints` | — | — |
| `origin` | — | — |

---

### Function: `ensureOpportunityAnalysisOrigin(cells, origin, options = {})`

Foundry's complete paths often leave out the Token's current cell, so we add
it to the front if it's missing (the committed waypoints don't change).

---

## `src/module/combat/opportunity/opportunity-orchestrator.js`

### Function: `warnUser(key, extra)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `key` | — | — |
| `extra` | — | — |

---

### Function: `movementInstruction(tokenDoc, options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |
| `options = {}` | — | — |

---

### Function: `isOpportunityContinuation(options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `options = {}` | — | — |

---

### Function: `originContinuationId(options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `options = {}` | — | — |

---

### Function: `hasOpportunityTokenLock(tokenDoc)`

Just reads the Opportunity token lock, without the warning or the stale-lock
cleanup that shouldBlockOverlappingOpportunityMove does.

---

### Function: `shouldBlockOverlappingOpportunityMove(tokenDoc, options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |
| `options = {}` | — | — |

---

### Function: `movementMethod(instruction, options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `instruction` | — | — |
| `options = {}` | — | — |

---

### Function: `waypointList(instruction, changed = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `instruction` | — | — |
| `changed = {}` | — | — |

---

### Function: `actionIsTeleport(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `originFromToken(tokenDoc)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |

---

### Function: `positionsEqual(a, b)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `a` | — | — |
| `b` | — | — |

---

### Function: `asWaypointList(waypoints)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `waypoints` | — | — |

---

### Function: `stampMovementInstruction(tokenDoc, waypoints, options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |
| `waypoints` | — | — |
| `options = {}` | — | — |

---

### Function: `snapshotDeferredMove(tokenDoc, waypoints, options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |
| `waypoints` | — | — |
| `options = {}` | — | — |

---

### Function: `continuationMoveOptions(tokenDoc, session, deferred)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |
| `session` | — | — |
| `deferred` | — | — |

---

### Function: `completePathFor(tokenDoc, waypoints)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |
| `waypoints` | — | — |

---

### Function: `findOpportunityWaypointIndex(waypoints, pauseAt)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `waypoints` | — | — |
| `pauseAt` | — | — |

---

### Function: `waypointPathIndexes(waypoints, path)`

Matches in path order. A waypoint that returns to an earlier pixel gets the later visit.

---

### Function: `pauseIndexOnPath(checkpoint, path)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `checkpoint` | — | — |
| `path` | — | — |

---

### Function: `resolveCheckpointPlacement(waypoints, checkpoint, { path } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `waypoints` | — | — |
| `checkpoint` | — | — |
| `{ path } = {}` | — | — |

---

### Function: `injectOpportunityCheckpoints(waypoints, checkpoints, { origin, path } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `waypoints` | — | — |
| `checkpoints` | — | — |
| `{ origin` | — | — |
| `path } = {}` | — | — |

---

### Function: `findInsertIndex(waypoints, pauseAt)`

Fallback for when there's no analysis path or the pause isn't on it. Without
path-order matching it can't handle a path that visits the pause cell more than once.

---

### Function: `destinationMatchesPauseAt(destination, pauseAt)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `destination` | — | — |
| `pauseAt` | — | — |

---

### Function: `consumeResolvedCrossings(session)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |

---

### Function: `aggregateCheckpointMovementDirective(checkpoint)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `checkpoint` | — | — |

---

### Function: `pauseKeyFor(session, checkpoint)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |
| `checkpoint` | — | — |

---

### Function: `claimCheckpoint(session, checkpoint)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |
| `checkpoint` | — | — |

---

### Function: `releaseCheckpoint(session, checkpoint)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |
| `checkpoint` | — | — |

---

### Function: `rememberRuntime(session, extras = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |
| `extras = {}` | — | — |

---

### Function: `runtimeFor(sessionOrId, tokenDoc)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `sessionOrId` | — | — |
| `tokenDoc` | — | — |

---

### Function: `forgetRuntime(session)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |

---

### Function: `isMovementInitiator(movement, user)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `movement` | — | — |
| `user` | — | — |

---

### Function: `observedMovementState(tokenDoc, movement)`

Foundry puts `state` on TokenDocument#movement, not on the operation record that
`_onUpdateMovement` gets. Without this a finished segment would keep the token lock.

---

### Function: `resolveMoverActor(tokenDoc)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |

---

### Function: `tokenStillAtPauseAt(tokenDoc, pauseAt)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |
| `pauseAt` | — | — |

---

### Function: `canContinueOpportunityMovement(tokenDoc, session, movement, checkpoint)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |
| `session` | — | — |
| `movement` | — | — |
| `checkpoint` | — | — |

---

### Function: `expireUnresolvedPending(session, reason)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |
| `reason` | — | — |

---

### Function: `prepareOpportunityTokenUpdate(tokenDoc, changed = {}, options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |
| `changed = {}` | — | — |
| `options = {}` | — | — |

---

### Function: `prepareOriginContinuation(tokenDoc, changed, options, continuationOf, empty)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |
| `changed` | — | — |
| `options` | — | — |
| `continuationOf` | — | — |
| `empty` | — | — |

---

### Function: `finishOpportunityTokenUpdate(tokenDoc, prepared, options, preUpdate)`

Runs Foundry's `_preUpdate` after prepareOpportunityTokenUpdate and releases the session
of a movement Foundry drops. Only accepted movement ends up in `options._movement`.
Unfortunately we miss a later `preUpdateToken` veto.

---

### Function: `interceptOpportunityTokenMove(tokenDoc, waypoints, options = {}, commitMove)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |
| `waypoints` | — | — |
| `options = {}` | — | — |
| `commitMove` | — | — |

---

### Function: `expireGoneReactors(session)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |

---

### Function: `onOpportunityTokenMovement(tokenDoc, movement, operation, user)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |
| `movement` | — | — |
| `operation` | — | — |
| `user` | — | — |

---

### Function: `onOpportunityTokenMovementStopped(tokenDoc)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |

---

### Function: `sessionsOwningToken(tokenId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenId` | — | — |

---

### Function: `handleOpportunityCombatUpdate(combat, changed = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combat` | — | — |
| `changed = {}` | — | — |

---

### Function: `handleOpportunityCombatEnd(_combat)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `_combat` | — | — |

---

### Function: `handleOpportunityTokenDeleted(tokenDoc)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `tokenDoc` | — | — |

---

### Function: `registerOpportunityOrchestrator()`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

## `src/module/combat/opportunity/opportunity-movement.js`

### `const OPPORTUNITY_PATH_WARNINGS`

> [WARNING] *No JSDoc comment — signature extracted from source.*

*No description provided.*

---

### `const LOW_CALIBER_OPPORTUNITY_REACH`

Opportunity Attack reach for Low Caliber weapons, in squares (their
`system.range` is their ranged Attack range so it doesn't count here).

---

### Function: `sameDocument(a, b)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `a` | — | — |
| `b` | — | — |

---

### Function: `combatantToken(combatant)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `combatant` | — | — |

---

### Function: `tokenDisposition(token)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |

---

### Function: `tokenIsHidden(token)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |

---

### Function: `tokenIsInvisible(token)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |

---

### Function: `waypointList(waypoints)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `waypoints` | — | — |

---

### Function: `waypointAction(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `isTeleportAction(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `movementIsForced({ forced, waypoints } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ forced` | — | — |
| `waypoints } = {}` | — | — |

---

### Function: `movementIsTeleport({ teleport, action, waypoints } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ teleport` | — | — |
| `action` | — | — |
| `waypoints } = {}` | — | — |

---

### Function: `movementIsVoluntary({ method, voluntary } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ method` | — | — |
| `voluntary } = {}` | — | — |

---

### Function: `irrelevant(reason, extra = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `reason` | — | — |
| `extra = {}` | — | — |

---

### Function: `classifyOpportunityMovement(input = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `input = {}` | — | — |

---

### Function: `isOpportunityCapableWeapon(weapon)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `weapon` | — | — |

---

### Function: `getOpportunityWeaponReach(weapon)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `weapon` | — | — |

---

### Function: `listOpportunityWeapons(actor)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |

---

### Function: `canPayOpportunityAttack(actor, { combatant, weapon, combat } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `actor` | — | — |
| `{ combatant` | — | — |
| `weapon` | — | — |
| `combat } = {}` | — | — |

---

### Function: `listOpportunityReactors({ combat, moverToken, moverCombatant } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ combat` | — | — |
| `moverToken` | — | — |
| `moverCombatant } = {}` | — | — |

---

### Function: `readGridSize(options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `options = {}` | — | — |

---

### Function: `gridDistanceOf(options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `options = {}` | — | — |

---

### Function: `toElevationSquare(elevation, options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `elevation` | — | — |
| `options = {}` | — | — |

---

### Function: `finiteCoord(value)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `value` | — | — |

---

### Function: `tokenFootprintSource(token)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |

---

### Function: `opportunityPointWithTokenSize(point, token)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `point` | — | — |
| `token` | — | — |

---

### Function: `copyCellMeta(point, i, j, options = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `point` | — | — |
| `i` | — | — |
| `j` | — | — |
| `options = {}` | — | — |

---

### Function: `normalizeOpportunityCell(point, options = {})`

Returns the point's top-left cell. Careful, here `i` goes along x and `j`
along y (the reverse of Foundry grid offsets).

---

### Function: `elevationSquareOf(cell)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `cell` | — | — |

---

### Function: `opportunityStepSquares(fromCell, toCell)`

How many squares the top-left cell moved (elevation included). A big Token
moving one square is still a step of 1 even though its old and new spots overlap.

---

### Function: `opportunityReachSquares(fromCell, toCell)`

Chebyshev gap between the two occupied volumes (0 if they overlap).

---

### Function: `opportunityCrossingKey({ reactorCombatantId, pauseAt } = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ reactorCombatantId` | — | — |
| `pauseAt } = {}` | — | — |

---

### Function: `filterConsumedOpportunityCrossings(checkpoints, movementActionId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `checkpoints` | — | — |
| `movementActionId` | — | — |

---

### Function: `normalizePathCells(path, options, warnings, mover = null)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `path` | — | — |
| `options` | — | — |
| `warnings` | — | — |
| `mover = null` | — | — |

---

### Function: `reactorCell(token, options, warnings, combatantId)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `token` | — | — |
| `options` | — | — |
| `warnings` | — | — |
| `combatantId` | — | — |

---

### Function: `pathMayReach(pathCells, origin, maxReach)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `pathCells` | — | — |
| `origin` | — | — |
| `maxReach` | — | — |

---

### Function: `collectWeaponExits(pathCells, origin, weapons)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `pathCells` | — | — |
| `origin` | — | — |
| `weapons` | — | — |

---

### Function: `sortWeaponIds(ids)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `ids` | — | — |

---

### Function: `reactorOrder(a, b)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `a` | — | — |
| `b` | — | — |

---

### Function: `descriptorFor(reactor, exit, weaponIds)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `reactor` | — | — |
| `exit` | — | — |
| `weaponIds` | — | — |

---

### Function: `limitAutomaticOpportunitiesToFirstExitPerReactor(checkpoints)`

A reactor only gets one automatic Opportunity per continuous movement. This
only limits the prompts (`rawExits` still has every exit).

---

### Function: `analyzeOpportunityMovement(input = {})`

`input.moverToken` is a Token or TokenDocument.

---

## `src/module/combat/opportunity/opportunity-attack.js`

### Function: `reject(reason, extra = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `reason` | — | — |
| `extra = {}` | — | — |

---

### Function: `resolveExactActor({ actorId, tokenId } = {})`

If we have a Token id then only that Token's Actor counts. A missing Token
gives null (no falling back to the world Actor).

---

### Function: `resolveExactCombatant({ combatantId, tokenId, combat } = {})`

Matches by Combatant id, or by Token id if there isn't one. Another Combatant of the same Actor doesn't count.

---

### Function: `resolveIdentity({ session, decision, combat })`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `{ session` | — | — |
| `decision` | — | — |
| `combat }` | — | — |

---

### Function: `identitiesMatch(decision, identity)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `decision` | — | — |
| `identity` | — | — |

---

### Function: `isWeaponStillEligible(decision, weapon)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `decision` | — | — |
| `weapon` | — | — |

---

### Function: `movementDirectiveForOpportunityResolution(resolution)`

The reactor is the attacker here and the mover is the defender. The mover
only gets stopped (and its Movement spent) if the reactor wins a defended Clash.

---

### Function: `defenseTypeFromClash(state)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |

---

### Function: `resolutionFromWinnerIdentity(state)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |

---

### Function: `buildOpportunityAttackResult(state, extras = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |
| `extras = {}` | — | — |

---

### Function: `errorResult(session, decision, extras = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |
| `decision` | — | — |
| `extras = {}` | — | — |

---

### Function: `restoreIntent(session, decision, extras, reason, extra = {})`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `session` | — | — |
| `decision` | — | — |
| `extras` | — | — |
| `reason` | — | — |
| `extra = {}` | — | — |

---

### Function: `failAfterDeclaration(session, decision, reason)`

Once the Reaction is declared a failure doesn't refund it. We just record an error result.

---

### Function: `resolveOpportunityAttackDecision(sessionOrId, opportunityId)`

Resolves a recorded Attack intent. The decision has to be an "attack" that's
still "awaiting-attack-resolution" and has a chosen weapon.

---

### Function: `finalizeOpportunityAttackFromClash(state)`

> [WARNING] *No JSDoc comment — signature extracted from source.*

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `state` | — | — |
