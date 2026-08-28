export const KEYWORDS = new Set([
  // core syntax
  "if", "do", "on", "per", "and", "to", "from",
  // targets (single)
  "self", "target", "ally", "attacker", "originator", "burster", "burstee",
  // targets (multi)
  "enemies", "allies", "all",
  // flag keywords
  "isStaggered", "isPanicking", "hasStatus",
  // natural-language aliases
  "gain", "spend", "lose", "require", "then", "inflict",
  "reduce", "increase", "by",
  "halve", "double", "half", "of",
  "convert",
  "create",
  "dialog",
  "message",
  "burst",
  "proc",
  "targeting",
  "with",
  "as",
  "roll", "the",
  "next", "round", "turn", "pause",
  // effect template polarity
  "positive", "negative",
  // verb component keywords (power up/down, dice max up/down, range up/down, regen)
  "power", "dice", "regen", "range", "up", "down", "max",
  "advantage", "disadvantage",
  "before", "after",
  "let",
]);

function readVariable(source, index) {
  if (source[index] !== "$") return null;
  if (!/[A-Za-z_]/.test(source[index + 1])) {
    throw new LexError("Expected variable name after '$'", index);
  }
  let i = index + 1;
  let name = "";
  while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) name += source[i++];
  return { type: "VARIABLE", value: name, length: i - index };
}

function readFloorOperator(source, index) {
  if (source[index] !== "/" || source[index + 1] !== "/") return null;
  const suffix = source[index + 2]?.toLowerCase();
  if (suffix === "c" || suffix === "f") {
    return { value: `//${suffix}`, length: 3 };
  }
  return { value: "//", length: 2 };
}

function readKeepDropSuffixes(source, index) {
  let i = index;
  while (i < source.length) {
    const a = source[i]?.toLowerCase();
    const b = source[i + 1]?.toLowerCase();
    if ((a !== "k" && a !== "d") || (b !== "h" && b !== "l")) break;
    i += 2;
    while (i < source.length && /[0-9]/.test(source[i])) i++;
  }
  return i === index ? null : { length: i - index };
}

function readNumberOrDice(source, index, diceError) {
  let i = index;
  let num = "";
  while (i < source.length && /[0-9]/.test(source[i])) num += source[i++];
  if (source[i] === "d" || source[i] === "D") {
    let diceStr = `${num}d`;
    i++;
    if (!/[0-9]/.test(source[i])) throw new LexError(diceError, i);
    while (i < source.length && /[0-9]/.test(source[i])) diceStr += source[i++];
    const keep = readKeepDropSuffixes(source, i);
    if (keep) {
      diceStr += source.slice(i, i + keep.length);
      i += keep.length;
    }
    return { type: "DICE", value: diceStr, length: i - index };
  }
  return { type: "NUMBER", value: num, length: i - index };
}

/**
 * @param {string} source
 * @returns {{ type: string, value: string }[]}
 */
export function tokenize(source) {
  const tokens = [];
  let i = 0;

  while (i < source.length) {
    if (source[i] === " " || source[i] === "\t" || source[i] === "\r") {
      i++;
      continue;
    }
    if (source[i] === "\n") {
      tokens.push({ type: "NEWLINE", value: "\n" });
      i++;
      continue;
    }

    // Comment
    if (source[i] === "#") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }

    // TRIGGER [...]
    if (source[i] === "[") {
      const end = source.indexOf("]", i);
      if (end === -1) throw new LexError("Unclosed '[' in trigger", i);
      tokens.push({ type: "TRIGGER", value: source.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }

    // STRING "..."
    if (source[i] === '"') {
      let j = i + 1;
      while (j < source.length && source[j] !== '"') {
        if (source[j] === "\n") throw new LexError("Unterminated string (newline inside quotes)", i);
        j++;
      }
      if (j >= source.length) throw new LexError("Unterminated string", i);
      tokens.push({ type: "STRING", value: source.slice(i + 1, j) });
      i = j + 1;
      continue;
    }

    // ACCESSOR (...) — raw capture with depth tracking
    if (source[i] === "(") {
      let depth = 1, j = i + 1;
      while (j < source.length && depth > 0) {
        if (source[j] === "(") depth++;
        if (source[j] === ")") depth--;
        if (depth > 0) j++;
      }
      if (depth !== 0) throw new LexError("Unclosed '(' in accessor", i);
      tokens.push({ type: "ACCESSOR", value: source.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }

    // SEMICOLON
    if (source[i] === ";") {
      tokens.push({ type: "SEMICOLON", value: ";" });
      i++;
      continue;
    }

    if (source[i] === ":") {
      tokens.push({ type: "COLON", value: ":" });
      i++;
      continue;
    }

    if (source[i] === ",") {
      tokens.push({ type: "COMMA", value: "," });
      i++;
      continue;
    }

    if (source[i] === ".") {
      tokens.push({ type: "DOT", value: "." });
      i++;
      continue;
    }

    const floorOp = readFloorOperator(source, i);
    if (floorOp) {
      tokens.push({ type: "MATHOP", value: floorOp.value });
      i += floorOp.length;
      continue;
    }
    if ("+-*/%".includes(source[i])) {
      tokens.push({ type: "MATHOP", value: source[i] }); i++; continue;
    }

    // OPERATOR >= <= == != > <  (check == before standalone =)
    if (/[><!]/.test(source[i]) || (source[i] === "=" && source[i + 1] === "=")) {
      const two = source.slice(i, i + 2);
      if ([">=", "<=", "==", "!="].includes(two)) {
        tokens.push({ type: "OPERATOR", value: two }); i += 2;
      } else {
        tokens.push({ type: "OPERATOR", value: source[i] }); i++;
      }
      continue;
    }

    if (source[i] === "=") {
      tokens.push({ type: "ASSIGN", value: "=" });
      i++;
      continue;
    }

    const variable = readVariable(source, i);
    if (variable) {
      tokens.push({ type: "VARIABLE", value: variable.value });
      i += variable.length;
      continue;
    }

    // NUMBER or DICE
    if (/[0-9]/.test(source[i])) {
      const tok = readNumberOrDice(source, i, "Expected number after 'd' in dice expression");
      tokens.push({ type: tok.type, value: tok.value });
      i += tok.length;
      continue;
    }

    // KEYWORD or IDENT
    if (/[a-zA-Z_]/.test(source[i])) {
      let word = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) word += source[i++];
      tokens.push({ type: KEYWORDS.has(word) ? "KEYWORD" : "IDENT", value: word });
      continue;
    }

    throw new LexError(`Unexpected character '${source[i]}'`, i);
  }

  tokens.push({ type: "EOF", value: "" });
  return tokens;
}

/**
 * Tokenizes the interior of an accessor for math-expression parsing.
 */
export function tokenizeExpression(source) {
  const tokens = [];
  let i = 0;

  while (i < source.length) {
    if (/\s/.test(source[i])) { i++; continue; }
    if (source[i] === "(") { tokens.push({ type: "LPAREN", value: "(" }); i++; continue; }
    if (source[i] === ")") { tokens.push({ type: "RPAREN", value: ")" }); i++; continue; }
    if (source[i] === ".") { tokens.push({ type: "DOT",    value: "." }); i++; continue; }

    if (source[i] === '"') {
      let j = i + 1;
      while (j < source.length && source[j] !== '"') j++;
      if (j >= source.length) throw new LexError("Unterminated string in expression", i);
      tokens.push({ type: "STRING", value: source.slice(i + 1, j) });
      i = j + 1;
      continue;
    }

    const floorOp = readFloorOperator(source, i);
    if (floorOp) {
      tokens.push({ type: "MATHOP", value: floorOp.value });
      i += floorOp.length;
      continue;
    }
    if ("+-*/%".includes(source[i])) {
      tokens.push({ type: "MATHOP", value: source[i] }); i++; continue;
    }

    const variable = readVariable(source, i);
    if (variable) {
      tokens.push({ type: "VARIABLE", value: variable.value });
      i += variable.length;
      continue;
    }

    if (/[0-9]/.test(source[i])) {
      const tok = readNumberOrDice(source, i, "Expected number after 'd'");
      tokens.push({ type: tok.type, value: tok.value });
      i += tok.length;
      continue;
    }

    if (/[a-zA-Z_]/.test(source[i])) {
      let word = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) word += source[i++];
      tokens.push({ type: "IDENT", value: word });
      continue;
    }

    throw new LexError(`Unexpected character '${source[i]}' in expression`, i);
  }

  tokens.push({ type: "EOF", value: "" });
  return tokens;
}

export class LexError extends Error {
  constructor(message, position) {
    super(`[EasyEffects Lexer] ${message} at position ${position}`);
    this.position = position;
  }
}