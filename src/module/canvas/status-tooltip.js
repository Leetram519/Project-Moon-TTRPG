const TEMPLATE = "systems/projectmoonttrpg/templates/hud/status-tooltip.hbs";

let el = null;
let requestId = 0;

export function preloadStatusTooltip() {
  return foundry.applications.handlebars.loadTemplates([TEMPLATE]);
}

function getElement() {
  if (el?.isConnected) return el;
  el = document.createElement("aside");
  el.className = "pmttrpg-status-tooltip";
  document.body.appendChild(el);
  return el;
}

/**
 * @param {object} status  Grouped status (name, img, count, description, showCount, pending, showHoverDetails)
 * @param {{left:number, top:number, width:number, height:number}} rect  Client-space rect of the badge
 */
export async function showStatusTooltip(status, rect) {
  if(!game.settings.get("projectmoonttrpg", "showStatusInfoBoxWorld") || !game.settings.get("projectmoonttrpg", "showStatusInfoBoxClient") || !status.showHoverDetails) return;

  const id = ++requestId;

  const TextEditor = foundry.applications.ux.TextEditor.implementation;
  const description = await TextEditor.enrichHTML(status.description ?? "", { async: true });
  const html = await foundry.applications.handlebars.renderTemplate(TEMPLATE, {
    name: status.name,
    img: status.img || "icons/svg/mystery-man.svg",
    count: status.count,
    showCount: status.showCount !== false,
    pending: !!status.pending,
    description,
  });

  if (id !== requestId) return; // hover moved on while rendering

  const tip = getElement();
  tip.innerHTML = html;
  tip.classList.toggle("pending", !!status.pending);
  tip.style.visibility = "hidden";
  tip.classList.add("visible");

  const { width, height } = tip.getBoundingClientRect();
  const gap = 8;
  let x = rect.left + rect.width / 2 - width / 2;
  let y = rect.top + rect.height + gap;
  if (y + height > window.innerHeight - 8) y = rect.top - height - gap; // flip above
  x = Math.clamp(x, 8, window.innerWidth - width - 8);
  y = Math.max(8, y);

  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
  tip.style.visibility = "";
}

export function hideStatusTooltip() {
  requestId++;
  el?.classList.remove("visible");
}