# Project Moon TTRPG — FoundryVTT System

A community-built FoundryVTT system for the **Project Moon TTRPG**, based on the community rulebook.

![Foundry v14](https://img.shields.io/badge/Foundry-v14-green)
![License: GPL](https://img.shields.io/badge/License-GPL-blue)
![GitHub issues](https://img.shields.io/github/issues/Leetram519/Project-Moon-TTRPG)
![GitHub pull requests](https://img.shields.io/github/issues-pr/Leetram519/Project-Moon-TTRPG)

---

## Features

- **Character sheets** for player characters and NPCs/enemies
- **Derived attributes** — HP, ST, SP, and Light calculated automatically from stats and rank
- **Rollable stats** — Fortitude, Prudence, Justice, Charm, Insight, Temperance
- **Challenge rolls** — 2d6 + stat with success/partial/failure resolution
- **Combat rolls** — Attack, Block, and Evade dice with modifiers
- **Clash system** *(in development)* — full clash request and interaction support
- **Equipment** — Weapon, Outfit, Skill, and Augment item sheets with EP budgets
- **Status effects** — stackable statuses tracked as inventory items
- **EasyEffects** *(in development)* — a lightweight scripting syntax for defining item effects without macros
- **Compendium** *(in development)* — statuses, effects, weapons, outfits, tools, and enemies

---

## Manual Installation

The system is not yet listed in the official Foundry VTT package browser. Install it manually using the steps below.

### Option A — Install from release zip

1. Go to the [Releases page](https://github.com/Leetram519/Project-Moon-TTRPG/releases) and download the latest `system.zip`. If no releases are available currently, please check back later, or build it yourself from source.
2. Extract the contents into your Foundry data directory:
   ```
   <foundryData>/Data/systems/projectmoonttrpg/
   ```
3. Restart Foundry VTT if it was already running.
4. Create or open a World and select **Project Moon TTRPG** as the game system.

### Option B - Install from manifest URL

This is not yet possible. We're working on it, and it'll come with the MVP 1.0.0 release.

---

## Compatibility

| Foundry Version | Status | Supported Until |
|----------------|--------|---------------|
| v13 | ✅ Supported | MVP 1.1 |
| v14 | ✅ Supported | Further Notice |

---

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) v24 or higher
- npm (comes with Node.js)

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/Leetram519/Project-Moon-TTRPG.git
cd Project-Moon-TTRPG

# 2. Install dependencies
npm install

# 3. Build the system (compiles SCSS → CSS and assembles output files)
npm run build
```

Once built, copy or symlink the output directory into your Foundry data folder:

```bash
# Linux / macOS — symlink (recommended for active development)
ln -s /path/to/Project-Moon-TTRPG/dist ~/.local/share/FoundryVTT/Data/systems/projectmoonttrpg

# Windows — copy manually or use mklink in an Administrator terminal
mklink /D "C:\Users\<you>\AppData\Local\FoundryVTT\Data\systems\projectmoonttrpg" "C:\path\to\Project-Moon-TTRPG\dist"
```

Then restart Foundry VTT.

---

## Contributing

We welcome bug reports, feature requests, and pull requests from everyone.

- **Issues** — use [GitHub Issues](https://github.com/Leetram519/Project-Moon-TTRPG/issues) to report bugs or request features. Please search existing issues before opening a new one.
- **Pull Requests** — fork the repo, make your changes on a feature branch, and open a PR against `master`. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting.
- **Core team** — the project is maintained by a core team of five, under the Glasshat Studios umbrella; all PRs are reviewed before merging.

---

## Source Code Structure

```
docs/           # Documentation for the project (currently empty)
src/            # The actual source code
├── assets/             # SCSS source files
├── module/             # JS Files that define the system's logic
│   ├── actor/                  # Actor classes and data preparation
│   ├── combat/                 # Defines the Initiative Turn Order sidebar
│   ├── item/                   # Item classes (weapon, outfit, skill, augment, status, tool)
│   ├── easy-effects/           # EasyEffects scripting engine (lexer, parser, interpreter, registry)
│   ├── effects/                # Some functions to help with Effects and auto-descriptions
│   └── chat.js                 # Handles chat buttons
│   ├── config.js               # Some constants
│   ├── handlebars.js           # Some utilities accessible via HTML
│   ├── projectmoonttrpg.js     # Main entrypoint file
│   ├── rolls.js                # Handles anything rolling-related
│   ├── status-macro-api.js     # Helper for status effects and hook points for them
│   ├── targeting.js            # Helper for targeting
│   ├── templates.js            # Registers HTML templates
│   └── utility.js              # Miscellanous helper functions
├── templates/          # HTML Templates
│   ├── chat/                   # Templates for chat cards and chat buttons
│   ├── combat/                 # Templates for the combat sidebar
│   ├── dialog/                 # Templates for dialog popups
│   ├── items/                  # Templates for item sheets
│   ├── parts/                  # Template parts (buttons, dividers etc)
│   └── sheet/                  # Templates for NPC and Player sheets
├── packs/              # Compendium packs (YML, turns into JSON at compile)
├── scripts/            # Useful scripts that are executed at compile time
├── styles/             # SCSS source files
└── yaml/               # Various YML files
    ├── lang/                   # Localization files
    ├── system.yml              # Defines the system info, compiles into system.json
    └── template.yml            # Defines data types for players/items... in the system
tools/          # Useful tools to help with development
```

---

## License

This project is licensed under the **GNU General Public License (GPL)**. See [LICENSE](./LICENSE) for details.

---

## Acknowledgements

Built by the PMTRPG EN community in collaboration with [Glasshat Studios](https://glasshat.fr/), based on the [Community Rulebook](https://docs.google.com/document/d/1B5mX63nfjJt36l7GlWmtnO2Gsvv9lCuKm30M-S0fzmw/edit?tab=t.0).  
This system is a fan project and is not affiliated with or endorsed by Project Moon Co., Ltd., West Marches, and is not owned by Glasshat Studios.
