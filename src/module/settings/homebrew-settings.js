import { BoiHomebrew } from "../homebrew/boi-homebrew.js";

/**
 * Manages the "Open Homebrew Menu" button in module settings,
 * and renders the Homebrew Menu dialog.
 */
export class HomebrewSettings {
    static SETTING_KEY = "openHomebrewMenu";

    /** Registers the button that opens the Homebrew Menu. */
    static register() {
        // A menu-type setting renders as a button in the settings UI
        game.settings.registerMenu("projectmoonttrpg", HomebrewSettings.SETTING_KEY, {
            name: "Homebrew Menu",
            label: "Open Homebrew Menu",
            hint: "Enable or disable homebrew content packs.",
            icon: "fas fa-book-open",
            scope: "world",
            type: HomebrewMenuDialog,
            restricted: true,   // GM only,
            onChange: () => window.location.reload()
        });
    }
}

/**
 * The dialog window shown when clicking "Open Homebrew Menu".
 */
class HomebrewMenuDialog extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "homebrew-menu",
            title: "Homebrew Menu",
            template: "systems/projectmoonttrpg/templates/settings/homebrew-menu.hbs",
            width: "auto",
            height: "auto",
            closeOnSubmit: true,
        });
    }

    /** Passes current toggle states to the template. */
    getData() {
        return {
        homebrews: [
            {
                label: "OverCLAW",
                hint: "(NOT IMPLEMENTED!) Optimized, variated, enhanced and rebalanced Community-Led Additional Works.",
            },
            {
                label: "Maxo's Abnormal Mystery Research",
                hint: "(NOT IMPLEMENTED!) Mysteries, Distortions, Abnormalities and more.",
            },
            {
                id: BoiHomebrew.SETTING_KEY,
                label: "Boi's Homebrew",
                hint: "Shin (心), Mang (望), Ammo, Vengeance's Mark.",
                enabled: BoiHomebrew.isEnabled(),
            },
        ],
        };
    }

    /** Saves all toggle states when the form is submitted. */
    async _updateObject(_event, formData) {
        for (const [key, value] of Object.entries(formData)) {
            await game.settings.set("projectmoonttrpg", key, value);
        }
    }
}