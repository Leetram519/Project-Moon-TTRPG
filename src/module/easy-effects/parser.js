import {
  DAMAGE_TYPES,
  buildResistanceOverrideMap,
  isResistanceNoun,
  normalizeDamageType,
  normalizeResistanceLevel,
} from "./resistances.js";
import { normalizeBurstTrigger, normalizeClashStanceTrigger, normalizeDepletedTrigger, normalizeTakingDamageTrigger } from "./damage-filter.js";
import {
  canonicalizeProcName,
  isReservedProcBindName,
  isReservedProcName,
  normalizeProcTrigger,
} from "./proc.js";
import { isAlwaysActiveResource, isApplyPoolNoun, isBonusNoun, isRegenNoun, isReservedNoun, isResourceNoun, lookupNoun, nounAllowsOp, resolveApplyPool} from "./nouns.js";
import { tokenize, tokenizeExpression, LexError } from "./lexer.js";

const SINGLE_TARGETS = new Set(["self", "target", "ally", "attacker", "originator", "burster", "burstee"]);
const MULTI_TARGETS  = new Set(["enemies", "allies", "all"]);
const ALL_TARGETS    = new Set([...SINGLE_TARGETS, ...MULTI_TARGETS]);
const FLAG_KEYWORDS  = new Set(["isStaggered", "isPanicking", "hasStatus"]);
const MUL_OPS = new Set(["*", "/", "%", "//", "//f", "//c"]);
const EXPR_PATH_ROOTS = new Set([
  "self", "target", "ally", "attacker", "originator", "burster", "burstee",
  "damage", "incoming", "item", "clash", "changed", "burst", "depleted", "moved", "roll", "proc",
  "round", "combat",
]);
const SINGLE_TARGET_HINT = "self/target/ally/attacker/originator/burster/burstee";

const NUMERIC_COMPARE_OPS = new Set([">", "<", ">=", "<="]);

function packConditions(conditions) {
  if (!conditions?.length) return null;
  if (conditions.length === 1) return conditions[0];
  return { type: "And", conditions };
}

export {
  normalizeTakingDamageTrigger,
  matchesDamageFilter,
  normalizeBurstTrigger,
  matchesBurstFilter,
  shouldExecuteBurstBlock,
  normalizeDepletedTrigger,
  matchesDepletedFilter,
} from "./damage-filter.js";

export {
  canonicalizeProcName,
  isReservedProcName,
  isReservedProcBindName,
  normalizeProcTrigger,
} from "./proc.js";

export function parse(source) {
  const tokens = tokenize(source);
  return new Parser(tokens).parseScript();
}

class Parser {
  constructor(tokens) { this.tokens = tokens; this.pos = 0; }

  skipNewlines() {
    while (this.tokens[this.pos]?.type === "NEWLINE") this.pos++;
  }

  _peekOffset(offset = 0) {
    let i = this.pos;
    for (let n = 0; n <= offset; n++) {
      while (this.tokens[i]?.type === "NEWLINE") i++;
      if (n === offset) return this.tokens[i];
      i++;
    }
    return this.tokens[i];
  }

  peek() { return this._peekOffset(); }

  _parseOptionalOnOrToTarget() {
    if (!(this.check("KEYWORD", "on") || this.check("KEYWORD", "to"))) return null;
    this.consume("KEYWORD");
    const tok = this.peek();
    if (!ALL_TARGETS.has(tok.value)) {
      throw new ParseError(`Expected target after 'on'/'to', got '${tok.value}'`, tok);
    }
    return this.consume("KEYWORD").value;
  }

  /** Actor role passed as `target` in the nested proc. */
  _parseOptionalProcTarget() {
    if (!this.check("KEYWORD", "targeting")) return null;
    this.consume("KEYWORD", "targeting");
    const tok = this.peek();
    if (!SINGLE_TARGETS.has(tok.value)) {
      throw new ParseError(
        `Expected proc target (${SINGLE_TARGET_HINT}), got '${tok.value}'`,
        tok
      );
    }
    return this.consume("KEYWORD").value;
  }

  /**
   * @param {"before"|"after"} defaultTiming
   * @returns {"before"|"after"}
   */
  _parseOptionalResistanceTiming(defaultTiming) {
    if (!(this.check("KEYWORD", "before") || this.check("KEYWORD", "after"))) {
      return defaultTiming;
    }
    const when = this.consume("KEYWORD").value;
    const tok = this.peek();
    const word = String(tok?.value ?? "").toLowerCase();
    if (
      !(tok && (tok.type === "IDENT" || tok.type === "KEYWORD")
        && (word === "resistance" || word === "resistances"))
    ) {
      throw new ParseError(
        `Expected 'resistance' or 'resistances' after '${when}', got '${tok?.value}'`,
        tok ?? this.peek()
      );
    }
    this.advance();
    return when === "before" ? "before" : "after";
  }

  consume(type, value) {
    this.skipNewlines();
    const tok = this.tokens[this.pos];
    if (type && tok.type !== type)
      throw new ParseError(`Expected ${type} but got ${tok.type} ('${tok.value}')`, tok);
    if (value !== undefined && tok.value !== value)
      throw new ParseError(`Expected '${value}' but got '${tok.value}'`, tok);
    this.pos++;
    return tok;
  }

  advance() {
    this.skipNewlines();
    const tok = this.tokens[this.pos];
    this.pos++;
    return tok;
  }

  /** `;`, newline(s), or next trigger / EOF. */
  consumeStatementEnd() {
    const start = this.pos;
    while (this.tokens[this.pos]?.type === "NEWLINE") this.pos++;
    const tok = this.tokens[this.pos];

    if (tok?.type === "SEMICOLON") {
      this.pos++;
      while (this.tokens[this.pos]?.type === "NEWLINE") this.pos++;
      return;
    }

    if (this.pos > start) return;

    if (tok?.type === "EOF" || tok?.type === "TRIGGER") return;

    throw new ParseError(
      `Expected ';' or newline to end statement, got ${tok.type} ('${tok.value}')`,
      tok
    );
  }

  check(type, value) {
    const tok = this.peek();
    return tok.type === type && (value === undefined || tok.value === value);
  }

  checkAny(type, values) { return values.some(v => this.check(type, v)); }

  // ── Status name ────────────────────────────────────────────────────────────
  parseStatusName() {
    if (this.check("STRING")) return this.consume("STRING").value;
    // Bare names and dotted document UUIDs.
    if (this.check("IDENT")) {
      let name = this.consume("IDENT").value;
      while (this.check("DOT") && this._peekOffset(1)?.type === "IDENT") {
        this.consume("DOT");
        name += `.${this.consume("IDENT").value}`;
      }
      return name;
    }
    if (this.check("KEYWORD")) {
      const tok = this.peek();
      throw new ParseError(
        `'${tok.value}' is reserved; quote it as a status name, e.g. "${tok.value}"`,
        tok
      );
    }
    throw new ParseError(`Expected status name, got '${this.peek().value}'`, this.peek());
  }

  isStatusNameToken() {
    return this.check("STRING") || (this.check("IDENT") && !isReservedNoun(this.peek().value));
  }

  // ── Top level ──────────────────────────────────────────────────────────────
  parseScript() {
    const blocks = [];
    this.skipNewlines();
    while (!this.check("EOF")) {
      blocks.push(this.parseBlock());
      this.skipNewlines();
    }
    return { type: "Script", blocks };
  }

  parseBlock() {
    const rawTrigger = this.consume("TRIGGER").value;
    let { trigger, damageFilter } = normalizeTakingDamageTrigger(rawTrigger);
    let burstFilter = null;
    let depletedFilter = null;
    let clashStanceFilter = null;
    if (!damageFilter && trigger === String(rawTrigger ?? "").trim()) {
      const depleted = normalizeDepletedTrigger(rawTrigger);
      if (depleted.matched) {
        trigger = depleted.trigger;
        depletedFilter = depleted.depletedFilter;
      } else {
        const clashStance = normalizeClashStanceTrigger(rawTrigger);
        if (clashStance.matched) {
          trigger = clashStance.trigger;
          clashStanceFilter = clashStance.clashStanceFilter;
        } else {
          const burst = normalizeBurstTrigger(rawTrigger);
          if (burst.matched) {
            trigger = burst.trigger;
            burstFilter = burst.burstFilter;
          } else {
            const proc = normalizeProcTrigger(rawTrigger);
            if (proc.matched) trigger = proc.trigger;
          }
        }
      }
    }
    const statements = [];
    this.skipNewlines();
    while (!this.check("EOF") && !this.check("TRIGGER")) {
      statements.push(this.parseStatement());
      this.skipNewlines();
    }
    if (trigger === "Always Active") {
      for (const stmt of statements) this._assertAlwaysActiveSafe(stmt);
    }
    return {
      type: "Block",
      trigger,
      damageFilter,
      burstFilter,
      depletedFilter,
      clashStanceFilter,
      statements,
    };
  }

  _assertAlwaysActiveSafe(stmt) {
    if (stmt.type === "LetStatement") return;
    if (stmt.type === "DialogStatement") {
      throw new ParseError(
        "[Always Active] does not allow 'dialog'; use an event trigger",
        this.peek()
      );
    }
    if (stmt.type === "MessageStatement") {
      throw new ParseError(
        "[Always Active] does not allow 'message'; use an event trigger",
        this.peek()
      );
    }
    if (stmt.type === "RollStatement" || stmt.roll) {
      throw new ParseError(
        "[Always Active] does not allow 'roll'; use an event trigger",
        this.peek()
      );
    }
    const okBonus = new Set(["power up", "power down", "dice max up", "dice max down", "range up", "range down"]);
    for (const action of stmt.actions ?? []) {
      if (action.verb === "burst") {
        throw new ParseError(
          "[Always Active] does not allow 'burst'; use an event trigger",
          this.peek()
        );
      }
      if (action.verb === "proc") {
        throw new ParseError(
          "[Always Active] does not allow 'proc'; use an event trigger",
          this.peek()
        );
      }
      if (action.verb === "roll") {
        throw new ParseError(
          "[Always Active] does not allow 'roll'; use an event trigger",
          this.peek()
        );
      }
      if (action.verb === "dialog") {
        throw new ParseError(
          "[Always Active] does not allow 'dialog'; use an event trigger",
          this.peek()
        );
      }
      if (action.verb === "message") {
        throw new ParseError(
          "[Always Active] does not allow 'message'; use an event trigger",
          this.peek()
        );
      }
      if (okBonus.has(action.verb)) continue;
      if ((action.verb === "add" || action.verb === "remove") && action.noun === "resource") {
        if (!isAlwaysActiveResource(action.argument)) {
          throw new ParseError(
            `[Always Active] cannot use '${action.argument}' (use an event trigger)`,
            this.peek()
          );
        }
        continue;
      }
      if (action.verb === "set" && action.noun === "resource") {
        if (!isAlwaysActiveResource(action.argument)) {
          throw new ParseError(
            `[Always Active] cannot set '${action.argument}' (use an event trigger)`,
            this.peek()
          );
        }
        continue;
      }
      if (action.verb === "instant") continue;
      if (action.verb === "set" && action.noun === "resistance") continue;
      throw new ParseError(
        `[Always Active] does not allow '${action.verb}'`
        + (action.noun === "status" ? " (status stacks)" : "")
        + "; use combat triggers for statuses/damage. Only max resources, power, dice max, and instant are allowed here",
        this.peek()
      );
    }
  }

  parseStatement() {
    const polarity = this._parsePolarityPrefix();

    let stmt;
    if (this.check("KEYWORD", "create")) {
      const next = this._peekOffset(1);
      if (next?.type === "KEYWORD" && next.value === "message") {
        stmt = this.parseMessageStatement();
      } else {
        stmt = this.parseDialogStatement();
      }
    }
    else if (this.check("KEYWORD", "message")) stmt = this.parseMessageStatement();
    else if (this.check("KEYWORD", "dialog")) stmt = this.parseDialogStatement();
    else if (this.check("KEYWORD", "roll")) stmt = this.parseRollStatement();
    else if (this.check("KEYWORD", "on") && this._peekOffset(1)?.type === "KEYWORD" && this._peekOffset(1)?.value === "roll") {
      stmt = this.parseOnRollStatement();
    }
    else if (this.check("KEYWORD", "burst")) stmt = this.parseNaturalStatement();
    else if (this.check("KEYWORD", "proc")) stmt = this.parseNaturalStatement();
    else if (this.check("KEYWORD", "pause")) stmt = this.parseNaturalStatement();
    else if (this.check("KEYWORD", "advantage") || this.check("KEYWORD", "disadvantage")) {
      stmt = this.parseNaturalStatement();
    }
    else if (this.check("KEYWORD", "let")) stmt = this.parseLetStatement();
    else if (this.check("VARIABLE")) {
      throw new ParseError(
        `Unexpected '$${this.peek().value}'. Use 'let $${this.peek().value} = …' to declare a variable`,
        this.peek()
      );
    }
    else if (this.check("KEYWORD", "spend"))   stmt = this.parseSpendStatement();
    else if (this.check("KEYWORD", "require")) stmt = this.parseRequireStatement();
    else if (this.checkAny("KEYWORD", ["gain", "lose", "inflict", "reduce", "increase", "halve", "double", "convert"])) {
      stmt = this.parseNaturalStatement();
    }
    else if (this.check("IDENT", "deal") || this.check("IDENT", "heal") || this.check("IDENT", "set") || this.check("IDENT", "instant")) stmt = this.parseNaturalStatement();
    else if (this._isBonusVerbAhead()) stmt = this.parseBonusVerbStatement();
    else if (this.check("KEYWORD", "range")) stmt = this.parseNaturalStatement();
    else stmt = this.parseDoStatement();

    stmt.polarity = polarity;
    return stmt;
  }

  parseMessageStatement() {
    if (this.check("KEYWORD", "create")) {
      this.consume("KEYWORD", "create");
      if (!this.check("KEYWORD", "message")) {
        throw new ParseError(
          `Expected 'message' after 'create', got '${this.peek().value}'`,
          this.peek()
        );
      }
    }
    this.consume("KEYWORD", "message");

    if (!this.check("STRING")) {
      throw new ParseError(`Expected message string, got '${this.peek().value}'`, this.peek());
    }
    const template = this.consume("STRING").value;
    if (!String(template).trim()) {
      throw new ParseError("Message text cannot be empty", this.peek());
    }

    let speaker = "self";
    if (this.check("KEYWORD", "on") || this.check("KEYWORD", "to")) {
      this.consume("KEYWORD");
      const tok = this.peek();
      if (!SINGLE_TARGETS.has(tok.value)) {
        throw new ParseError(
          `Expected message speaker (${SINGLE_TARGET_HINT}), got '${tok.value}'`,
          tok
        );
      }
      speaker = this.consume("KEYWORD").value;
    }

    this.consumeStatementEnd();
    return { type: "MessageStatement", template, speaker, polarity: null };
  }

  parseLetStatement() {
    this.consume("KEYWORD", "let");
    if (!this.check("VARIABLE")) {
      throw new ParseError(`Expected $variable after 'let', got '${this.peek().value}'`, this.peek());
    }
    const name = this.consume("VARIABLE").value;
    if (!this.check("ASSIGN")) {
      throw new ParseError(`Expected '=' after 'let $${name}', got '${this.peek().value}'`, this.peek());
    }
    this.consume("ASSIGN");
    const expr = this._parseMainExpr();
    this.consumeStatementEnd();
    return { type: "LetStatement", name, expr, polarity: null };
  }

  parseRollStatement() {
    this.consume("KEYWORD", "roll");
    if (!this.check("DICE")) {
      throw new ParseError(`Expected dice formula after 'roll', got '${this.peek().value}'`, this.peek());
    }
    const formula = this.consume("DICE").value;
    let bind = null;
    if (this.check("KEYWORD", "as")) {
      this.consume("KEYWORD", "as");
      if (!(this.check("IDENT") || this.check("KEYWORD"))) {
        throw new ParseError(`Expected bind name after 'roll … as', got '${this.peek().value}'`, this.peek());
      }
      bind = this.advance().value;
    }
    this.consumeStatementEnd();
    return { type: "RollStatement", formula, bind, polarity: null };
  }

  parseOnRollHead() {
    this.consume("KEYWORD", "on");
    this.consume("KEYWORD", "roll");
    if (!this.check("DICE")) {
      throw new ParseError(`Expected dice formula after 'on roll', got '${this.peek().value}'`, this.peek());
    }
    const formula = this.consume("DICE").value;
    const operator = this.consume("OPERATOR").value;
    const rhs = this.parseCondRhs(operator);
    this.consume("KEYWORD", "then");
    return {
      roll: { formula, bind: null },
      condition: {
        type: "Condition",
        lhs: { type: "ACCESSOR", expr: { type: "Path", segments: ["roll"] } },
        operator,
        rhs,
      },
    };
  }

  parseOnRollStatement() {
    const parsed = this.parseOnRollHead();
    return this.parseThenBody([], parsed.roll, [parsed.condition]);
  }

  parseDialogStatement() {
    const parsed = this._parseDialogCore();
    this.consumeStatementEnd();
    return { type: "DialogStatement", ...parsed, polarity: null };
  }

  parseNaturalDialogAction() {
    const parsed = this._parseDialogCore();
    return {
      type: "Action",
      verb: "dialog",
      noun: null,
      argument: parsed.prompt,
      amount: null,
      per: null,
      target: null,
      audience: parsed.audience,
      choices: parsed.choices,
      pool: null,
      damageType: null,
    };
  }

  _parseDialogCore() {
    if (this.check("KEYWORD", "create")) {
      this.consume("KEYWORD", "create");
      if (!this.check("KEYWORD", "dialog")) {
        throw new ParseError(
          `Expected 'dialog' after 'create', got '${this.peek().value}'`,
          this.peek()
        );
      }
    }
    this.consume("KEYWORD", "dialog");

    if (!this.check("STRING")) {
      throw new ParseError(`Expected dialog prompt string, got '${this.peek().value}'`, this.peek());
    }
    const prompt = this.consume("STRING").value.trim();
    if (!prompt) {
      throw new ParseError("Dialog prompt cannot be empty", this.peek());
    }
    this.consume("COLON");

    const choices = [];
    const seen = new Set();
    while (true) {
      if (!(this.check("IDENT") || this.check("KEYWORD"))) {
        throw new ParseError(
          `Expected dialog answer id, got '${this.peek().value}'`,
          this.peek()
        );
      }
      const idTok = this.advance();
      const id = idTok.value;
      if (seen.has(id)) {
        throw new ParseError(`Duplicate dialog answer id '${id}'`, idTok);
      }
      seen.add(id);

      if (this.check("KEYWORD", "as")) this.consume("KEYWORD", "as");

      if (!this.check("STRING")) {
        throw new ParseError(
          `Expected label string after dialog answer id '${id}', got '${this.peek().value}'`,
          this.peek()
        );
      }
      const label = this.consume("STRING").value.trim();
      if (!label) {
        throw new ParseError(`Dialog answer '${id}' label cannot be empty`, this.peek());
      }
      choices.push({ id, label });

      if (!this.check("COMMA")) break;
      this.consume("COMMA");
    }

    if (choices.length < 2) {
      throw new ParseError(
        "Dialog requires at least two choices (id \"Label\", id \"Label\")",
        this.peek()
      );
    }

    let audience = null;
    if (this.check("KEYWORD", "on") || this.check("KEYWORD", "to")) {
      this.consume("KEYWORD");
      const tok = this.peek();
      if (!SINGLE_TARGETS.has(tok.value)) {
        throw new ParseError(
          `Expected dialog audience (${SINGLE_TARGET_HINT}), got '${tok.value}'`,
          tok
        );
      }
      audience = this.consume("KEYWORD").value;
    }

    return { prompt, audience, choices };
  }

  /**
   * Optional `positive:` / `negative:` effect-template polarity.
   * @returns {"positive"|"negative"|null}
   */
  _parsePolarityPrefix() {
    if (!this.checkAny("KEYWORD", ["positive", "negative"])) return null;
    if (this._peekOffset(1)?.type !== "COLON") return null;
    const polarity = this.consume("KEYWORD").value;
    this.consume("COLON");
    return polarity;
  }

  _parseOptionalAmount() {
    return this._parseAmountExpr({ required: false });
  }

  // Parse numbers, dice, N, accessors, or bare formulas.
  _parseAmountExpr({ required = false } = {}) {
    if (!this._isAmountAhead() && !this._isUnaryMinusAhead()) {
      if (required) {
        throw new ParseError(`Expected amount, got '${this.peek().value}'`, this.peek());
      }
      return null;
    }

    const expr = this._parseMainExpr();
    if (expr.type === "Num") return { type: "NUMBER", value: expr.value };
    if (expr.type === "Dice") return { type: "DICE", value: expr.formula };
    if (expr.type === "EffectN") return { type: "EFFECT_N" };
    if (expr.type === "Path" && expr.segments?.length === 1 && expr.segments[0] === "N") {
      return { type: "EFFECT_N" };
    }
    return { type: "ACCESSOR", expr };
  }

  _isUnaryMinusAhead() {
    const next = this._peekOffset(1);
    return this.check("MATHOP", "-") && (
      next?.type === "NUMBER"
      || next?.type === "DICE"
      || next?.type === "ACCESSOR"
      || next?.type === "VARIABLE"
      || (next?.type === "IDENT" && next.value === "N")
      || (next?.type === "IDENT" && this._isBareStatusAmountIdent(next.value))
    );
  }

  _parseMainExpr() {
    let node = this._parseMainTerm();
    while (this.check("MATHOP", "+") || this.check("MATHOP", "-")) {
      const op = this.advance().value;
      node = { type: "BinOp", op, left: node, right: this._parseMainTerm() };
    }
    return node;
  }

  _parseMainTerm() {
    let node = this._parseMainFactor();
    while (this.peek()?.type === "MATHOP" && MUL_OPS.has(this.peek().value)) {
      const op = this.peek().value;
      if (op === "%") {
        const next = this._peekOffset(1);
        if (!_canStartExprFactor(next)) {
          this.advance();
          node = { type: "Percent", expr: node };
          continue;
        }
      }
      this.advance();
      node = { type: "BinOp", op, left: node, right: this._parseMainFactor() };
    }
    return node;
  }

  _parseMainFactor() {
    if (this.check("MATHOP", "-")) {
      this.advance();
      return { type: "BinOp", op: "-", left: { type: "Num", value: 0 }, right: this._parseMainFactor() };
    }
    if (this.check("ACCESSOR")) {
      return parseAccessorExpression(this.consume("ACCESSOR").value);
    }
    if (this.check("VARIABLE")) {
      return { type: "Variable", name: this.consume("VARIABLE").value };
    }
    if (this.check("STRING")) {
      const name = this.consume("STRING").value;
      return { type: "Path", segments: ["self", "status", name] };
    }
    if (this.check("NUMBER")) {
      return { type: "Num", value: Number(this.consume("NUMBER").value) };
    }
    if (this.check("DICE")) {
      return { type: "Dice", formula: this.consume("DICE").value };
    }
    if (this.check("IDENT", "N") || this.check("KEYWORD", "N")) {
      this.advance();
      return { type: "EffectN" };
    }
    if (
      (this.check("KEYWORD") || this.check("IDENT"))
      && EXPR_PATH_ROOTS.has(this.peek().value)
      && this._peekOffset(1)?.type === "DOT"
    ) {
      const segments = [this.advance().value];
      while (this.check("DOT")) {
        this.advance();
        if (this.check("STRING")) segments.push(this.consume("STRING").value);
        else if (this.check("IDENT")) segments.push(this.consume("IDENT").value);
        else if (this.check("KEYWORD")) segments.push(this.consume("KEYWORD").value);
        else throw new ParseError(`Expected path segment after '.', got '${this.peek().value}'`, this.peek());
      }
      return { type: "Path", segments };
    }
    // A bare status name reads its stack count on self.
    if (this.check("IDENT") && this._isBareStatusAmountIdent(this.peek().value)) {
      const name = this.consume("IDENT").value;
      return { type: "Path", segments: ["self", "status", name] };
    }
    throw new ParseError(`Unexpected token in amount: '${this.peek().value}'`, this.peek());
  }

  /** Ident that can start an amount (not a pool noun like `hp`). */
  _isBareStatusAmountIdent(name) {
    if (!name || typeof name !== "string") return false;
    if (EXPR_PATH_ROOTS.has(name)) return false;
    if (isApplyPoolNoun(name) || isResourceNoun(name) || isReservedNoun(name)) return false;
    return true;
  }

  _isBonusVerbAhead() {
    const t0 = this.peek();
    const t1 = this._peekOffset(1);
    const t2 = this._peekOffset(2);
    if (!t0 || t0.type !== "KEYWORD") return false;
    if (t0.value === "power" && t1?.type === "KEYWORD" && (t1.value === "up" || t1.value === "down")) return true;
    if (t0.value === "dice"  && t1?.type === "KEYWORD" && t1.value === "max" &&
        t2?.type === "KEYWORD" && (t2.value === "up" || t2.value === "down")) return true;
    if (t0.value === "regen" && t1 && (t1.type === "KEYWORD" || t1.type === "IDENT") && isRegenNoun(t1.value))
      return true;
    return false;
  }

  /**
   * Parses a bare bonus verb statement (no leading 'do', no 'if'):
   *   power up attack 2;
   *   regen hp 5;
   * Wraps it in a standard Statement with condition:null.
   */
  parseBonusVerbStatement() {
    const action = this.parseSingleAction();
    this.consumeStatementEnd();
    return { type: "Statement", condition: null, actions: [action], polarity: null };
  }

  // ── Standard if/do ────────────────────────────────────────────────────────
  parseDoStatement() {
    let condition = null;
    if (this.check("KEYWORD", "if")) condition = this.parseCondition();
    const actions = this.parseActionChain();
    this.consumeStatementEnd();
    return { type: "Statement", condition, actions, polarity: null };
  }

  parseCondition() {
    this.consume("KEYWORD", "if");
    const conditions = [this.parseConditionBody()];
    while (this.check("KEYWORD", "and")) {
      this.consume("KEYWORD", "and");
      conditions.push(this.parseConditionBody());
    }
    return packConditions(conditions);
  }

  parseConditionBody() {
    const lhs = this.parseCondLhs();
    const operator = this.consume("OPERATOR").value;
    const rhs = this.parseCondRhs(operator);
    return { type: "Condition", lhs, operator, rhs };
  }

  parseCondLhs() {
    if (this.check("KEYWORD") && FLAG_KEYWORDS.has(this.peek().value)) return this.parseFlagExpr();
    if (this.check("VARIABLE")) {
      return { type: "ACCESSOR", expr: { type: "Variable", name: this.consume("VARIABLE").value } };
    }
    if (this.check("ACCESSOR")) {
      const raw = this.consume("ACCESSOR").value;
      return { type: "ACCESSOR", expr: parseAccessorExpression(raw) };
    }
    throw new ParseError(`Expected accessor, variable, or flag in condition LHS, got '${this.peek().value}'`, this.peek());
  }

  parseFlagExpr() {
    const flag = this.consume("KEYWORD").value;
    let statusName = null;
    if (flag === "hasStatus") statusName = this.parseStatusName();
    let flagTarget = "self";
    if (this.check("KEYWORD") && ALL_TARGETS.has(this.peek().value)) flagTarget = this.consume("KEYWORD").value;
    return { type: "FLAG", flag, statusName, target: flagTarget };
  }

  /**
   * @param {string} [operator]
   */
  parseCondRhs(operator) {
    if (this.check("VARIABLE") || (operator && NUMERIC_COMPARE_OPS.has(operator))) {
      return this._parseAmountExpr({ required: true });
    }
    if (this.check("ACCESSOR")) {
      return { type: "ACCESSOR", expr: parseAccessorExpression(this.consume("ACCESSOR").value) };
    }
    if (this.check("DICE"))   return { type: "DICE",   value: this.consume("DICE").value };
    if (this.check("NUMBER")) return { type: "NUMBER", value: Number(this.consume("NUMBER").value) };
    if (this.check("STRING") || this.check("IDENT")) {
      const name = this.parseStatusName();
      return { type: "IDENT", value: name };
    }
    throw new ParseError(`Expected value on RHS of condition, got '${this.peek().value}'`, this.peek());
  }

  // ── Action chain ──────────────────────────────────────────────────────────
  parseActionChain() {
    this.consume("KEYWORD", "do");
    if (this._looksLikeNaturalAction()) {
      return this.parseNaturalActionChain();
    }
    const actions = [this.parseSingleAction()];
    while (this.check("KEYWORD", "and")) {
      this.consume("KEYWORD", "and");
      actions.push(this.parseSingleAction());
    }
    return actions;
  }

  _looksLikeNaturalAction() {
    if (this.checkAny("KEYWORD", [
      "gain", "lose", "inflict", "reduce", "increase", "halve", "double", "convert",
      "burst", "proc", "pause", "advantage", "disadvantage", "power", "dice", "regen",
      "message", "dialog", "roll",
    ])) return true;
    if (
      this.check("KEYWORD", "create")
      && this._peekOffset(1)?.type === "KEYWORD"
      && (this._peekOffset(1).value === "message" || this._peekOffset(1).value === "dialog")
    ) {
      return true;
    }
    if (this.check("IDENT", "deal") || this.check("IDENT", "heal") || this.check("IDENT", "instant")) {
      return true;
    }
    if (this.check("IDENT", "set")) {
      const next = this._peekOffset(1);
      return !(next && (next.type === "IDENT" || next.type === "KEYWORD") && next.value === "stat");
    }
    return false;
  }

  /**
   * Parses a single action, handling multi-keyword verbs:
   *   power [up/down] / dice max [up/down] / range [up/down] / regen / <IDENT>
   *
   * Returns { type:"Action", verb, noun, argument, amount, per, target }
   */
  parseSingleAction() {
    let verb, noun;
    let dealPool = null;
    let dealDamageType = null;

    // ── Multi-keyword verb detection ────────────────────────────────────────
    const t0 = this.peek();
    const t1 = this._peekOffset(1);
    const t2 = this._peekOffset(2);

    if (t0.type === "KEYWORD" && t0.value === "power") {
      if (t1.type === "KEYWORD" && t1.value === "up") {
        this.consume("KEYWORD", "power"); this.consume("KEYWORD", "up");
        verb = "power up";
      } else if (t1.type === "KEYWORD" && t1.value === "down") {
        this.consume("KEYWORD", "power"); this.consume("KEYWORD", "down");
        verb = "power down";
      } else {
        throw new ParseError(`Expected 'up' or 'down' after 'power', got '${t1.value}'`, t1);
      }
      noun = this._parseBonusNoun();

    } else if (t0.type === "KEYWORD" && t0.value === "dice" &&
               t1.type === "KEYWORD" && t1.value === "max") {
      if (t2.type === "KEYWORD" && t2.value === "up") {
        this.consume("KEYWORD","dice"); this.consume("KEYWORD","max"); this.consume("KEYWORD","up");
        verb = "dice max up";
      } else if (t2.type === "KEYWORD" && t2.value === "down") {
        this.consume("KEYWORD","dice"); this.consume("KEYWORD","max"); this.consume("KEYWORD","down");
        verb = "dice max down";
      } else {
        throw new ParseError(`Expected 'up' or 'down' after 'dice max', got '${t2.value}'`, t2);
      }
      noun = this._parseBonusNoun();

    } else if (t0.type === "KEYWORD" && t0.value === "range") {
      if (t1.type === "KEYWORD" && t1.value === "up") {
        this.consume("KEYWORD", "range"); this.consume("KEYWORD", "up");
        verb = "range up";
      } else if (t1.type === "KEYWORD" && t1.value === "down") {
        this.consume("KEYWORD", "range"); this.consume("KEYWORD", "down");
        verb = "range down";
      } else {
        throw new ParseError(`Expected 'up' or 'down' after 'range', got '${t1.value}'`, t1);
      }
      noun = "range";

    } else if (t0.type === "KEYWORD" && t0.value === "regen") {
      this.consume("KEYWORD", "regen");
      verb = "regen";
      noun = this._parseRegenNoun();

    } else {
      // Standard single-word verb (IDENT)
      verb = this.consume("IDENT").value;
      if (verb === "deal" || verb === "heal") {
        ({ noun, pool: dealPool, damageType: dealDamageType } = this._parseDealHealTail(verb));
      } else {
        noun = this.consume("IDENT").value;
      }
    }

    // Optional status/resource name argument (only for standard verbs)
    let argument = null;
    let pool = dealPool ?? null;
    if (!["power up","power down","dice max up","dice max down","range up","range down","regen","deal","heal"].includes(verb)) {
      if (noun === "resource") argument = this.parseStatusName();
      else if (this.isStatusNameToken()) argument = this.parseStatusName();
    }

    let amount = this._parseOptionalAmount();

    // Optional per
    let per = null;
    if (this.check("KEYWORD", "per")) {
      per = this._parseOptionalPerAmount();
    }

    let resistanceTiming = null;
    if (verb === "deal") {
      resistanceTiming = this._parseOptionalResistanceTiming("after");
    }

    let target = null;
    if (this.check("KEYWORD", "on") || this.check("KEYWORD", "to")) {
      target = this._parseOptionalOnOrToTarget();
    }

    return {
      type: "Action",
      verb,
      noun,
      argument,
      amount,
      per,
      target,
      pool,
      damageType: dealDamageType ?? null,
      ...(resistanceTiming ? { resistanceTiming } : {}),
    };
  }

  /** @returns {object|null} */
  _parseOptionalPerAmount() {
    if (!this.check("KEYWORD", "per")) return null;
    this.consume("KEYWORD", "per");

    let multiplier = null;
    if (this.check("NUMBER")) {
      const next = this._peekOffset(1);
      if (
        next?.type === "ACCESSOR"
        || (next?.type === "IDENT" && this._isBareStatusAmountIdent(next.value))
        || (
          (next?.type === "KEYWORD" || next?.type === "IDENT")
          && EXPR_PATH_ROOTS.has(next.value)
          && this._peekOffset(2)?.type === "DOT"
        )
      ) {
        multiplier = { type: "NUMBER", value: Number(this.consume("NUMBER").value) };
      }
    }

    if (this.check("ACCESSOR")) {
      const path = parseAccessorExpression(this.consume("ACCESSOR").value);
      if (path?.type === "Path") {
        return {
          type: "MULTIPLIEDPATH",
          multiplier: multiplier ?? { type: "NUMBER", value: 1 },
          path,
        };
      }
      return {
        type: "ACCESSOR",
        expr: multiplier
          ? { type: "BinOp", op: "*", left: { type: "Num", value: multiplier.value }, right: path }
          : path,
      };
    }

    if (this.check("IDENT") && this._isBareStatusAmountIdent(this.peek().value)) {
      const name = this.consume("IDENT").value;
      return {
        type: "MULTIPLIEDPATH",
        multiplier: multiplier ?? { type: "NUMBER", value: 1 },
        path: { type: "Path", segments: ["self", "status", name] },
      };
    }

    const amount = this._parseAmountExpr({ required: true });
    if (amount.type === "ACCESSOR" && amount.expr?.type === "Path") {
      return {
        type: "MULTIPLIEDPATH",
        multiplier: multiplier ?? { type: "NUMBER", value: 1 },
        path: amount.expr,
      };
    }
    if (multiplier) {
      const right = amount.type === "ACCESSOR"
        ? amount.expr
        : amount.type === "NUMBER"
          ? { type: "Num", value: amount.value }
          : amount.type === "EFFECT_N"
            ? { type: "EffectN" }
            : amount;
      return {
        type: "ACCESSOR",
        expr: { type: "BinOp", op: "*", left: { type: "Num", value: multiplier.value }, right },
      };
    }
    return amount;
  }

  _packPools(pools) {
    if (!pools.length) return null;
    return pools.length === 1 ? pools[0] : pools;
  }

  // Only consume `and` when another pool follows it. Otherwise it starts the next action.
  _parseAdditionalPools(pools) {
    while (this.check("KEYWORD", "and")) {
      const next = this._peekOffset(1);
      if (!next || (next.type !== "IDENT" && next.type !== "KEYWORD") || !isApplyPoolNoun(next.value)) break;
      this.consume("KEYWORD", "and");
      pools.push(resolveApplyPool(this.advance().value));
    }
  }

  // Damage type and pool may appear in either order.
  _parseDealTypeAndPool() {
    const pools = [];
    let damageType = null;
    for (let n = 0; n < 8; n++) {
      const tok = this.peek();
      if (!tok) break;
      if (tok.type === "STRING") {
        if (damageType) break;
        damageType = this.consume("STRING").value;
        continue;
      }
      if (tok.type !== "IDENT" && tok.type !== "KEYWORD") break;
      if (tok.value === "damage") break;
      // The pool helper already consumed `and <pool>`. So we can leave action chains alone.
      if (ALL_TARGETS.has(tok.value) || tok.value === "on" || tok.value === "to" || tok.value === "and") break;

      if (isApplyPoolNoun(tok.value)) {
        if (pools.length) break;
        pools.push(resolveApplyPool(tok.value));
        this.advance();
        this._parseAdditionalPools(pools);
        continue;
      }

      if (damageType) break;
      damageType = tok.value;
      this.advance();
    }
    return { pool: this._packPools(pools), damageType };
  }

  _consumeDamageNoun(after) {
    const token = this.peek();
    if (!["IDENT", "KEYWORD"].includes(token.type) || token.value !== "damage") {
      throw new ParseError(`Expected 'damage' after ${after}, got '${token.value}'`, token);
    }
    this.advance();
  }

  _parseDealHealTail(verb) {
    let pool = null;
    let damageType = null;
    if (verb === "deal") {
      ({ pool, damageType } = this._parseDealTypeAndPool());
    } else {
      pool = this._parseOptionalHealPool();
    }

    // Heal may omit "damage" when the amount comes next.
    if (verb === "heal" && (this.check("NUMBER") || this.check("DICE") || this.check("ACCESSOR"))) {
      return { noun: "damage", pool, damageType: null };
    }

    this._consumeDamageNoun(`'${verb}'`);
    return { noun: "damage", pool, damageType };
  }

  /** Parses the noun for power up/down and dice max up/down: attack|block|evade|defense|damage */
  _parseBonusNoun() {
    const tok = this.peek();
    if ((tok.type === "IDENT" || tok.type === "KEYWORD") && isBonusNoun(tok.value)) {
      this.advance();
      return lookupNoun(tok.value).id;
    }
    throw new ParseError(`Expected bonus noun (attack/block/evade/defense/damage) after verb, got '${tok.value}'`, tok);
  }

  /** Parses the noun for regen: hp|st */
  _parseRegenNoun() {
    const tok = this.peek();
    if ((tok.type === "IDENT" || tok.type === "KEYWORD") && isRegenNoun(tok.value)) {
      this.advance();
      return lookupNoun(tok.value).id;
    }
    throw new ParseError(`Expected a regen noun after 'regen', got '${tok.value}'`, tok);
  }

  // ── Natural language ──────────────────────────────────────────────────────
  parseNaturalStatement() {
    const actions = this.parseNaturalActionChain();
    this.consumeStatementEnd();
    return { type: "Statement", condition: null, actions, polarity: null };
  }

  parseRequireStatement() {
    const pre = this.parseRequireConditionList();
    this.consume("KEYWORD", "then");
    return this.parseThenBody(pre, null, []);
  }

  parseThenBody(preConditions, roll, postConditions) {
    const pre = preConditions ?? [];
    const post = postConditions ?? [];

    if (this.check("KEYWORD", "require")) {
      const more = this.parseRequireConditionList();
      this.consume("KEYWORD", "then");
      if (roll) return this.parseThenBody(pre, roll, [...post, ...more]);
      return this.parseThenBody([...pre, ...more], roll, post);
    }

    if (this.check("KEYWORD", "on") && this._peekOffset(1)?.type === "KEYWORD" && this._peekOffset(1)?.value === "roll") {
      if (roll) {
        throw new ParseError("Only one 'on roll' is allowed per statement", this.peek());
      }
      const parsed = this.parseOnRollHead();
      return this.parseThenBody(pre, parsed.roll, [...post, parsed.condition]);
    }

    // I add a bit of desugaring here for spend.
    if (this.check("KEYWORD", "spend")) {
      const spend = this.parseSpendBody();
      this.consumeStatementEnd();
      const spendPre = roll ? pre : [...pre, spend.condition];
      const spendPost = roll ? [...post, spend.condition] : post;
      const stmt = {
        type: "Statement",
        condition: packConditions(spendPre),
        actions: spend.actions,
        polarity: null,
      };
      if (roll) stmt.roll = roll;
      const packedPost = packConditions(spendPost);
      if (packedPost) stmt.postCondition = packedPost;
      return stmt;
    }

    const actions = this.parseNaturalActionChain();
    this.consumeStatementEnd();
    const stmt = { type: "Statement", condition: packConditions(pre), actions, polarity: null };
    if (roll) stmt.roll = roll;
    const packedPost = packConditions(post);
    if (packedPost) stmt.postCondition = packedPost;
    return stmt;
  }

  parseRequireConditionList() {
    const conditions = [];
    this.consume("KEYWORD", "require");
    conditions.push(this.parseRequireConditionCore());
    while (this.check("KEYWORD", "and")) {
      this.consume("KEYWORD", "and");
      if (this.check("KEYWORD", "require")) this.consume("KEYWORD", "require");
      conditions.push(this.parseRequireConditionCore());
    }
    return conditions;
  }

  parseRequireConditionCore() {
    let lhs, operator, rhs;

    if (this.check("KEYWORD", "the") && this._peekOffset(1)?.type === "KEYWORD" && this._peekOffset(1)?.value === "roll") {
      this.consume("KEYWORD", "the");
      this.consume("KEYWORD", "roll");
      lhs = { type: "ACCESSOR", expr: { type: "Path", segments: ["roll"] } };
      operator = this.consume("OPERATOR").value;
      rhs = this.parseCondRhs(operator);
    } else if (this.check("IDENT", "damage") || (this.check("KEYWORD") && this.peek().value === "damage")) {
      this.advance();
      this.consume("KEYWORD", "from");
      const next = this.peek();
      if (next?.type === "IDENT" && /^attacks?$/i.test(next.value)) {
        this.advance();
        lhs = { type: "ACCESSOR", expr: { type: "Path", segments: ["damage", "attack"] } };
        operator = "==";
        rhs = { type: "NUMBER", value: 1 };
      } else {
        const statusName = this.parseStatusName();
        lhs = { type: "ACCESSOR", expr: { type: "Path", segments: ["damage", "source"] } };
        operator = "==";
        rhs = { type: "IDENT", value: statusName };
      }
    } else if (this.check("NUMBER")) {
      const amount = this.consume("NUMBER").value;
      const tok = this.peek();
      if (!ALL_TARGETS.has(tok.value)) throw new ParseError(`Expected target in 'require', got '${tok.value}'`, tok);
      const tgt = this.consume("KEYWORD").value;
      const sName = this.parseStatusName();
      lhs = { type: "ACCESSOR", expr: { type: "Path", segments: [tgt, "status", sName] } };
      operator = ">=";
      rhs = { type: "NUMBER", value: Number(amount) };
    } else if (
      this.check("ACCESSOR")
      || this.check("VARIABLE")
      || (this.check("KEYWORD") && FLAG_KEYWORDS.has(this.peek().value))
    ) {
      return this.parseConditionBody();
    } else {
      throw new ParseError(`Expected accessor, variable, flag, 'the roll', 'damage from', or amount after 'require', got '${this.peek().value}'`, this.peek());
    }

    return { type: "Condition", lhs, operator, rhs };
  }

  parseNaturalActionChain() {
    const actions = [this.parseNaturalAction()];
    while (this.check("KEYWORD", "and")) {
      this.consume("KEYWORD", "and");
      actions.push(this.parseNaturalAction());
    }
    return actions;
  }

  // Accept amount-first and noun-first forms, such as "deal 5 hp damage".
  parseNaturalDealAction() {
    return this._parseNaturalDealOrHealAction("deal");
  }

  parseNaturalHealAction() {
    return this._parseNaturalDealOrHealAction("heal");
  }

  _parseNaturalDealOrHealAction(verb) {
    this.consume("IDENT", verb);

    let pool = null;
    let damageType = null;
    let amount;

    if (this._isAmountAhead()) {
      amount = this._parseOptionalAmount();
      if (verb === "deal") {
        ({ pool, damageType } = this._parseDealTypeAndPool());
        this._consumeDamageNoun("deal amount");
      } else {
        pool = this._parseOptionalHealPool();
        if (this.check("IDENT", "damage") || (this.check("KEYWORD") && this.peek().value === "damage")) {
          this.advance();
        }
      }
    } else if (verb === "deal") {
      ({ pool, damageType } = this._parseDealTypeAndPool());
      this._consumeDamageNoun("'deal'");
      amount = this._parseOptionalAmount();
      if (!amount) {
        throw new ParseError(`Expected amount after 'deal … damage', got '${this.peek().value}'`, this.peek());
      }
    } else {
      pool = this._parseOptionalHealPool();
      if (this.check("IDENT", "damage") || (this.check("KEYWORD") && this.peek().value === "damage")) {
        this.advance();
      }
      amount = this._parseOptionalAmount();
      if (!amount) {
        throw new ParseError(`Expected amount after 'heal', got '${this.peek().value}'`, this.peek());
      }
    }

    let target = verb === "heal" ? "self" : "target";
    const per = this._parseOptionalPerAmount();
    const resistanceTiming = verb === "deal"
      ? this._parseOptionalResistanceTiming("after")
      : null;
    const explicitTarget = this._parseOptionalOnOrToTarget();
    if (explicitTarget) target = explicitTarget;

    return {
      type: "Action",
      verb,
      noun: "damage",
      argument: null,
      amount,
      per,
      target,
      pool,
      damageType,
      ...(resistanceTiming ? { resistanceTiming } : {}),
    };
  }

  _parseOptionalHealPool() {
    const tok = this.peek();
    if ((tok.type === "IDENT" || tok.type === "KEYWORD") && isApplyPoolNoun(tok.value)) {
      const pools = [resolveApplyPool(tok.value)];
      this.advance();
      this._parseAdditionalPools(pools);
      return this._packPools(pools);
    }
    return null;
  }

  parseNaturalSetAction() {
    this.consume("IDENT", "set");

    if (this._isSetResistanceAhead()) {
      return this._parseSetResistanceTail();
    }

    let amount;
    let nounHit;
    let isPool = false;
    let statusName = null;

    if (this._isAmountAhead() || this._isUnaryMinusAhead()) {
      amount = this._parseAmountExpr({ required: true });
      const nameTok = this.peek();
      if ((nameTok.type === "IDENT" || nameTok.type === "KEYWORD") && isApplyPoolNoun(nameTok.value)) {
        if (!nounAllowsOp(nameTok.value, "set")) {
          throw new ParseError(`'set' is not allowed on '${nameTok.value}'`, nameTok);
        }
        isPool = true;
        nounHit = lookupNoun(nameTok.value);
        this.advance();
      } else if ((nameTok.type === "IDENT" || nameTok.type === "KEYWORD") && isResourceNoun(nameTok.value)) {
        nounHit = this._parseSetResourceNoun();
      } else {
        statusName = this.parseStatusName();
      }
    } else {
      const nameTok = this.peek();
      if ((nameTok.type === "IDENT" || nameTok.type === "KEYWORD") && isApplyPoolNoun(nameTok.value)) {
        if (!nounAllowsOp(nameTok.value, "set")) {
          throw new ParseError(`'set' is not allowed on '${nameTok.value}'`, nameTok);
        }
        isPool = true;
        nounHit = lookupNoun(nameTok.value);
        this.advance();
        this.consume("KEYWORD", "to");
        amount = this._parseSetAmountOrMax({ allowMax: true });
      } else if ((nameTok.type === "IDENT" || nameTok.type === "KEYWORD") && isResourceNoun(nameTok.value)) {
        nounHit = this._parseSetResourceNoun();
        this.consume("KEYWORD", "to");
        amount = this._parseSetAmountOrMax({ allowMax: false });
      } else {
        statusName = this.parseStatusName();
        this.consume("KEYWORD", "to");
        amount = this._parseAmountExpr({ required: true });
      }
    }

    if (statusName != null) {
      return {
        type: "Action",
        verb: "set",
        noun: "status",
        argument: statusName,
        amount,
        per: null,
        target: this._parseOptionalOnOrToTarget() ?? "self",
        pool: null,
      };
    }

    return {
      type: "Action",
      verb: "set",
      noun: isPool ? "pool" : "resource",
      argument: nounHit.id,
      amount,
      per: null,
      target: this._parseOptionalOnOrToTarget() ?? "self",
      pool: isPool ? nounHit.id : null,
    };
  }

  /** `max` reads the current pool maximum. */
  _parseSetAmountOrMax({ allowMax = false } = {}) {
    if (allowMax && this.check("KEYWORD", "max")) {
      this.advance();
      return { type: "POOL_MAX" };
    }
    return this._parseAmountExpr({ required: true });
  }

  _isSetResistanceAhead() {
    const t0 = this.peek();
    if (!t0 || (t0.type !== "IDENT" && t0.type !== "KEYWORD")) return false;
    if (isResistanceNoun(t0.value)) return true;
    if (normalizeDamageType(t0.value)) return true;
    const pool = String(t0.value).toLowerCase();
    if (pool === "hp" || pool === "st") {
      const t1 = this._peekOffset(1);
      return !!(t1 && (t1.type === "IDENT" || t1.type === "KEYWORD") && (
        isResistanceNoun(t1.value) || normalizeDamageType(t1.value)
      ));
    }
    return false;
  }

  _parseSetResistanceTail() {
    let damageTypes = null;
    let pools = null;

    const first = this.peek();
    if (normalizeDamageType(first.value)) {
      damageTypes = [normalizeDamageType(first.value)];
      this.advance();
    } else if (String(first.value).toLowerCase() === "hp" || String(first.value).toLowerCase() === "st") {
      pools = [String(first.value).toLowerCase()];
      this.advance();
    }

    const second = this.peek();
    if (second && (second.type === "IDENT" || second.type === "KEYWORD")) {
      if (!damageTypes && normalizeDamageType(second.value)) {
        damageTypes = [normalizeDamageType(second.value)];
        this.advance();
      } else if (!pools && (String(second.value).toLowerCase() === "hp" || String(second.value).toLowerCase() === "st")) {
        pools = [String(second.value).toLowerCase()];
        this.advance();
      }
    }

    const resistTok = this.peek();
    if (!resistTok || (resistTok.type !== "IDENT" && resistTok.type !== "KEYWORD") || !isResistanceNoun(resistTok.value)) {
      throw new ParseError(
        `Expected 'resistance(s)' in set resistance, got '${resistTok?.value}'`,
        resistTok ?? this.peek()
      );
    }
    this.advance();

    this.consume("KEYWORD", "to");

    const levelTok = this.peek();
    if (!levelTok || (levelTok.type !== "IDENT" && levelTok.type !== "KEYWORD")) {
      throw new ParseError(`Expected resistance level after 'to', got '${levelTok?.value}'`, levelTok ?? this.peek());
    }
    const level = normalizeResistanceLevel(levelTok.value);
    if (!level) {
      throw new ParseError(
        `Unknown resistance level '${levelTok.value}' (fatal/weak/normal/endured/ineffective/immune)`,
        levelTok
      );
    }
    this.advance();

    const map = buildResistanceOverrideMap({
      pools: pools ?? ["hp", "st"],
      damageTypes: damageTypes ?? [...DAMAGE_TYPES],
      level,
    });
    if (!map) {
      throw new ParseError("Invalid resistance set (need level and at least one pool/type)", this.peek());
    }

    return {
      type: "Action",
      verb: "set",
      noun: "resistance",
      argument: level,
      amount: null,
      per: null,
      target: this._parseOptionalOnOrToTarget() ?? "self",
      pool: null,
      resistanceOverrides: map,
    };
  }

  _parseSetResourceNoun() {
    const nameTok = this.peek();
    if ((nameTok.type !== "IDENT" && nameTok.type !== "KEYWORD") || !isResourceNoun(nameTok.value)) {
      throw new ParseError(
        `Expected resource, pool, or status for 'set' (hp/st/sp/light, tempHp, maxHp, Critical, …), got '${nameTok.value}'`,
        nameTok
      );
    }
    if (!nounAllowsOp(nameTok.value, "set")) {
      throw new ParseError(`'set' is not allowed on '${nameTok.value}'`, nameTok);
    }
    const resourceHit = lookupNoun(nameTok.value);
    this.advance();
    return resourceHit;
  }

  parseNaturalConvertAction() {
    this.consume("KEYWORD", "convert");

    let amount = null;
    let setAmount = false;
    if (this._isAmountAhead() || this._isUnaryMinusAhead()) {
      amount = this._parseAmountExpr({ required: true });
      setAmount = true;
    }

    this._consumeDamageNoun("'convert'");

    this.consume("KEYWORD", "to");

    let convertKind;
    let convertTo;
    if (this.check("STRING")) {
      convertKind = "damageType";
      convertTo = this.consume("STRING").value;
    } else {
      const destTok = this.peek();
      if (destTok.type !== "IDENT" && destTok.type !== "KEYWORD") {
        throw new ParseError(`Expected pool or damage type after 'convert … to', got '${destTok.value}'`, destTok);
      }
      const raw = destTok.value;
      const poolKey = String(raw).toLowerCase();
      if (isApplyPoolNoun(poolKey)) {
        convertKind = "pool";
        const pools = [resolveApplyPool(poolKey)];
        this.advance();
        this._parseAdditionalPools(pools);
        convertTo = this._packPools(pools);
      } else {
        convertKind = "damageType";
        convertTo = raw;
        this.advance();
      }
    }

    return {
      type: "Action",
      verb: "convert",
      noun: "damage",
      argument: null,
      amount,
      setAmount,
      convertKind,
      convertTo,
      per: null,
      target: null,
      pool: null,
    };
  }

  parseNaturalBurstAction() {
    this.consume("KEYWORD", "burst");
    const statusName = this.parseStatusName();
    const target = this._parseOptionalOnOrToTarget() ?? "self";
    return {
      type: "Action",
      verb: "burst",
      noun: "status",
      argument: statusName,
      amount: null,
      per: null,
      target,
      pool: null,
      damageType: null,
    };
  }

  parseNaturalProcAction() {
    this.consume("KEYWORD", "proc");
    const rawName = this.parseStatusName();
    if (isReservedProcName(rawName)) {
      throw new ParseError(
        `'proc ${rawName}' is reserved; use a lifecycle trigger or pick another name`,
        this.peek()
      );
    }
    const procName = canonicalizeProcName(rawName);
    const target = this._parseOptionalOnOrToTarget() ?? "self";
    const procTarget = this._parseOptionalProcTarget();
    const binds = this._parseOptionalProcWithBinds();
    return {
      type: "Action",
      verb: "proc",
      noun: "proc",
      argument: procName,
      amount: null,
      per: null,
      target,
      procTarget,
      pool: null,
      damageType: null,
      binds,
    };
  }

  parseNaturalInstantAction() {
    this.consume("IDENT", "instant");
    const names = [this.parseStatusName()];
    while (this.check("COMMA")) {
      this.consume("COMMA");
      this.skipNewlines();
      names.push(this.parseStatusName());
    }
    return {
      type: "Action",
      verb: "instant",
      noun: "status",
      argument: names,
      amount: null,
      per: null,
      target: null,
      pool: null,
    };
  }

  _parseOptionalProcWithBinds() {
    if (!this.check("KEYWORD", "with")) return [];
    this.consume("KEYWORD", "with");
    const binds = [];
    for (;;) {
      const amount = this._parseAmountExpr({ required: true });
      this.consume("KEYWORD", "as");
      if (!this.check("IDENT")) {
        throw new ParseError(`Expected bind name after 'as', got '${this.peek().value}'`, this.peek());
      }
      const name = this.consume("IDENT").value;
      if (isReservedProcBindName(name)) {
        throw new ParseError(
          `'${name}' is reserved and cannot be a proc bind name`,
          this.peek()
        );
      }
      binds.push({ name, amount });
      if (!this.check("COMMA")) break;
      this.consume("COMMA");
    }
    if (!binds.length) {
      throw new ParseError("Expected at least one 'with <expr> as <Name>' bind", this.peek());
    }
    return binds;
  }

  parseNaturalMessageAction() {
    if (this.check("KEYWORD", "create")) {
      this.consume("KEYWORD", "create");
      if (!this.check("KEYWORD", "message")) {
        throw new ParseError(
          `Expected 'message' after 'create', got '${this.peek().value}'`,
          this.peek()
        );
      }
    }
    this.consume("KEYWORD", "message");
    if (!this.check("STRING")) {
      throw new ParseError(`Expected message string, got '${this.peek().value}'`, this.peek());
    }
    const template = this.consume("STRING").value;
    if (!String(template).trim()) {
      throw new ParseError("Message text cannot be empty", this.peek());
    }
    const target = this._parseOptionalOnOrToTarget() ?? "self";
    if (!SINGLE_TARGETS.has(target)) {
      throw new ParseError(
        `Expected message speaker (${SINGLE_TARGET_HINT}), got '${target}'`,
        this.peek()
      );
    }
    return {
      type: "Action",
      verb: "message",
      noun: null,
      argument: template,
      amount: null,
      per: null,
      target,
      pool: null,
      damageType: null,
    };
  }

  _isAmountAhead() {
    if (this.check("NUMBER") || this.check("DICE") || this.check("ACCESSOR") || this.check("VARIABLE")) return true;
    if (this.check("STRING")) return true;
    if (this.check("IDENT", "N") || this.check("KEYWORD", "N")) return true;
    if (
      (this.check("KEYWORD") || this.check("IDENT"))
      && EXPR_PATH_ROOTS.has(this.peek().value)
      && this._peekOffset(1)?.type === "DOT"
    ) {
      return true;
    }
    // deal Burn hp damage: status name as amount, not a pool noun
    if (this.check("IDENT") && this._isBareStatusAmountIdent(this.peek().value)) {
      const next = this._peekOffset(1);
      if (!next || next.type === "EOF" || next.type === "SEMICOLON" || next.type === "TRIGGER") {
        return true;
      }
      if (next.type === "MATHOP") return true;
      if (next.type === "KEYWORD" && (next.value === "before" || next.value === "after" || next.value === "and" || next.value === "then" || next.value === "do")) {
        return true;
      }
      if ((next.type === "IDENT" || next.type === "KEYWORD") && (next.value === "damage" || isApplyPoolNoun(next.value))) {
        return true;
      }
    }
    return false;
  }

  parseNaturalAction() {
    if (this.check("KEYWORD", "roll")) return this.parseNaturalRollAction();
    if (this.check("IDENT", "deal")) return this.parseNaturalDealAction();
    if (this.check("IDENT", "heal")) return this.parseNaturalHealAction();
    if (this.check("IDENT", "set")) return this.parseNaturalSetAction();
    if (this.check("IDENT", "instant")) return this.parseNaturalInstantAction();
    if (this.check("KEYWORD", "convert")) return this.parseNaturalConvertAction();
    if (this.check("KEYWORD", "burst")) return this.parseNaturalBurstAction();
    if (this.check("KEYWORD", "proc")) return this.parseNaturalProcAction();
    if (this.check("KEYWORD", "pause")) return this.parseNaturalPauseAction();
    if (this.check("KEYWORD", "advantage") || this.check("KEYWORD", "disadvantage")) {
      return this.parseNaturalAdvantageAction();
    }
    if (this.check("KEYWORD", "create")) {
      const next = this._peekOffset(1);
      if (next?.type === "KEYWORD" && next.value === "message") {
        return this.parseNaturalMessageAction();
      }
      if (next?.type === "KEYWORD" && next.value === "dialog") {
        return this.parseNaturalDialogAction();
      }
      throw new ParseError(
        `Expected 'dialog' or 'message' after 'create', got '${next?.value ?? "end of script"}'`,
        next ?? this.peek()
      );
    }
    if (this.check("KEYWORD", "message")) return this.parseNaturalMessageAction();
    if (this.check("KEYWORD", "dialog")) return this.parseNaturalDialogAction();
    if (
      this.check("KEYWORD", "power")
      || this.check("KEYWORD", "dice")
      || this.check("KEYWORD", "regen")
      || this.check("KEYWORD", "range")
    ) {
      return this.parseSingleAction();
    }

    const verbTok = this.consume("KEYWORD");
    if (!["gain", "lose", "inflict", "reduce", "increase", "halve", "double"].includes(verbTok.value))
      throw new ParseError(`Expected 'gain', 'lose', 'inflict', 'reduce', 'increase', 'halve', 'double', 'convert', 'set', 'deal', 'heal', 'burst', 'proc', 'instant', 'pause', 'advantage', 'disadvantage', 'message', 'dialog', 'power', 'range', 'dice', 'regen', or 'roll', got '${verbTok.value}'`, verbTok);

    if (verbTok.value === "halve" || verbTok.value === "double") {
      return this._desugarStatusScaleAction(verbTok.value);
    }

    if (verbTok.value === "reduce" || verbTok.value === "increase") {
      const pool = this._parseOptionalHealPool();
      this._consumeDamageNoun(`'${verbTok.value}'`);
      if (this.check("KEYWORD", "by")) this.consume("KEYWORD", "by");
      const amount = this._parseAmountExpr({ required: false }) ?? { type: "NUMBER", value: 1 };
      const resistanceTiming = this._parseOptionalResistanceTiming("before");
      return {
        type: "Action",
        verb: verbTok.value,
        noun: "damage",
        argument: null,
        amount,
        per: null,
        target: null,
        pool,
        resistanceTiming,
      };
    }

    if (
      (verbTok.value === "lose" || verbTok.value === "gain")
      && (this.check("KEYWORD", "half") || this.check("KEYWORD", "double"))
    ) {
      const scale = this.consume("KEYWORD").value;
      if (verbTok.value === "lose" && scale !== "half") {
        throw new ParseError(`Expected 'half' after 'lose', got '${scale}'`, this.peek());
      }
      if (verbTok.value === "gain" && scale !== "double") {
        throw new ParseError(`Expected 'double' after 'gain', got '${scale}'`, this.peek());
      }
      if (this.check("KEYWORD", "of")) this.consume("KEYWORD", "of");
      return this._desugarStatusScaleAction(verbTok.value === "lose" ? "halve" : "double");
    }

    if (verbTok.value === "lose" && this.check("KEYWORD", "all")) {
      this.consume("KEYWORD", "all");
      if (this.check("KEYWORD", "of")) this.consume("KEYWORD", "of");
      return this._desugarStatusClearAllAction();
    }

    const amountAhead = (this._isAmountAhead() && !this.check("STRING")) || this._isUnaryMinusAhead();
    let amount = amountAhead
      ? (this._parseOptionalAmount() ?? { type: "NUMBER", value: 1 })
      : { type: "NUMBER", value: 1 };

    const nameTok = this.peek();
    const isResource = (nameTok.type === "IDENT" || nameTok.type === "KEYWORD") && isResourceNoun(nameTok.value);
    if (isResource) {
      const resourceHit = lookupNoun(nameTok.value);
      if (verbTok.value === "inflict")
        throw new ParseError(`'inflict' cannot target resource nouns like '${nameTok.value}'`, nameTok);
      if (!nounAllowsOp(nameTok.value, verbTok.value))
        throw new ParseError(`'${verbTok.value}' is not allowed on resource '${resourceHit.id}'`, verbTok);
      this.advance();

      const tail = this._parseStatusOrResourceTail({ allowTiming: false });

      const verb = verbTok.value === "lose" ? "remove" : "add";
      return {
        type: "Action",
        verb,
        noun: "resource",
        argument: resourceHit.id,
        amount,
        per: tail.per,
        target: tail.target ?? "self",
      };
    }

    const statusName = this.parseStatusName();

    // inflict defaults to "target"; gain/lose default to "self"
    const defaultTarget = verbTok.value === "inflict" ? "target" : "self";
    const tail = this._parseStatusOrResourceTail();

    // Resolve verb → add/remove, baking in the default target
    const verb = verbTok.value === "lose" ? "remove" : "add";

    return {
      type: "Action",
      verb,
      noun: "status",
      argument: statusName,
      amount,
      per: tail.per,
      target: tail.target ?? defaultTarget,
      timing: tail.timing,
    };
  }

  _parseStatusOrResourceTail({ allowTiming = true } = {}) {
    let per = null;
    let timing = null;
    let target = null;

    for (;;) {
      if (!per) {
        const nextPer = this._parseOptionalPerAmount();
        if (nextPer) { per = nextPer; continue; }
      }
      if (allowTiming && !timing) {
        const nextTiming = this._parseOptionalTiming();
        if (nextTiming) { timing = nextTiming; continue; }
      }
      if (!target) {
        const nextTarget = this._parseOptionalOnOrToTarget();
        if (nextTarget) { target = nextTarget; continue; }
      }
      break;
    }

    return { per, timing, target };
  }

  /** Timing may appear before or after the target. */
  _parseOptionalTiming() {
    if (!this.check("KEYWORD", "next")) return null;
    this.consume("KEYWORD", "next");
    if (this.check("KEYWORD", "round")) {
      this.consume("KEYWORD", "round");
      return "round";
    }
    if (this.check("KEYWORD", "turn")) {
      this.consume("KEYWORD", "turn");
      return "turn";
    }
    throw new ParseError(`Expected 'round' or 'turn' after 'next', got '${this.peek().value}'`, this.peek());
  }

  parseNaturalPauseAction() {
    this.consume("KEYWORD", "pause");
    const statusName = this.parseStatusName();
    let timing = this._parseOptionalTiming();
    let target = this._parseOptionalOnOrToTarget() ?? "self";
    if (!timing) timing = this._parseOptionalTiming() ?? "round";
    return {
      type: "Action",
      verb: "pause",
      noun: "status",
      argument: statusName,
      amount: null,
      per: null,
      target,
      timing,
    };
  }

  parseNaturalRollAction() {
    this.consume("KEYWORD", "roll");
    if (!this.check("DICE")) {
      throw new ParseError(`Expected dice formula after 'roll', got '${this.peek().value}'`, this.peek());
    }
    const formula = this.consume("DICE").value;
    let bind = null;
    if (this.check("KEYWORD", "as")) {
      this.consume("KEYWORD", "as");
      if (!(this.check("IDENT") || this.check("KEYWORD"))) {
        throw new ParseError(`Expected bind name after 'roll … as', got '${this.peek().value}'`, this.peek());
      }
      bind = this.advance().value;
    }
    return {
      type: "Action",
      verb: "roll",
      noun: null,
      argument: bind,
      amount: { type: "DICE", value: formula },
      bind,
      per: null,
      target: null,
      pool: null,
    };
  }

  parseNaturalAdvantageAction() {
    const verbTok = this.peek();
    if (!verbTok || (verbTok.value !== "advantage" && verbTok.value !== "disadvantage")) {
      throw new ParseError(`Expected 'advantage' or 'disadvantage', got '${verbTok?.value}'`, verbTok ?? this.peek());
    }
    this.advance();
    return {
      type: "Action",
      verb: verbTok.value,
      noun: null,
      argument: null,
      amount: { type: "NUMBER", value: 1 },
      per: null,
      target: this._parseOptionalOnOrToTarget() ?? "self",
      pool: null,
    };
  }

  // Halving removes ceil(stacks / 2); doubling adds the current stack count.
  _desugarStatusScaleAction(kind) {
    const statusName = this.parseStatusName();
    const target = this._parseOptionalOnOrToTarget() ?? "self";

    const stackPath = { type: "Path", segments: [target, "status", statusName] };
    const amount = kind === "halve"
      ? {
        type: "ACCESSOR",
        expr: {
          type: "BinOp",
          op: "//c",
          left: stackPath,
          right: { type: "Num", value: 2 },
        },
      }
      : { type: "ACCESSOR", expr: stackPath };

    return {
      type: "Action",
      verb: kind === "halve" ? "remove" : "add",
      noun: "status",
      argument: statusName,
      amount,
      per: null,
      target,
    };
  }

  _desugarStatusClearAllAction() {
    const statusName = this.parseStatusName();
    const target = this._parseOptionalOnOrToTarget() ?? "self";
    return {
      type: "Action",
      verb: "remove",
      noun: "status",
      argument: statusName,
      amount: {
        type: "ACCESSOR",
        expr: { type: "Path", segments: [target, "status", statusName] },
      },
      per: null,
      target,
    };
  }

  // ── Spend ─────────────────────────────────────────────────────────────────
  parseSpendStatement() {
    const spend = this.parseSpendBody();
    this.consumeStatementEnd();
    return { type: "Statement", condition: spend.condition, actions: spend.actions, polarity: null };
  }

  parseSpendBody() {
    this.consume("KEYWORD", "spend");

    let spendAmount;
    if (this.check("NUMBER")) {
      spendAmount = { type: "NUMBER", value: Number(this.consume("NUMBER").value) };
    } else if (this.check("DICE")) {
      spendAmount = { type: "DICE", value: this.consume("DICE").value };
    } else if (this.check("ACCESSOR")) {
      spendAmount = { type: "ACCESSOR", expr: parseAccessorExpression(this.consume("ACCESSOR").value) };
    } else {
      throw new ParseError(`Expected amount after 'spend', got '${this.peek().value}'`, this.peek());
    }

    const statusName = this.parseStatusName();

    let spendTarget = "self";
    if (this.check("KEYWORD", "on")) {
      this.consume("KEYWORD", "on");
      const tok = this.peek();
      if (!ALL_TARGETS.has(tok.value)) throw new ParseError(`Expected target after 'on' in spend, got '${tok.value}'`, tok);
      spendTarget = this.consume("KEYWORD").value;
    }

    this.consume("KEYWORD", "to");
    if (this.check("KEYWORD", "do")) this.consume("KEYWORD", "do");
    const gainActions = this.parseNaturalActionChain();

    const condition = {
      type: "Condition",
      lhs: { type: "ACCESSOR", expr: { type: "Path", segments: [spendTarget, "status", statusName] } },
      operator: ">=",
      rhs: spendAmount,
    };

    const loseAction = {
      type: "Action",
      verb: "remove", noun: "status", argument: statusName,
      amount: spendAmount, per: null, target: spendTarget,
    };

    return { condition, actions: [...gainActions, loseAction] };
  }
}

// ── Math-expression parser ────────────────────────────────────────────────────

/** True when a token can begin a factor (so `%` is modulo and not a postfix percent). */
function _canStartExprFactor(tok) {
  if (!tok) return false;
  if (tok.type === "NUMBER" || tok.type === "DICE" || tok.type === "STRING") return true;
  if (tok.type === "LPAREN" || tok.type === "ACCESSOR" || tok.type === "VARIABLE") return true;
  if (tok.type === "IDENT" || tok.type === "KEYWORD") return true;
  if (tok.type === "MATHOP" && tok.value === "-") return true;
  return false;
}

export function parseAccessorExpression(raw) {
  const tokens = tokenizeExpression(raw);
  const ep = new ExprParser(tokens);
  const node = ep.parseExpr();
  ep.expect("EOF");
  return node;
}

class ExprParser {
  constructor(tokens) { this.tokens = tokens; this.pos = 0; }

  peek() { return this.tokens[this.pos]; }

  expect(type, value) {
    const tok = this.tokens[this.pos];
    if (tok.type !== type || (value !== undefined && tok.value !== value))
      throw new ParseError(`Expected ${type}${value ? ` '${value}'` : ""} in expression, got ${tok.type} ('${tok.value}')`, tok);
    this.pos++;
    return tok;
  }

  check(type, value) {
    const tok = this.peek();
    return tok.type === type && (value === undefined || tok.value === value);
  }

  parseExpr() {
    let node = this.parseTerm();
    while (this.check("MATHOP", "+") || this.check("MATHOP", "-")) {
      const op = this.expect("MATHOP").value;
      node = { type: "BinOp", op, left: node, right: this.parseTerm() };
    }
    return node;
  }

  parseTerm() {
    let node = this.parseFactor();
    while (true) {
      if (
        this.check("MATHOP", "*") || this.check("MATHOP", "/")
        || this.check("MATHOP", "//") || this.check("MATHOP", "//c") || this.check("MATHOP", "//f")
      ) {
        const op = this.expect("MATHOP").value;
        node = { type: "BinOp", op, left: node, right: this.parseFactor() };
        continue;
      }
      if (this.check("MATHOP", "%")) {
        const next = this.tokens[this.pos + 1];
        if (_canStartExprFactor(next)) {
          this.expect("MATHOP");
          node = { type: "BinOp", op: "%", left: node, right: this.parseFactor() };
        } else {
          // Postfix % is pool fill from 0-100 or an existing percent-point value.
          this.expect("MATHOP");
          node = { type: "Percent", expr: node };
        }
        continue;
      }
      break;
    }
    return node;
  }

  parseFactor() {
    if (this.check("MATHOP", "-")) {
      this.expect("MATHOP", "-");
      return { type: "BinOp", op: "-", left: { type: "Num", value: 0 }, right: this.parseFactor() };
    }
    if (this.check("LPAREN")) {
      this.expect("LPAREN");
      const node = this.parseExpr();
      this.expect("RPAREN");
      return node;
    }
    if (this.check("NUMBER")) return { type: "Num",  value: Number(this.expect("NUMBER").value) };
    if (this.check("DICE"))   return { type: "Dice", formula: this.expect("DICE").value };
    if (this.check("VARIABLE")) return { type: "Variable", name: this.expect("VARIABLE").value };
    if (this.check("STRING")) {
      const name = this.expect("STRING").value;
      return { type: "Path", segments: ["self", "status", name] };
    }
    if (this.check("IDENT")) {
      // Bare N is the effect intensity.
      if (this.peek().value === "N") {
        const j = this.pos + 1;
        if (this.tokens[j]?.type !== "DOT") {
          this.expect("IDENT");
          return { type: "EffectN" };
        }
      }
      const segments = [this.expect("IDENT").value];
      while (this.check("DOT")) {
        this.expect("DOT");
        segments.push(this.check("STRING") ? this.expect("STRING").value : this.expect("IDENT").value);
      }
      // Named roll binds take precedence over status stacks.
      return { type: "Path", segments };
    }
    throw new ParseError(`Unexpected token in expression: '${this.peek().value}'`, this.peek());
  }
}

export class ParseError extends Error {
  constructor(message, token) {
    super(`[EasyEffects Parser] ${message} (token: ${JSON.stringify(token)})`);
    this.token = token;
  }
}