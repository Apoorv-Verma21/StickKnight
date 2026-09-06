/**
 * wasm/compiler.ts — the code-generation back end (Days 9-10, stretch goal).
 *
 * Walks the SAME AST the interpreter walks, but instead of computing values it
 * emits WebAssembly instructions. Putting a second consumer on the AST is the
 * point of the exercise: it is what shows the tree really is an intermediate
 * representation and not just an interpreter's private data structure.
 *
 * WHAT IT COVERS
 *   numbers, yes/no, arithmetic, comparisons, and/or/not,
 *   if / otherwise if / otherwise,
 *   all three repeat forms, stop and skip,
 *   define / give back, calls and recursion,
 *   say (through an imported function),
 *   the numeric built-ins that map onto a single WebAssembly instruction.
 *
 * WHAT IT DOES NOT
 *   text, lists, `for each`, and nested definitions. Those need a heap,
 *   a string representation and closure conversion, which is a whole project
 *   of its own. Programs that use them get a clear message naming the feature
 *   and pointing back at the interpreter, which runs everything.
 *
 * THREE THINGS THE LOWERING HAS TO SOLVE
 *
 *  1. TYPES. WebAssembly has no boolean and no dynamic type. Every value
 *     becomes an f64; yes/no becomes 1.0 / 0.0. Comparisons produce an i32, so
 *     they are widened back with f64.convert_i32_u whenever the result is used
 *     as a value rather than as a condition.
 *
 *  2. SCOPES. WebAssembly locals are flat across a whole function, but
 *     Stickynight blocks shadow. Names are therefore alpha-renamed: a `set`
 *     inside a loop that reuses an outer name gets its own slot (`total~1`),
 *     so the compiled program keeps the interpreter's scoping exactly.
 *
 *  3. BRANCH DEPTHS. `br` takes the number of enclosing labels to jump out
 *     of, so `stop` inside two ifs inside a loop is a different number from
 *     `stop` written directly in the loop body. The generator tracks the label
 *     depth as it walks and subtracts, which is why loops nest correctly.
 */

import {
  Expr,
  FunctionStmt,
  Program,
  Stmt,
} from "../ast";
import { codegenError, StickynightError } from "../errors";
import { Token } from "../token";
import {
  Instr,
  WasmFunction,
  WasmGlobal,
  WasmModule,
  WasmParam,
} from "./ir";

/** Numeric built-ins that lower to a single instruction. */
const INTRINSICS: Record<string, { arity: number; instrs: Instr[] }> = {
  square_root: { arity: 1, instrs: [{ op: "f64.sqrt" }] },
  absolute: { arity: 1, instrs: [{ op: "f64.abs" }] },
  floor: { arity: 1, instrs: [{ op: "f64.floor" }] },
  ceiling: { arity: 1, instrs: [{ op: "f64.ceil" }] },
  round: { arity: 1, instrs: [{ op: "f64.nearest" }] },
  minimum: { arity: 2, instrs: [{ op: "f64.min" }] },
  maximum: { arity: 2, instrs: [{ op: "f64.max" }] },
};

/** A loop we are currently inside, and where its two exits live. */
interface LoopContext {
  /** Label depth just inside the loop's surrounding block — `stop` goes here. */
  breakDepth: number;
  /** Label depth just inside the per-turn block — `skip` goes here. */
  continueDepth: number;
}

/** One lexical scope: source name -> WebAssembly slot name. */
type Scope = Map<string, string>;

export class WasmCompiler {
  private readonly globals: WasmGlobal[] = [];
  private readonly functions: WasmFunction[] = [];
  private readonly notes: string[] = [];

  /** Signatures of every user definition, for arity checking at compile time. */
  private readonly signatures = new Map<string, FunctionStmt>();

  // --- per-function state -------------------------------------------------
  private locals: WasmParam[] = [];
  private scopes: Scope[] = [];
  private loops: LoopContext[] = [];
  private labelDepth = 0;
  private slotCounter = new Map<string, number>();
  private currentFunction = "the main program";
  private currentParams = new Set<string>();
  private scratchCount = 0;

  compile(program: Program): WasmModule {
    // Pass 1: every definition is visible everywhere, matching the
    // interpreter's hoisting rule.
    for (const stmt of program.statements) {
      if (stmt.kind === "Function") {
        this.signatures.set(stmt.name.lexeme, stmt);
      }
    }

    // Pass 2: top-level `set` names become mutable globals. Their values are
    // computed in main, because a WebAssembly global initialiser has to be a
    // constant and `set total to a + b` is not.
    const globalScope: Scope = new Map();
    for (const stmt of program.statements) {
      if (stmt.kind === "Set" && !globalScope.has(stmt.name.lexeme)) {
        const slot = stmt.name.lexeme;
        globalScope.set(slot, slot);
        this.globals.push({ name: slot, type: "f64", mutable: true, init: 0 });
      }
    }

    // Pass 3: compile every definition.
    for (const stmt of program.statements) {
      if (stmt.kind === "Function") {
        this.functions.push(this.compileFunction(stmt, globalScope));
      }
    }

    // Pass 4: everything else becomes the body of `main`.
    this.beginFunction("the main program");
    this.scopes = [globalScope];
    const body: Instr[] = [];
    for (const stmt of program.statements) {
      if (stmt.kind === "Function") continue;
      this.statement(stmt, body);
    }

    this.functions.push({
      name: "main",
      sourceName: "the main program",
      params: [],
      locals: this.locals,
      results: [],
      body,
      exported: true,
    });

    this.notes.push(
      "Every value is an f64. yes/no are 1 and 0.",
      "say(...) is imported from the host; the host prints what it is handed.",
      "round() uses f64.nearest, which settles a .5 towards the even number."
    );

    return {
      imports: [
        {
          module: "stickynight",
          field: "say",
          name: "say",
          params: ["f64"],
          results: [],
        },
      ],
      globals: this.globals,
      functions: this.functions,
      notes: this.notes,
    };
  }

  // =======================================================================
  // Functions
  // =======================================================================

  private compileFunction(stmt: FunctionStmt, globalScope: Scope): WasmFunction {
    this.beginFunction(stmt.name.lexeme);

    const params: WasmParam[] = stmt.params.map((p) => ({
      name: p.lexeme,
      type: "f64" as const,
    }));

    const scope: Scope = new Map();
    for (const param of stmt.params) {
      scope.set(param.lexeme, param.lexeme);
      this.slotCounter.set(param.lexeme, 1);
      this.currentParams.add(param.lexeme);
    }

    this.scopes = [globalScope, scope];

    const body: Instr[] = [];
    for (const inner of stmt.body) {
      this.statement(inner, body);
    }

    // A definition that runs off the end produces `nothing`, which this back
    // end represents as 0. The value is unreachable when every path already
    // returned, and WebAssembly accepts it either way.
    body.push({ op: "f64.const", value: 0 });

    return {
      name: stmt.name.lexeme,
      sourceName: stmt.name.lexeme,
      params,
      locals: this.locals,
      results: ["f64"],
      body,
      exported: true,
    };
  }

  private beginFunction(name: string): void {
    this.locals = [];
    this.scopes = [];
    this.loops = [];
    this.labelDepth = 0;
    this.slotCounter = new Map();
    this.currentFunction = name;
    this.currentParams = new Set();
    this.scratchCount = 0;
  }

  // =======================================================================
  // Name resolution — alpha renaming
  // =======================================================================

  /**
   * Introduce a name in the innermost scope.
   *
   * If the name is ALREADY bound in this same scope, the existing slot is
   * reused — `set` twice in one block updates one variable, and a `set` of a
   * parameter's name writes to the parameter. A name bound only in an
   * enclosing scope gets a brand new slot, which is the shadowing case.
   */
  private declare(name: string): string {
    const innermost = this.scopes[this.scopes.length - 1];

    const existing = innermost.get(name);
    if (existing !== undefined) return existing;

    const used = this.slotCounter.get(name) ?? 0;
    const slot = used === 0 ? name : `${name}~${used}`;
    this.slotCounter.set(name, used + 1);

    if (!this.currentParams.has(slot) && !this.locals.some((l) => l.name === slot)) {
      this.locals.push({ name: slot, type: "f64" });
    }

    innermost.set(name, slot);
    return slot;
  }

  /** Find the slot a name currently refers to, innermost scope first. */
  private resolve(name: Token): { slot: string; isGlobal: boolean } {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const slot = this.scopes[i].get(name.lexeme);
      if (slot !== undefined) {
        const isGlobal = i === 0 && this.globals.some((g) => g.name === slot);
        return { slot, isGlobal };
      }
    }

    throw codegenError(
      `I do not know anything called '${name.lexeme}'.`,
      name.line,
      name.column,
      name.length,
      `Give it a value before using it, for example: set ${name.lexeme} to 0`
    );
  }

  /** A temporary slot, for lowering things like `mod` that need two. */
  private scratch(): string {
    const slot = `scratch~${this.scratchCount++}`;
    if (!this.locals.some((l) => l.name === slot)) {
      this.locals.push({ name: slot, type: "f64" });
    }
    return slot;
  }

  private pushScope(): void {
    this.scopes.push(new Map());
  }

  private popScope(): void {
    this.scopes.pop();
  }

  // =======================================================================
  // Statements
  // =======================================================================

  private statement(stmt: Stmt, out: Instr[]): void {
    switch (stmt.kind) {
      case "Set": {
        this.expression(stmt.value, out);
        const slot = this.declare(stmt.name.lexeme);
        const isGlobal =
          this.scopes.length === 1 && this.globals.some((g) => g.name === slot);
        out.push(isGlobal ? { op: "global.set", name: slot } : { op: "local.set", name: slot });
        return;
      }

      case "Change": {
        if (stmt.target.kind !== "Variable") {
          throw this.unsupported(
            stmt.keyword,
            "changing one item of a list",
            "lists"
          );
        }
        this.expression(stmt.value, out);
        const { slot, isGlobal } = this.resolve(stmt.target.name);
        out.push(isGlobal ? { op: "global.set", name: slot } : { op: "local.set", name: slot });
        return;
      }

      case "Say": {
        this.expression(stmt.value, out);
        out.push({ op: "call", name: "say" });
        return;
      }

      case "If":
        return this.ifStatement(stmt, out);

      case "RepeatTimes":
        return this.repeatTimes(stmt, out);

      case "RepeatRange":
        return this.repeatRange(stmt, out);

      case "RepeatWhile":
        return this.repeatWhile(stmt, out);

      case "Return": {
        if (stmt.value) {
          this.expression(stmt.value, out);
        } else {
          out.push({ op: "f64.const", value: 0 });
        }
        out.push({ op: "return" });
        return;
      }

      case "Stop": {
        const loop = this.innermostLoop(stmt.keyword, "stop");
        out.push({
          op: "br",
          depth: this.labelDepth - loop.breakDepth,
          label: "break",
        });
        return;
      }

      case "Skip": {
        const loop = this.innermostLoop(stmt.keyword, "skip");
        out.push({
          op: "br",
          depth: this.labelDepth - loop.continueDepth,
          label: "next",
        });
        return;
      }

      case "Expression": {
        this.expression(stmt.expression, out);
        // A call used as a statement leaves its result behind; drop it.
        // `say` returns nothing, so it is the one case with nothing to drop.
        if (!(stmt.expression.kind === "Call" && this.callReturnsNothing(stmt.expression))) {
          out.push({ op: "drop" });
        }
        return;
      }

      case "Function":
        throw this.unsupported(
          stmt.name,
          "a definition written inside another block",
          "closures"
        );

      case "ForEach":
        throw this.unsupported(stmt.keyword, "'for each'", "lists");

      case "Add":
        throw this.unsupported(stmt.keyword, "'add ... to ...'", "lists");
    }
  }

  private callReturnsNothing(expr: Extract<Expr, { kind: "Call" }>): boolean {
    return expr.callee.kind === "Variable" && expr.callee.name.lexeme === "say";
  }

  private innermostLoop(token: Token, word: string): LoopContext {
    const loop = this.loops[this.loops.length - 1];
    if (!loop) {
      throw codegenError(
        `'${word}' only makes sense inside a repeat.`,
        token.line,
        token.column,
        token.length,
        null
      );
    }
    return loop;
  }

  private ifStatement(stmt: Extract<Stmt, { kind: "If" }>, out: Instr[]): void {
    this.condition(stmt.condition, out);

    this.labelDepth++;
    this.pushScope();
    const thenBody: Instr[] = [];
    for (const inner of stmt.thenBranch) this.statement(inner, thenBody);
    this.popScope();

    let elseBody: Instr[] | null = null;
    if (stmt.elseBranch) {
      this.pushScope();
      elseBody = [];
      for (const inner of stmt.elseBranch) this.statement(inner, elseBody);
      this.popScope();
    }
    this.labelDepth--;

    out.push({ op: "if", result: null, then: thenBody, else: elseBody });
  }

  /**
   * Every loop gets the same three-layer shape, which is what makes `stop`
   * and `skip` uniform:
   *
   *   block $break          <- `stop` jumps out of this
   *     loop $again
   *       <condition>  br_if $break when it is false
   *       block $next       <- `skip` jumps out of this
   *         <body>
   *       end
   *       <step>            <- runs even after a `skip`, which is the point
   *       br $again
   *     end
   *   end
   */
  private emitLoop(
    setup: (out: Instr[]) => void,
    condition: (out: Instr[]) => void,
    body: Stmt[],
    step: (out: Instr[]) => void,
    out: Instr[]
  ): void {
    setup(out);

    const baseDepth = this.labelDepth;
    const breakDepth = baseDepth + 1; // inside block $break
    const continueDepth = baseDepth + 3; // inside block $next

    this.labelDepth = baseDepth + 2; // inside loop $again
    const loopBody: Instr[] = [];

    // Condition, inverted: leave the loop when it is no longer true.
    condition(loopBody);
    loopBody.push({ op: "i32.eqz" });
    loopBody.push({ op: "br_if", depth: this.labelDepth - breakDepth, label: "break" });

    this.labelDepth = continueDepth;
    this.loops.push({ breakDepth, continueDepth });
    this.pushScope();
    const inner: Instr[] = [];
    for (const stmt of body) this.statement(stmt, inner);
    this.popScope();
    this.loops.pop();
    this.labelDepth = baseDepth + 2;

    loopBody.push({ op: "block", label: "next", result: null, body: inner });
    step(loopBody);
    loopBody.push({ op: "br", depth: 0, label: "again" });

    this.labelDepth = baseDepth;

    out.push({
      op: "block",
      label: "break",
      result: null,
      body: [{ op: "loop", label: "again", result: null, body: loopBody }],
    });
  }

  private repeatTimes(stmt: Extract<Stmt, { kind: "RepeatTimes" }>, out: Instr[]): void {
    const counter = this.scratch();
    const limit = this.scratch();

    this.emitLoop(
      (o) => {
        this.expression(stmt.count, o);
        o.push({ op: "local.set", name: limit });
        o.push({ op: "f64.const", value: 0 });
        o.push({ op: "local.set", name: counter });
      },
      (o) => {
        o.push({ op: "local.get", name: counter });
        o.push({ op: "local.get", name: limit });
        o.push({ op: "f64.lt" });
      },
      stmt.body,
      (o) => {
        o.push({ op: "local.get", name: counter });
        o.push({ op: "f64.const", value: 1 });
        o.push({ op: "f64.add" });
        o.push({ op: "local.set", name: counter });
      },
      out
    );
  }

  private repeatRange(stmt: Extract<Stmt, { kind: "RepeatRange" }>, out: Instr[]): void {
    const limit = this.scratch();
    const step = this.scratch();

    // The counter is a real Stickynight name, so it goes through declare()
    // and gets a scope of its own for the duration of the loop.
    this.pushScope();
    const counter = this.declare(stmt.variable.lexeme);

    this.emitLoop(
      (o) => {
        this.expression(stmt.start, o);
        o.push({ op: "local.set", name: counter });
        this.expression(stmt.end, o);
        o.push({ op: "local.set", name: limit });
        if (stmt.step) {
          this.expression(stmt.step, o);
        } else {
          // No `by`: count up, or down when the end is below the start.
          o.push({ op: "local.get", name: counter });
          o.push({ op: "local.get", name: limit });
          o.push({ op: "f64.le" });
          o.push({ op: "if", result: "f64", then: [{ op: "f64.const", value: 1 }], else: [{ op: "f64.const", value: -1 }] });
        }
        o.push({ op: "local.set", name: step });
      },
      (o) => {
        // Counting up ends at `> limit`; counting down ends at `< limit`.
        o.push({ op: "local.get", name: step });
        o.push({ op: "f64.const", value: 0 });
        o.push({ op: "f64.gt" });
        o.push({
          op: "if",
          result: "i32",
          then: [
            { op: "local.get", name: counter },
            { op: "local.get", name: limit },
            { op: "f64.le" },
          ],
          else: [
            { op: "local.get", name: counter },
            { op: "local.get", name: limit },
            { op: "f64.ge" },
          ],
        });
      },
      stmt.body,
      (o) => {
        o.push({ op: "local.get", name: counter });
        o.push({ op: "local.get", name: step });
        o.push({ op: "f64.add" });
        o.push({ op: "local.set", name: counter });
      },
      out
    );

    this.popScope();
  }

  private repeatWhile(stmt: Extract<Stmt, { kind: "RepeatWhile" }>, out: Instr[]): void {
    this.emitLoop(
      () => {},
      (o) => this.condition(stmt.condition, o),
      stmt.body,
      () => {},
      out
    );
  }

  // =======================================================================
  // Expressions
  // =======================================================================

  /** Emit an expression so that it leaves an i32 (0 or 1) on the stack. */
  private condition(expr: Expr, out: Instr[]): void {
    // A comparison already produces an i32, so no conversion is needed.
    if (isComparison(expr)) {
      this.expressionRaw(expr, out);
      return;
    }
    if (expr.kind === "Grouping") return this.condition(expr.inner, out);
    if (expr.kind === "Unary" && expr.operator === "not") {
      this.condition(expr.right, out);
      out.push({ op: "i32.eqz" });
      return;
    }
    if (expr.kind === "Logical") {
      // Short-circuit, so the compiled program agrees with the interpreter:
      //   a and b  ->  if a then b else 0
      //   a or  b  ->  if a then 1 else b
      this.condition(expr.left, out);
      this.labelDepth++;
      const right: Instr[] = [];
      this.condition(expr.right, right);
      this.labelDepth--;

      out.push(
        expr.operator === "and"
          ? { op: "if", result: "i32", then: right, else: [{ op: "i32.const", value: 0 }] }
          : { op: "if", result: "i32", then: [{ op: "i32.const", value: 1 }], else: right }
      );
      return;
    }

    // Anything else is a value: it is true when it is not 0.
    this.expression(expr, out);
    out.push({ op: "f64.const", value: 0 });
    out.push({ op: "f64.ne" });
  }

  /** Emit an expression so that it leaves an f64 on the stack. */
  private expression(expr: Expr, out: Instr[]): void {
    if (isComparison(expr) || expr.kind === "Logical" || (expr.kind === "Unary" && expr.operator === "not")) {
      this.condition(expr, out);
      out.push({ op: "f64.convert_i32_u" });
      return;
    }
    this.expressionRaw(expr, out);
  }

  private expressionRaw(expr: Expr, out: Instr[]): void {
    switch (expr.kind) {
      case "Grouping":
        return this.expressionRaw(expr.inner, out);

      case "Literal": {
        if (typeof expr.value === "number") {
          out.push({ op: "f64.const", value: expr.value });
          return;
        }
        if (typeof expr.value === "boolean") {
          out.push({ op: "f64.const", value: expr.value ? 1 : 0 });
          return;
        }
        if (expr.value === null) {
          out.push({ op: "f64.const", value: 0 });
          return;
        }
        throw this.unsupported(expr.token, "text", "text");
      }

      case "Variable": {
        const { slot, isGlobal } = this.resolve(expr.name);
        out.push(isGlobal ? { op: "global.get", name: slot } : { op: "local.get", name: slot });
        return;
      }

      case "Unary": {
        if (expr.operator === "-") {
          this.expression(expr.right, out);
          out.push({ op: "f64.neg" });
          return;
        }
        // 'not' is handled by expression()/condition().
        this.condition(expr, out);
        out.push({ op: "f64.convert_i32_u" });
        return;
      }

      case "Binary":
        return this.binary(expr, out);

      case "Logical":
        this.condition(expr, out);
        out.push({ op: "f64.convert_i32_u" });
        return;

      case "Call":
        return this.call(expr, out);

      case "List":
        throw this.unsupported(expr.token, "lists", "lists");

      case "Index":
        throw this.unsupported(expr.token, "'item ... of ...'", "lists");

      case "Length":
        throw this.unsupported(expr.token, "'length of ...'", "lists and text");
    }
  }

  private binary(expr: Extract<Expr, { kind: "Binary" }>, out: Instr[]): void {
    const simple: Partial<Record<string, Instr>> = {
      "+": { op: "f64.add" },
      "-": { op: "f64.sub" },
      "*": { op: "f64.mul" },
      "/": { op: "f64.div" },
      is: { op: "f64.eq" },
      "is not": { op: "f64.ne" },
      "is at least": { op: "f64.ge" },
      "is at most": { op: "f64.le" },
      "is more than": { op: "f64.gt" },
      "is less than": { op: "f64.lt" },
    };

    if (expr.operator === "mod") {
      // WebAssembly has no f64 remainder, so it is built by hand:
      //     a mod b  ==  a - b * trunc(a / b)
      const a = this.scratch();
      const b = this.scratch();
      this.expression(expr.left, out);
      out.push({ op: "local.set", name: a });
      this.expression(expr.right, out);
      out.push({ op: "local.set", name: b });

      out.push({ op: "local.get", name: a });
      out.push({ op: "local.get", name: b });
      out.push({ op: "local.get", name: a });
      out.push({ op: "local.get", name: b });
      out.push({ op: "f64.div" });
      out.push({ op: "f64.trunc" });
      out.push({ op: "f64.mul" });
      out.push({ op: "f64.sub" });
      return;
    }

    const instruction = simple[expr.operator];
    if (!instruction) {
      throw this.unsupported(expr.operatorToken, `'${expr.operator}'`, "this operator");
    }

    this.expression(expr.left, out);
    this.expression(expr.right, out);
    out.push(instruction);
  }

  private call(expr: Extract<Expr, { kind: "Call" }>, out: Instr[]): void {
    if (expr.callee.kind !== "Variable") {
      throw this.unsupported(expr.paren, "calling something that is not a plain name", "closures");
    }

    const name = expr.callee.name.lexeme;

    const intrinsic = INTRINSICS[name];
    if (intrinsic) {
      if (expr.args.length !== intrinsic.arity) {
        throw codegenError(
          `'${name}' needs ${intrinsic.arity} input${intrinsic.arity === 1 ? "" : "s"}, but it was given ${expr.args.length}.`,
          expr.paren.line,
          expr.paren.column,
          expr.paren.length,
          null
        );
      }
      for (const arg of expr.args) this.expression(arg, out);
      out.push(...intrinsic.instrs);
      return;
    }

    const declaration = this.signatures.get(name);
    if (!declaration) {
      throw codegenError(
        `The WebAssembly back end does not know anything called '${name}'.`,
        expr.callee.name.line,
        expr.callee.name.column,
        expr.callee.name.length,
        `It can call definitions made with 'define', plus these built-ins: ${Object.keys(INTRINSICS).join(", ")}. The interpreter has the full library.`
      );
    }

    if (declaration.params.length !== expr.args.length) {
      throw codegenError(
        `'${name}' needs ${declaration.params.length} input${declaration.params.length === 1 ? "" : "s"}, but it was given ${expr.args.length}.`,
        expr.paren.line,
        expr.paren.column,
        expr.paren.length,
        declaration.params.length
          ? `Its inputs are: ${declaration.params.map((p) => p.lexeme).join(", ")}`
          : null
      );
    }

    for (const arg of expr.args) this.expression(arg, out);
    out.push({ op: "call", name });
  }

  // =======================================================================
  // Errors
  // =======================================================================

  private unsupported(token: Token, what: string, feature: string): StickynightError {
    return codegenError(
      `The WebAssembly back end cannot compile ${what} yet.`,
      token.line,
      token.column,
      token.length,
      `Compiling ${feature} needs a heap and a value representation, which this back end does not have. The interpreter runs the whole language — use 'stickynight run' for this program.`
    );
  }
}

function isComparison(expr: Expr): boolean {
  return (
    expr.kind === "Binary" &&
    ["is", "is not", "is at least", "is at most", "is more than", "is less than"].includes(
      expr.operator
    )
  );
}

/** AST in, WebAssembly module in IR form out. */
export function compileToWasm(program: Program): WasmModule {
  return new WasmCompiler().compile(program);
}
