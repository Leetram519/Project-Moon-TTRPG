import { HOMEBREW_REGISTRY } from "../homebrew/homebrew-registry.js";
import { CompendiumFlags }   from "../homebrew/compendium/compendium-flags.js";

export class HomebrewSettings {
  static SETTING_KEY = "openHomebrewMenu";

  static register() {
    CompendiumFlags.register();

    for (const def of HOMEBREW_REGISTRY) {
      if (!def.implemented) continue;
      game.settings.register("projectmoonttrpg", def.id, {
        name: def.label,
        hint: def.hint,
        scope: "world",
        config: false,
        type: Boolean,
        default: false,
        onChange: async (value) => {
          await CompendiumFlags.applyHomebrewState(def.id, value);
        },
      });
    }

    game.settings.registerMenu("projectmoonttrpg", HomebrewSettings.SETTING_KEY, {
      name: "Homebrew Menu",
      label: "Open Homebrew Menu",
      hint: "Enable, disable, and reorder homebrew content packs.",
      icon: "fas fa-book-open",
      scope: "world",
      type: HomebrewMenuDialog,
      restricted: true,
    });
  }

  /** Is a given homebrew pack enabled? */
  static isEnabled(id) {
    try {
      return game.settings.get("projectmoonttrpg", id) === true;
    } catch {
      return false;
    }
  }
}

class HomebrewMenuDialog extends FormApplication {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "homebrew-menu",
      title: "Homebrew Menu",
      template: `systems/projectmoonttrpg/templates/settings/homebrew-menu.hbs`,
      width: 600,
      height: "auto",
      resizable: true,
      closeOnSubmit: true,
      tabs: [{
          navSelector: ".tabs",
          contentSelector: ".tab-content",
          initial: "packs",
      }],
    });
  }

  /** @override */
  getData() {
    const packConfigs = CompendiumFlags.getAll();

    const homebrews = HOMEBREW_REGISTRY.map(def => {
      const enabled = HomebrewSettings.isEnabled(def.id);

      const prio = def.compendiumPacks.reduce((max, key) => {
          return Math.max(max, packConfigs[key]?.priority ?? 0);
      }, 0);

      return {
        id: def.id,
        label: def.label,
        hint: def.hint,
        implemented: def.implemented,
        enabled,
        priority: prio,
      };
    }).sort((a, b) => b.priority - a.priority);

    const allPackConfigs = Object.entries(packConfigs).map(([key, cfg]) => {
      const pack = game.packs.get(key);
      return {
        key,
        label: pack?.metadata?.label ?? key,
        hidden: cfg.hidden,
        active: cfg.active,
        priority: cfg.priority,
      };
    }).sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label));

    return { homebrews, allPackConfigs };
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Drag handles on the homebrew rows
    html.find(".homebrew-list").each((_, list) => {
      this._enableDragSort(list);
    });
  }

  /**
   * Simple drag-sort using the HTML5 drag API.
   * Reorders the DOM rows and writes new priority values into hidden inputs.
   */
  _enableDragSort(list) {
    let dragged = null;

    list.querySelectorAll(".homebrew-row[draggable]").forEach(row => {
      row.addEventListener("dragstart", e => {
        dragged = row;
        row.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });

      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        dragged = null;
        this._recalcPriorities(list);
      });

      row.addEventListener("dragover", e => {
        e.preventDefault();
        if (dragged && dragged !== row) {
          const rect = row.getBoundingClientRect();
          const after = e.clientY > rect.top + rect.height / 2;
          list.insertBefore(dragged, after ? row.nextSibling : row);
        }
      });
    });
  }

  _recalcPriorities(list) {
      const rows = [...list.querySelectorAll(".homebrew-row[draggable]")];
      const total = rows.length;

      rows.forEach((row, i) => {
          const newPriority = (total - i) * 10;   // 50, 40, 30, …
          const input = row.querySelector("input.priority-hidden");
          if (input) input.value = newPriority;

          const badge = row.querySelector(".priority-badge");
          if (badge) badge.textContent = `Priority: ${newPriority}`;
      });
  }

  /** @override */
  async _updateObject(_event, formData) {
    for (const def of HOMEBREW_REGISTRY) {
      if (!def.implemented) continue;

      await game.settings.set("projectmoonttrpg", def.id, formData[`homebrew.${def.id}.enabled`] === true || formData[`homebrew.${def.id}.enabled`] === "true");
    }

    const newConfigs = {};

    for (const pack of game.packs) {
      const key = pack.collection;
      newConfigs[key] = {
        hidden: formData[`pack.${key}.hidden`] === true || formData[`pack.${key}.hidden`] === "true",
        active: formData[`pack.${key}.active`] === true || formData[`pack.${key}.active`] === "true",
        priority: Number(formData[`pack.${key}.priority`] ?? 0),
      };
    }

    for (const def of HOMEBREW_REGISTRY) {
      const dragPriority = formData[`homebrew.${def.id}.priority`];
      if (dragPriority == null) continue;

      const prio = Number(dragPriority);
      const enabled = formData[`homebrew.${def.id}.enabled`] === true || formData[`homebrew.${def.id}.enabled`] === "true";

      for (const packKey of def.compendiumPacks) {
        if (!newConfigs[packKey]) continue;
        newConfigs[packKey].priority = prio;
        newConfigs[packKey].hidden = !enabled;
        newConfigs[packKey].active = enabled;
      }
    }

    await CompendiumFlags.saveAll(newConfigs);
  }
}