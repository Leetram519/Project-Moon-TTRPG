import { pmWindowClasses } from "./dialog-classes.js";
import { RESISTANCE_DAMAGE_TYPES } from "../easy-effects/resistances.js";

const NO_CHOICE = Symbol("pmttrpg.noChoice");
const WINDOW_WIDTH = 420;
const RADIO_PICKER_TEMPLATE = "systems/projectmoonttrpg/templates/dialog/radio-picker.hbs";

function unwrap(result) {
  return result === NO_CHOICE ? null : result;
}

function guardButton(button) {
  if (typeof button?.callback !== "function") return button;
  const callback = button.callback;
  return { ...button, callback: async (...args) => (await callback(...args)) ?? NO_CHOICE };
}

/**
 * Basically the same as `DialogV2.wait`, except a button callback that returns nothing will
 * resolve to null. Foundry resolves `callback() ?? action`, so otherwise a Cancel
 * callback returning null comes back as "cancel" and gets past the caller's null check.
 */
export async function waitForChoice(config = {}) {
  const wrapped = { ...config, buttons: (config.buttons ?? []).map(guardButton) };
  if (typeof config.submit === "function") {
    const submit = config.submit;
    wrapped.submit = (result, dialog) => submit(unwrap(result), dialog);
  }
  return unwrap(await foundry.applications.api.DialogV2.wait(wrapped)) ?? null;
}

export function cancelButton() {
  return { action: "cancel", label: game.i18n.localize("PMTTRPG.Dialog.cancel"), callback: () => null };
}

export function confirmButton(callback, { label = null, icon = "fa-solid fa-check" } = {}) {
  return {
    action: "confirm",
    label: label ?? game.i18n.localize("PMTTRPG.ActionMenu.Confirm"),
    icon,
    default: true,
    callback,
  };
}

/**
 * We move the default button (the one marked `default`, else the first) to the end
 * so it sits on the right. The others become `type="button"` so Enter would still press
 * the default one (implicit submission uses the form's first submit button).
 */
function themeButtonOrder(buttons) {
  const marked = buttons.findIndex((button) => button?.default);
  const index = marked >= 0 ? marked : 0;
  const primary = buttons[index];
  if (!primary) return [];
  const others = buttons.filter((_, i) => i !== index).map((button) => ({ type: "button", ...button }));
  return [...others, { ...primary, default: true }];
}

/** `waitForChoice` but in the pm-window theme. */
export async function waitForWindowChoice({ classes = [], position = {}, buttons = [], ...config } = {}) {
  return waitForChoice({
    ...config,
    classes: pmWindowClasses(...classes),
    position: { width: WINDOW_WIDTH, ...position },
    buttons: themeButtonOrder(buttons),
  });
}

// only Slash, Pierce and Blunt have an icon
function iconDamageType(item) {
  const type = item?.system?.damageType;
  return RESISTANCE_DAMAGE_TYPES.includes(type) ? type : "";
}

export async function itemPickerRows(items, tag, checkedId = items[0]?.id) {
  // not imported at the top (the EE parser ends up importing this file and has to load without Foundry)
  const { buildItemEffectsTooltip } = await import("../effects/effect-summary.js");
  return Promise.all(items.map(async (item) => ({
    id: item.id,
    name: item.name,
    img: item.img,
    tag: item.system?.equipped ? tag : "",
    checked: item.id === checkedId,
    damageType: iconDamageType(item),
    tooltip: await buildItemEffectsTooltip(item),
  })));
}

export async function itemPickerHost(item, meta = "") {
  const { buildItemEffectsTooltip } = await import("../effects/effect-summary.js");
  return {
    name: item.name,
    img: item.img,
    meta,
    damageType: iconDamageType(item),
    tooltip: await buildItemEffectsTooltip(item),
  };
}

/**
 * Shows one radio list and resolves the checked row's id (or null if they cancel or close it).
 * A None row can use "" as its id, and with a toggle ({ label, checked }) you get { id, checked } back instead.
 */
export async function pickRadioRow({ title, hint = "", inputName, rows, toggle = null, host = null }) {
  const content = await foundry.applications.handlebars.renderTemplate(RADIO_PICKER_TEMPLATE, { hint, inputName, rows, toggle, host });
  return waitForWindowChoice({
    window: { title },
    content,
    buttons: [
      cancelButton(),
      confirmButton((_event, _button, dialog) => {
        const id = dialog.element?.querySelector(`[name='${inputName}']:checked`)?.value ?? null;
        if (id === null || !toggle) return id;
        return { id, checked: !!dialog.element.querySelector("[name='toggle']")?.checked };
      }),
    ],
    rejectClose: false,
  });
}
