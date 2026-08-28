This guide is for **Game Masters and content creators** who want to write effects on weapons, outfits, augments, and skills without touching any code.

---

# What is EasyEffects?

EasyEffects is a small scripting language built into the Project Moon TTRPG system. It lets you describe what an item *does* in plain, readable text — and the system handles the rest automatically.

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

Most of the scripts you will see are attached to an **item**: a weapon, outfit, augment, skill, tool, or status. Item scripts run while the item is equipped or the status is on the actor.

Each **actor** also has a script for core mechanics of the system like what happens when you run out HP/ST/SP. 

- **World script.** Go to Game Settings -> Project Moon TTRPG -> *World EasyEffects script* -> **Edit World Script**. Every actor uses this script by default, including actors imported from a compendium.
- **Actor script.** Open an actor sheet, select the 3-elipses menu in the window header, then select **EasyEffects Script**. The editor shows the world script until it is changed.

Saving an actor script that differs from the world script **detaches** the actor. It keeps its own copy and no longer receives world script changes. The editor header shows the current state. **Sync From World** discards the actor copy and reattaches it.

Both editors are GM-only and reject scripts that fail to parse.

---

# Triggers

A trigger tells the system **when** to fire your effect. Write it in square brackets on its own line.

| Trigger | When it fires |
|---------|--------------|
| `[Always Active]` | A passive effect that's applied while the item is equipped |
| `[On Clash Start]` | When retaliation begins, before **either** clash die is rolled (both sides). Declare-only attack cards do not fire this yet |
| `[On Clash]` | Same timing as On Clash Start (alias for setup effects) |
| `[On Clash With Attack]` / `[… With Block|Evade|Defense]` | Same as On Clash, filtered by reaction. `Attack`/`Counter`/`Offensive` = Offensive Dice; `Block` / `Evade` exact; `Defense` = Block or Evade |
| `[Clash Win]` / `[On Clash Win]` | The item's actor wins a clash |
| `[Clash Win With Attack]` / `[… With Block|Evade|Defense]` | Clash Win filtered by that side’s reaction |
| `[Clash Lose]` / `[On Clash Lose]` | The item's actor loses a clash |
| `[Clash Lose With Attack]` / `[… With Block|Evade|Defense]` | Clash Lose filtered by that side’s reaction |
| `[On Damage Calc]` | Before damage is finalized |
| `[On Hit]` | An attack connects, either one-sided or after a Clash Win. Runs on the **attacker** weapon/tool and statuses. After a clash, runs **after** the result card posts |
| `[On Being Hit]` | Same hit, but runs **status** scripts on the **defender** (`self` = defender, `target`/`attacker` = hitter). Same post-card timing as On Hit |
| `[On Instant]` | Instant skill activation |
| `[On Burst]` | Status-local burst body on the status being burst (shorthand for `[On <this status> Burst]`) |
| `[On <Status> Burst]` | After that status’s burst resolves. Used by skills, addons, and other statuses (e.g. `[On Tremor Burst]`) |
| `[On <Name>]` | Freeform named proc driven by `proc <Name>` (any name that is not a reserved lifecycle trigger) |
| `[On Action]` | At the end of an action |
| `[On Stagger]` | The item's actor becomes Staggered |
| `[On Applied]` | This status was created on the actor (first appear only) |
| `[On Removed]` | This status was cleared from the actor (full clear only) |
| `[On Gain]` | This status gained stacks (every increase, including first apply) |
| `[On Lose]` | This status lost stacks (every decrease, including full clear) |
| `[Turn Start]` | The start of the item's actor's turn in combat |
| `[On Move]` | After a token walk on the actor's turn |
| `[End of Round]` | When the combat round advances |
| `[On Taking Damage]` | Before damage is applied to the defender (flat resists, etc.) |
| `[On Taking <Filter> Damage]` | Same, but only when the hit matches a pool, status source, or damage type (see below) |
| `[On Depleted]` | A pool just dropped from above zero to zero |
| `[On Depleted <Pool>]` | Same, but only for `HP`, `ST`, `SP`, or `Light` |

One item can have **multiple trigger blocks** — just list them one after another:

```
[Clash Win]
gain 1 Charge;

[Turn Start]
lose 1 Charge;
```

`[On Applied]` / `[On Removed]` / `[On Gain]` / `[On Lose]` are for **status** items.

- **Applied / Removed:** fire once when the status first appears or fully clears.
- **Gain / Lose:** fire on every stack change. First apply runs Applied **and** Gain; full clear runs Lose **and** Removed.

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

| Path | Meaning |
|------|---------|
| `changed.amount` | Signed delta (`+3` on Gain, `-2` on Lose) |
| `changed.before` | Stacks before the change |
| `changed.after` | Stacks after the change |

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

- Arrival: `next round` promotes after `[End of Round]` (after clears like “lose all Tremor”). `next turn` promotes at that actor’s Turn Start.
- `pause <Status>` changes the **same** live status item to pending (default next round) without running Burst or On Lose. Effect List Pause skills run on Clash Win, which finishes **before** `[On Being Hit]`.

## Status Burst

`burst <Status> [on|to <target>];` runs a two-phase Burst for any status name:

1. **Local:** the burstee’s status item runs `[On Burst]` / `[On <Status> Burst]` (damage, stack clearing, etc.).
2. **Global:** equipped gear and statuses on the **attacker** and **burstee** then run matching `[On <Status> Burst]` blocks (e.g. Tremor–Bleed addons, Rupture Jag).

```
[On Burst]
deal (burst.amount) st damage to self;
lose all Tremor on self;
```

| Path | Meaning |
|------|---------|
| `burst.status` | Name of the status being burst |
| `burst.amount` / `burst.before` | Stacks when the burst started |
| `burst.after` | Stacks after the local phase (often `0`) |

`[On Burst]` on a status is shorthand for that status’s own burst body. Write `[On Tremor Burst]` on other items to react after a Tremor burst resolves.

Not allowed in `[Always Active]`.

## Named Procs

`proc <Name> [on|to <target>] [with <expr> as <Bind>, …];` fires a freeform named event in two phases.

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

**Carry-over binds** are evaluated on the caller and copied to every listener:

```
proc Foo with (self.status.Bar) as Bar, self.initiative as Zee;
proc Critical with (roll) as CritRoll;
```

Listeners read `(Bar)`, `(Zee)`, or `(proc.Bar)` / `(proc.name)`. Nested `proc` replaces binds (no merge).

Not allowed in `[Always Active]`.

## Passive Effects

The `[Always Active]` trigger is special. It doesn't wait for combat events, and applies the bonus ONCE when it's equipped, and inverts the bonus when unequipped (bringing it back to normal).

You cannot use dice or randomness with `[Always Active]` effects. It is strictly intended for passive effects that do not depend on any other variables.

Allowed here: resource `gain` / `lose` / `set` on maxes, `set resistances to …`, `power` / `dice max` passives, and `range up` passives.

Example:

```
[Always Active]
dice max up attack 2;
range up 1;
gain 2 maxHp;
set maxSp to 0;
set resistances to fatal;
```

- `gain` / `lose` on `maxHp` / `maxSt` / `maxSp` / `maxLight` are **additive** bonuses (misc / light bonus).
- `set maxSp to 0` (also `maxHp`, `maxSt`, `maxLight`) is an **absolute** override of the effective max.
- `set resistances to fatal` (or a single type) overrides outfit resists while the item/status is active; removing it restores the outfit values. Levels: `fatal` · `weak` · `normal` · `endured` · `ineffective` · `immune` (x2, 1.5x, 1, x0.5, x0.25, x0).
- Lowering a max clamps the current value immediately. Removing the item restores the max, but not the points lost to that clamp. Removing an increased max also clamps current to the natural max.
- If several items `set` the same max, the **lowest** value wins.

### Filtered taking-damage triggers

`[On Taking <Filter> Damage]` is shorthand for "only run this block for matching hits."

| Filter | Matches when… |
|--------|----------------|
| *(omit)* / `Any` | Always (same as `[On Taking Damage]`) |
| `HP` / `ST` / `SP` / `Light` | Pending pool is that resource |
| A status name (`Burn`, `"Bleed"`) | Damage `source` is that status |
| Any other word (`Slash`, `Pierce`, `Blunt`, …) | `damageType` equals that string (case-insensitive) |

```
[On Taking Burn Damage]
reduce damage by 3;

[On Taking SP Damage]
deal (incoming.amount * 2) hp damage to self;
```

Pools win over names: `[On Taking HP Damage]` always means the HP pool, not a status called HP.

### Clash With Attack / Block / Evade / Defense

Filters match the item actor's reaction on that clash, not who started the fight:

| Stance | When it matches |
|--------|-----------------|
| `Attack` / `Attacks` / `Offensive` / `Counter` | **Offensive Dice**: initiator Attack, **Counter Reaction**, or Attack Skill. Counter is Offensive, not its own stance at runtime |
| `Block` | Block Reaction (or Block Skill) only |
| `Evade` | Evade Reaction (or Evade Skill) only |
| `Defense` / `Defensive` | Block **or** Evade. This is the Effect List *with [Attack/Defense]* bucket |

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

| Timing | On `deal` | On `reduce` / `increase` |
|--------|-----------|---------------------------|
| **after** (default for `deal`) | Flat damage; skips type resist | Apply after the multiply (Protection, Fragile, Smoke) |
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
- `attacker` - the actor dealing the damage (same as `target` on this trigger)

`deal` accepts an optional damage type before or after the pool: `blunt hp damage` or `hp blunt damage`. If you omit the type and/or pool while reflecting, the new hit keeps `incoming.damageType` and `incoming.pool` (pool still defaults to `hp` outside that context). On non-status items during a clash, an omitted type falls back to the clash weapon's damage type. **Status** scripts such as Tremor Burst stay typeless / `none` unless a type is specified.

`convert` changes the **pending** hit (pool and/or type, optionally amount) without firing another damage event. Pool destinations can use `and` the same way as `deal` / `heal` (`convert damage to hp and st`).

Nested `deal` / `heal` from inside `[On Taking Damage]` does **not** re-run that trigger. Status ticks and other top-level `deal`s still run resists normally.

## Modificating your Combat Bonuses

Clash-time Power / Max write into that clash's **per-side** bonus bags (`attacker` / `defender`).
`on self` (default) affects the item owner's side; `on target` affects the other side.

```
[On Clash Start]
power up attack 2;
power down evade 1 on target;

dice max up attack 1;
dice max down evade 2;
```

- `power up` / `power down`: flat Dice Power added after the roll.
- `dice max up` / `dice max down`: changes die faces (d10 +2 Max → d12). If faces would go below 1, each excess Max reduction becomes −1 Power instead.
- Use `on target` for Enemy Power Down effects so the penalty applies to the other roll.

### Advantage / Disadvantage

Clash dice (attack / block / evade / counter) can roll with Advantage or Disadvantage. Roll twice and keep the highest for Advantage or lowest for Disadvantage. They **cancel** if both apply. Multiple sources still produce only two rolls.

```
[On Clash Start]
advantage;
disadvantage on target;
```

- Writes into that side’s clash bonus bag (same targeting as `power up`: `self` default, `on target` for the other side).
- Not valid in `[Always Active]`. Use `[On Clash Start]` (see Paralysis below as an example).

**Paralysis** (Effect List): Disadv on the Action/Reaction die, then −1 stack; clear all at end of round.

```
[On Clash Start] # TODO: placeholder, change to [On Action] when implemented
disadvantage;
lose 1 Paralysis;

[End of Round]
lose all Paralysis;
```

---

# Amounts

Amounts can be plain numbers, dice rolls, or values read from the actor.

| Form | Example | Meaning |
|------|---------|---------|
| Flat number | `3` | Always 3 |
| Dice | `1d6` | Roll a d6 at runtime |
| Actor value | `(self.rank)` | Equal to the actor's Rank |
| Math expression | `(self.rank * 2 + 1)` | Calculated at runtime |

```
gain (self.rank) Charge;
do deal damage 1d6 on target;
do deal damage (self.rank * 2) on target;
```

Dice and math can even be combined inside parentheses:

```
do deal damage (1d6 + self.rank) on target;
```

---

# Conditions

Conditions run an action only when their expression is true.

## Rolling once (`roll` / `on roll`)

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

- `the roll` and `(roll)` read the last `roll` / `on roll` in this trigger block.
- `(panic)` (or any bind name) reads that named total. Avoid status names because a named roll wins when both names match.
- On numeric compares (`<`, `<=`, `>`, `>=`), a bare status on the RHS (e.g. `<= Poise`) means **self stack count**, same as `(Poise)`.
- Equality (`==` / `!=`) treats a bare status name as a **string** (e.g. `require damage from Burn`).
- Not allowed under `[Always Active]` (no randomness there).
- If **Dice So Nice** is installed, `roll` / `on roll` **and** dice amounts (`deal 1d10…`, `heal 1d6…`, etc.) animate and the script **waits until the dice settle**. Without DSN, totals resolve silently.
- Simple `NdX per K` expands before rolling: `deal 1d10 hp damage per Critical` with 8 Critical -> one `8d10` roll (not `1d10 × 8`). Flat amounts multiply (`deal 2 per Critical` -> 16).

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
```

On `[On Taking Damage]`, you can gate by status source (status **name**), or use a filtered trigger instead:

```
require damage from Burn then reduce damage by 2;

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
3. Automatically removes the spent stacks — you never write `lose` manually

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
```

Reads: *"Deal 2 damage for each stack of Charge on self."*

---

# Flags (boolean checks)

These let you check whether someone is in a certain state:

| Flag | What it checks |
|------|---------------|
| `isStaggered self/target` | Is currently Staggered |
| `isPanicking self/target` | Is currently Panicking |
| `hasStatus <Name> self/target` | Has at least 1 stack of that status |

```
require isStaggered target == 1 then gain 2 Bleed on target;
require hasStatus Burn target == 1 then do deal damage 3 on target;
```

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

## Burn on hit, burst at 3 stacks
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

## Combo weapon — two triggers
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
require isStaggered target == 1 then gain 2 Bleed on target;
```

## AoE Smoke on Clash Win
```
[Clash Win]
gain 1 Smoke on enemies;
```

## Outfit — rally aura
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

## Hardblood shield
```
[On Damage Calc]
spend 1 self Bleed to regen hp 3;
```

## Limbus style clashing buff
```
[On Clash Start]
power up attack 1 per (self.status.Burn);
```

## Enemy Power Down (On Clash)
```
[On Clash Start]
power down attack 1 on target;
power down block 1 on target;
power down evade 1 on target;
```

---

# Quick Reference Card

## Triggers
`[Clash Win]` / `[On Clash Win]` · `[Clash Lose]` / `[On Clash Lose]` · `[… With Attack|Block|Evade|Defense|Counter]` · `[On Clash]` / `[On Clash Start]` · `[On Hit]` · `[On Being Hit]` · `[On Burst]` · `[On <Status> Burst]` · `[On <Name>]` · `[On Stagger]` · `[On Applied]` · `[On Gain]` · `[On Lose]` · `[On Removed]` · `[On Dialog Answer <id>]` · `[Turn Start]` · `[On Taking <Filter> Damage]`

## Targets
`self` · `target` · `ally` · `attacker` · `originator` · `enemies` · `allies` · `all`

`originator` is the actor stored on the host status’s `system.origin` (who applied it). Only meaningful on **status** scripts.

## Actions
| Statement | Meaning |
|-----------|---------|
| `create dialog "<prompt>" : <id> [as] "<label>", ... [to|on <target>]` | Ask a player; then run `[On Dialog Answer <id>]` on this script |
| `create message "<text>" [on|to <speaker>]` | Post chat as that character; `(…)` values interpolate |
| `inflict <N> <Status> next round\|turn [on <t>]` | Queue pending stacks (no EE until arrival) |
| `pause <Status> [on <t>]` | Flip same live status item to pending (Pause skills) |
| `burst <Status> [on\|to <target>]` | Status-local `[On Burst]`, then global `[On <Status> Burst]` |
| `proc <Name> [on\|to <target>] [with … as …]` | Named proc -> `[On <Name>]` (Crit/Dev/custom); optional bind carries |
| `gain <N> <Status> [on <target>]` | Add N stacks (target defaults to `self`) |
| `inflict <N> <Status> [on <target>]` | Add N stacks (target defaults to `target`) |
| `lose <N> <Status> [on <target>]` | Remove N stacks |
| `lose all [of] <Status> [on <target>]` | Remove every stack |
| `set <Status> to <N> [on <target>]` | Set stacks absolutely (`set <N> <Status>` also works; clamps to `stackMax` when > 0) |
| `halve <Status> [on <target>]` | Reduce stacks to half (floor) |
| `double <Status> [on <target>]` | Gain stacks equal to current (2x) |
| `lose half [of] <Status> [on <target>]` | Same as `halve` |
| `gain double [of] <Status> [on <target>]` | Same as `double` |
| `spend <N> <Status> [on <target>] to <actions>` | Require + remove + do |
| `require <condition> then <actions>` | Conditional block |
| `roll <dice> [as <name>]` | Roll once into `(roll)` / named bind |
| `on roll <dice> <op> <value> then <actions>` | Roll once, compare, then act |
| `deal <N> [<type>] [hp\|st\|sp\|light] damage [before\|after resistances] [to\|on <target>]` | Deal damage (default **after** resistances) |
| `do deal damage <N> on <target>` | Deal HP damage (standard form) |
| `convert [amount] damage to <pool\|type>` | Rewrite pending hit on `[On Taking Damage]` |
| `gain`/`lose`/`set` `Action`\|`Reaction`\|`movement` `[on <t>]` | Current action-economy / tactical SQR pools (`actions` / `reactions` / `squares` / `sqr` aliases) |
| `gain`/`lose`/`set` `tempHp`\|`tempSt`\|`tempSp` `[on <t>]` | Temporary pool buffers |
| `set hp\|st\|sp\|light to <N\|max> [on\|to <t>]` | Set current pool (`max` = that actor’s current max) |
| `set resistances to <level> [on <t>]` | All HP+ST Slash/Pierce/Blunt outfit resists (Always Active = override; event = write outfit) |
| `set <slash\|pierce\|blunt> resistance to <level> [on <t>]` | One damage type, both HP and ST |
| `set maxHp\|maxSt\|maxSp\|maxLight to <N>` | Absolute max (`[Always Active]` only) |
| `do heal <N> on <target>` | Restore HP |
| `power <up/down> <attack/block/evade/defense> <N> [on <target>]` | Dice Power on that side's roll (`defense` = Block and Evade) |
| `dice max <up/down> <attack/block/evade/defense> <N> [on <target>]` | Dice Max (faces) on that side's roll (`defense` = Block and Evade) |
| `advantage` / `disadvantage` `[on\|to <t>]` | Clash-side Adv/Disadv (cancel if both; `[On Clash Start]`) |
| `regen <hp/st/sp/light> <N>` | Shorthand to gain HP/ST/SP/Light |
| `range up <N>` | Increase a weapon's range. |

`<Status>` is a display name (`Burn`, `"Panic [Fight]"`) or a Document UUID (`Item.xxx`, quoted or bare dotted). Lookup order: UUID -> world Items -> packs.

## Readable values
| Path | Value |
|------|-------|
| `self.hp` / `sp` / `st` / `light` | Core attributes |
| `self.hp%` / `sp%` / `st%` / `light%` | Current fill as 0–100 of that pool’s max |
| `self.action` / `self.reaction` / `self.movement` | Remaining Actions / Reactions / tactical SQRs |
| `self.tempHp` / `tempSt` / `tempSp` | Temporary buffers |
| `self.rank` | Rank |
| `self.attack` / `evade` / `block` | Combat modifiers |
| `self.stat.for` / `pru` / `jus` / `cha` / `ins` / `tem` | Ability scores |
| `self.status.Burn` | Stack count of Burn on self |
| `self.status.Burn.origin` | Actor UUID that applied Burn (empty if unknown) |
| `self.uuid` / `self.id` / `self.name` | This actor’s UUID / id / name (`(self)` alone -> name) |
| `item.origin` | Applier UUID on the status/item running this script |
| `originator` / `originator.name` / `.uuid` | Who applied this status (status scripts; bare -> name) |
| `clash.margin` | Winning roll − losing roll |
| `clash.attackerRoll` / `clash.defenderRoll` | Raw clash dice |
| `incoming.amount` / `.pool` / `.source` / `.damageType` | Pending damage (`damage.*` also works) |
| `burst.status` / `.amount` / `.before` / `.after` | Active Burst snapshot |
| `moved.squares` / `.spaces` / `.movement` / `.forced` | `[On Move]` tiles walked (`forced` is 0 or 1) |
| `proc.name` / `proc.<Bind>` | Active Proc name / `with … as` binds (bare `<Bind>` also works) |
| `roll` / `roll.<name>` | Last / named roll-once totals |

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