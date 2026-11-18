import { pmWindowClasses } from "../apps/dialog-classes.js";
import { ACTION_KINDS } from "./kinds.js";
import { editReactionCredit, grantReactionCredits, reactionCreditRows } from "./reaction-credits.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const KIND_KEYS = {
  universal: "PMTTRPG.ReactionCredit.Universal",
  block: "PMTTRPG.ReactionCredit.Block",
  evade: "PMTTRPG.ReactionCredit.Evade",
  counter: "PMTTRPG.ReactionCredit.Counter",
  opportunityAttack: "PMTTRPG.ReactionCredit.OpportunityAttack",
};

const FEEDBACK_KEYS = {
  spend: "PMTTRPG.ReactionCredit.FeedbackSpent",
  restore: "PMTTRPG.ReactionCredit.FeedbackRestored",
  remove: "PMTTRPG.ReactionCredit.FeedbackRemoved",
};

async function postCreditFeedback(combatant, op, detail) {
  try {
    const { combatantFeedbackEvent, postActionFeedbackEvent } = await import("./action-feedback.js");
    await postActionFeedbackEvent(combatantFeedbackEvent(combatant, {
      id: foundry.utils.randomID(),
      kind: ACTION_KINDS.MANUAL,
      metadata: { feedbackLabelKey: FEEDBACK_KEYS[op], feedbackDetail: detail },
    }));
  } catch (error) {
    console.warn("[PMTTRPG] Reaction credit feedback failed", error);
  }
}

/** Spend, restore, remove or add Reaction credits by hand. */
class ReactionCreditsDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: pmWindowClasses("pm-reaction-credits"),
    position: { width: 400 },
    window: {
      icon: "fa-solid fa-shield-halved",
      minimizable: false,
    },
    actions: {
      spend: this.#onEdit,
      restore: this.#onEdit,
      remove: this.#onEdit,
      add: this.#onAdd,
      done: this.#onDone,
    },
  };

  static PARTS = {
    body: { template: "systems/projectmoonttrpg/templates/apps/reaction-credits.hbs" },
  };

  #actor;

  #combatant;

  #onChange;

  #watched = [];

  constructor({ actor, combatant, onChange = null, ...options } = {}) {
    super({ id: `pmttrpg-reaction-credits-${combatant?.id ?? "none"}`, ...options });
    this.#actor = actor;
    this.#combatant = combatant;
    this.#onChange = onChange;
  }

  get combatant() {
    return this.#combatant;
  }

  /** @override */
  get title() {
    return game.i18n.format("PMTTRPG.ReactionCredit.Title", { name: this.#actor?.name ?? "" });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, {
      rows: reactionCreditRows(this.#actor, this.#combatant),
      pool: Math.max(0, Number(this.#actor?.system?.attributes?.reactions?.value) || 0),
      kinds: Object.entries(KIND_KEYS).map(([value, key]) => ({ value, label: game.i18n.localize(key) })),
    });
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    // Combatant changes re-render the Combat's apps
    this.#watched = [this.#actor, this.#combatant?.parent ?? this.#combatant?.combat].filter((doc) => doc?.apps);
    for (const doc of this.#watched) doc.apps[this.id] = this;
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    for (const doc of this.#watched) delete doc.apps[this.id];
    this.#watched = [];
  }

  async #changed() {
    await this.render();
    try {
      await this.#onChange?.();
    } catch (error) {
      console.warn("[PMTTRPG] Reaction credit refresh after an edit failed", error);
    }
  }

  /** @this {ReactionCreditsDialog} */
  static async #onEdit(_event, target) {
    const op = target.dataset.action;
    const creditId = target.closest("[data-credit-id]")?.dataset.creditId;
    if (!creditId) return;
    const row = reactionCreditRows(this.#actor, this.#combatant).find((entry) => entry.id === creditId);
    const result = await editReactionCredit(this.#combatant, creditId, op);
    if (!result?.ok) {
      ui.notifications.warn(game.i18n.localize("PMTTRPG.ReactionCredit.EditFailed"));
      return;
    }
    if (!result.unchanged) await postCreditFeedback(this.#combatant, op, row?.label ?? "");
    await this.#changed();
  }

  /** @this {ReactionCreditsDialog} */
  static async #onAdd() {
    const kind = this.element.querySelector("[name='kind']")?.value ?? "universal";
    const result = await grantReactionCredits(this.#actor, { kind, amount: 1, grantedBy: "manual" }, { combatant: this.#combatant });
    if (!result?.ok) {
      ui.notifications.warn(game.i18n.localize("PMTTRPG.ReactionCredit.EditFailed"));
      return;
    }
    await this.#changed();
  }

  /** @this {ReactionCreditsDialog} */
  static #onDone() {
    return this.close();
  }
}

export async function openReactionCreditsDialog(actor, combatant, { onChange = null } = {}) {
  for (const open of ReactionCreditsDialog.instances()) {
    if (open.combatant?.id === combatant?.id) {
      open.bringToFront();
      return open;
    }
  }
  const dialog = new ReactionCreditsDialog({ actor, combatant, onChange });
  await dialog.render({ force: true });
  return dialog;
}
