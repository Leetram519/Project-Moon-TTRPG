# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### New Features

- Added anything in CR that interacted with a weapon's Range. (by @Leetram)
- [EasyEffects] `range up/down <Amount>` syntax added. (by @Leetram)
- You can now have multiple Augments per actor. (by @Leetram)
- Clashes now spend the attacker's Action and defender's Reaction when needed. (by @Bullesta)
- [EasyEffects] `[On Action]` now triggers before clash dice are rolled, allowing Paralysis and Bleed to trigger at the correct time. (by @Bullesta)

### QoL

- Target list now highlights targets that are within range over ones that are out of range. (by @Leetram)
- While targeting, there is now a red square highlighting the actor's range. (by @Leetram)
- Augments can now be enabled and disabled at will. (by @Leetram)
- Improved Styling of unequipped/inactive equipment. (by @Leetram)

### Bug Fixes

- [EasyEffects] `[Always Active]` `power/dice max` effects are now scoped to the item they came from, instead of applying to all items. (by @Bullesta)
- [EasyEffects] `spend <Amount> <Status> to ...` now snapshots the amount being spent before the following actions are run. (by @Bullesta)

## [0.1.2] - 2026/08/26

### New Features

- Documentation Github Pages. (by @Leetram)
- Applied tools are now usable on reactions. (by @Bullesta)
- [EasyEffects] `let $name = ...` variables are now usable. (by @Bullesta)
- [EasyEffects] `require (x) >= 1 then create dialog ...` parses now. (by @Bullesta)
- [EasyEffects] Bursts now include `burster` (the person that burst), and `burstee` (the person that holds the status) accessors. (by @Bullesta)
- [EasyEffects] Added `[On Depleted HP/ST/SP]` in Status Scripts (by @Bullesta)
- [EasyEffects] Added `proc <Name> on <focus> targeting <actor>` syntax, allowing proper targeting for effects live Devastating Hits. (by @Bullesta)
- [EasyEffects] Poise and Ruin roll before Clash Win/Lose by default, rather than after. (by @Bullesta)

### QoL

- Ranged weapons don't need a fake Slash/Pierce/Blunt damage type, and can now fire a `None` damage type bullet if no ammo is used. (by @Bullesta)
- Added a GM setting to show players the full combat tracker. (by @Bullesta)
- Changed the buttons around in the clash provocation card, where Retaliate now always answers as the clash target, whereas Intercept now uses your selected token. (by @Bullesta)

### Bug Fixes

- Fixed an issue where Form and Hand Properties didn't set themselves by default. (by @Bullesta)
- Fixed an issue where Effect descriptions didn't parse properly when `N` is not leading. (by @Bullesta)
- [EasyEffects] Fixed an issue where Clash Damage incorrectly marked the initiator as the one dealing the damage. (by @Bullesta)
- [EasyEffects] Fixed an issue where `reduce damage` was reducing damage an incorrect number of times. (by @Bullesta)
- [EasyEffects] Fixed an issue where `instant <Status>` was not instant. (by @Bullesta)
- [EasyEffects] Fixed an issue where `Bind Bonus` and `Press Advantage` has incorrect syntax. (by @Bullesta)
- [EasyEffects] Fixed an issue where `Charge Protection / Charge ST Protection` weren't added. (by @Leetram)
- [EasyEffects] Fixed an issue where `Ruination` effect had an incorrect syntax. (by @Leetram)
- [EasyEffects] Fixed an issue where `Slip Past` had an incorrect EE Script. (by @Leetram)
- [EasyEffects] Fixed an issue where `Smoke` Status has minor inconsistancies with CR. (by @Leetram)

### Cleanup

## [0.1.1] - 2026/08/22

### New Features

- Recycled Evades now correctly apply a -1 penalty instead of -2. (by @Bullesta)
- NPCs can (and must) now equip weapons and outfits. (by @Bullesta)
- [EasyEffects] Skills can now use `[On <Status> Burst]` triggers. (by @Bullesta)
- [EasyEffects] Skills can now listen to `proc` triggers. (by @Bullesta)
- [EasyEffects] `[On Use]` now correctly runs off of the weapon/outfit/tool/skill that was used. (by @Bullesta)
- [EasyEffects] `per` keyword can now be used with `gain`/`lose`/`inflict`, including in `[Always Active]` (be sure not to add dice though, as this intentionnaly does not work). (by @Bullesta)
- [EasyEffects] You can now walk actor paths. (by @Bullesta)
- [EasyEffects] `[Always Active] gain 1 Action/Reaction` now bump the max amount of Actions or Reactions. (by @Bullesta)
- [EasyEffects] `[On Taking <Pool> <Source> Damage]` trigger has been added. (by @Bullesta)
- [EasyEffects] `require damage from attack then` condition has been added. (by @Bullesta)
- [EasyEffects] `incoming.attack` accessor has been added. (by @Bullesta)
- [Macros] Full Heal macro added. (by @Bullesta)

### QoL

- Added a "missing badge" icon to character sheets when no badge is provided. (by @Leetram)
- SP can now go into the negatives. (by @Bullesta)
- Editing a pending status no longer spawns a live duplicate, and instead modifies the pending status. (by @Bullesta)
- Status badges and floating HP/Status numbers show up on all tokens that the player can see. (by @Bullesta)
- Clash Result cards now properly highlight winner and loser. (by @Bullesta)
- Clash Result cards now include an easy "apply effects to loser" button. (by @Bullesta)
- Dice So Nice rolls are now properly synchronized with each side's presets. (by @Bullesta)
- Combat Sidebar now highlights the actor whose turn it currently is. (by @Fetlach)

### Bug Fixes

- [EasyEffects] Fixed an issue where some effects were incorrectly scripted as `next turn` instead of `next round`. (by @Leetram)
- [EasyEffects] Fixed an issue where various effects (Regen HP/SP/ST) were incorrectly scripted as dealing N damage to target instead of self. (by @Leetram)
- [EasyEffects] Fixed an issue where the `Critical` status was malfunctionning due to incorrect parentheses. (by @Leetram)
- [EasyEffects] Fixed an issue where the `Critical` status was rolling 1d10 instead of 1d6 when the actor has `Slasher Stance` status. (by @Leetram)
- [EasyEffects] Fixed an issue where the some effects, when using `create dialog`, had an incorrect syntax. (by @Leetram)
- [EasyEffects] Fixed an issue where the [Clash Lose] effect triggered on one-sided attacks. (by @Bullesta)
- [EasyEffects] Fixed an issue where the `Sinking` status not applying HP damage when bursting on a target with no Max SP. (by @Bullesta)
- Fixed an issue where the movement ruler and sheet information reset every turn, regardless of if it should or not. (by @Bullesta)
- [EasyEffects] Fixed an issue where `Clash Win/Lose` ran on every equipped weapon/outfit/tool/skill instead of the one that was actually used. (by @Bullesta)
- [EasyEffects] Fixed an issue where `Fragile`, `ST Fragile`, `Protection`, `ST Protection` and `Smoke` responded to any damage type, including statuses. (by @Bullesta)
- [EasyEffects] Fixed an issue where `Pyromaniac`, `Cryomaniac`, `Hemomaniac`, `Siphon Luck` and `Siphon Curse` did not work as intended. (by @Bullesta)
- [EasyEffects] Fixed an issue where `Enemy Power Down` didn't affect defensive rolls. (by @Bullesta)
- [EasyEffects] Fixed an issue where various `Bonus` and `Vigor` didn't properly apply. (by @Leetram)

### Cleanup

- Removed `weight` field off of ammunition. (by @Bullesta)

## [0.1.0] - 2026/08/20

_First release._