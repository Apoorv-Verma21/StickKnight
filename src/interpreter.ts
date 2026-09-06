/**
 * interpreter.ts — the tree-walking evaluator (Days 6-7).
 *
 * Walks the AST produced by the parser and executes it directly. This is the
 * "code generation / execution" stage of the pipeline in its simplest honest
 * form: no bytecode, no machine code, just a recursive walk over the same IR
 * the WebAssembly back end also consumes.
 *
 * Three things here are worth pointing at:
 *
 *  - CONTROL FLOW USES EXCEPTIONS. `give back`, `stop` and `skip` all need to
 *    unwind an arbitrary depth of recursive evaluate() calls. Throwing a
 *    signal object is the standard way to do that in a tree-walker; the
 *    signals are private classes so they can never be confused with errors.
 *
 *  - TYPES ARE CHECKED AT THE POINT OF USE, and every failure produces a
 *    sentence rather than a code. `"5" - 1` says which side was text.
 *
 *  - THE STEP BUDGET. The playground runs programs written by whoever is
 *    typing, so an accidental endless loop has to end in a message rather
 *    than a frozen tab.
 */

import {
  BinaryExpr,
  CallExpr,
  Expr,
  FunctionStmt,
  IndexExpr,
  Program,
  Stmt,
} from "./ast";
import { defineBuiltins } from "./builtins";
import { Environment } from "./environment";
import { CallFrame, runtimeError, StickynightError } from "./errors";
import { Token, TokenType } from "./token";
import {
  arityAccepts,
  CallContext,
  Callable,
  describeArity,
  formatNumber,
  isCallable,
  isList,
  stringify,
  typeName,
  Value,
  valuesEqual,
} from "./values";

// ---------------------------------------------------------------------------
// Control-flow signals (not errors — they never reach the user)
// ---------------------------------------------------------------------------

class ReturnSignal {
  constructor(readonly value: Value) {}
}

class StopSignal {
  constructor(readonly token: Token) {}
}

class SkipSignal {
  constructor(readonly token: Token) {}
}

// ---------------------------------------------------------------------------
// A function the program defined itself
// ---------------------------------------------------------------------------

class StickynightFunction implements Callable {
  readonly isUserDefined = true;

  constructor(
    private readonly declaration: FunctionStmt,
    /**
     * The scope the definition was written in. Capturing it here is what makes
     * closures work: a definition can still see the names that surrounded it
     * long after that block has finished.
     */
    private readonly closure: Environment,
    private readonly interpreter: Interpreter
  ) {}

  get callableName(): string {
    return this.declaration.name.lexeme;
  }

  get arity(): number {
    return this.declaration.params.length;
  }

  get params(): Token[] {
    return this.declaration.params;
  }

  call(args: Value[], _context: CallContext): Value {
    const scope = new Environment(this.closure, this.callableName);
    this.declaration.params.forEach((param, index) => {
      scope.define(param.lexeme, args[index]);
    });

    try {
      this.interpreter.executeBlock(this.declaration.body, scope);
    } catch (signal) {
      if (signal instanceof ReturnSignal) return signal.value;
      throw signal;
    }

    // A definition that never says `give back` produces `nothing`.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface InterpreterOptions {
  /** Where `say` sends its lines. Defaults to stdout. */
  output?: (line: string) => void;
  /**
   * Stop after this many statements. The playground sets a finite budget so a
   * runaway loop reports itself instead of hanging the page.
   */
  maxSteps?: number;
  /** How deep calls may nest before it is reported as runaway recursion. */
  maxDepth?: number;
}

// ---------------------------------------------------------------------------
// The interpreter
// ---------------------------------------------------------------------------

export class Interpreter {
  readonly globals = new Environment(null, "the main program");
  private environment = this.globals;

  private readonly emit: (line: string) => void;
  private readonly maxSteps: number;
  private readonly maxDepth: number;

  private steps = 0;
  private readonly frames: CallFrame[] = [];

  constructor(options: InterpreterOptions = {}) {
    this.emit = options.output ?? ((line) => console.log(line));
    this.maxSteps = options.maxSteps ?? Infinity;
    this.maxDepth = options.maxDepth ?? 250;
    defineBuiltins(this.globals);
  }

  // -----------------------------------------------------------------------
  // Entry point
  // -----------------------------------------------------------------------

  interpret(program: Program): void {
    this.executeBlock(program.statements, this.globals);
  }

  /**
   * Run a list of statements in a given scope.
   *
   * Definitions are hoisted: every `define` in the block is bound before any
   * of the block runs, so a program can call a helper that is written further
   * down the file. Without this, a file has to be read bottom-up, which is
   * the opposite of what a readable language should ask for.
   */
  executeBlock(statements: Stmt[], scope: Environment): void {
    const previous = this.environment;
    this.environment = scope;
    try {
      for (const statement of statements) {
        if (statement.kind === "Function") {
          scope.define(
            statement.name.lexeme,
            new StickynightFunction(statement, scope, this)
          );
        }
      }
      for (const statement of statements) {
        if (statement.kind === "Function") continue;
        this.execute(statement);
      }
    } finally {
      this.environment = previous;
    }
  }

  // -----------------------------------------------------------------------
  // Statements
  // -----------------------------------------------------------------------

  private execute(stmt: Stmt): void {
    if (++this.steps > this.maxSteps) {
      const token = anyToken(stmt);
      throw this.fail(
        token,
        "This program is taking too long to finish.",
        "It is probably stuck in a loop that never ends. Check that the condition of a 'repeat while' eventually becomes 'no'."
      );
    }

    switch (stmt.kind) {
      case "Set":
        this.environment.define(stmt.name.lexeme, this.evaluate(stmt.value));
        return;

      case "Change":
        return this.executeChange(stmt.target, this.evaluate(stmt.value));

      case "Say":
        this.emit(stringify(this.evaluate(stmt.value)));
        return;

      case "Add": {
        const value = this.evaluate(stmt.value);
        const collection = this.evaluate(stmt.collection);
        if (!isList(collection)) {
          throw this.fail(
            stmt.keyword,
            `'add' puts a value into a list, but this is ${typeName(collection)}.`,
            "Make a list first, for example: set scores to empty list"
          );
        }
        collection.push(value);
        return;
      }

      case "If": {
        if (this.condition(stmt.condition, "if")) {
          this.executeBlock(stmt.thenBranch, new Environment(this.environment, "an if block"));
        } else if (stmt.elseBranch) {
          this.executeBlock(stmt.elseBranch, new Environment(this.environment, "an otherwise block"));
        }
        return;
      }

      case "RepeatTimes":
        return this.executeRepeatTimes(stmt);

      case "RepeatRange":
        return this.executeRepeatRange(stmt);

      case "RepeatWhile": {
        while (this.condition(stmt.condition, "repeat while")) {
          if (this.runLoopBody(stmt.body)) break;
        }
        return;
      }

      case "ForEach":
        return this.executeForEach(stmt);

      case "Function":
        // Hoisted in executeBlock; reaching here means a nested re-run.
        this.environment.define(
          stmt.name.lexeme,
          new StickynightFunction(stmt, this.environment, this)
        );
        return;

      case "Return": {
        if (this.frames.length === 0) {
          throw this.fail(
            stmt.keyword,
            "'give back' only makes sense inside a definition.",
            "It sends a value out of a 'define'. At the top level there is nothing to send it to."
          );
        }
        throw new ReturnSignal(stmt.value ? this.evaluate(stmt.value) : null);
      }

      case "Stop":
        throw new StopSignal(stmt.keyword);

      case "Skip":
        throw new SkipSignal(stmt.keyword);

      case "Expression":
        this.evaluate(stmt.expression);
        return;
    }
  }

  private executeChange(target: Stmt extends never ? never : IndexExpr | { kind: "Variable"; name: Token }, value: Value): void {
    if (target.kind === "Variable") {
      this.environment.assign(target.name, value, this.snapshotFrames());
      return;
    }

    const collection = this.evaluate(target.collection);
    const index = this.evaluate(target.index);
    const position = this.checkIndex(index, collection, target.token);

    if (!isList(collection)) {
      throw this.fail(
        target.token,
        `Only a list can have one of its items changed, but this is ${typeName(collection)}.`,
        typeof collection === "string"
          ? "Text cannot be changed a character at a time. Build a new piece of text instead."
          : null
      );
    }

    collection[position - 1] = value;
  }

  private executeRepeatTimes(stmt: Extract<Stmt, { kind: "RepeatTimes" }>): void {
    const raw = this.evaluate(stmt.count);
    if (typeof raw !== "number") {
      throw this.fail(
        stmt.keyword,
        `'repeat' needs a number of times, but it was given ${typeName(raw)}.`,
        `You gave it: ${stringify(raw)}`
      );
    }
    if (!Number.isInteger(raw) || raw < 0) {
      throw this.fail(
        stmt.keyword,
        `'repeat' needs a whole number of times that is not negative, but it was given ${formatNumber(raw)}.`,
        null
      );
    }

    for (let i = 0; i < raw; i++) {
      if (this.runLoopBody(stmt.body)) break;
    }
  }

  private executeRepeatRange(stmt: Extract<Stmt, { kind: "RepeatRange" }>): void {
    const start = this.numberOperand(stmt.start, stmt.keyword, "the 'from' value of a repeat");
    const end = this.numberOperand(stmt.end, stmt.keyword, "the 'to' value of a repeat");
    const step = stmt.step
      ? this.numberOperand(stmt.step, stmt.keyword, "the 'by' value of a repeat")
      : start <= end
      ? 1
      : -1;

    if (step === 0) {
      throw this.fail(
        stmt.keyword,
        "A repeat cannot count 'by 0' — it would never finish.",
        "Use a step of 1 or more, or -1 to count downwards."
      );
    }

    // Counting 1 to 10 includes both ends: `repeat with i from 1 to 3` runs
    // three times, which is what "from 1 to 3" means in English.
    for (
      let value = start;
      step > 0 ? value <= end : value >= end;
      value += step
    ) {
      const scope = new Environment(this.environment, "a repeat block");
      scope.define(stmt.variable.lexeme, value);
      if (this.runLoopBody(stmt.body, scope)) break;
    }
  }

  private executeForEach(stmt: Extract<Stmt, { kind: "ForEach" }>): void {
    const collection = this.evaluate(stmt.collection);

    let items: Value[];
    if (isList(collection)) {
      // Iterate a snapshot so that adding to the list inside the loop cannot
      // make it run forever.
      items = collection.slice();
    } else if (typeof collection === "string") {
      items = [...collection];
    } else {
      throw this.fail(
        stmt.keyword,
        `'for each' goes through a list or some text, but it was given ${typeName(collection)}.`,
        `You gave it: ${stringify(collection)}`
      );
    }

    for (const item of items) {
      const scope = new Environment(this.environment, "a for each block");
      scope.define(stmt.variable.lexeme, item);
      if (this.runLoopBody(stmt.body, scope)) break;
    }
  }

  /**
   * Run one turn of a loop body. Returns true when the loop should end
   * because of `stop`.
   */
  private runLoopBody(body: Stmt[], scope?: Environment): boolean {
    try {
      this.executeBlock(body, scope ?? new Environment(this.environment, "a repeat block"));
    } catch (signal) {
      if (signal instanceof StopSignal) return true;
      if (signal instanceof SkipSignal) return false;
      throw signal;
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // Expressions
  // -----------------------------------------------------------------------

  evaluate(expr: Expr): Value {
    switch (expr.kind) {
      case "Literal":
        return expr.value;

      case "Grouping":
        return this.evaluate(expr.inner);

      case "Variable":
        return this.environment.get(expr.name, this.snapshotFrames());

      case "List":
        return expr.items.map((item) => this.evaluate(item));

      case "Unary": {
        const right = this.evaluate(expr.right);
        if (expr.operator === "-") {
          if (typeof right !== "number") {
            throw this.fail(
              expr.operatorToken,
              `A minus sign only goes in front of a number, but this is ${typeName(right)}.`,
              `You wrote it in front of: ${stringify(right)}`
            );
          }
          return -right;
        }
        // 'not'
        if (typeof right !== "boolean") {
          throw this.fail(
            expr.operatorToken,
            `'not' only works on yes/no, but this is ${typeName(right)}.`,
            `You wrote it in front of: ${stringify(right)}`
          );
        }
        return !right;
      }

      case "Logical": {
        const left = this.evaluate(expr.left);
        if (typeof left !== "boolean") {
          throw this.fail(
            expr.operatorToken,
            `The left side of '${expr.operator}' has to be yes or no, but it is ${typeName(left)}.`,
            `It was: ${stringify(left)}. A comparison like 'score is at least 50' gives a yes/no value.`
          );
        }

        // Short-circuit: the right side is only looked at when it matters.
        if (expr.operator === "or" && left) return true;
        if (expr.operator === "and" && !left) return false;

        const right = this.evaluate(expr.right);
        if (typeof right !== "boolean") {
          throw this.fail(
            expr.operatorToken,
            `The right side of '${expr.operator}' has to be yes or no, but it is ${typeName(right)}.`,
            `It was: ${stringify(right)}`
          );
        }
        return right;
      }

      case "Binary":
        return this.binary(expr);

      case "Call":
        return this.callExpression(expr);

      case "Index": {
        const collection = this.evaluate(expr.collection);
        const index = this.evaluate(expr.index);
        const position = this.checkIndex(index, collection, expr.token);
        if (typeof collection === "string") return collection[position - 1];
        return (collection as Value[])[position - 1];
      }

      case "Length": {
        const collection = this.evaluate(expr.collection);
        if (typeof collection === "string") return collection.length;
        if (isList(collection)) return collection.length;
        throw this.fail(
          expr.token,
          `'length of' works on a list or on text, but this is ${typeName(collection)}.`,
          `You asked for the length of: ${stringify(collection)}`
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Binary operators
  // -----------------------------------------------------------------------

  private binary(expr: BinaryExpr): Value {
    const left = this.evaluate(expr.left);
    const right = this.evaluate(expr.right);
    const token = expr.operatorToken;

    switch (expr.operator) {
      case "is":
        return valuesEqual(left, right);
      case "is not":
        return !valuesEqual(left, right);

      case "+": {
        // If either side is text, '+' joins. This is the one place the
        // language converts a value for you, and it exists because
        //   say "Score: " + score
        // is the first line half of all beginners write.
        if (typeof left === "string" || typeof right === "string") {
          if (isCallable(left) || isCallable(right)) {
            throw this.fail(
              token,
              "A definition cannot be joined onto text.",
              "Did you mean to call it, by putting () after its name?"
            );
          }
          return stringify(left) + stringify(right);
        }
        if (isList(left) && isList(right)) return [...left, ...right];
        return this.arithmetic(token, operatorWord(token), left, right, (a, b) => a + b);
      }

      case "-":
        return this.arithmetic(token, operatorWord(token), left, right, (a, b) => a - b);

      case "*":
        return this.arithmetic(token, operatorWord(token), left, right, (a, b) => a * b);

      case "/": {
        const result = this.arithmetic(token, operatorWord(token), left, right, (a, b) => {
          if (b === 0) {
            throw this.fail(
              token,
              "A number cannot be divided by zero.",
              "Check the value on the right of the division before doing it."
            );
          }
          return a / b;
        });
        return result;
      }

      case "mod":
        return this.arithmetic(token, operatorWord(token), left, right, (a, b) => {
          if (b === 0) {
            throw this.fail(
              token,
              "'mod' cannot work with zero on the right.",
              "'a mod b' is the remainder after dividing by b, and dividing by zero is not possible."
            );
          }
          return a % b;
        });

      case "is at least":
        return this.compare(token, "is at least", left, right, (a, b) => a >= b);
      case "is at most":
        return this.compare(token, "is at most", left, right, (a, b) => a <= b);
      case "is more than":
        return this.compare(token, "is more than", left, right, (a, b) => a > b);
      case "is less than":
        return this.compare(token, "is less than", left, right, (a, b) => a < b);
    }
  }

  private arithmetic(
    token: Token,
    name: string,
    left: Value,
    right: Value,
    apply: (a: number, b: number) => number
  ): number {
    if (typeof left !== "number" || typeof right !== "number") {
      const culprit = typeof left !== "number" ? left : right;
      const side = typeof left !== "number" ? "left" : "right";

      throw this.fail(
        token,
        `'${name}' works on numbers, but the ${side} side is ${typeName(culprit)}.`,
        typeof culprit === "string"
          ? `That side was ${JSON.stringify(culprit)}. If it holds digits, turn it into a number first: number(${JSON.stringify(culprit)})`
          : `That side was: ${stringify(culprit)}`
      );
    }
    return apply(left, right);
  }

  /**
   * Ordering comparisons work on two numbers or on two pieces of text
   * (dictionary order). Comparing a number with text is an error rather than
   * a silent conversion.
   */
  private compare(
    token: Token,
    name: string,
    left: Value,
    right: Value,
    apply: (a: number | string, b: number | string) => boolean
  ): boolean {
    if (typeof left === "number" && typeof right === "number") return apply(left, right);
    if (typeof left === "string" && typeof right === "string") return apply(left, right);

    if (typeof left !== typeof right) {
      throw this.fail(
        token,
        `'${name}' cannot compare ${typeName(left)} with ${typeName(right)}.`,
        `The two sides were ${stringify(left)} and ${stringify(right)}. Both sides have to be numbers, or both have to be text.`
      );
    }

    throw this.fail(
      token,
      `'${name}' works on numbers or on text, but both sides are ${typeName(left)}.`,
      "Only numbers and text can be put in order."
    );
  }

  // -----------------------------------------------------------------------
  // Calls
  // -----------------------------------------------------------------------

  private callExpression(expr: CallExpr): Value {
    const callee = this.evaluate(expr.callee);
    const args = expr.args.map((arg) => this.evaluate(arg));

    if (!isCallable(callee)) {
      const name = expr.callee.kind === "Variable" ? expr.callee.name.lexeme : "this";
      throw this.fail(
        expr.paren,
        `'${name}' is ${typeName(callee)}, so it cannot be called with ().`,
        "Only something made with 'define', or a built-in, can be called."
      );
    }

    if (!arityAccepts(callee.arity, args.length)) {
      const wanted = describeArity(callee.arity);
      const got = args.length === 1 ? "1" : String(args.length);

      // The commonest way to get here is the greedy list literal: a
      // `list of a, b` written straight inside a call swallows the commas
      // that were meant to separate the inputs.
      const swallowedCommas =
        expr.args.length === 1 &&
        expr.args[0].kind === "List" &&
        expr.args[0].items.length > 1;

      const hint = swallowedCommas
        ? `A 'list of ...' takes every comma that follows it, including the ones meant to separate the inputs — so this counted as one input. Put brackets round the list: ${callee.callableName}((list of ...), ...)`
        : callee.isUserDefined && callee instanceof StickynightFunction && callee.params.length
        ? `Its inputs are: ${callee.params.map((p) => p.lexeme).join(", ")}`
        : null;

      throw this.fail(
        expr.paren,
        `'${callee.callableName}' needs ${wanted}, but it was given ${got}.`,
        hint
      );
    }

    if (this.frames.length >= this.maxDepth) {
      throw this.fail(
        expr.paren,
        `'${callee.callableName}' has called itself ${this.maxDepth} times over without finishing.`,
        "A definition that calls itself needs a case where it stops. Check that the stopping condition is reached."
      );
    }

    const context: CallContext = {
      callToken: expr.paren,
      fail: (message, hint = null) => {
        throw this.fail(expr.paren, message, hint);
      },
      output: (line: string) => this.emit(line),
    };

    this.frames.push({ name: callee.callableName, line: expr.paren.line });
    try {
      return callee.call(args, context);
    } finally {
      this.frames.pop();
    }
  }

  // -----------------------------------------------------------------------
  // Shared checks
  // -----------------------------------------------------------------------

  /** Conditions must be an actual yes/no; nothing else is "truthy". */
  private condition(expr: Expr, context: string): boolean {
    const value = this.evaluate(expr);
    if (typeof value === "boolean") return value;

    throw this.fail(
      tokenOf(expr),
      `${article(context)} '${context}' needs a yes/no value to decide with, but it was given ${typeName(value)}.`,
      typeof value === "number"
        ? `It was ${formatNumber(value)}. A number is not a condition on its own — compare it, as in: ${context} count is more than 0:`
        : `It was: ${stringify(value)}`
    );
  }

  private numberOperand(expr: Expr, blame: Token, what: string): number {
    const value = this.evaluate(expr);
    if (typeof value !== "number") {
      throw this.fail(
        blame,
        `${what} has to be a number, but it is ${typeName(value)}.`,
        `It was: ${stringify(value)}`
      );
    }
    return value;
  }

  /**
   * Positions are 1-based: `item 1 of scores` is the first one. That matches
   * how the word "item" is used outside programming, and it is the single
   * design choice most likely to come up in the viva. The cost is one
   * subtraction here; the benefit is that nobody has to be told about
   * off-by-one before they can print a list.
   */
  private checkIndex(index: Value, collection: Value, token: Token): number {
    if (typeof index !== "number") {
      throw this.fail(
        token,
        `A position has to be a number, but it is ${typeName(index)}.`,
        `You asked for item ${stringify(index)}.`
      );
    }

    if (!Number.isInteger(index)) {
      throw this.fail(
        token,
        `A position has to be a whole number, but it is ${formatNumber(index)}.`,
        `Try item ${Math.round(index)} instead.`
      );
    }

    const size =
      typeof collection === "string"
        ? collection.length
        : isList(collection)
        ? collection.length
        : null;

    if (size === null) {
      throw this.fail(
        token,
        `'item ... of' works on a list or on text, but this is ${typeName(collection)}.`,
        `You tried to take an item out of: ${stringify(collection)}`
      );
    }

    if (index < 1 || index > size) {
      const what = typeof collection === "string" ? "piece of text" : "list";
      throw this.fail(
        token,
        size === 0
          ? `There is no item ${formatNumber(index)} — the ${what} is empty.`
          : `There is no item ${formatNumber(index)} — the ${what} only has ${size} item${size === 1 ? "" : "s"}.`,
        index === 0
          ? "Positions start at 1, so the first item is 'item 1'."
          : `The positions that exist are 1 to ${size}.`
      );
    }

    return index;
  }

  // -----------------------------------------------------------------------
  // Errors
  // -----------------------------------------------------------------------

  private fail(token: Token, message: string, hint: string | null = null): StickynightError {
    return runtimeError(
      message,
      token.line,
      token.column,
      token.length,
      hint,
      this.snapshotFrames()
    );
  }

  /** Innermost-first copy of the call stack, for the error report. */
  private snapshotFrames(): CallFrame[] {
    return this.frames.slice().reverse();
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/**
 * How an operator should be named in a message: the word the programmer
 * actually typed, so that `a times b` is not reported as a problem with '*'.
 */
function operatorWord(token: Token): string {
  if (token.type === TokenType.DIVIDED) return "divided by";
  return token.lexeme;
}

/** 'a' or 'an', so error messages read as English. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "An" : "A";
}

function tokenOf(expr: Expr): Token {
  switch (expr.kind) {
    case "Literal":
      return expr.token;
    case "Variable":
      return expr.name;
    case "Unary":
    case "Binary":
    case "Logical":
      return expr.operatorToken;
    case "Call":
      return expr.paren;
    case "List":
    case "Index":
    case "Length":
    case "Grouping":
      return expr.token;
  }
}

function anyToken(stmt: Stmt): Token {
  switch (stmt.kind) {
    case "Set":
      return stmt.name;
    case "Function":
      return stmt.name;
    case "Expression":
      return tokenOf(stmt.expression);
    default:
      return (stmt as { keyword: Token }).keyword;
  }
}

export { StickynightFunction };
