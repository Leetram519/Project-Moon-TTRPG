import { pmWindowClasses } from "./dialog-classes.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { FormDataExtended } = foundry.applications.ux;

/**
 * A dialog that keeps the user's choices as state and rebuilds the
 * whole view from that state on every render. Use it when what the dialog shows
 * depends on the choices so far or on documents that can change while it's open.
 *
 * Subclasses set `PARTS` and implement `_prepareView(selection)`, which returns
 * the template context plus the `selection` to keep and the `submit` value we
 * resolve with. `submit` is null while nothing can be submitted.
 */
export class ReactiveDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static FOOTER = "systems/projectmoonttrpg/templates/apps/parts/reactive-dialog-footer.hbs";

  static DEFAULT_OPTIONS = {
    classes: pmWindowClasses(),
    tag: "form",
    position: { width: 420 },
    window: {
      minimizable: false,
    },
    form: {
      handler: this.#onSubmit,
      closeOnSubmit: false,
    },
    actions: {
      cancel: this.#onCancel,
    },
  };

  #selection;

  #resolve;

  #watched = [];

  constructor({ selection = {}, resolve = null, ...options } = {}) {
    super(options);
    this.#selection = { ...selection };
    this.#resolve = resolve;
  }

  /** Opens the dialog and resolves with the view's `submit`, or null if it gets cancelled or closed. */
  static wait(options = {}) {
    return new Promise((resolve) => {
      const dialog = new this({ ...options, resolve });
      dialog.render({ force: true }).catch((error) => {
        console.error(`[PMTTRPG] ${this.name} failed to render`, error);
        resolve(null);
      });
    });
  }

  /** Changes to these documents will re-render the dialog while it's open. */
  get watchedDocuments() {
    return [];
  }

  /**
   * @abstract
   * @param {object} selection  The choices so far, possibly stale.
   * @returns {{ selection: object, submit: any }} and the template context.
   */
  _prepareView(_selection) {
    throw new Error(`${this.constructor.name} must implement _prepareView`);
  }

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    for (const part of Object.values(parts)) part.templates.push(ReactiveDialog.FOOTER);
    return parts;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const view = this._prepareView(this.#selection);
    this.#selection = view.selection ?? this.#selection;
    return Object.assign(context, view);
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.#watched = this.watchedDocuments.filter((doc) => doc?.apps);
    for (const doc of this.#watched) doc.apps[this.id] = this;
  }

  /** @override */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    this.#readForm(new FormDataExtended(this.form));
    this.render();
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    for (const doc of this.#watched) delete doc.apps[this.id];
    this.#watched = [];
    this.#settle(null);
  }

  // a radio group with nothing checked comes back undefined, so we skip it
  #readForm(formData) {
    const next = { ...this.#selection };
    for (const [name, value] of Object.entries(formData.object)) {
      if (value !== undefined) next[name] = value;
    }
    this.#selection = next;
  }

  #settle(result) {
    const resolve = this.#resolve;
    this.#resolve = null;
    resolve?.(result);
  }

  /**
   * Rebuilds the view instead of trusting the last render, since a document can
   * change in between and a field set from code fires no change event. We settle
   * before closing so the caller doesn't wait on the close animation.
   * @this {ReactiveDialog}
   */
  static async #onSubmit(_event, _form, formData) {
    this.#readForm(formData);
    const { submit } = this._prepareView(this.#selection);
    if (submit == null) return;
    this.#settle(submit);
    await this.close();
  }

  /** Submits with extra choices on top of the form, like the Drop button in Change Weapons. */
  async _submitWith(patch = {}) {
    this.#readForm(new FormDataExtended(this.form));
    const { submit } = this._prepareView({ ...this.#selection, ...patch });
    if (submit == null) return;
    this.#settle(submit);
    await this.close();
  }

  /** @this {ReactiveDialog} */
  static #onCancel() {
    return this.close();
  }
}
