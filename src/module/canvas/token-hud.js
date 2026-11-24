/**
 * Adds the Actions and Fall buttons to the Token HUD after every render (core replaces
 * the HUD root each time). What we read at render only decides if the Fall button shows
 * and how it looks, since the click checks the token again anyway.
 */

import { FALL_REASON, fallAvailability, startFallDescent } from "../falling/fall-descent.js";

const ACTION = "pmttrpgFall";
const ACTION_MENU = "pmttrpgActionMenu";

const REFUSAL_KEYS = {
  "support-changed": "PMTTRPG.Falling.Unavailable.Support",
  unavailable: "PMTTRPG.Falling.Unavailable.Generic",
  failed: "PMTTRPG.Falling.Unavailable.Generic",
};

function refusalKey(result) {
  const reason = result?.reason;
  if (typeof reason === "string" && reason.startsWith("PMTTRPG.")) return reason;
  if (reason === "support-changed" && result?.stopReason === "transition") return FALL_REASON.TRANSITION;
  return REFUSAL_KEYS[reason] ?? "PMTTRPG.Falling.Unavailable.Generic";
}

function warnFallRefused(result) {
  if (result?.notified === true) return;
  ui.notifications.warn(game.i18n.localize(refusalKey(result)));
}

async function onFallClick(event, target) {
  event.preventDefault();
  const doc = this.document;
  if (!doc) return;
  target.setAttribute("aria-busy", "true");
  try {
    const result = await startFallDescent(doc, game.user);
    if (result?.ok !== true) warnFallRefused(result);
  } catch (error) {
    console.warn("[PMTTRPG] Token HUD fall click failed", error);
    warnFallRefused({ reason: "failed" });
  } finally {
    target.removeAttribute("aria-busy");
    if (this.document === doc && this.rendered) {
      try {
        await this.render();
      } catch (error) {
        console.warn("[PMTTRPG] Token HUD refresh failed", error);
      }
    }
  }
}

function proneIconSrc() {
  const prone = CONFIG.statusEffects.find((effect) => effect.id === "prone");
  return prone?.img || "icons/svg/falling.svg";
}

function fallButton(availability) {
  const button = document.createElement("button");
  const enabled = availability.enabled === true;
  const label = game.i18n.localize("PMTTRPG.Falling.Action");
  const tooltip = enabled ? label : game.i18n.localize(availability.reasonKey ?? FALL_REASON.BUSY);
  button.type = "button";
  button.className = enabled ? "control-icon pmttrpg-fall" : "control-icon disabled pmttrpg-fall";
  button.dataset.action = ACTION;
  button.setAttribute("data-tooltip", "");
  button.setAttribute("aria-label", tooltip);
  if (!enabled) button.setAttribute("aria-disabled", "true");
  const icon = document.createElement("img");
  icon.setAttribute("src", proneIconSrc());
  icon.setAttribute("alt", "");
  button.append(icon);
  return button;
}

async function onActionMenuClick(event) {
  event.preventDefault();
  const doc = this.document;
  if (!doc?.actor?.isOwner) return;
  const { openActionMenu } = await import("../action-economy/action-menu.js");
  await openActionMenu(doc.actor, { token: doc });
}

function actionMenuButton() {
  const button = document.createElement("button");
  const label = game.i18n.localize("PMTTRPG.ActionMenu.Open");
  button.type = "button";
  button.className = "control-icon pmttrpg-action-menu";
  button.dataset.action = ACTION_MENU;
  button.setAttribute("data-tooltip", "");
  button.setAttribute("aria-label", label);
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-sword";
  icon.setAttribute("inert", "");
  button.append(icon);
  return button;
}

export function registerTokenHUDPMTTRPG() {
  const Current = CONFIG.Token.hudClass;
  if (Current.name === "TokenHUDPMTTRPG") return Current;

  class TokenHUDPMTTRPG extends Current {
    static DEFAULT_OPTIONS = {
      actions: {
        [ACTION]: onFallClick,
        [ACTION_MENU]: onActionMenuClick,
      },
    };

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      try {
        context.pmttrpgFall = fallAvailability(this.document, game.user, { at: "render" });
      } catch (error) {
        console.warn("[PMTTRPG] Token HUD fall availability check failed", error);
        context.pmttrpgFall = { visible: false, enabled: false, reasonKey: null };
      }
      return context;
    }

    async _onRender(context, options) {
      await super._onRender(context, options);
      const column = this.element.querySelector(".col.left");
      const elevation = column?.querySelector(".attribute.elevation");
      if (!elevation) return;
      for (const existing of column.querySelectorAll(".pmttrpg-action-menu")) existing.remove();
      for (const existing of column.querySelectorAll(".pmttrpg-fall")) existing.remove();
      let anchor = elevation;
      if (this.document?.actor?.isOwner) {
        anchor = actionMenuButton();
        elevation.insertAdjacentElement("afterend", anchor);
      }
      const availability = context.pmttrpgFall;
      if (!availability.visible) return;
      const button = fallButton(availability);
      anchor.insertAdjacentElement("afterend", button);
    }
  }

  CONFIG.Token.hudClass = TokenHUDPMTTRPG;
  return TokenHUDPMTTRPG;
}
