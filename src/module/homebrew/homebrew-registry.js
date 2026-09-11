/**
 * @typedef {Object} HomebrewPackDefinition
 * @property {string}   id              - Unique setting key (also used as game.settings key)
 * @property {string}   label           - Display name
 * @property {string}   hint            - Short description shown in the menu
 * @property {boolean}  implemented     - Whether the pack is fully implemented
 * @property {string[]} compendiumPacks - Array of compendium pack keys this homebrew owns
 *                                         (e.g. "module-name.pack-name")
 */

export const HOMEBREW_REGISTRY = [
    {
        id: "overclaw",
        label: "OverCLAW",
        hint: "Optimized, variated, enhanced and rebalanced Community-Led Additional Works.",
        implemented: false,
        compendiumPacks: [
            //"projectmoonttrpg.overclaw-homebrew"
        ],
    },
    {
        id: "maxoAmr",
        label: "Maxo's Abnormal Mystery Research",
        hint: "Mysteries, Distortions, Abnormalities and more.",
        implemented: false,
        compendiumPacks: [
            //"projectmoonttrpg.maxos-homebrew"
        ],
    },
    {
        id: "boiHomebrew",
        label: "Boi's Homebrew",
        hint: "Shin (心), Mang (望), Ammo, Vengeance's Mark.",
        implemented: true,
        compendiumPacks: [
            "projectmoonttrpg.boi-homebrew"
        ],
    },
];