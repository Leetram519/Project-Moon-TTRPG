import { groupStatuses, onStatusItemChange } from "../status/group-statuses.js";
import { actorTokenPlaceables } from "../acting-user.js";
import { applyStatusFromDrop } from "./status-drop-dialog.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { TextEditor } = foundry.applications.ux;

export class StatusTray extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pmttrpg-status-tray",
    classes: ["pmttrpg-status-tray"],
    tag: "aside",
    window: { frame: false, positioned: false },
    actions: {
      adjustStatus: {
        handler: this.#onAdjustStatus,
        buttons: [0, 2],
      },
    },
  };

  static PARTS = {
    main: {
      template: "systems/projectmoonttrpg/templates/apps/status-tray.hbs",
    },
  };

  refresh = foundry.utils.debounce(() => this.render({ force: true }), 80);

  get actor() {
    const token = canvas.tokens?.controlled[0];
    if (token) return token.actor ?? null;
    return game.user.isGM ? null : (game.user.character ?? null);
  }

  async _prepareContext(_options) {
    const actor = this.actor;
    const enabled = game.settings.get("projectmoonttrpg", "showStatusTray");
    if (!enabled || !actor?.testUserPermission(game.user, "OBSERVER")) {
      return { statuses: [] };
    }
    return { statuses: await this.#groupStatuses(actor) };
  }

  async _onRender(context, _options) {
    await super._onRender(context, _options);
    const el = this.element;
    if (!el) return;
    document.getElementById("ui-right-column-1")?.appendChild(el);
    el.hidden = context.statuses.length === 0;

    if (!el.dataset.pmContextBound) {
      el.dataset.pmContextBound = "true";
      el.addEventListener("contextmenu", (event) => event.preventDefault());
    }

    for (const itemEl of el.querySelectorAll("[data-status-name]")) {
      const status = context.statuses.find((s) =>
        (itemEl.dataset.itemId && s.itemId === itemEl.dataset.itemId)
        || (!itemEl.dataset.itemId && s.name === itemEl.dataset.statusName && !s.pending)
      );
      if (status?.tooltipHtml) itemEl.dataset.tooltip = status.tooltipHtml;
    }
  }

  async close(options = {}) {
    if (options.closeKey) return this;
    return super.close(options);
  }

  async #groupStatuses(actor) {
    const statuses = groupStatuses(actor, { sort: "applied" });
    for (const status of statuses) {
      const body = status.description
        ? await TextEditor.enrichHTML(status.description, {
          async: true,
          secrets: false,
          relativeTo: actor,
        })
        : `<p class="notes">${game.i18n.localize("PMTTRPG.StatusTrayNoDescription")}</p>`;
      const countHtml = status.showCount
        ? `<span>×${status.count}</span>`
        : "";
      const pendingNote = status.pending
        ? `<p class="pmttrpg-status-tip__pending">${game.i18n.localize(
          status.arrival === "turn"
            ? "PMTTRPG.StatusTrayPendingTurn"
            : "PMTTRPG.StatusTrayPendingRound"
        )}</p>`
        : "";
      status.tooltipHtml = `
        <section class="pmttrpg-status-tip__inner">
          <header><strong>${foundry.utils.escapeHTML(status.name)}</strong>${countHtml}</header>
          ${pendingNote}
          <div class="pmttrpg-status-tip__body">${body}</div>
          <footer class="pmttrpg-status-tip__controls">${game.i18n.localize("PMTTRPG.StatusTrayControls")}</footer>
        </section>`;
    }
    return statuses;
  }

  static async #onAdjustStatus(event, el) {
    const actor = this.actor;
    const name = el.dataset.statusName;
    if (!actor?.isOwner || !name) return;

    const pending = el.dataset.pending === "true";
    const arrival = el.dataset.arrival || "round";

    if (pending) {
      if (event.button === 2 && event.altKey) {
        const stacks = actor.getPendingStatusStacks(name, arrival);
        if (stacks > 0) {
          const item = actor.items.find(
            i => i.type === "status" && i.name === name && i.system?.pending
              && String(i.system?.arrival || "round") === arrival
          );
          if (item) {
            await item.delete({ PMTTRPG: { statusTextDelta: -stacks } });
          }
        }
        return;
      }
      const amount = (event.ctrlKey || event.metaKey) ? 5 : 1;
      if (event.button === 2) {
        const item = actor.items.find(
          i => i.id === el.dataset.itemId && i.system?.pending
        );
        if (!item) return;
        const current = Math.max(0, Number(item.system?.stacks ?? 0) || 0);
        const next = Math.max(0, current - amount);
        if (next <= 0) {
          await item.delete({ PMTTRPG: { statusTextDelta: -current } });
        } else {
          await item.update({ "system.stacks": next }, { PMTTRPG: { silentStatusText: true } });
        }
      } else {
        await actor.addPendingStatusStacks(name, amount, { arrival, silent: true });
      }
      return;
    }

    if (event.button === 2 && event.altKey) {
      await actor.setStatusStacks(name, 0);
      return;
    }

    const amount = (event.ctrlKey || event.metaKey) ? 5 : 1;
    if (event.button === 2) {
      const current = actor.getStatusStacks(name);
      await actor.removeStatusStacks(name, amount, { silent: current > amount });
    } else {
      await actor.addStatusStacks(name, amount, null, { originUuid: actor.uuid, silent: true });
    }
  }
}

export function registerStatusTraySettings() {
  game.settings.register("projectmoonttrpg", "showStatusTray", {
    name: "PMTTRPG.Settings.showStatusTray.name",
    hint: "PMTTRPG.Settings.showStatusTray.hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => game.projectmoonttrpg?.statusTray?.refresh(),
  });
}

function peekItemType(uuid) {
  const synced = fromUuidSync(uuid);
  if (synced?.type) return synced.type;
  const parsed = foundry.utils.parseUuid(uuid);
  return parsed?.collection?.index?.get(parsed.id)?.type ?? null;
}

function tokenAtPoint(x, y) {
  return [...canvas.tokens.quadtree.getObjects(new PIXI.Rectangle(x, y))]
    .filter((t) => t.visible)
    .sort((a, b) => (b.document.elevation - a.document.elevation)
      || (b.document.sort - a.document.sort))[0] ?? null;
}

function showStatusScrollingText(actor, statusName, added, amount = 1) {
  if (!canvas.ready || !actor) return;
  const tokens = actorTokenPlaceables(actor);
  if (!tokens.length) return;

  const n = Math.max(1, Math.trunc(Number(amount) || 1));
  const sign = added ? "+" : "-";
  const content = n === 1 ? `${sign}${statusName}` : `${sign}${n} ${statusName}`;
  for (const token of tokens) {
    if (!token?.center || token.isVisible === false) continue;
    canvas.interface.createScrollingText(token.center, content, {
      anchor: added ? CONST.TEXT_ANCHOR_POINTS.TOP : CONST.TEXT_ANCHOR_POINTS.BOTTOM,
      direction: added ? CONST.TEXT_ANCHOR_POINTS.TOP : CONST.TEXT_ANCHOR_POINTS.BOTTOM,
      fontSize: 28,
      fill: added ? 0xc79a4b : 0xcc6666,
      stroke: 0x000000,
      strokeThickness: 4,
      jitter: 0.25,
      duration: 2000,
    });
  }
}

async function applyStatusToTokenDrop(data, event) {
  const item = await fromUuid(data.uuid);
  if (!item || item.type !== "status") return;

  const actor = tokenAtPoint(data.x, data.y)?.actor;
  if (!actor) return;
  if (!actor.isOwner) {
    ui.notifications.warn(game.i18n.localize("PMTTRPG.StatusDropNoPermission"));
    return;
  }

  await applyStatusFromDrop(actor, item, event);
}

function registerStatusCanvasDrop() {
  Hooks.on("dropCanvasData", (_canvas, data, event) => {
    if (data?.type !== "Item" || !data.uuid) return;
    if (peekItemType(data.uuid) !== "status") return;
    void applyStatusToTokenDrop(data, event);
    return false;
  });
}

const pendingStatusText = new Map();
const STATUS_TEXT_MS = 150;

function statusTextSilent(options) {
  return !!options?.PMTTRPG?.silentStatusText;
}

function statusTextDelta(options, fallback = 0) {
  if (statusTextSilent(options)) return 0;
  const delta = Number(options?.PMTTRPG?.statusTextDelta);
  if (Number.isFinite(delta)) return delta;
  return fallback;
}

function flushStatusDeltaText(key) {
  const entry = pendingStatusText.get(key);
  if (!entry) return;
  pendingStatusText.delete(key);
  if (!entry.amount) return;
  showStatusScrollingText(entry.actor, entry.statusName, entry.amount > 0, Math.abs(entry.amount));
}

function queueStatusDeltaText(actor, statusName, delta) {
  const amount = Math.trunc(Number(delta) || 0);
  if (!actor || !statusName || !amount) return;
  const key = `${actor.uuid}:${statusName}:${amount > 0 ? "+" : "-"}`;
  const existing = pendingStatusText.get(key);
  if (existing) {
    existing.amount += amount;
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => flushStatusDeltaText(key), STATUS_TEXT_MS);
    return;
  }
  pendingStatusText.set(key, {
    actor,
    statusName,
    amount,
    timer: setTimeout(() => flushStatusDeltaText(key), STATUS_TEXT_MS),
  });
}

function registerStatusScrollingText() {
  Hooks.on("createItem", (item, options) => {
    if (item.type !== "status") return;
    const actor = item.parent ?? item.actor;
    if (typeof actor?.getActiveTokens !== "function") return;
    const amount = statusTextDelta(options, Number(item.system?.stacks ?? 1));
    if (amount > 0) queueStatusDeltaText(actor, item.name, amount);
  });
  Hooks.on("updateItem", (item, _changed, options) => {
    if (item.type !== "status") return;
    const actor = item.parent ?? item.actor;
    if (typeof actor?.getActiveTokens !== "function") return;
    const amount = statusTextDelta(options, 0);
    if (amount) queueStatusDeltaText(actor, item.name, amount);
  });
  Hooks.on("deleteItem", (item, options) => {
    if (item.type !== "status") return;
    if (statusTextSilent(options)) return;
    const actor = item.parent ?? item.actor;
    if (typeof actor?.getActiveTokens !== "function") return;
    const amount = statusTextDelta(options, NaN);
    if (Number.isFinite(amount) && amount) {
      queueStatusDeltaText(actor, item.name, amount);
      return;
    }
    if (!actor.getStatusStacks || actor.getStatusStacks(item.name) !== 0) return;
    const stacks = Math.max(1, Math.trunc(Number(item.system?.stacks ?? 1) || 1));
    queueStatusDeltaText(actor, item.name, -stacks);
  });
}

export function registerStatusTray() {
  const tray = new StatusTray();
  game.projectmoonttrpg.statusTray = tray;

  const refresh = () => tray.refresh();
  Hooks.on("canvasReady", refresh);
  Hooks.on("controlToken", refresh);
  onStatusItemChange(refresh);
  Hooks.on("updateUser", (user, changes) => {
    if (user.id === game.user.id && ("character" in changes)) refresh();
  });

  registerStatusCanvasDrop();
  registerStatusScrollingText();
  tray.render({ force: true });
}
