# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Leetram Versioning](https://leetramversioning.com).

## [Unreleased]

### Added

- [EasyEffects] `dice amount up` / `dice amount down` changes the number of dice. The count cannot go below 1. On `[Always Active]`, Amount on a weapon or outfit applies only to that item. Skill Amount applies when that skill is used. The clash breakdown shows Dice Amount.
- [EasyEffects] `set dice formula` on `[Always Active]` replaces the base count, faces, and flat Power. Rank, hand, form, outfit property, Insight, Temperance, and Power, Max, and Amount from other effects still add. With no die name, a weapon sets Attack and a outfit sets Block and Evade. A formula on a weapon, outfit, or status shows on the standing die. `[flavor]` sets the Dice So Nice color.
- Added a new system that allows players to hover and see statuses on any token.
- Added New Item Sheets
- Added Homebrew Settings
- Added Status Icons in Descriptions
- Added "Patreon Homebrew" Compendiums.
- Added 7 Patreon effects :
    - E.G.O. Attunement [Envy]
    - E.G.O. Attunement [Gloom]
    - E.G.O. Attunement [Gluttony]
    - E.G.O. Attunement [Lust]
    - E.G.O. Attunement [Pride]
    - E.G.O. Attunement [Sloth]
    - E.G.O. Attunement [Wrath]
- Added the Action Menu to character and NPC sheets.
- Added Dash, Disengage, Convert to Reactions, Protect, Take Cover, Ready, Assist and Reduce Status.
- Added Grapple, Throw and Break Free.
- Added Opportunity Attacks.
- Added Reaction credits.
- Added Delay to the Combat Tracker.
- Added Change Weapons and Change Outfit.
- Added Falling.
- Added the Force damage type.
- Actions now post a short chat message.
- Added Action states to tokens, the Combat Tracker and sheets.
- Added a Consume checkbox to skip the cost.
- [EasyEffects] `abs()`, `self.reactionsUsed`, `action.*`, `clash.reaction` and `clash.recycled` added.
- [EasyEffects] `gain N <Kind> Reaction` and `spend N Reaction to …` syntax added.
- [EasyEffects] `dashSquares` and `reduceStatusStacks` added.
- Added module APIs for the Action Economy.

### Changed

- [EasyEffects] SRD `[On Clash Start]` and `[On Clash RESULT]` effects now say `with CHOICE`.
- [EasyEffects] Charge lost at the end of the round counts toward Overcharge.
- [EasyEffects] Charge Barrier grants its temporary HP on `[Start of Round]`.
- A migration rewrites those Charge, Charge Barrier, and `with CHOICE` scripts on actors and items already in the world.
- Deleting an item from a sheet now asks first.
- Weapons and tools can now be Held, Stowed or Dropped.
- Actions taken outside your turn cost a Reaction.
- Actions and Reactions are free out of combat.
- Market and Standalone tools cost 1 Action.
- Starting or joining combat refills Actions, Reactions and Movement.
- Weapon attacks need a held weapon.
- Attacks and Retaliates you can't pay for are refused.
- Ammo and Skill Light are spent when the clash rolls.
- Linked actors with several tokens now ask which one acts if it isn't clear.
- Range now counts from the edge of large tokens.
- Difficult Terrain and Crawl cost extra Squares.
- Removed the None damage type button. Click a selected type again to clear it.
- [EasyEffects] Updated SRD scripts for the Action Economy:
    - Staggered
    - Self-Staggered
    - Panic [Freeze]
    - Panic [Fawn]
    - Bleed
    - Burn
    - Frostbite
    - Smoke
    - Bleed - Hemorrhage
    - Burn - Renewed Blaze
    - Frostbite - Deep Chill
    - Additional Block
    - Gain Charge
    - Single Strike
    - Light Material
    - Insulated Fabric
- [EasyEffects] `self.reaction`, `lose N Reaction` and `set reaction to N` include Reaction credits.
- [EasyEffects] `With Counter` clash triggers only run for Counters now.
- [Macros] Full Heal restores Reaction credits.

### Cleanup

- Removed an unused copy of the Combatant class.

### Fixed

- Foundry combat tracker Roll All / Roll NPCs now use 1d6 + Justice + misc.
- Each unlinked token has its own combatant. Combat start, combat end, turns, movement, targeting, and clash chat use that token. EasyEffects `enemies`, `allies`, and `all` use that token too.
- Cancelling a dialog no longer counts as a choice.
- Retaliating twice on the same attack card no longer starts two clashes.
- Previous Turn and Previous Round no longer rerun turn and round triggers.
- Removing the current Combatant now starts the next turn.
- Status stacks no longer get lost when two changes happen at once.
- [EasyEffects] Using a tool now runs `[On Action]` on equipped items and statuses.
- [EasyEffects] Staggered from end-of-round damage now lasts through the next round.
- [EasyEffects] `Burn+` now inflicts Burn instead of Bleed.
- [EasyEffects] `instant` on the used kit now also covers that side's augments, outfits, and statuses, so `Instant Crit` counts their Poise and Critical before the crit roll.
- [EasyEffects] A status that loses and regains itself during its own proc or burst no longer runs it again. `Cursed` no longer triggers Devastation twice.
- [EasyEffects] `Poise` and `Ruin` no longer fire `[On FailedCriticalRoll]` / `[On FailedDevastationRoll]` after a successful roll.
- [EasyEffects] `Tremor Shock` now triggers on Tremor Burst and no longer says it isn't implemented. `Tremor Break` shows its own description.
- [EasyEffects] Outfit `Power Engine` now asks only when the outfit is used to Block or Evade.
- `Evade Dice Max Up` now says Evade Dice in its description.
- [EasyEffects] Charge is only lost at the end of the round when Overcharge is on.
- [EasyEffects] Skill Charge effects now consume their Charge on use, win or lose.
- [EasyEffects] `Charge - Bombardment`, `Charge - Type Fragile`, `Charge - Type Protection`, `Ruptured Omen`, `Smoke Overflow`, `[M] Extension Grip`, and `E.G.O. Attunement [Gloom]` now correctly parse.
- [EasyEffects] `[M] Extension Grip` can be declined, and stops spending Charge after the turn it was chosen.
- `Charge - Type Protection` now lists Protection types instead of Fragile.
- [EasyEffects] Negative `Shock Absorbant` and `Padded Clothing` now deal ST and HP damage instead of granting temporary ST and HP.

## [0.1.3] - 2026-09-16

### Added

- [DiceSoNice] Dice rolls now have visual flavour colors.
- [DiceSoNice] Dice rolls now support "flavour syntax", such as `1d10[poise]`, `1d12+2[pierce]`, `2d8kh[ruin]`, putting a dice type onto the dice roll.
- [EasyEffects] `[Before Dealing … Damage]` / `[On Dealing … Damage]` added.
- [EasyEffects] `[On Combat Start]` / `[On Combat End]` added (every owned item, equipped or not).
- [EasyEffects] `[On Equip]` / `[On Unequip]` added.
- [EasyEffects] `[On Heal]` / `[On Being Healed]` / `[On Heal HP]` added. `increase heal` / `reduce heal` / `convert heal` syntax and the `healer` target added.
- [EasyEffects] `[On Roll]` / `[On Roll "<tag>"]` added. `roll <dice> tagged "<tag>"` and `reduce/increase roll` syntax added.
- [EasyEffects] `[On Clash Win Before Results]` / `[On Hit Before Results]` / `[On Being Hit Before Results]` added.
- [EasyEffects] `[End of Turn]` added. `[Turn Start]` / `[Start of Round]` / `[End of Round]` now accept `On` / `Start of` aliases.
- [EasyEffects] `halve` / `double` / `lose half` / `gain double` syntax added.
- [EasyEffects] `min()` / `max()` / `clamp()` and `//` / `//f` / `//c` syntax added.
- [EasyEffects] `increase flag` / `reduce flag` syntax added.
- [EasyEffects] `range up/down <Amount>` syntax added.
- [Macros] Effect Clear macro added.
- Rank EX: the sheet shows EX at rank 6+, and level can go down to -3 (Rank 0). Rank EX still uses Rank 5 Action / Reaction counts.
- GMs can now reveal or hide individual combat tracker stats per combatant.
- Added anything in CR that interacted with a weapon's Range.
- You can now have multiple Augments per actor.
- While targeting, there is now a red square highlighting the actor's range.
- There are now 2 buttons on the header of Actors allowing you to do End of Combat Healing and Out of Combat Resting (according to CR 3.x rules).
- Alt+drop a status onto a token or character sheet to set quantity and apply it now, next round, or next turn.
- GMs can now edit EasyEffects flags from the 3-dot menu on actor sheets, item sheets, and the combat tracker.
- You can now drag combatants in the tracker to change turn order, and GMs and owners can type a new Speed.
- Added a Migration System that allows GMs to update their world automatically via a popup at the start.
- [EasyEffects] added various CR automation scripts : 
    - **Charge & Overcharge**
    - [M] Increase Range
    - [M] Extra DMG Type
    - [R] Extra Range
    - [M] Extension Grip (This is a hacky fix!)
    - Vital Protections
    - Comfy Clothes
    - Bloodthirst
    - Overcharged Drive
    - Kinetic Storage
    - Regeneration Versatility
    - Indomitable
    - Paranoid
    - Squeamish
    - [R] Overheat (This is a partial fix! Only applies the +2 Dice Power Up, not the "can only use this weapon once per turn" restriction.)
    - Instant Bind
    - Burn+
    - Burn Vigor
    - Frostbite+
    - Frostbite Vigor
    - Bleed+
    - Bleed Vigor
    - Instant Crit
    - Instant Devastation
    - Rupture+
    - Instant Rupture
    - Tremor+
    - Instant Tremor
    - Sinking+
    - Instant Sinking

### Changed

- Target list now highlights targets that are within range over ones that are out of range.
- Augments can now be enabled and disabled at will.
- Improved Styling of unequipped/inactive equipment.
- Clashes now spend the attacker's Action and the defender's Reaction when needed.
- [EasyEffects] `Staggered` and `Self-Staggered` expire after two `[Start of Round]` ticks and `proc Staggered` on apply.
- You can Counter out of range. Winning still deals the counter, and the result card shows `Out of range`.
- [EasyEffects] `[On Action]` now fires when spending an Action or Reaction (clash and the sheet buttons) and when using a tool, before clash dice, so Paralysis and Bleed tick at the right time.
- Tool use now awaits EasyEffects `[On Use]` / `[On Action]` instead of only firing public hooks.

### Removed

- [EasyEffects] Dropped the unused `[On Stagger]` lifecycle trigger and the `pmttrpg.actorStaggered` hook.

### Cleanup

- Removed some old unused rolling code.
- Small cleanup on the Header.

### Fixed

- Weapon range 0 no longer counts as 1.
- Combat tracker now scrolls when there are too many combatants.
- Target dialog now scrolls when there are too many combatants.
- [EasyEffects] Outfit `Additional Reaction` now stamps `[Always Active] gain 1 Reaction`.
- [EasyEffects] `[On Hit]` / `[On Hit Before Results]` now run on the attacker's active augments.
- [EasyEffects] `Rupture Boost` and `Tremor Boost` now burst the clash loser (`on target`), so Block Clash Wins apply the Burst.
- Armored outfits now deal Block Win ST equal to half the Block total when that is greater than the clash difference.
- NPC sheet loadout now lists a newly added weapon or outfit immediately, instead of waiting until both types exist.
- [EasyEffects] `[Always Active]` `power/dice max` effects are now scoped to the item they came from, instead of applying to all items.
- [EasyEffects] Skill `[Always Active]` Power / Max now apply when that skill is used, instead of changing the actor's standing Attack / Block / Evade modifiers. NPC kits with Attack Replacement no longer show a permanent -2 Attack.
- [EasyEffects] `spend <Amount> <Status> to ...` now uses the amount from before later actions run.
- [EasyEffects] `[Start of Round]` no longer runs on statuses that were fully cleared during the same `[End of Round]`.
- [EasyEffects] `set "<Multi Word Status>" to <N>` now parses.
- [EasyEffects] `Scattering Dance` now lowers the critical-check roll instead of changing Poise.
- [EasyEffects] `Poise`, `Bulwark Defense`, `Elusive`, and `Precision` critical checks now use `roll ... tagged "critical-check"`.
- [EasyEffects] `Cursed` now applies on `[On Equip]` and when Ruin or Devastation stacks change.
- [EasyEffects] `Hemorrhage` now inflicts `N` stacks and applies to Bleed from the same clash.
- [EasyEffects] `Chill Out`, `Cold Snap`, `Deep Chill`, `Shatter`, `Rupture Shred`, and `Ruptured Omen` now match the rulebook.
- [EasyEffects] `Absorb Sinking`, `Constant Barrier`, `Single Strike`, and various Vigor effects now use the correct capped formulas.
- [EasyEffects] `Evaporate` and `Smoke Stack` no longer apply the wrong clash bonus.
- Clash result cards wait for Dice So Nice before revealing, with a timeout so a stuck animation cannot freeze the card. Player-owned tokens can Retaliate even when the token is not on the viewed scene, and clash chat updates keep their flags when a GM applies them.
- Clash spends (actions, reactions, ammo, Light, recycled evade) now go through the GM when the clicker cannot write a token ActorDelta, so a player Retaliate no longer dies on NPC or unlinked-token updates.
- [EasyEffects] Gaining Devastation (or Critical) with no paired Ruin (or Poise) no longer resets the new stacks to 1.
- [EasyEffects] `Ruination` now hears a failed Ruin roll and checks the target's Ruin.
- [EasyEffects] Panic types set `isPanicking`, and Staggered / Self-Staggered set `isStaggered`, on apply and clear those flags on remove. `Sinking Deluge` uses those flags (plus 0 SP) instead of a dialog.
- [EasyEffects] `Slow Start` and `Bloodthirst` now apply first-round dice Power on `[On Clash Start]`, instead of writing clash bonuses during `[Start of Round]` where they are ignored.

## [0.1.2] - 2026-08-26

### Added

- Documentation Github Pages.
- Applied tools are now usable on reactions.
- [EasyEffects] `let $name = ...` variables are now usable.
- [EasyEffects] `require (x) >= 1 then create dialog ...` parses now.
- [EasyEffects] Bursts now include `burster` (the person that burst), and `burstee` (the person that holds the status) accessors.
- [EasyEffects] Added `[On Depleted HP/ST/SP]` in Status Scripts
- [EasyEffects] Added `proc <Name> on <focus> targeting <actor>` syntax, allowing proper targeting for effects live Devastating Hits.
- [EasyEffects] Poise and Ruin roll before Clash Win/Lose by default, rather than after.

### Changed

- Ranged weapons don't need a fake Slash/Pierce/Blunt damage type, and can now fire a `None` damage type bullet if no ammo is used.
- Added a GM setting to show players the full combat tracker.
- Changed the buttons around in the clash provocation card, where Retaliate now always answers as the clash target, whereas Intercept now uses your selected token.

### Fixed

- Fixed an issue where Form and Hand Properties didn't set themselves by default.
- Fixed an issue where Effect descriptions didn't parse properly when `N` is not leading.
- [EasyEffects] Fixed an issue where Clash Damage incorrectly marked the initiator as the one dealing the damage.
- [EasyEffects] Fixed an issue where `reduce damage` was reducing damage an incorrect number of times.
- [EasyEffects] Fixed an issue where `instant <Status>` was not instant.
- [EasyEffects] Fixed an issue where `Bind Bonus` and `Press Advantage` has incorrect syntax.
- [EasyEffects] Fixed an issue where `Charge Protection / Charge ST Protection` weren't added.
- [EasyEffects] Fixed an issue where `Ruination` effect had an incorrect syntax.
- [EasyEffects] Fixed an issue where `Slip Past` had an incorrect EE Script.
- [EasyEffects] Fixed an issue where `Smoke` Status has minor inconsistancies with CR.

## [0.1.1] - 2026-08-22

### Added

- Recycled Evades now correctly apply a -1 penalty instead of -2.
- NPCs can (and must) now equip weapons and outfits.
- [EasyEffects] Skills can now use `[On <Status> Burst]` triggers.
- [EasyEffects] Skills can now listen to `proc` triggers.
- [EasyEffects] `[On Use]` now correctly runs off of the weapon/outfit/tool/skill that was used.
- [EasyEffects] `per` keyword can now be used with `gain`/`lose`/`inflict`, including in `[Always Active]` (be sure not to add dice though, as this intentionnaly does not work).
- [EasyEffects] You can now walk actor paths.
- [EasyEffects] `[Always Active] gain 1 Action/Reaction` now bump the max amount of Actions or Reactions.
- [EasyEffects] `[On Taking <Pool> <Source> Damage]` trigger has been added.
- [EasyEffects] `require damage from attack then` condition has been added.
- [EasyEffects] `incoming.attack` accessor has been added.
- [Macros] Full Heal macro added.

### Changed

- Added a "missing badge" icon to character sheets when no badge is provided.
- SP can now go into the negatives.
- Editing a pending status no longer spawns a live duplicate, and instead modifies the pending status.
- Status badges and floating HP/Status numbers show up on all tokens that the player can see.
- Clash Result cards now properly highlight winner and loser.
- Clash Result cards now include an easy "apply effects to loser" button.
- Dice So Nice rolls are now properly synchronized with each side's presets.
- Combat Sidebar now highlights the actor whose turn it currently is.

### Removed

- Removed `weight` field off of ammunition.

### Fixed

- [EasyEffects] Fixed an issue where some effects were incorrectly scripted as `next turn` instead of `next round`.
- [EasyEffects] Fixed an issue where various effects (Regen HP/SP/ST) were incorrectly scripted as dealing N damage to target instead of self.
- [EasyEffects] Fixed an issue where the `Critical` status was malfunctionning due to incorrect parentheses.
- [EasyEffects] Fixed an issue where the `Critical` status was rolling 1d10 instead of 1d6 when the actor has `Slasher Stance` status.
- [EasyEffects] Fixed an issue where the some effects, when using `create dialog`, had an incorrect syntax.
- [EasyEffects] Fixed an issue where the [Clash Lose] effect triggered on one-sided attacks.
- [EasyEffects] Fixed an issue where the `Sinking` status not applying HP damage when bursting on a target with no Max SP.
- Fixed an issue where the movement ruler and sheet information reset every turn, regardless of if it should or not.
- [EasyEffects] Fixed an issue where `Clash Win/Lose` ran on every equipped weapon/outfit/tool/skill instead of the one that was actually used.
- [EasyEffects] Fixed an issue where `Fragile`, `ST Fragile`, `Protection`, `ST Protection` and `Smoke` responded to any damage type, including statuses.
- [EasyEffects] Fixed an issue where `Pyromaniac`, `Cryomaniac`, `Hemomaniac`, `Siphon Luck` and `Siphon Curse` did not work as intended.
- [EasyEffects] Fixed an issue where `Enemy Power Down` didn't affect defensive rolls.
- [EasyEffects] Fixed an issue where various `Bonus` and `Vigor` didn't properly apply.

## [0.1.0] - 2026-08-20

_First release._
