# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Changed

- Target list now highlights targets that are within range over ones that are out of range.
- Augments can now be enabled and disabled at will.
- Improved Styling of unequipped/inactive equipment.
- Clashes now spend the attacker's Action and the defender's Reaction when needed.
- [EasyEffects] `[On Action]` now fires when spending an Action or Reaction (clash and the sheet buttons) and when using a tool, before clash dice, so Paralysis and Bleed tick at the right time.
- Tool use now awaits EasyEffects `[On Use]` / `[On Action]` instead of only firing public hooks.

### Cleanup

- Removed some old unused rolling code.
- Small cleanup on the Header.

### Fixed

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
- [EasyEffects] `Bleed+` now applies extra Bleed when Bleed increased during the clash.
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
