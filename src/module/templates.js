/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
 export const preloadHandlebarsTemplates = async function() {

  // Define template paths to load
  const templatePaths = [
    "systems/projectmoonttrpg/templates/parts/chat-buttons.html",
    "systems/projectmoonttrpg/templates/chat/damage-taken.hbs",
    "systems/projectmoonttrpg/templates/chat/damage-breakdown.hbs",
    "systems/projectmoonttrpg/templates/combat/clashing/roll-breakdown.hbs",
    "systems/projectmoonttrpg/templates/parts/initiative-character.html",
    "systems/projectmoonttrpg/templates/parts/effects-list.html",
    "systems/projectmoonttrpg/templates/parts/easy-effects.html",
    "systems/projectmoonttrpg/templates/parts/item-slug-field.hbs",
    "systems/projectmoonttrpg/templates/apps/status-tray.hbs",
    "systems/projectmoonttrpg/templates/apps/easy-effects-editor.hbs",
    "systems/projectmoonttrpg/templates/hud/waypoint-label.hbs",
    // Character sheet (AppV2) partials referenced by sheet.hbs
    "systems/projectmoonttrpg/templates/sheet/character/partials/tracker.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/resists.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/header.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/attributes.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/tabs.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/panel-fx.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/tab-combat.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/tab-skills.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/tab-equipment.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/tab-weapons.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/tab-outfits.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/tab-ammunition.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/tab-tools.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/tab-augment.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/tab-bio.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/bios.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/augment.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/item-controls-equipment.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/item-controls-skill.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/item-controls-augment.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/item-controls-ammunition.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/item-controls-tool.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/damage-type-icon.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/item-thumb.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/status-list.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/item-attack-dice.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/item-defense-dice.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/item-resist-tile.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/item-resist-strip.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/item-row-weapon.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/item-row-outfit.hbs",
    "systems/projectmoonttrpg/templates/sheet/character/partials/item-row-skill.hbs",
    // NPC sheet (AppV2) partials
    "systems/projectmoonttrpg/templates/sheet/npc/partials/header.hbs",
    "systems/projectmoonttrpg/templates/sheet/npc/partials/tabs.hbs",
    "systems/projectmoonttrpg/templates/sheet/npc/partials/tab-combat.hbs",
    "systems/projectmoonttrpg/templates/sheet/npc/partials/tab-skills.hbs",
    "systems/projectmoonttrpg/templates/sheet/npc/partials/tab-brief.hbs",
    "systems/projectmoonttrpg/templates/sheet/npc/partials/item-controls-loadout.hbs",
    "systems/projectmoonttrpg/templates/sheet/npc/partials/item-row-weapon.hbs",
    "systems/projectmoonttrpg/templates/sheet/npc/partials/item-row-outfit.hbs",
    "systems/projectmoonttrpg/templates/sheet/npc/partials/item-row-augment.hbs",
    // Combat turn order partials
    "systems/projectmoonttrpg/templates/combat/parts/character.hbs",
    "systems/projectmoonttrpg/templates/combat/parts/initiative-tracker.hbs",
    "systems/projectmoonttrpg/templates/combat/parts/main-stat-tracker.hbs",
    "systems/projectmoonttrpg/templates/combat/parts/detail-stat-tracker.hbs",
    // Character sheet dialogs
    "systems/projectmoonttrpg/templates/dialog/apply-end-of-combat-healing.hbs",
    "systems/projectmoonttrpg/templates/dialog/apply-out-of-combat-healing.hbs",
    // Settings partials
    "systems/projectmoonttrpg/templates/settings/homebrew-menu.hbs"
  ];

  // Load the template parts
  return foundry.applications.handlebars.loadTemplates(templatePaths);
};
