import { BoiHomebrew } from "./boi-homebrew.js";

const LOG = "[HomebrewRegistry]";

export const HOMEBREW_REGISTRY = [
  {
    id: "overclaw",
    label: "OverCLAW",
    hint: "Optimized, variated, enhanced and rebalanced Community-Led Additional Works.",
    implemented: false,
    compendiumPacks: [],
  },
  {
    id: "maxoAmr",
    label: "Maxo's Abnormal Mystery Research",
    hint: "Mysteries, Distortions, Abnormalities and more.",
    implemented: false,
    compendiumPacks: [],
  },
  {
    id: "boiHomebrew",
    label: "Boi's Homebrew",
    hint: "Shin (心), Mang (望), Ammo, Vengeance's Mark.",
    implemented: true,
    associatedClass: BoiHomebrew,
    compendiumPacks: [
      "projectmoonttrpg.boi-homebrew"
    ],
  },
];

export class HomebrewRegistry {

  static registerAll() {
    console.groupCollapsed(`${LOG} Registering all homebrews`);

    for (const def of HOMEBREW_REGISTRY) {
      if (def.implemented && def.associatedClass) {
        console.log(`${LOG} Registering: ${def.id}`);
        def.associatedClass.register();
      }
    }

    console.groupEnd();
  }

  static getHomebrew(id) {
    return HOMEBREW_REGISTRY.find(h => h.id === id);
  }

  static getImplemented() {
    return HOMEBREW_REGISTRY.filter(h => h.implemented);
  }
}