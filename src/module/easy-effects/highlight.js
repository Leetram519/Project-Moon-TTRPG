import { KEYWORDS as LEXER_KEYWORDS } from "./lexer.js";

const ACTIONS = new Set([
  "gain", "spend", "lose", "require", "inflict", "reduce", "increase",
  "convert", "create", "dialog", "message", "burst", "proc", "deal", "heal", "add", "remove",
  "set", "clear", "halve", "double", "regen", "power", "dice", "range", "roll", "pause",
  "advantage", "disadvantage", "let",
]);

const CALLS = new Set(["min", "max", "clamp"]);
const TAGS = new Set(["instant"]);

const HOSTS = new Set([
  "self", "target", "ally", "attacker", "originator", "burster", "burstee", "healer",
  "enemies", "allies",
  "event", "item", "combat",
]);

const PATH_SEGMENTS = new Set([
  "status", "flag", "amount", "pool", "originalpool", "origin",
  "source", "damagetype", "attack",
  "before", "after", "max",
  "squares", "spaces", "movement", "forced", "method",
  "value", "rolledvalue", "number", "tag", "tags",
  "uuid", "name", "id",
  "attr", "stat", "rank",
  "hp", "st", "sp", "light",
  ...HOSTS,
]);

const KEYWORDS = new Set([
  ...[...LEXER_KEYWORDS].map((word) => word.toLowerCase()),
  "action", "actions", "reaction", "reactions",
  "movement", "square", "squares", "sqr", "sqrs",
  "hp", "st", "sp", "light", "stagger", "sanity",
  "temphp", "tempst", "tempsp",
  "maxhp", "maxst", "maxsp", "maxlight",
  "resistance", "resistances",
  "fatal", "weak", "normal", "endured", "ineffective", "immune",
  "slash", "pierce", "blunt",
  "incoming", "damage", "heal", "changed", "depleted", "moved", "clash", "burst",
  "round", "pendingroll", "flag",
  "status", "uuid", "name", "id", "origin",
  "true", "false",
  "formula",
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

/*
 * After a dot, only known path fields are highlighted. User-defined keys stay
 * plain. min/max/clamp count as calls only when followed by `(` so names like
 * `dice max` and `self.hp.max` are not misclassified. (big brain ik)
 */
export function classifyEasyEffectsIdent(
  raw,
  { afterDot = false, followedByParen = false } = {}
) {
  const lower = String(raw ?? "").toLowerCase();
  if (!lower) return null;

  if (afterDot) return PATH_SEGMENTS.has(lower) ? "keyword" : null;
  if (followedByParen && CALLS.has(lower)) return "call";
  if (TAGS.has(lower)) return "tag";
  if (ACTIONS.has(lower)) return "action";
  if (HOSTS.has(lower)) return "host";
  if (lower === "n") return "number";
  if (KEYWORDS.has(lower)) return "keyword";

  return null;
}

export function highlightEasyEffects(source) {
  const text = String(source ?? "");
  if (!text) return "";

  let out = "";
  let i = 0;
  let lineStart = true;

  while (i < text.length) {
    const ch = text[i];

    if (ch === "\n") {
      out += "\n";
      i++;
      lineStart = true;
      continue;
    }

    if (ch === " " || ch === "\t" || ch === "\r") {
      out += escapeHtml(ch);
      i++;
      continue;
    }

    if (ch === "#") {
      let j = i + 1;
      while (j < text.length && text[j] !== "\n") j++;
      out += span("comment", text.slice(i, j));
      i = j;
      lineStart = false;
      continue;
    }

    if (ch === "[") {
      const end = text.indexOf("]", i);
      if (end === -1) {
        out += span(lineStart ? "trigger" : "tag", text.slice(i));
        break;
      }
      out += span(lineStart ? "trigger" : "tag", text.slice(i, end + 1));
      i = end + 1;
      lineStart = false;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"' && text[j] !== "\n") j++;
      if (j < text.length && text[j] === '"') j++;
      out += span("string", text.slice(i, j));
      i = j;
      lineStart = false;
      continue;
    }

    if (ch === "$") {
      const rest = text.slice(i + 1).match(WORD_RE);
      if (rest) {
        out += span("variable", `$${rest[0]}`);
        i += 1 + rest[0].length;
        lineStart = false;
        continue;
      }
    }

    const num = text.slice(i).match(NUMBER_RE);
    if (num) {
      out += span("number", num[0]);
      i += num[0].length;
      lineStart = false;
      continue;
    }

    const word = text.slice(i).match(WORD_RE);
    if (word) {
      const raw = word[0];
      const cls = classifyEasyEffectsIdent(raw, {
        afterDot: i > 0 && text[i - 1] === ".",
        followedByParen: text[i + raw.length] === "(",
      });

      out += cls ? span(cls, raw) : escapeHtml(raw);
      i += raw.length;
      lineStart = false;
      continue;
    }

    out += escapeHtml(ch);
    i++;
    lineStart = false;
  }

  return out.endsWith("\n") ? `${out}\n` : `${out}\n`;
}

/*
 * Keeps the syntax layer aligned with each EasyEffects textarea. AbortSignal
 * lets a re-render tear down the binding without leaving stale listeners.
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

    let raf = 0;
    const syncScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;

        // Move the mirror instead of scrolling it to avoid scrollbar-gutter drift.
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
