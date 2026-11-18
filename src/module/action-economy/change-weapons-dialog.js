import { ReactiveDialog } from "../apps/reactive-dialog.js";
import { localize } from "../shared-helpers.js";
import { HELD_HAND_CAPACITY, handOccupancy, isDroppedItem } from "./formulas.js";
import {
  changeWeaponsPool,
  evaluateChangeWeaponsPlan,
  freeOneHandChangeUsed,
  listChangeWeaponsItems,
  listHeldLoadout,
  occupiedHands,
} from "./change-weapons.js";
import { ECONOMY_TYPES } from "./kinds.js";

class ChangeWeaponsDialog extends ReactiveDialog {
  static DEFAULT_OPTIONS = {
    id: "pmttrpg-change-weapons-{id}",
    classes: ["pm-change-weapons"],
    window: {
      title: "PMTTRPG.ActionMenu.ChangeWeapons",
      icon: "fa-solid fa-right-left",
    },
    actions: {
      drop: this.#onDrop,
    },
  };

  static PARTS = {
    body: {
      template: "systems/projectmoonttrpg/templates/apps/change-weapons.hbs",
      root: true,
    },
  };

  #actor;

  #planOptions;

  constructor({ actor, planOptions = {}, ...options } = {}) {
    super(options);
    this.#actor = actor;
    this.#planOptions = planOptions;
  }

  /** @override */
  get title() {
    return game.i18n.format("PMTTRPG.ActionMenu.ChangeWeaponsTitle", { name: this.#actor?.name ?? "" });
  }

  /**
   * Works for unlinked tokens too (the ActorDelta forwards Item changes to the
   * synthetic actor), and Combatant changes re-render the Combat's apps.
   * @override
   */
  get watchedDocuments() {
    return [this.#actor, this.#planOptions.combat];
  }

  /** @override */
  _prepareView(selection) {
    const view = buildChangeWeaponsView(this.#actor, selection, this.#planOptions);
    view.summary.text = view.summary.parts
      .map(({ key, data }) => localize(key, data))
      .join(" ");
    return view;
  }

  static #onDrop() {
    return this._submitWith({ drop: true });
  }
}

/** Resolves with `{ op, sheatheId, drawId }`, or null if the dialog gets cancelled, closed or fails to render. */
export function promptChangeWeapons(actor, planOptions = {}) {
  return ChangeWeaponsDialog.wait({ actor, planOptions });
}

/**
 * View model for the Change Weapons dialog. The player picks something held,
 * something from the inventory or one of each and we work out the change from that.
 */

const KEY = "PMTTRPG.ActionMenu.ChangeWeapons";

const REASON_KEYS = {
  "not-active-turn": `${KEY}ReasonNotYourTurn`,
  "insufficient-actions": `${KEY}ReasonNoAction`,
  "insufficient-reactions": `${KEY}ReasonNoReaction`,
};

/**
 * The rows are checkboxes and clicking a pick again clears it. When two are
 * checked the new one is the one that isn't the last pick.
 */
function resolvePick(raw, previous, ids) {
  if (raw === undefined) return ids.includes(previous) ? previous : null;
  const checked = (Array.isArray(raw) ? raw : [raw]).filter((id) => ids.includes(id));
  if (checked.length <= 1) return checked[0] ?? null;
  return checked.find((id) => id !== previous) ?? checked[0];
}

function requestFor(sheatheId, drawId, dropping) {
  if (sheatheId && drawId) return { op: "swap", sheatheId, drawId };
  if (sheatheId) return { op: dropping ? "drop" : "paidSheathe", sheatheId };
  if (drawId) return { op: "paidDraw", drawId };
  return null;
}

function slotState(now, after) {
  if (now && after) return "held";
  if (now) return "freed";
  if (after) return "taken";
  return "free";
}

function itemRow(item, checked) {
  return {
    id: item.id,
    name: item.name,
    img: item.img,
    handsKey: handOccupancy(item) >= 2 ? `${KEY}TwoHanded` : `${KEY}OneHanded`,
    groundKey: isDroppedItem(item) ? `${KEY}OnGround` : null,
    checked,
  };
}

function actionPart(request, plan, names) {
  if (request.op === "swap") return { key: `${KEY}DoSwap`, data: { out: names.out, in: names.in } };
  if (request.op === "drop") return { key: `${KEY}DoDrop`, data: { out: names.out } };
  if (request.op === "paidSheathe") return { key: `${KEY}DoSheathe`, data: { out: names.out } };
  return { key: plan.pickUp ? `${KEY}DoPickUp` : `${KEY}DoDraw`, data: { in: names.in } };
}

function costPart(plan, options) {
  if (plan.cost > 0) {
    const word = plan.payWith === ECONOMY_TYPES.REACTION ? "Reaction" : "Action";
    return { key: `PMTTRPG.ActionMenu.CostSummary.${options.ignoreActionCost ? `${word}NotConsumed` : word}` };
  }
  if (plan.op === "drop") return { key: options.combatant ? `${KEY}CostDrop` : `${KEY}CostFree` };
  if (plan.usesFree && options.combatant) return { key: `${KEY}CostFreeChange` };
  return { key: `${KEY}CostFree` };
}

function confirmKey(request, plan) {
  if (!request) return `${KEY}Confirm`;
  if (request.op === "swap") return `${KEY}Swap`;
  if (request.op === "drop") return `${KEY}Drop`;
  if (request.op === "paidSheathe") return `${KEY}Sheathe`;
  return plan.pickUp ? `${KEY}PickUp` : `${KEY}Draw`;
}

function buildChangeWeaponsView(actor, selection = {}, options = {}) {
  const freeUsed = freeOneHandChangeUsed(options.combatant ?? null, options.combat ?? null);

  const held = listHeldLoadout(actor);
  const heldIds = held.map((item) => item.id);
  const stowed = listChangeWeaponsItems(actor).filter((item) => !heldIds.includes(item.id));
  const stowedIds = stowed.map((item) => item.id);

  const sheatheId = resolvePick(selection.held, selection.sheatheId ?? null, heldIds);
  const drawId = resolvePick(selection.stowed, selection.drawId ?? null, stowedIds);
  const canDrop = Boolean(sheatheId) && !drawId;
  const request = requestFor(sheatheId, drawId, canDrop && selection.drop === true);
  const plan = request ? evaluateChangeWeaponsPlan(actor, request, { ...options, freeUsed }) : null;

  const nameOf = (id) => [...held, ...stowed].find((item) => item.id === id)?.name ?? "";
  const names = { out: nameOf(sheatheId), in: nameOf(drawId) };

  const used = occupiedHands(held);
  const after = plan?.ok ? plan.finalHands : used;
  const capacity = HELD_HAND_CAPACITY;
  const slotCount = Math.max(capacity, used, after);

  let summary = { parts: [{ key: `${KEY}Pick` }], tone: null };
  if (request && !plan.ok) {
    summary = {
      parts: [actionPart(request, plan, names), { key: REASON_KEYS[plan.reason] ?? `${KEY}Stale` }],
      tone: "reason",
    };
  } else if (request) {
    const parts = [actionPart(request, plan, names), costPart(plan, options)];
    if (after > Math.max(capacity, used)) parts.push({ key: `${KEY}HandsOver`, data: { hands: after } });
    summary = { parts, tone: plan.cost > 0 ? "cost" : "free" };
  }

  return {
    selection: { sheatheId, drawId },
    submit: plan?.ok ? { op: plan.op, sheatheId: plan.sheatheId, drawId: plan.drawId } : null,
    hands: {
      used,
      after,
      capacity,
      changes: after !== used,
      usedOver: used > capacity,
      afterOver: after > capacity,
      slots: Array.from({ length: slotCount }, (_, i) => ({
        state: slotState(i < used, i < after),
        over: i >= capacity,
      })),
    },
    freeChange: options.combatant ? { used: freeUsed } : null,
    pool: changeWeaponsPool(actor, options),
    held: { rows: held.map((item) => itemRow(item, item.id === sheatheId)) },
    stowed: { rows: stowed.map((item) => itemRow(item, item.id === drawId)) },
    drop: {
      disabled: !canDrop,
      tooltipKey: canDrop ? `${KEY}DropHint` : `${KEY}DropPick`,
    },
    summary,
    confirm: { labelKey: confirmKey(request, plan ?? {}), disabled: !plan?.ok },
  };
}
