import { pmWindowClasses } from "./dialog-classes.js";

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

export function itemPickerRows(items, tag, checkedId = items[0]?.id) {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    img: item.img,
    tag: item.system?.equipped ? tag : "",
    checked: item.id === checkedId,
  }));
}

/** Shows one radio list and resolves the checked row's id (or null if they cancel or close it). */
export async function pickRadioRow({ title, hint, inputName, rows }) {
  const content = await foundry.applications.handlebars.renderTemplate(RADIO_PICKER_TEMPLATE, { hint, inputName, rows });
  return waitForWindowChoice({
    window: { title },
    content,
    buttons: [
      cancelButton(),
      confirmButton((_event, _button, dialog) => dialog.element?.querySelector(`[name='${inputName}']:checked`)?.value?.trim() || null),
    ],
    rejectClose: false,
  });
}
