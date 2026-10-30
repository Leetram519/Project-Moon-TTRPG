import { ActorPMTTRPG } from "../actor/actor.js";

export function addEnrichers() {
    addStatusEnricher();
}

export function addStatusEnricher() {
  CONFIG.TextEditor.enrichers.push({
    id: `pmttrpg.status`,
    pattern: /\[\[\/status\s+([^\]]+?)\]\]/gi,

    enricher: async (match) => {
      const requestedName = match[1].trim();
      const status = await ActorPMTTRPG._resolveStatusTemplate(requestedName);

      const element = document.createElement("span");
      element.classList.add("status-display");

      if (!status) {
        element.classList.add("status-display--missing");
        element.textContent = requestedName;
        element.title = "Status not found";
        return element;
      }

      const img = document.createElement("img");
      img.src = status.img;
      img.alt = "";
      img.classList.add("status-display__icon");

      const name = document.createElement("span");
      name.classList.add("status-display__name");
      name.textContent = status.name;

      /*const tooltipHTML = await foundry.applications.handlebars.renderTemplate(
        "systems/projectmoonttrpg/templates/hud/status-tooltip.hbs",
        {
            img: status.img,
            name: status.name,
            description: status.description,
            showCount: false,
            count: 0
        }
      );

      const tooltip = document.createElement("div");
      tooltip.classList.add("status-display__tooltip");
      tooltip.innerHTML = tooltipHTML;*/

      element.append(img, name);
      element.dataset.statusId = status.uuid;

      return element;
    }
  });
}