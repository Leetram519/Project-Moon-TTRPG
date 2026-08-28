import { KEYWORDS as LEXER_KEYWORDS } from "./lexer.js";

const ACTIONS = new Set([
  "gain", "spend", "lose", "require", "inflict", "reduce", "increase",
  "convert", "create", "dialog", "message", "burst", "proc", "deal", "heal", "add", "remove",
  "set", "halve", "double", "regen", "power", "dice", "range", "roll", "pause",
  "advantage", "disadvantage",
]);

const TAGS = new Set(["instant"]);

const KEYWORDS = new Set([
  ...LEXER_KEYWORDS,
  "action", "actions", "reaction", "reactions",
  "movement", "square", "squares", "sqr", "sqrs",
  "hp", "st", "sp", "light", "stagger", "sanity",
  "tempHp", "tempSt", "tempSp",
  "maxHp", "maxSt", "maxSp", "maxLight",
  "resistance", "resistances",
  "fatal", "weak", "normal", "endured", "ineffective", "immune",
  "slash", "pierce", "blunt",
  "incoming", "damage", "changed", "depleted", "moved", "clash", "item", "burst",
  "combat", "round",
  "status", "uuid", "name", "id", "origin",
]);

const WORD_RE = /^[A-Za-z_][A-Za-z0-9_]*/;
const NUMBER_RE = /^\d+(?:\.\d+)?(?:d\d+(?:[kd][hl]\d*)*)?/i;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function span(cls, text) {
  return `<span class="pm-ee-tok pm-ee-tok--${cls}">${escapeHtml(text)}</span>`;
}

/** @param {string} source */
export function highlightEasyEffects(source) {
  const text = String(source ?? "");
  if (!text) return "";

  let out = "";
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === "#") {
      let j = i + 1;
      while (j < text.length && text[j] !== "\n") j++;
      out += span("comment", text.slice(i, j));
      i = j;
      continue;
    }

    if (ch === "[") {
      const end = text.indexOf("]", i);
      if (end === -1) {
        out += span("trigger", text.slice(i));
        break;
      }
      out += span("trigger", text.slice(i, end + 1));
      i = end + 1;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"' && text[j] !== "\n") j++;
      if (j < text.length && text[j] === '"') j++;
      out += span("string", text.slice(i, j));
      i = j;
      continue;
    }

    if (ch === "$") {
      const rest = text.slice(i + 1).match(WORD_RE);
      if (rest) {
        out += span("variable", `$${rest[0]}`);
        i += 1 + rest[0].length;
        continue;
      }
    }

    const num = text.slice(i).match(NUMBER_RE);
    if (num) {
      out += span("number", num[0]);
      i += num[0].length;
      continue;
    }

    const word = text.slice(i).match(WORD_RE);
    if (word) {
      const raw = word[0];
      const lower = raw.toLowerCase();
      if (TAGS.has(lower)) out += span("tag", raw);
      else if (ACTIONS.has(lower)) out += span("action", raw);
      else if (KEYWORDS.has(lower) || KEYWORDS.has(raw)) out += span("keyword", raw);
      else out += escapeHtml(raw);
      i += raw.length;
      continue;
    }

    out += escapeHtml(ch);
    i++;
  }

  return out.endsWith("\n") ? `${out}\n` : `${out}\n`;
}

/**
 * @param {ParentNode} root
 * @param {{ signal?: AbortSignal }} [options]
 */
export function bindEasyEffectsHighlighter(root, { signal } = {}) {
  if (!root?.querySelectorAll) return;

  for (const shell of root.querySelectorAll(".pm-ee-code")) {
    const textarea = shell.querySelector(".pm-ee-code__source");
    const highlight = shell.querySelector(".pm-ee-code__highlight");
    if (!textarea || !highlight) continue;

    const paint = () => {
      highlight.innerHTML = highlightEasyEffects(textarea.value);
    };

    // Moving the mirror avoids scrollbar-gutter drift.
    let raf = 0;
    const syncScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        highlight.style.transform =
          `translate3d(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px, 0)`;
      });
    };

    paint();
    syncScroll();

    if (textarea.dataset.pmEeHighlightBound === "true") continue;
    textarea.dataset.pmEeHighlightBound = "true";

    const opts = signal ? { signal } : undefined;
    textarea.addEventListener("input", () => {
      paint();
      syncScroll();
    }, opts);
    textarea.addEventListener("scroll", syncScroll, opts);
    textarea.addEventListener("select", syncScroll, opts);
    textarea.addEventListener("keyup", syncScroll, opts);
    textarea.addEventListener("mousemove", (ev) => {
      if (ev.buttons) syncScroll();
    }, opts);

    signal?.addEventListener("abort", () => {
      if (raf) cancelAnimationFrame(raf);
      delete textarea.dataset.pmEeHighlightBound;
      highlight.style.transform = "";
    }, { once: true });
  }
}
