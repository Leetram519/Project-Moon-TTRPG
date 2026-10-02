/**
 * EffectAutocomplete — single-select, close-on-pick.
 *
 * Each effect object:
 * {
 *   id:          string,
 *   name:        string,
 *   icon:        string,          // must be a src link
 *   source:      string,
 *   epCost:      number | null,   // null is displayed as "not specified" and has a value of 0.
 *   tags: [{ name: string, icon?: string }] // icon is a "fas" icon
 * }
 *
 * Usage:
 *   const ac = new EffectAutocomplete(el, {
 *     effects: [...],
 *     onSelect: (effect) => { ... }   // called with the full effect object
 *   });
 */
export class EffectAutocomplete {
  constructor(container, options = {}) {
    this.container = container;
    this.effects = options.effects ?? [];
    this.onSelect = options.onSelect ?? (() => {});
    this.maxResults = options.maxResults ?? 12;

    this._query = '';
    this._activeIdx = -1;
    this._results = [];

    this._bindElements();
    this._bindEvents();
  }

  _bindElements() {
    this.input = this.container.querySelector('.effect-autocomplete__input');
    this.dropdown = this.container.querySelector('.effect-autocomplete__dropdown');
    this.list = this.container.querySelector('.effect-autocomplete__list');
    this.empty = this.container.querySelector('.effect-autocomplete__empty');
    this.countEl = this.container.querySelector('.effect-autocomplete__count');
    this.clearBtn = this.container.querySelector('.effect-autocomplete__clear');
  }

  _bindEvents() {
    this.input.addEventListener('input', () => {
      this._query = this.input.value.trim();
      this._activeIdx = -1;
      this._query.length ? this._search(this._query) : this._close();
      if (this.clearBtn) this.clearBtn.hidden = !this._query.length;
    });

    this.input.addEventListener('keydown', e => this._onKeydown(e));

    this.input.addEventListener('focus', () => {
      if (this._query.length) this._search(this._query);
    });

    this.clearBtn?.addEventListener('click', () => {
      this.input.value = '';
      this._query = '';
      this.clearBtn.hidden = true;
      this._close();
      this.input.focus();
    });

    document.addEventListener('click', e => {
      if (!this.container.contains(e.target)) this._close();
    });
  }

  _search(query) {
    const q = query.toLowerCase();
    this._results = this.effects
      .filter(e => {
        return (
          e.name.toLowerCase().includes(q) ||
          (e.source ?? '').toLowerCase().includes(q) ||
          (e.tags ?? []).some(t => t.name.toLowerCase().includes(q))
        );
      })
      .slice(0, this.maxResults);

    this._renderList();
    this._openDropdown();
  }

  _pick(effect) {
    this.input.value = '';
    this._query = '';
    if (this.clearBtn) this.clearBtn.hidden = true;
    this._close();
    this.onSelect(effect);
  }

  _renderList() {
    this.list.innerHTML = '';

    if (this._results.length === 0) {
      this.empty.hidden = false;
      this.countEl.textContent = '';
      return;
    }

    this.empty.hidden = true;
    this.countEl.textContent = `${this._results.length} effect${this._results.length !== 1 ? 's' : ''}`;

    for (const [idx, effect] of this._results.entries()) {
      const li = document.createElement('li');
      li.className = 'effect-autocomplete__item';
      li.dataset.id = effect.id;
      li.dataset.idx = idx;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');

      // EP cost badge
      const epHtml = effect.epCost != null
        ? `<span class="eac-ep">${effect.epCost} <abbr title="Effect Points">EP</abbr></span>`
        : '';

      // Tags
      const tagsHtml = (effect.tags ?? []).length
        ? `<span class="eac-tags">
            ${effect.tags.map(t =>
              `<span class="eac-tag">
                ${t.icon ? `<i class="${t.icon}"></i>` : ''}
                ${t.name}
              </span>`
            ).join('')}
           </span>`
        : '';

      // Sub-row only if there's something to show
      const subRow = (epHtml || tagsHtml)
        ? `<div class="eac-item__sub">${epHtml}${tagsHtml}</div>`
        : '';

      li.innerHTML = `
        <img class="eac-item__icon" ${effect.icon ? `src=${effect.icon}`: ""}>
        <div class="eac-item__body">
          <div class="eac-item__main">
            <span class="eac-item__name">${this._hl(effect.name)}</span>
            ${effect.source
              ? `<span class="eac-item__source">from ${this._hl(effect.source)}</span>`
              : ''}
          </div>
          ${subRow}
        </div>
      `;

      li.addEventListener('click', () => this._pick(effect));
      li.addEventListener('mouseenter', () => {
        this._activeIdx = idx;
        this._highlightActive();
      });

      this.list.appendChild(li);
    }
  }

  _hl(text) {
    if (!this._query) return text;
    const re = new RegExp(
      `(${this._query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'
    );
    return text.replace(re, '<mark>$1</mark>');
  }

  /* ── Open / Close ───────────────────────────────────── */

  _openDropdown() {
    this.dropdown.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
    this.container.classList.add('is-open');
  }

  _close() {
    this.dropdown.hidden = true;
    this._activeIdx = -1;
    this.input.setAttribute('aria-expanded', 'false');
    this.container.classList.remove('is-open');
  }

  /* ── Keyboard ───────────────────────────────────────── */

  _onKeydown(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this._activeIdx = Math.min(this._activeIdx + 1, this._results.length - 1);
        this._highlightActive();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this._activeIdx = Math.max(this._activeIdx - 1, 0);
        this._highlightActive();
        break;
      case 'Enter':
        e.preventDefault();
        if (this._activeIdx >= 0 && this._results[this._activeIdx]) {
          this._pick(this._results[this._activeIdx]);
        }
        break;
      case 'Escape':
        this._close();
        this.input.blur();
        break;
    }
  }

  _highlightActive() {
    this.list.querySelectorAll('.effect-autocomplete__item').forEach((el, i) => {
      const active = i === this._activeIdx;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-selected', String(active));
    });
    this.list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }
}