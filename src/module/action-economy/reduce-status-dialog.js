import { ReactiveDialog } from "../apps/reactive-dialog.js";
import { describeReduceStatusOptions } from "./reduce-status-data.js";

/**
 * Reduce Status allocation for one target. The total and the mode update as you
 * fill the form, and the lists re-render if the target's statuses change.
 */
class ReduceStatusDialog extends ReactiveDialog {
  static DEFAULT_OPTIONS = {
    id: "pmttrpg-reduce-status-{id}",
    classes: ["pm-reduce-status"],
    window: {
      title: "PMTTRPG.ActionMenu.ReduceStatus",
      icon: "fa-solid fa-hand-holding-medical",
    },
  };

  static PARTS = {
    body: {
      template: "systems/projectmoonttrpg/templates/apps/reduce-status.hbs",
      root: true,
    },
  };

  #target;

  #viewOptions;

  #title;

  constructor({ target, viewOptions = {}, title = null, ...options } = {}) {
    super(options);
    this.#target = target;
    this.#viewOptions = viewOptions;
    this.#title = title;
  }

  /** @override */
  get title() {
    return this.#title ?? super.title;
  }

  /** @override */
  get watchedDocuments() {
    return [...new Set([this.#target, this.#viewOptions.budgetActor])];
  }

  /** @override */
  _prepareView(selection) {
    return buildReduceStatusView(this.#target, selection, this.#viewOptions);
  }
}

/** Resolves with `{ mode, pauseItemId, amounts }`, or null if the dialog gets cancelled, closed or fails to render. */
export function promptReduceStatusAllocation(target, { budgetActor = null, consume = true, asReaction = false, title = null } = {}) {
  return ReduceStatusDialog.wait({ target, viewOptions: { budgetActor, consume, asReaction }, title });
}

/**
 * View model for the Reduce Status dialog. Going over the budget only shows a
 * warning here and the plan gets refused once the dialog closes.
 */

const KEY = "PMTTRPG.ActionMenu.ReduceStatus";

function standardAmountField(itemId) {
  return `std-${itemId}`;
}

function amountOf(raw) {
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function costSummaryKey(consume, asReaction) {
  if (asReaction) {
    return consume ? "PMTTRPG.ActionMenu.CostSummary.Reaction" : "PMTTRPG.ActionMenu.CostSummary.ReactionNotConsumed";
  }
  return consume ? "PMTTRPG.ActionMenu.CostSummary.Action" : "PMTTRPG.ActionMenu.CostSummary.ActionNotConsumed";
}

function summaryFor(mode, allocated, over, consume, asReaction) {
  if (mode === "standard" && allocated < 1) return { key: `${KEY}NoneAllocated`, tone: "reason" };
  if (mode === "standard" && over) return { key: `${KEY}OverBudget`, tone: "reason" };
  return { key: costSummaryKey(consume, asReaction), tone: "cost" };
}

/**
 * `selection` is the form data (`mode`, `pauseItemId` and a `std-<itemId>` amount
 * per Status Effect). `asReaction` prices the Action as a Reaction.
 */
function buildReduceStatusView(targetActor, selection = {}, { budgetActor = null, consume = true, asReaction = false } = {}) {
  const options = describeReduceStatusOptions(targetActor, { budgetActor });
  const modes = [options.canStandard && "standard", options.canPause && "pause"].filter(Boolean);
  const mode = modes.includes(selection.mode) ? selection.mode : (modes[0] ?? "standard");

  const standardRows = options.standard.map((entry) => {
    const field = standardAmountField(entry.itemId);
    const raw = selection[field];
    return {
      itemId: entry.itemId,
      name: entry.name,
      img: entry.img,
      stacks: entry.stacks,
      field,
      value: raw ?? (Object.hasOwn(selection, field) ? "" : 0),
      amount: amountOf(raw),
    };
  });
  const allocated = standardRows.reduce((sum, row) => sum + row.amount, 0);
  const over = allocated > options.standardBudget;

  const pauseItemId = options.pause.some((entry) => entry.itemId === selection.pauseItemId)
    ? selection.pauseItemId
    : (options.pause[0]?.itemId ?? null);
  const pauseRows = options.pause.map((entry) => ({
    itemId: entry.itemId,
    name: entry.name,
    img: entry.img,
    stacks: entry.stacks,
    after: entry.stacks - Math.min(options.pauseBudget, entry.stacks),
    checked: entry.itemId === pauseItemId,
  }));

  const submit = mode === "pause"
    ? { mode, pauseItemId, amounts: {} }
    : { mode, pauseItemId: null, amounts: Object.fromEntries(standardRows.map((row) => [row.itemId, row.amount])) };

  return {
    selection: { ...selection, mode, pauseItemId },
    submit,
    mode,
    showModes: modes.length > 1,
    modes: modes.map((id) => ({
      id,
      labelKey: id === "standard" ? `${KEY}Standard` : `${KEY}Pause`,
      checked: id === mode,
    })),
    standard: options.canStandard
      ? { active: mode === "standard", budget: options.standardBudget, allocated, over, rows: standardRows }
      : null,
    pause: options.canPause
      ? { active: mode === "pause", budget: options.pauseBudget, rows: pauseRows }
      : null,
    summary: summaryFor(mode, allocated, over, consume, asReaction),
    confirm: { labelKey: "PMTTRPG.ActionMenu.Confirm", disabled: false },
  };
}
