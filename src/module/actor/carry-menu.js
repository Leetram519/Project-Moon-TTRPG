import { DROPPED_ITEM_PATH, handOccupancy, isDroppedItem } from "../action-economy/formulas.js";
import { flagKeyDeletion } from "../action-economy/combat-flags.js";

const MENU_CLASS = "pmttrpg-carry-menu";

const STATES = {
  held: { icon: "fa-solid fa-hand-back-fist" },
  worn: { icon: "fa-solid fa-shirt", labelKey: "PMTTRPG.CarryState.Worn" },
  stowed: { icon: "fa-solid fa-box", labelKey: "PMTTRPG.CarryState.Stowed" },
  dropped: { icon: "fa-solid fa-grip-lines", labelKey: "PMTTRPG.CarryState.Dropped" },
};

function isWornItem(item) {
  return item.type === "outfit" || handOccupancy(item) === 0;
}

function carryStateOf(item) {
  const source = item._source.system;
  const on = Boolean(source.equipped || source.held || item.system.equipped);
  if (on) return isWornItem(item) ? "worn" : "held";
  return isDroppedItem(item) ? "dropped" : "stowed";
}

function carryStateLabelKey(item, state = carryStateOf(item)) {
  if (state !== "held") return STATES[state].labelKey;
  return handOccupancy(item) >= 2 ? "PMTTRPG.CarryState.Held2H" : "PMTTRPG.CarryState.Held1H";
}

export function carryOptions(item) {
  const current = carryStateOf(item);
  const states = isWornItem(item) ? ["worn", "stowed"] : ["held", "stowed"];
  if (item.type !== "outfit") states.push("dropped");
  return states.map((state) => ({
    state,
    icon: STATES[state].icon,
    labelKey: carryStateLabelKey(item, state),
    selected: state === current,
  }));
}

export function carryUpdate(item, state) {
  const update = { "system.equipped": state === "held" || state === "worn" };
  if (state === "dropped") update[DROPPED_ITEM_PATH] = true;
  else if (isDroppedItem(item)) update[DROPPED_ITEM_PATH] = false;
  if (item.type === "tool") Object.assign(update, flagKeyDeletion("system.held"));
  return update;
}

function optionButton(option) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `${MENU_CLASS}__option`;
  button.dataset.state = option.state;
  button.setAttribute("role", "menuitemradio");
  button.setAttribute("aria-checked", String(option.selected));
  const icon = document.createElement("i");
  icon.className = option.icon;
  icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.textContent = game.i18n.localize(option.labelKey);
  button.append(icon, label);
  return button;
}

function moveFocus(menu, step) {
  const buttons = [...menu.querySelectorAll("button")];
  const index = buttons.indexOf(document.activeElement);
  const next = index < 0
    ? (step > 0 ? 0 : buttons.length - 1)
    : (index + step + buttons.length) % buttons.length;
  buttons[next]?.focus();
}

export function openCarryMenu(anchor, item, onPick) {
  for (const open of document.querySelectorAll(`.locked-tooltip.${MENU_CLASS}`)) {
    const sameItem = open.dataset.itemUuid === item.uuid;
    game.tooltip.dismissLockedTooltip(open);
    if (sameItem) return null;
  }

  const menu = document.createElement("menu");
  menu.className = `${MENU_CLASS}__list`;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", game.i18n.format("PMTTRPG.CarryState.Menu", { name: item.name }));
  for (const option of carryOptions(item)) menu.append(optionButton(option));

  game.tooltip.activate(anchor, { html: menu, cssClass: MENU_CLASS, locked: true });
  const locked = menu.closest(".locked-tooltip");
  if (!locked) return null;
  locked.dataset.itemUuid = item.uuid;
  const close = () => game.tooltip.dismissLockedTooltip(locked);

  menu.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-state]");
    if (!button) return;
    close();
    if (button.getAttribute("aria-checked") === "true") return;
    await onPick(button.dataset.state);
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") moveFocus(menu, 1);
    else if (event.key === "ArrowUp") moveFocus(menu, -1);
    else if (event.key === "Escape") {
      close();
      if (anchor.isConnected) anchor.focus();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  });

  (menu.querySelector('[aria-checked="true"]') ?? menu.querySelector("button"))?.focus({ preventScroll: true });
  return locked;
}
