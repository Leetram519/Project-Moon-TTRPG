This guide is for **Game Masters and content creators** who want to write effects on weapons, outfits, augments, and skills without touching any code.

## Table of Contents

1. [What is EasyEffects?](#what-is-easyeffects)
2. [The Basic Idea](#the-basic-idea)
3. [Where scripts live](#where-scripts-live)
4. [Triggers](#triggers)
  - [Choice dialogs](#choice-dialogs)
    - [Chat messages](#chat-messages)
    - [Delayed statuses](#delayed-statuses-next-round-next-turn)
    - [Status Burst](#status-burst)
    - [Named Procs](#named-procs)
    - [Passive Effects](#passive-effects)
    - [Filtered taking-damage triggers](#filtered-taking-damage-triggers)
    - [Clash With Attack / Block / Evade / Defense](#clash-with-attack-block-evade-defense)
    - [Clash order](#clash-order)
5. [Actions](#actions)
6. [Amounts](#amounts)
7. [Conditions](#conditions)
8. [Chaining Actions (](#chaining-actions-and)`and`[)](#chaining-actions-and)
9. [Scaling with](#scaling-with-per) `per`
10. [Flags (boolean checks)](#flags-boolean-checks)
11. [Metadata flags](#metadata-flags)
12. [Comments](#comments)
13. [Full Examples](#full-examples)
14. [Quick Reference Card](#quick-reference-card)

---



# What is EasyEffects?

EasyEffects is a small scripting language built into the Project Moon TTRPG system. It lets you describe what an item *does* in plain, readable text, and the system handles the rest automatically.

You write EasyEffects scripts directly on an item sheet, in the **EasyEffects** text field.

---



# The Basic Idea

Every EasyEffects script is made of one or more **blocks**. A block says:

> *"When **this thing** happens… do **that**."*

```
[Clash Win]
gain 1 Charge;
```

That's it. When the item's actor wins a clash, they gain 1 stack of Charge.

---



# Where scripts live

Most of the scripts you will see are attached to an **item**: a weapon, outfit, augment, skill, tool, or status. Which items actually run depends on the trigger:

- Always Active, turns, rounds, move, and On Action (clash or sheet): equipped loadout and live statuses. Tool use runs On Action on that tool only. Skill `[Always Active]` Power / Max apply when that skill is used, not as a standing Attack / Block / Evade bonus.
- Clash Start / Win / Lose / Clash Win Before Results: the **used** weapon, applied tool, skill, and ammo, plus outfits, active augments, and statuses. Other weapons on the same actor do not run.
- On Hit / On Hit Before Results: the attacker's used kit (weapon, applied tool, skill, ammo), plus active augments and the attacker's statuses.
- On Being Hit / On Being Hit Before Results: defender **statuses** only.
- On Use: the item that was used. At clash start, that side's used kit (weapon, applied tool, skill, ammo).
- On Taking Damage: the defender's equipped loadout and live statuses (and the actor script).
- Before Dealing / On Dealing Damage: the dealer's equipped loadout, live statuses, actor script, and the **used** attack source items (weapon, skill, applied tool, ammo) resolved at apply time.
- On Heal: the healer's equipped loadout and live statuses (and the actor script).
- On Being Healed: the patient's equipped loadout and live statuses (and the actor script).
- On Depleted: the actor script and live statuses. Equipped gear does not run.

Each **actor** also has a script for core mechanics of the system like what happens when you run out HP/ST/SP.

- **World script.** Go to Game Settings -> Project Moon TTRPG -> *World EasyEffects script* -> **Edit World Script**. Every actor uses this script by default, including actors imported from a compendium.
- **Actor script.** Open an actor sheet, select the three-dot menu in the window header, then select **EasyEffects Script**. The editor shows the world script until it is changed.

Saving an actor script that differs from the world script **detaches** the actor. It keeps its own copy and no longer receives world script changes. The editor header shows the current state. **Sync From World** discards the actor copy and reattaches it.

Both editors are GM-only and reject scripts that fail to parse.

---



# Triggers

A trigger tells the system **when** to fire your effect. Write it in square brackets on its own line.


| Trigger                                                                                   | When it fires                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[Always Active]`                                                                         | A passive on an equipped item or live status                                                                                                                                                                                                                         |
| `[On Clash Start]`                                                                        | When retaliation is chosen, before **either** clash die is rolled (both sides)                                                                                                                                                                                       |
| `[On Clash]`                                                                              | Same timing as On Clash Start (alias for setup effects)                                                                                                                                                                                                              |
| `[On Clash With Attack]` / `[… With Block                                                 | Evade                                                                                                                                                                                                                                                                |
| `[Clash Win]` / `[On Clash Win]`                                                          | The winner's **used kit** (weapon, applied tool, skill, ammo), plus outfits, active augments, and statuses. Other weapons on that actor do not run                                                                                                                   |
| `[Clash Win With Attack]` / `[… With Block                                                | Evade                                                                                                                                                                                                                                                                |
| `[Clash Lose]` / `[On Clash Lose]`                                                        | Same listeners on the loser. Does not fire on a one-sided attack                                                                                                                                                                                                     |
| `[Clash Lose With Attack]` / `[… With Block                                               | Evade                                                                                                                                                                                                                                                                |
| `[On Damage Calc]`                                                                        | Before damage is finalized. Used attacker kit only (weapon, applied tool, skill, ammo)                                                                                                                                                                               |
| `[On Clash Win Before Results]` / `[Clash Win Before Results]` / `[Before Clash Results]` | Same listeners as Clash Win. After the result card and Instant, before `[Clash Win]`                                                                                                                                                                                 |
| `[On Hit Before Results]` / `[On Being Hit Before Results]`                               | Same listeners as On Hit / On Being Hit. After the result card and Instant, before `[Clash Win]` / `[Clash Lose]`                                                                                                                                                    |
| `[On Hit]`                                                                                | An attack connects: one-sided, after a Clash Win, or a connecting Counter. Runs on the **attacker** used kit (weapon, applied tool, skill, ammo), plus active augments and statuses. After `[Clash Win]` / `[Clash Lose]`. The attack has connected; damage has **not** necessarily been applied yet |
| `[On Being Hit]`                                                                          | Same hit, but runs **status** scripts on the **defender** (`self` = defender, `target`/`attacker` = hitter). Same timing as On Hit                                                                                                                                   |
| `[On Use]`                                                                                | The item that was used (weapon, tool, skill, ammo). Also fires at clash start for that side's used kit                                                                                                                                                               |
| `[On Equip]`                                                                              | A weapon, outfit, or tool is equipped, or an augment is turned on. Also fires if EasyEffects syncs while the item is already on                                                                                                                                      |
| `[On Unequip]`                                                                            | The same item leaves the loadout: unequipped, augment turned off, tool quantity hits 0 while equipped, or deleted while it was on. Does not fire on EasyEffects sync. Flags and statuses from `[On Equip]` are not undone unless this script clears or removes them  |
| `[On Burst]`                                                                              | Status-local burst body on the status being burst (shorthand for `[On <this status> Burst]`)                                                                                                                                                                         |
| `[On <Status> Burst]`                                                                     | After that status’s burst resolves. Used by skills, addons, and other statuses (e.g. `[On Tremor Burst]`)                                                                                                                                                            |
| `[On <Name>]`                                                                             | Freeform named proc driven by `proc <Name>` (any name that is not a reserved lifecycle trigger)                                                                                                                                                                      |
| `[On Action]`                                                                             | When the actor **spends** an Action or Reaction (clash Attack, Block, Counter, or Evade, and the sheet buttons). **Before** clash dice. Tool use fires it on that tool                                                                                               |
| `[On Applied]`                                                                            | This status was created on the actor (first appear only)                                                                                                                                                                                                             |
| `[On Removed]`                                                                            | This status was cleared from the actor (full clear only)                                                                                                                                                                                                             |
| `[On Gain]`                                                                               | This status gained stacks (every increase, including first apply)                                                                                                                                                                                                    |
| `[On Lose]`                                                                               | This status lost stacks (every decrease, including full clear)                                                                                                                                                                                                       |
| `[Turn Start]` / `[On Turn Start]` / `[Start of Turn]` / `[On Start of Turn]`             | The start of the item's actor's turn in combat                                                                                                                                                                                                                       |
| `[End of Turn]` / `[On End of Turn]`                                                      | The end of the item's actor's turn in combat                                                                                                                                                                                                                         |
| `[On Move]`                                                                               | After a token walk on the actor's turn                                                                                                                                                                                                                               |
| `[On Combat Start]` / `[Combat Start]` / `[Start of Combat]`                              | Begin Combat, before the first `[Start of Round]`. Also when someone is added to a fight that's already going                                                                                                                                                        |
| `[Start of Round]` / `[On Start of Round]`                                                | A new combat round starts. Statuses that just expired at End of Round do not run this                                                                                                                                                                                |
| `[End of Round]` / `[On End of Round]`                                                    | When the combat round advances                                                                                                                                                                                                                                       |
| `[On Combat End]` / `[Combat End]` / `[End of Combat]`                                    | Combat is deleted, or that actor is taken out of a fight that's still going                                                                                                                                                                                          |
| `[Before Dealing Damage]` / `[Before Dealing <Filter> Damage]`                            | Attack damage is about to be applied (`fromAttack`). Mutable pending hit. Runs on the **dealer** before `[On Taking …]`. Does **not** fire for status ticks (like Burn or Bleed)                                                                                     |
| `[On Taking Damage]`                                                                      | Before damage is applied to the defender (flat resists, etc.)                                                                                                                                                                                                        |
| `[On Taking <Filter> Damage]`                                                             | Same, but only when the hit matches a pool, status source, damage type, or `Attack` (see below)                                                                                                                                                                      |
| `[On Dealing Damage]` / `[On Dealing <Filter> Damage]`                                    | After attack damage has been committed to a pool. Read-only result. `damage.amount` is what actually landed. Attack-apply only, not status ticks (like Burn or Bleed)                                                                                                |
| `[On Roll]`                                                                               | After a `roll` statement, before the total is saved. Other items can change it here                                                                                                                                                                                  |
| `[On Roll "<tag>"]`                                                                       | Same, but only for rolls with that tag (see Pending named rolls)                                                                                                                                                                                                     |
| `[On Depleted]`                                                                           | A pool just dropped from above zero to zero. Actor script and live statuses                                                                                                                                                                                          |
| `[On Depleted <Pool>]`                                                                    | Same, but only for `HP`, `ST`, `SP`, or `Light`                                                                                                                                                                                                                      |
| `[On Heal]`                                                                               | Before a heal is applied. `self` is the healer, `target` is the patient. Runs before `[On Being Healed]`                                                                                                                                                             |
| `[On Being Healed]`                                                                       | Same heal, on the patient (`self` is the patient, `target` / `healer` is the healer)                                                                                                                                                                                 |
| `[On Heal HP]` / `[On Being Healed ST]`                                                   | Same, but only if the heal **started** as that pool (still matches after a later `convert`)                                                                                                                                                                          |




One item can have **multiple trigger blocks**. List them one after another:

```
[Clash Win]
gain 1 Charge;

[Turn Start]
lose 1 Charge;
```

`[On Applied]` / `[On Removed]` / `[On Gain]` / `[On Lose]` are for **status** items.

- **Applied / Removed:** fire once when the status first appears or fully clears.
- **Gain / Lose:** fire on every stack change. First apply runs Applied **and** Gain; full clear runs Lose **and** Removed.

`[On Combat Start]` / `[On Combat End]` look at **every item** the actor owns, equipped or not. The world/actor script runs too.

- Start waits for Begin Combat. Adding people to the tracker first does nothing.
- A second linked token of someone already in the fight does not fire again.
- End also fires if that actor is pulled out while combat is still going.

```
[On Applied]
deal 5 SP damage to self;
heal 1 light damage to self;

[On Removed]
heal 10 ST damage to self;
```

```
[On Gain]
gain (changed.amount) Critical;

[On Lose]
require (changed.after) == 0 then deal 5 hp damage to self;
```

`[On Gain]` and `[On Lose]` expose the stack delta:


| Path             | Meaning                                   |
| ---------------- | ----------------------------------------- |
| `changed.amount` | Signed delta (`+3` on Gain, `-2` on Lose) |
| `changed.before` | Stacks before the change                  |
| `changed.after`  | Stacks after the change                   |


(`gain 1 Light` adds a **status** named Light. Use `heal … light damage` to restore the Light pool.)

## Choice dialogs

Use a dialog to run a branch based on the player's answer:

```
[On Being Hit]
create dialog "Proc Tremor Burst?":
  burst as "Burst",
  skip as "Do not burst"
  to attacker;

[On Dialog Answer burst]
burst Tremor on self;
```

- Syntax: `[create] dialog "<prompt>" : <answerId> [as] "<button label>", ... [to|on <self|target|ally|attacker|originator>];`
- `dialog` is shorthand for `create dialog`.
- `as` before the label is optional (`burst "Burst"` still works).
- A dialog needs **at least two** choices. Answer IDs must be unique within that dialog.
- Choices may span lines; commas between choices are required.
- `[On Dialog Answer <id>]` runs **only on the same item script** that opened the dialog.
- The answer branch keeps the same `self`, `target`, `item`, `clash`, and other context.
- Trailing `to attacker` (also `self` / `target` / `ally`) prompts that actor's controlling user, even if another client is resolving the hit. Omit it to prompt the local client.
- Canceling, closing the window, or a remote timeout selects nothing and runs no answer block.
- The parent block continues after the answer branch or cancellation.
- Not allowed in `[Always Active]`.

Answer IDs are **local control flow**, not global game events. An answer ID of `burst` does not trigger a Burst. Call `burst <Status>` to run the Burst dispatcher.

For example on the Tremor Status effect above:
`self` is the defender who has the status; `to attacker` asks the hitter.

## Chat messages

```
[On Hit]
on roll 1d10 <= Poise then
  create message "Poise broke! Rolled (roll) vs (Poise)." on self
  and lose all Poise on self;

[On Taking Damage]
create message "Took (incoming.amount) damage from (incoming.source)." on self;
message "Hello from (self.rank)." on target;
```

- Syntax: `[create] message "<text>" [on|to <self|target|ally|attacker|originator>];`
- `message` is shorthand for `create message`.
- `on` / `to` sets the **speaker** (who the chat line appears as). Defaults to `self`.
- Works standalone or after `require` / `on roll … then` / `and` like other actions.
- Values: any `(…)` accessor inside the quotes is evaluated and substituted (`(roll)`, `(Poise)`, `(incoming.amount)`, `(self.hp)`, named binds, math, etc.).
- Literal parentheses: `\(` and `\)`. A literal backslash is `\\`.
- Not allowed in `[Always Active]`.



## Delayed statuses (`next round` / `next turn`)

Most weapon Inflict effects, including Tremor, Rupture, Sinking, Bind, and Fragile, apply **next round**. Pending stacks use a separate status item on the actor (`system.pending`). They appear at the **bottom** of the status tray in gray with a breathing animation and **do not run EasyEffects** until they arrive.

```
inflict 3 Tremor next round on target;
inflict 2 Bind next turn on target;
gain 1 Haste next round on self;

# Tremor Pause / Rupture Pause / Sinking Pause
pause Tremor on target;
```

- Arrival: `next round` arrives after `[End of Round]` (after clears like “lose all Tremor”). `next turn` arrives at that actor’s Turn Start. `[Start of Round]` runs after arrival, so the new stacks tick and the ones that just expired do not.
- `pause <Status>` changes the **same** live status item to pending (default next round) without running Burst or On Lose. Effect List Pause skills run on Clash Win, which finishes **before** `[On Being Hit]`.



## Status Burst

`burst <Status> [on|to <target>];` runs a two-phase Burst for any status name. Omitted `on`/`to` means `self` (the script owner). Status items burst themselves (`burst Tremor on self`) and Clash Win effects that burst the enemy need `on target`.

1. **Local:** the burstee’s status item runs `[On Burst]` / `[On <Status> Burst]` (damage, stack clearing, etc.).
2. **Global:** equipped gear, used skills, and statuses on the **burster** and **burstee** then run matching `[On <Status> Burst]` blocks (e.g. Tremor / Bleed addons, Rupture Jag).

```
[On Burst]
deal (burst.amount) st damage to self;
lose all Tremor on self;
```


| Path                            | Meaning                                  |
| ------------------------------- | ---------------------------------------- |
| `burst.status`                  | Name of the status being burst           |
| `burst.amount` / `burst.before` | Stacks when the burst started            |
| `burst.after`                   | Stacks after the local phase (often `0`) |


`[On Burst]` on a status is shorthand for that status’s own burst body. Write `[On Tremor Burst]` on other items to react after a Tremor burst resolves.

Not allowed in `[Always Active]`.

## Named Procs

`proc <Name> [on|to <focus>] [targeting <actor>] [with <expr> as <Bind>, …];` fires a freeform named event in two phases.

1. **Local:** if the focus actor has a status item matching `<Name>`, that item’s `[On <Name>]` runs first (`self` = focus).
2. **Global:** equipped gear, statuses, and actor scripts on the **proccer** (script `self`) and **focus** run matching `[On <Name>]`.

```
[On Hit]
on roll 1d10 <= Poise then
  lose all Poise on self
  and proc Critical;

[On Critical]
deal 1d10 hp damage per Critical to target;
lose all Critical on self;
```

`on` / `to` is the proc focus. `targeting` sets who listeners see as `target` (empty keeps the current `target`):

```
proc DevastatingHit on attacker targeting self;
```

A used skill only listens if its owner is the proccer or the focus. From a defender status, proc onto the attacker and `targeting self` so the attacker's kit listens for it and still sees the holder as `target`:

```
proc FailedDevastationRoll on attacker targeting self;
```

**Carry-over binds** are evaluated on the caller and copied to every listener:

```
proc Foo with (self.status.Bar) as Bar, self.initiative as Zee;
proc Critical with (roll) as CritRoll;
```

Listeners read `(Bar)`, `(Zee)`, or `(proc.Bar)` / `(proc.name)`. Nested `proc` replaces binds (no merge).

Not allowed in `[Always Active]`.

## Passive Effects

The `[Always Active]` trigger is special. It doesn't wait for combat events, and applies the bonus ONCE when it's equipped, and inverts the bonus when unequipped (bringing it back to normal).

Weapon and outfit Power / Max stay on their respective item. Skill Power / Max apply when that skill is used for the action. They do not change the actor's standing Attack, Block, or Evade modifiers.

You cannot use dice or randomness with `[Always Active]` effects. It is strictly intended for passive effects that do not depend on any other variables.

Allowed here: resource `gain` / `lose` / `set` on maxes, `set resistances to …`, `power` / `dice max` passives, `range up` / `range down`, and `instant`. `gain` / `lose` on `Action` / `Reaction` / `movement` bump those **maxes** (event-time `gain 1 Action` still spends or restores the current pool). You can **read** stored flags (`(self.flag.x)`, `(item.flag.x)`, `(combat.flag.x)`). You cannot `set flag`, `clear flag`, `increase flag`, or `reduce flag`.

Example:

```
[Always Active]
dice max up attack 2;
range up 1;
gain 2 maxHp;
set maxSp to 0;
set resistances to fatal;
```

```
[Always Active]
instant Tremor;
```

`instant Tremor` (comma lists work: `instant Poise, Critical`) on the **used kit** makes those statuses apply **live** this clash, instead of waiting for next round.

- `gain` / `lose` on `maxHp` / `maxSt` / `maxSp` / `maxLight` are **additive** bonuses (misc / light bonus).
- `set maxSp to 0` (also `maxHp`, `maxSt`, `maxLight`) is an **absolute** override of the effective max.
- `set resistances to fatal` (or a single type) overrides outfit resists while the item/status is active; removing it restores the outfit values. Levels: `fatal` · `weak` · `normal` · `endured` · `ineffective` · `immune` (x2, 1.5x, 1, x0.5, x0.25, x0).
- Lowering a max clamps the current value immediately. Removing the item restores the max, but not the points lost to that clamp. Removing an increased max also clamps current to the natural max.
- If several items `set` the same max, the **lowest** value wins.



## Filtered taking-damage triggers

`[On Taking <Filter> Damage]` is shorthand for "only run this block for matching hits."


| Filter                                         | Matches when…                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| *(omit)* / `Any`                               | Always (same as `[On Taking Damage]`)                                  |
| `HP` / `ST` / `SP` / `Light`                   | Pending pool is that resource                                          |
| `Attack` / `Attacks`                           | The hit is a weapon attack (`incoming.attack` is 1), not a status tick |
| A status name (`Burn`, `"Bleed"`)              | Damage `source` is that status                                         |
| Any other word (`Slash`, `Pierce`, `Blunt`, …) | `damageType` equals that string (case-insensitive)                     |


Filters combine: `[On Taking HP Attack Damage]`, `[On Taking Slash Attack Damage]`.

```
[On Taking Burn Damage]
reduce damage by 3;

[On Taking SP Damage]
deal (incoming.amount * 2) hp damage to self;

[On Taking HP Attack Damage]
reduce damage by Protection after resistances;
```

Pools win over names: `[On Taking HP Damage]` always means the HP pool, not a status called HP. `Attack` is the attack flag, not a damage type named Attack.

## Dealing vs taking

`[On Hit]` means the attack **connected**. HP/ST choice, full/half/double, and whether anyone clicks Take Damage are still unknown at that point.

Dealer `[Before Dealing …]` / `[On Dealing …]` run later, when `applyDamage` actually spends pools on an **attack** (`fromAttack`). They do not fire for Burn, Bleed, Frostbite, Rupture, or any other status ticks. Status-origin hits still need to use `[On Taking Burn Damage]` on the defender.

Dealer filters are only: pools (`HP`/`ST`/`SP`/`Light`), `Attack`/`Attacks`, `Slash`/`Pierce`/`Blunt`, and `Any`.

```
[Before Dealing Slash HP Damage]
increase damage 2;

[On Dealing HP Attack Damage]
gain 1 Charge on self;

[On Taking Burn Damage]
reduce damage 2;
```

Order inside one attack apply:

1. `[Before Dealing …]` on the dealer (mutable `incoming.*`)
2. `[On Taking …]` on the defender (same pending hit)
3. Resist, temp absorb, pool write
4. `[On Dealing …]` on the dealer (read-only; `damage.amount` is what actually landed)

`self` on Dealing is the dealer; `target` is the defender. Self-damage still runs all four steps on the same actor.

`increase` / `reduce` / `convert` damage are allowed on `[Before Dealing …]` and `[On Taking …]`. They warn and do nothing on `[On Dealing …]`.

On Dealing you can read:

- `damage.amount` / `appliedAmount` - what the pool (and temp) actually lost
- `damage.finalAmount` - calculated hit before temp absorb and clamp
- `damage.requestedAmount` - the apply amount after full/half/double, before EasyEffects
- `damage.beforeValue` / `afterValue` - primary pool `.value` before/after the write

If HP was 3 and the calculated hit was 10, `finalAmount` is 10 and `appliedAmount` is 3.

## Clash With Attack / Block / Evade / Defense

Filters match the item actor's reaction on that clash, not who started the fight:


| Stance                                         | When it matches                                                                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Attack` / `Attacks` / `Offensive` / `Counter` | **Offensive Dice**: initiator Attack, **Counter Reaction**, or Attack Skill. Counter is Offensive, not its own stance at runtime |
| `Block`                                        | Block Reaction (or Block Skill) only                                                                                             |
| `Evade`                                        | Evade Reaction (or Evade Skill) only                                                                                             |
| `Defense` / `Defensive`                        | Block **or** Evade. This is the Effect List *with [Attack/Defense]* bucket                                                       |


```
[On Clash Start With Attack]
power up attack 1;

[Clash Win With Evade]
deal 5 hp damage to attacker;

[Clash Win With Attack]
# Attack or Counter win
deal 5 hp damage to attacker;

[Clash Win With Defense]
regen hp 2;
```



## Clash order

On a clash:

1. `[On Action]` (attacker spends an Action, then the defender spends a Reaction on Block, Counter, or Evade)
2. `[On Clash Start]` on that side's used kit, outfits, active augments, and statuses, plus `[On Use]` on the used kit (attacker side, then defender side)
3. Clash dice. Ties reroll.
4. `[On Damage Calc]`
5. Result card posts
6. Instant statuses apply live (`instant Tremor` on `[Always Active]` of the used kit)
7. `[On Clash Win Before Results]`
8. `[On Hit Before Results]` / `[On Being Hit Before Results]` if the attack (or a connecting Counter) hits
9. `[Clash Win]` / `[Clash Lose]` (`[Clash Lose]` skips a one-sided attack)
10. `[On Hit]` / `[On Being Hit]` if that hit connected

---



# Actions

An action is one thing the effect does. End it with a semicolon `;` or put the next action on a new line.

```
[Clash Win]
gain 1 Charge
lose 1 Bleed on self;
```



## Gaining and losing statuses

```
gain 1 Burn on target;
lose 2 Bleed on self;
lose all Poise on self;
halve Burn on self;
double Charge;
lose half of Burn on self;
gain double of Poise on self;
```

- `gain` adds stacks of a status
  - similarly `inflict` adds stacks of a status, but defaults to `target` instead of `self`.
- `lose` removes stacks of a status
- `lose all [of] <Status>` removes every stack (same as `lose (self.status.Name) Name on self`)
- `set <Status> to <N>` / `set <N> <Status>` sets stacks to an absolute value (0 clears). Clamps to the status’s `stackMax` when that max is > 0; `stackMax` 0 means unlimited.
- `halve <Status>` reduces stacks to half rounded down. (same as `lose half of <Status>`)
- `double <Status>` adds as many stacks as are already there (2x) (same as `gain double of <Status>`)
- `on self` / `on target` controls who is affected

If you leave out `on ...`, the effect defaults to `self`, unless using `inflict`.

Players need an **active GM** online for changes to actors they don't own (e.g. `inflict 1 Bleed on target`). Owned-self updates work without that.

### Resolving status templates

Status templates resolve in this order: **Document UUID** -> **world Items directory** -> **Item compendia**. World-only statuses can be referenced by name. Use a UUID to pin a specific document:

```
inflict Item.BFzoOtZRYWAmDjIW on target;
inflict 1 "Item.BFzoOtZRYWAmDjIW" on target;
gain 1 "Test Effect" on self;   # Example world item not from compendium
# Hyphenated UUIDs (compendium pack ids) must be quoted:
inflict "Compendium.projectmoonttrpg.status-pmttrpg-srd.Item.abc123" on target;
```

The applied stack uses the status’s **display name** for merging, tray display, and paths (`self.status."Test Effect"`).

### Status names in formulas

A bare status name in an amount/`(…)` formula means **that status’s stack count on self** (same as `self.status.Burn`):

```
deal Burn hp damage to self;
halve Burn on self;
power up attack 1 per (Burn);
```

Use `target.status.Burn` (or `attacker.status.…`) when you need someone else’s stacks. The applier UUID is available at `.origin`; status scripts can also use the `originator` target/path root:

```
# Return damage to the actor who applied the status effect
[On Being Hit]
deal 1 hp damage to originator;

require (target.status."Mark [Assassination]".origin) == (self.uuid) then
  deal 3 hp damage after resistances to target;
```

`gain` / `inflict` from EasyEffects set `system.origin` to the script’s `self` on first apply. Later stacks keep the existing origin.

### Multi-word status names

Wrap the name in double quotes:

```
gain 1 "Stagger Fragile" on target;
lose 1 "Stagger Fragile" on self;
```

Single-word names don't need quotes, but you can add them if you want. Reserved words (`half`, `double`, `halve`, `convert`, `by`, …) must be quoted too: `gain 1 "Double"`.

## Dealing damage and healing

```
do deal damage 5 on target;
deal (self.rank) hp damage to target;
deal 5 hp and st damage to target;
deal (incoming.amount) blunt hp damage to attacker;
deal (Smoke) hp damage before resistances to target;
do heal 10 on self;
heal 10 ST damage to self;
heal 5 hp and st damage to self;
heal 1 light damage to self;
```

You can join multiple resource pools with `and` (`hp and st`, `hp and st and sp`). The same amount applies to each pool. Action chaining still uses `and` between full actions (`deal 5 hp damage to target and heal 3 st damage to self`).

### Before / after resistances

Hits go through a **before** bucket, then outfit type resistance (`×`), then an **after** bucket:

```
[before-resist amount]  ->  × Type Resistance  ->  [after-resist flats]
```


| Timing                                         | On `deal`                           | On `reduce` / `increase`                                      |
| ---------------------------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| **after** (default for `deal`)                 | Flat damage; skips type resist      | Apply after the multiply (Protection, Fragile, Smoke)         |
| **before** (default for `reduce` / `increase`) | Amount is multiplied by type resist | Change the pending amount first (Overcharge, Type Protection) |


```
deal 5 hp damage after resistances to target;   # same as bare deal
deal 5 slash hp damage before resistances to target;

[On Taking HP Damage]
reduce damage by Protection after resistances;
increase damage by Fragile after resistances;
reduce damage by 3 before resistances;          # same as bare reduce
```

Singular `resistance` works too.

On `[On Taking Damage]`, you can read the pending hit with `incoming.*` (alias of `damage.*`) and reflect or rewrite it:

```
[On Taking Damage]
deal (incoming.amount) hp damage to attacker;

[On Taking HP Damage]
deal (incoming.amount) blunt hp damage to attacker;

[On Taking SP Damage]
convert (incoming.amount * 2) damage to hp;
convert damage to hp and st;

[On Taking Pierce Damage]
convert damage to blunt;
```

- `incoming.amount` / `damage.amount` - how much is about to apply
- `incoming.pool` - `hp`, `st`, `sp`, or `light`
- `incoming.source` - status name when the damage came from a status (e.g. Burn)
- `incoming.damageType` - slash / pierce / blunt / whatever was passed in
- `incoming.attack` - `1` if this hit is a weapon attack, `0` for status ticks
- `attacker` - the actor dealing the damage (same as `target` on this trigger)

`deal` accepts an optional damage type before or after the pool: `blunt hp damage` or `hp blunt damage`. If you omit the type and/or pool while reflecting, the new hit keeps `incoming.damageType` and `incoming.pool` (pool still defaults to `hp` outside that context). On non-status items during a clash, an omitted type falls back to the clash weapon's damage type. **Status** scripts such as Tremor Burst stay typeless / `none` unless a type is specified.

`convert` changes the **pending** hit (pool and/or type, optionally amount) without firing another damage event. Pool destinations can use `and` the same way as `deal` / `heal` (`convert damage to hp and st`).

If you `deal` or `heal` from inside `[Before Dealing Damage]`, `[On Dealing Damage]`, `[On Taking Damage]`, `[On Heal]`, or `[On Being Healed]`, that extra hit or heal does **not** fire those triggers again.

### Pending heals

`[On Heal]` and `[On Being Healed]` run before the heal is applied, so you can change it first:

```
[On Heal]
increase heal by 4;

[On Being Healed]
reduce heal by 2;
convert heal to st;
```

Both triggers see the same pending heal. Flags you set on `event` during `[On Heal]` are still there for `[On Being Healed]`. You see the amount **before** it is capped to max, not what actually lands.

- `heal.amount` - how much is about to restore
- `heal.pool` - where it is going right now (after any `convert`)
- `heal.originalPool` - where it started (what `[On Heal HP]` matches)
- `heal.source` - source label, if one was passed
- `healer` - the healer on both triggers (`heal 5 to healer`)

Heals ignore resistances. `after resistances` is not allowed on `reduce heal` / `increase heal`.

If the heal started as HP and something `convert`s it to ST, `[On Heal HP]` still runs. `reduce hp heal` then does nothing because the destination is no longer HP. Bare `reduce heal` still works.

## Modificating your Combat Bonuses

Clash-time Power / Max write into that clash's **per-side** bonus bags (`attacker` / `defender`).
`on self` (default) affects the item owner's side; `on target` affects the other side.

```
[On Clash Start]
power up attack 2;
power down evade 1 on target;

dice max up attack 1;
dice max down evade 2;
range up 1;
power up damage 2;
```

- `power up` / `power down`: Adds or removes flat Dice Power after the roll. `attack`, `block`, `evade`, and `defense` affect the clash die itself, with `defense` applying to both Block and Evade. `damage` only changes damage Power/Max and does not affect the clash die. When used with `[Always Active]`, weapon and outfit Power only applies to that specific item, while skill Power applies whenever that skill is used.
- `dice max up` / `dice max down`: changes die faces (d10 +2 Max → d12). If faces would go below 1, each excess Max reduction becomes -1 Power instead. `dice max up damage` is damage Max.
- `range up` / `range down`: weapon range. Same targeting as `power up`. Works in `[Always Active]` or on the clash bag.
- Use `on target` for Enemy Power Down effects so the penalty applies to the other roll.



### Advantage / Disadvantage

Clash dice (attack / block / evade / counter) can roll with Advantage or Disadvantage. Roll twice and keep the highest for Advantage or lowest for Disadvantage. They **cancel** if both apply. Multiple sources still produce only two rolls.

```
[On Clash Start]
advantage;
disadvantage on target;
```

- Writes into that side’s clash bonus bag (same targeting as `power up`: `self` default, `on target` for the other side).
- Not valid in `[Always Active]`. Use `[On Clash Start]` or `[On Action]`.



### Pending named rolls

```
roll <dice> [as <name>] [tagged "<tag>"];
```

- `<dice>` - the formula (`1d10`)
- `as <name>` - optional. This script reads the total later as `(name)`. Always also stored as `(roll)`.
- `tagged "<tag>"` - optional. Other items listen with `[On Roll "<tag>"]`. Quote tags that have hyphens.

`as` and `tagged` can be in either order. A plain `roll 1d10` still fires `[On Roll]`.

After the dice land, `[On Roll]` (and `[On Roll "<tag>"]` if you tagged it) run so other items can change the total. Then that total is saved.

```
[On Hit]
roll 1d10 as poiseRoll tagged "critical-check";
require (poiseRoll) <= Poise then proc Critical;

[On Roll "critical-check"]
require (target.status.Bleed) >= N
and (pendingRoll.value) > 0
then reduce roll by (min(N, pendingRoll.value));
```

Inside `[On Roll]`:

- `(pendingRoll.value)` - the total you can change (`reduce roll by N` / `increase roll by N`)
- `(pendingRoll.rolledValue)` - the original dice result (never changes)
- `(roll)` and named binds - the last **finished** roll, not the one still being changed

`reduce roll` / `increase roll` only work here. They can go below 0. Use `reduce roll by (min(N, pendingRoll.value))` if you want to stop at 0.

`on roll 1d10 <= X then …` does **not** fire `[On Roll]`.

---



# Amounts

Amounts can be plain numbers, dice rolls, or values read from the actor.


| Form            | Example               | Meaning                                         |
| --------------- | --------------------- | ----------------------------------------------- |
| Flat number     | `3`                   | Always 3                                        |
| Dice            | `1d6`                 | Roll a d6 at runtime                            |
| Keep / drop     | `2d10kh`              | Foundry suffixes: `kh`, `kl`, `kh3`, `dh`, `dl` |
| Actor value     | `(self.rank)`         | Equal to the actor's Rank                       |
| Math expression | `(self.rank * 2 + 1)` | Calculated at runtime                           |
| Cap             | `(min(N, 3))`         | Smaller of N and 3. N never goes **above** 3    |
| Floor           | `(max(N, 2))`         | Larger of N and 2. N never goes **below** 2     |
| Clamp           | `(clamp(N, 2, 6))`    | N kept between 2 and 6                          |


```
gain (self.rank) Charge;
do deal damage 1d6 on target;
do deal damage (self.rank * 2) on target;
inflict (min(proc.amount, 3)) "Bleed - Hemorrhage";
```

Dice and math can even be combined inside parentheses:

```
do deal damage (1d6 + self.rank) on target;
```

`min` / `max` / `clamp` work like Foundry roll math:

```
let $taken = (min(self.status.Poise, N));
require ($taken) > 0 then inflict ($taken) Poise on target and lose ($taken) Poise on self;

power up attack (clamp(self.reaction, 2, 6));
```

Without `(`, they are just names (`min` can be a status). `self.hp.max` is still a path.

`let $name = …` binds a value for **this trigger block**. Read it as `($taken)`. Declare it before you use it; you cannot redeclare the same name. An undeclared `$name` errors.

---



# Conditions

Conditions run an action only when their expression is true.

## Rolling once (`roll` / `on roll`)

```
roll <dice> [as <name>] [tagged "<tag>"];
on roll <dice> <op> <value> then <actions>;
```

Dice inside amounts and `(…)` formulas roll separately on every evaluation. Bind the roll first when multiple branches need the same result:

```
on roll 1d10 <= Poise then lose all Poise on self;

roll 1d10;
require the roll <= Poise then lose all Poise on self;

# Reuse one named roll across branches
roll 1d4 as panic;
require (panic) == 1 then inflict 1 "Panic [Fight]" on self;
require (panic) == 2 then inflict 1 "Panic [Flight]" on self;
```

- `the roll` and `(roll)` read the last **completed** `roll` / `on roll` in this trigger block.
- `(panic)` (or any bind name) reads that named total. Avoid status names because a named roll wins when both names match.
- A tagged `roll` fires `[On Roll]` first so other items can change the total. See Pending named rolls.
- On numeric compares (`<`, `<=`, `>`, `>=`), a bare status on the RHS (e.g. `<= Poise`) means **self stack count**, same as `(Poise)`.
- Equality (`==` / `!=`) treats a bare status name as a **string** (e.g. `require damage from Burn`).
- Not allowed under `[Always Active]` (no randomness there).
- If **Dice So Nice** is installed, `roll` / `on roll` **and** dice amounts (`deal 1d10…`, `heal 1d6…`, etc.) animate. The script waits until those 3D dice have settled (including rolls after a clash, such as Ruin) before dialogs or later lines run, then continues even if DSN never finishes. Without DSN, totals resolve silently.
- Dice with `per` expand or multiply as described in [Scaling with](#scaling-with-per) `per`.



## `require ... then`

```
require 3 self Charge then gain 1 Poise;
```

Reads: *"If you have at least 3 Charge, gain 1 Poise."*

Short form: `require <amount> <who> <Status> then <action>`

Full expression form:

```
require (self.status.Charge) >= 3 then gain 1 Poise;
require the roll <= Poise then lose all Poise on self;
require (self.status.Charge) >= 3 and (target.status.Bleed) >= 1 then gain 1 Poise;
require (self.status.Charge) > 0 then require (target.status.Bleed) > 0 then gain 1 Poise;
```

On `[On Taking Damage]`, you can gate by status source (status **name**), by whether the hit is an attack, or use a filtered trigger instead:

```
require damage from Burn then reduce damage by 2;
require damage from attack then reduce damage by Protection after resistances;

[On Taking Burn Damage]
reduce damage by 2;
```

`reduce` / `increase` take an optional `by`, a full amount formula (`N`, `N*2`, `(N // 2)`, dice, etc.), and optional `before|after resistance[s]` (default **before**):

```
reduce damage by N;
increase damage by N*2;
reduce damage by Protection after resistances;
```



## Effect templates (`N`, `positive:`, `negative:`, `RESULT`, `CHOICE`)

Catalog **effect** items (Burn Resistance, etc.) can ship an EasyEffects template. Those templates may use:

- bare `N` (also inside math like `N*2`) - equals the number of buyins for that effect on the equipment.
- `positive:` / `negative:` - keep only the branch that matches the entry's Positive/Negative mode (sticky until the next polarity label or trigger)
- `RESULT` inside a clash trigger - filled from the gear entry's Win / Lose / None dropdown (`procResult`). `Win` → `Win`, `Lose` → `Lose`. `None` drops that whole trigger block.
- `CHOICE` in a trigger or action - filled from the gear entry's Attack / Defense dropdown (`procChoice`). `Attack` → `Attack`. `Defense` → `Defense` (Block and Evade). Leave the dropdown on **Attack / Defense** to drop `with CHOICE` from the trigger (`[Clash Win]`) and skip body lines that still have `CHOICE`.

Those tokens are **effect-template only**. They do not exist on equipment after sync.

On a weapon / outfit / skill / etc., linked effect templates are stamped into a managed region on the host EasyEffects script:

```
# >>> synced effects
# Burn Resistance
[On Taking Burn Damage]
reduce damage by 2;
# <<< synced effects
```

Adding, removing, or changing an effect's intensity, mode, clash result, or Attack/Defense choice updates only that block. Put custom scripts **outside** the markers so they are not overwritten.

If you edit *inside* the synced block, auto-update pauses and warns you. Use **Sync with current effects** twice to confirm a rebuild; text outside the markers is preserved.

Example template on Burn Resistance:

```
[On Taking Burn Damage]
positive:
reduce damage by N;
negative:
increase damage by N;
```

Example template for a clash buy-in (Inflict Burn, etc.):

```
[Clash RESULT with CHOICE]
positive:
inflict N Burn;
negative:
gain N Burn;
```

With intensity `2`, clash result **Win**, and Attack/Defense **Attack**, sync stamps:

```
[Clash Win with Attack]
inflict 2 Burn;
```

Leave Attack/Defense unset to stamp `[Clash Win]` with no `with`.

`[Clash RESULT With Evade]` and `[On Clash RESULT]` work the same way.

Augment conditionals such as Burn Bonus use `CHOICE` without `RESULT`:

```
[On Clash Start with CHOICE]
require 2 target Burn then power up CHOICE 1;
```

With **Defense** chosen, that becomes `[On Clash Start with Defense]` and `power up Defense 1` (both Block and Evade).

Combat runs **only** the host's EasyEffects (not the catalog effect document).

## `spend ... to`

`spend` is the most powerful shorthand. It:

1. Checks that the actor has enough stacks
2. Runs the actions you specify
3. Automatically removes the spent stacks. You never write `lose` manually.

```
spend 3 Charge to gain 1 Poise;
```

Reads: *"If you have at least 3 Charge, gain 1 Poise, then lose 3 Charge."*

You can specify who spends with `on`:

```
spend 3 "Stagger Fragile" on target to deal damage 5 on target;
```

---



# Chaining Actions (`and`)

Multiple actions can be chained with `and`. The condition (if any) applies to all of them.

```
require 3 self Charge then gain 1 Poise and lose 3 Charge;
gain 1 Burn on target and gain 1 Smoke on target;
```

You can also give each action in a chain its own target:

```
do add status Poise 1 on self and deal damage 1d6 on target;
```

If you omit `on` for a later action, it inherits the previous action's target.

---



# Scaling with `per`

You can multiply an amount by a live value using `per`:

```
do deal damage 2 per (self.status.Charge) on target;
deal 1d10 hp damage per Critical;
```

Reads: *"Deal 2 damage for each stack of Charge on self."*

Simple `NdX` expands **before** the roll. 8 Critical turns `1d10 per Critical` into one `8d10`, not `1d10` eight times. `2d6 per 3` is one `6d6`. A Power suffix on the formula stays put: `1d10+2 per 8` is `8d10+2`.

Anything else (`2d10kh`, `(1d6 + self.rank)`, …) rolls once, then multiplies that total. Flat amounts just multiply (`deal 2 per Critical` with 8 Critical is 16). `per 0` is 0.

`gain` / `lose` / `inflict` take `per` the same way, including in `[Always Active]` (still no dice there).

---



# Flags (boolean checks)

These let you check whether someone is in a certain state:


| Flag                           | What it checks                      |
| ------------------------------ | ----------------------------------- |
| `hasStatus <Name> self/target` | Has at least 1 stack of that status |


Staggered is a **status**. Check it with `hasStatus`, same as Burn:

```
require hasStatus Staggered target == 1 then gain 2 Bleed on target;
require hasStatus Burn target == 1 then do deal damage 3 on target;
```

---



# Metadata flags

A named value you store yourself. Call the key whatever you want.

```
set flag "<key>" on <host> to <value>;
clear flag "<key>" on <host>;
increase flag "<key>" on <host> [by <amount>];
reduce flag "<key>" on <host> [by <amount>];
hasFlag "<key>" [<host>]
(<host>.flag.<key>)
```

- `"<key>"` - the name. Quote it on `set` / `clear` / `increase` / `reduce`. Quote it in paths too if it has dots or spaces: `(self.flag."boss.phase")`.
- `on <host>` - who holds it. Required on `set` / `clear` / `increase` / `reduce`. `hasFlag` defaults to `self`.
- `to <value>` - a number, a `"string"`, `true`/`false`, or a `(…)` value. `(3 / 2)` stays `1.5`.
- `by <amount>` - a number or `(…)`. Omit it to add or subtract **1**. Numbers are not rounded. Missing keys start at `0`. String and boolean flags are left alone.

`<host>` is `event`, `item`, `combat`, or an actor: `self` · `target` · `ally` · `attacker` · `originator` · `burster` · `burstee` · `healer`.

Not `enemies` / `allies` / `all`.

- `event` lasts for this trigger only. `[On Hit]` and `[On Being Hit]` share it. A nested `roll`, `proc`, or `burst` starts a new set. A dialog answer keeps flags you set before `create dialog`.
- The rest stay until you `clear` them (`self` on that actor, `item` on the item, `combat` on the encounter). Unequipping does not clear flags; use `[On Unequip]` if you set them in `[On Equip]`.

```
set flag "phase" on self to 2;
set flag "hit" on event to true;
set flag "mod" on item to "heavy";
increase flag "hits" on self by 1;
reduce flag "hits" on self;
clear flag "phase" on self;
require hasFlag "phase" self == 1 then …
require (self.flag.phase) == 2 then …
require (event.flag.hit) == true then …
```

- `(self.flag.phase)` is the value. Missing reads as `0`.
- `hasFlag` is whether the key exists. A stored `0` still counts.
- No `set` / `clear` / `increase` / `reduce` flag in `[Always Active]`. You can still read saved flags. `(event.flag.x)` is always 0 there.
- If two people write `combat.flag` at the same time, one write can overwrite the other. `increase` / `reduce` are the same: they read, then `set`. They are not atomic.

---



# Comments

Lines starting with `#` are ignored:

```
[Clash Win]
# Build charge on each win
gain 1 Charge;
# Dump at 3
spend 3 Charge to gain 1 Poise;
```

---



# Full Examples



## Charge → Poise dump

```
[Clash Win]
gain 1 Charge;
spend 3 Charge to gain 1 Poise;
```



## Burn on hit, dump at 3 stacks

```
[On Hit]
gain 1 Burn on target;
spend 3 Burn on target to do deal damage 2d8 on target;
```



## Rank-scaling bleed

```
[On Hit]
gain (self.rank) Bleed on target;
```



## Combo weapon: two triggers

```
[Clash Win]
gain 1 Charge;

[On Hit]
do deal damage 1d6 on target;
```



## Punish the Staggered

```
[On Hit]
gain 1 Bleed on target;
require hasStatus Staggered target == 1 then gain 2 Bleed on target;
```



## AoE Smoke on Clash Win

```
[Clash Win]
gain 1 Smoke on enemies;
```



## Outfit: rally aura

```
[Turn Start]
do heal 5 on allies;
```



## Scale damage by clash margin

```
[Clash Win]
do deal damage (clash.margin * 2) on target;
```



## Dice + math combo

```
[Clash Win]
do deal damage (1d6 + self.rank) on target;
```



## Spend Bleed on damage calc

```
[On Damage Calc]
spend 1 self Bleed to regen hp 3;
```



## Limbus style clashing buff

```
[On Clash Start]
power up attack 1 per (self.status.Burn);
```



## Enemy Power Down (On Clash Start)

```
[On Clash Start]
power down attack 1 on target;
power down block 1 on target;
power down evade 1 on target;
```

---



# Quick Reference Card



## Triggers

`[Always Active]` · `[Clash Win]` / `[On Clash Win]` · `[Clash Lose]` / `[On Clash Lose]` · `[… With Attack|Block|Evade|Defense|Counter]` · `[On Clash]` / `[On Clash Start]` · `[On Use]` · `[On Action]` · `[On Clash Win Before Results]` / `[Clash Win Before Results]` / `[Before Clash Results]` · `[On Hit Before Results]` / `[On Being Hit Before Results]` · `[On Hit]` · `[On Being Hit]` · `[On Damage Calc]` · `[On Burst]` · `[On <Status> Burst]` · `[On <Name>]` · `[On Applied]` · `[On Equip]` · `[On Unequip]` · `[On Gain]` · `[On Lose]` · `[On Removed]` · `[On Dialog Answer <id>]` · `[Turn Start]` / `[On Turn Start]` / `[Start of Turn]` / `[On Start of Turn]` · `[End of Turn]` / `[On End of Turn]` · `[On Move]` · `[On Combat Start]` / `[Combat Start]` / `[Start of Combat]` · `[Start of Round]` / `[On Start of Round]` · `[End of Round]` / `[On End of Round]` · `[On Combat End]` / `[Combat End]` / `[End of Combat]` · `[Before Dealing <Filter> Damage]` · `[On Taking <Filter> Damage]` · `[On Dealing <Filter> Damage]` · `[On Roll]` / `[On Roll "<tag>"]` · `[On Depleted]` / `[On Depleted <Pool>]` · `[On Heal]` / `[On Being Healed]` · `[On Heal HP]` / `[On Being Healed ST]`

## Targets

`self` · `target` · `ally` · `attacker` · `originator` · `healer` · `burster` · `burstee` · `enemies` · `allies` · `all`

`originator` is the actor stored on the host status’s `system.origin` (who applied it). Only meaningful on **status** scripts. `burster` / `burstee` are set during Burst. `healer` is set on `[On Heal]` / `[On Being Healed]`.

## Actions


| Statement                                                                               | Meaning                                                                                                                                             |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create dialog "" : [as] "", ... [to\|on ]`                                              | Ask a player; then run `[On Dialog Answer <id>]` on this script                                                                                     |
| `create message "" [on\|to ]`                                                            | Post chat as that character; `(…)` values interpolate                                                                                               |
| `inflict <N> <Status> next round\|turn [on <t>]`                                         | Queue pending stacks (no EE until arrival)                                                                                                          |
| `pause <Status> [on <t>]`                                                               | Flip same live status item to pending (Pause skills)                                                                                                |
| `burst <Status> [on\|to <target>]`                                                       | Status-local `[On Burst]`, then global `[On <Status> Burst]` (defaults to `self`)                                                                   |
| `proc <Name> [on\|to <focus>] [targeting <actor>] [with … as …]`                         | Named proc -> `[On <Name>]` (Crit/Dev/custom); optional bind carries                                                                                |
| `let $name = <expr>`                                                                    | Bind a value for this trigger block (`($name)`); cannot redeclare                                                                                   |
| `instant <Status>[, …]`                                                                 | `[Always Active]` on the used kit: those statuses apply live this clash                                                                             |
| `gain <N> <Status> [on <target>]`                                                       | Add N stacks (target defaults to `self`)                                                                                                            |
| `inflict <N> <Status> [on <target>]`                                                    | Add N stacks (target defaults to `target`)                                                                                                          |
| `lose <N> <Status> [on <target>]`                                                       | Remove N stacks                                                                                                                                     |
| `lose all [of] <Status> [on <target>]`                                                  | Remove every stack                                                                                                                                  |
| `set <Status> to <N> [on <target>]`                                                     | Set stacks absolutely (`set <N> <Status>` also works; clamps to `stackMax` when > 0)                                                                |
| `set flag "<key>" on <host> to <value>`                                                 | Write a flag on `event` / an actor / `item` / `combat`                                                                                              |
| `clear flag "<key>" on <host>`                                                          | Remove that flag                                                                                                                                    |
| `increase`/`reduce` `flag "<key>" on <host> [by <N>]`                                   | Add or subtract a number (default 1). Missing is 0. Not atomic                                                                                      |
| `halve <Status> [on <target>]`                                                          | Reduce stacks to half (floor)                                                                                                                       |
| `double <Status> [on <target>]`                                                         | Gain stacks equal to current (2x)                                                                                                                   |
| `lose half [of] <Status> [on <target>]`                                                 | Same as `halve`                                                                                                                                     |
| `gain double [of] <Status> [on <target>]`                                               | Same as `double`                                                                                                                                    |
| `spend <N> <Status> [on <target>] to <actions>`                                         | Require + remove + do                                                                                                                               |
| `require <condition> then <actions>`                                                    | Conditional block                                                                                                                                   |
| `roll <dice> [as <name>] [tagged "<tag>"]`                                              | Roll once into `(roll)` / a named bind; fires `[On Roll]` first                                                                                     |
| `on roll <dice> <op> <value> then <actions>`                                            | Roll once, compare, then act (does not fire `[On Roll]`)                                                                                            |
| `reduce`/`increase` `roll by <N>`                                                       | Change the pending roll total on `[On Roll]` (can go below 0; use `min` for a floor)                                                                |
| `deal <N> [<type>] [hp\|st\|sp\|light] damage [before\|after resistances] [to\|on <target>]` | Deal damage (default **after** resistances)                                                                                                         |
| `do deal damage <N> on <target>`                                                        | Deal HP damage (standard form)                                                                                                                      |
| `convert [amount] damage to <pool\|type>`                                                | Rewrite pending hit on `[Before Dealing Damage]` / `[On Taking Damage]`                                                                             |
| `gain`/`lose`/`set` `Action`\|`Reaction`\|`movement` `[on <t>]`                           | Current action-economy / tactical SQR pools (`actions` / `reactions` / `squares` / `sqr` aliases). In `[Always Active]`, `gain`/`lose` bump **max** |
| `gain`/`lose`/`set` `tempHp`\|`tempSt`\|`tempSp` `[on <t>]`                               | Temporary pool buffers                                                                                                                              |
| `set hp\|st\|sp\|light to <N\|max> [on\|to <t>]`                                             | Set current pool (`max` = that actor’s current max)                                                                                                 |
| `set resistances to <level> [on <t>]`                                                   | All HP+ST Slash/Pierce/Blunt outfit resists (Always Active = override; event = write outfit)                                                        |
| `set <slash\|pierce\|blunt> resistance to <level> [on <t>]`                               | One damage type, both HP and ST                                                                                                                     |
| `set maxHp\|maxSt\|maxSp\|maxLight to <N>`                                                 | Absolute max (`[Always Active]` only)                                                                                                               |
| `do heal <N> on <target>`                                                               | Restore HP                                                                                                                                          |
| `reduce`/`increase` `heal by <N>`                                                       | Change the pending heal on `[On Heal]` / `[On Being Healed]`                                                                                        |
| `convert heal to <pool>`                                                                | Change where the pending heal goes (`heal.originalPool` stays the same)                                                                             |
| `power <up/down> <attack/block/evade/defense/damage> <N> [on <target>]`                 | Dice Power (`defense` = Block and Evade; `damage` is damage Power, not the clash die)                                                               |
| `dice max <up/down> <attack/block/evade/defense/damage> <N> [on <target>]`              | Dice Max (faces); `damage` is damage Max                                                                                                            |
| `advantage` / `disadvantage` `[on\|to <t>]`                                              | Clash-side Adv/Disadv (cancel if both; `[On Clash Start]` or `[On Action]`)                                                                         |
| `regen <hp/st/sp/light> <N>`                                                            | Shorthand to gain HP/ST/SP/Light                                                                                                                    |
| `range up` / `range down` `<N>`                                                         | Weapon range (Always Active or clash bag).                                                                                                          |


`<Status>` is a display name (`Burn`, `"Panic [Fight]"`) or a Document UUID (`Item.xxx`, quoted or bare dotted). Lookup order: UUID -> world Items -> packs.

## Readable values


| Path                                                                             | Value                                                                                         |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `self.hp` / `sp` / `st` / `light`                                                | Core attributes                                                                               |
| `self.hp%` / `sp%` / `st%` / `light%`                                            | Current fill as 0–100 of that pool’s max                                                      |
| `self.action` / `self.reaction` / `self.movement`                                | Remaining Actions / Reactions / tactical SQRs                                                 |
| `self.tempHp` / `tempSt` / `tempSp`                                              | Temporary buffers                                                                             |
| `self.rank`                                                                      | Rank                                                                                          |
| `self.speed`                                                                     | Speed bonus                                                                                   |
| `self.attack` / `evade` / `block`                                                | Combat modifiers                                                                              |
| `self.stat.for` / `pru` / `jus` / `cha` / `ins` / `tem`                          | Ability scores                                                                                |
| `self.status.Burn`                                                               | Stack count of Burn on self                                                                   |
| `self.status.Burn.origin`                                                        | Actor UUID that applied Burn (empty if unknown)                                               |
| `self.flag.<key>` / `item.flag.<key>` / `combat.flag.<key>` / `event.flag.<key>` | Metadata flag (missing is 0)                                                                  |
| `self.uuid` / `self.id` / `self.name`                                            | This actor’s UUID / id / name (`(self)` alone -> name)                                        |
| `item.origin`                                                                    | Applier UUID on the status/item running this script                                           |
| `originator` / `originator.name` / `.uuid`                                       | Who applied this status (status scripts; bare -> name)                                        |
| `clash.margin`                                                                   | How much the winner won by on `[Clash Win]`. On `[Clash Lose]`: defender roll − attacker roll |
| `clash.attackerRoll` / `clash.defenderRoll`                                      | Raw clash dice                                                                                |
| `incoming.amount` / `.pool` / `.source` / `.damageType` / `.attack`              | Pending damage (`damage.*` also works; `.attack` is 1 on a weapon hit)                        |
| `heal.amount` / `.pool` / `.originalPool` / `.source`                            | Pending restore on `[On Heal]` / `[On Being Healed]`                                          |
| `pendingRoll.value` / `.rolledValue`                                             | Mutable / original total on `[On Roll]`                                                       |
| `burst.status` / `.amount` / `.before` / `.after`                                | Active Burst snapshot                                                                         |
| `depleted.pool` / `.before` / `.max`                                             | Pool that just hit 0 on `[On Depleted]`                                                       |
| `moved.squares` / `.spaces` / `.movement` / `.forced`                            | `[On Move]` tiles walked (`forced` is 0 or 1)                                                 |
| `proc.name` / `proc.<Bind>`                                                      | Active Proc name / `with … as` binds (bare `<Bind>` also works)                               |
| `roll` / `roll.<name>`                                                           | Last / named roll-once totals                                                                 |
| `round` / `round.number` / `combat.round`                                        | Current combat round                                                                          |




## Math

`+` `-` `*` `/` `%` (modulo) `//` or `//f` (floor) · `//c` (ceil). All are usable inside `( )`.

### Percent of max (`%` postfix)

`(self.hp%)` is current HP as **0–100** of max (same for `st` / `sp` / `light`). A trailing `%` on a plain threshold is cosmetic percent-points (matches Effect List wording):

```
# Overcoming Crisis: HP ≤ (100 − N×20)% of max, +N Power
[On Clash Start]
require (self.hp%) <= (100 - N*20) then power up attack N;
```

`%` remains modulo when it has a right-hand side: `(stacks % 3)`.