/**
 * ast.ts — Stickynight Abstract Syntax Tree node contract (Day 1 deliverable).
 *
 * The AST is the project's intermediate representation (IR). It is produced by
 * the parser and consumed by THREE independent back ends:
 *
 *   1. src/ast-printer.ts   -> a readable tree, for verification
 *   2. src/interpreter.ts   -> direct tree-walking execution
 *   3. src/wasm/compiler.ts -> WebAssembly code generation
 *
 * Nodes are plain tagged unions (a discriminated union on `kind`) rather than
 * classes with a visitor interface. TypeScript then checks exhaustiveness of
 * every `switch` in every back end at compile time, which is exactly the
 * guarantee a hand-written visitor pattern is trying to buy.
 */

import { Token } from "./token";

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

/** Binary operators, after the parser has folded multi-word phrases. */
export type BinaryOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "mod"
  | "is"            // equality        : a is b
  | "is not"        // inequality      : a is not b
  | "is at least"   // >=
  | "is at most"    // <=
  | "is more than"  // >
  | "is less than"; // <

export type LogicalOperator = "and" | "or";
export type UnaryOperator = "-" | "not";

export interface LiteralExpr {
  kind: "Literal";
  value: number | string | boolean | null;
  token: Token;
}

export interface VariableExpr {
  kind: "Variable";
  name: Token;
}

export interface UnaryExpr {
  kind: "Unary";
  operator: UnaryOperator;
  operatorToken: Token;
  right: Expr;
}

export interface BinaryExpr {
  kind: "Binary";
  operator: BinaryOperator;
  operatorToken: Token;
  left: Expr;
  right: Expr;
}

/** `and` / `or` are separate from Binary because they short-circuit. */
export interface LogicalExpr {
  kind: "Logical";
  operator: LogicalOperator;
  operatorToken: Token;
  left: Expr;
  right: Expr;
}

export interface CallExpr {
  kind: "Call";
  callee: Expr;
  /** The closing ')' — the position blamed for wrong-argument-count errors. */
  paren: Token;
  args: Expr[];
}

/** `list of 1, 2, 3`  /  `empty list` */
export interface ListExpr {
  kind: "List";
  items: Expr[];
  token: Token;
}

/** `item 2 of scores` — 1-based, see SPEC.md section 6.4. */
export interface IndexExpr {
  kind: "Index";
  index: Expr;
  collection: Expr;
  token: Token;
}

/** `length of scores` */
export interface LengthExpr {
  kind: "Length";
  collection: Expr;
  token: Token;
}

/** Parentheses are kept in the tree so the AST printer can round-trip source. */
export interface GroupingExpr {
  kind: "Grouping";
  inner: Expr;
  token: Token;
}

export type Expr =
  | LiteralExpr
  | VariableExpr
  | UnaryExpr
  | BinaryExpr
  | LogicalExpr
  | CallExpr
  | ListExpr
  | IndexExpr
  | LengthExpr
  | GroupingExpr;

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

/** `set name to value` — introduces a binding in the current scope. */
export interface SetStmt {
  kind: "Set";
  name: Token;
  value: Expr;
}

/**
 * `change name to value` / `change item 1 of list to value`
 * Assigns to an EXISTING binding; an unknown name is a runtime error.
 */
export interface ChangeStmt {
  kind: "Change";
  target: VariableExpr | IndexExpr;
  value: Expr;
  keyword: Token;
}

export interface SayStmt {
  kind: "Say";
  value: Expr;
  keyword: Token;
}

/** `add value to list` */
export interface AddStmt {
  kind: "Add";
  value: Expr;
  collection: Expr;
  keyword: Token;
}

export interface IfStmt {
  kind: "If";
  condition: Expr;
  thenBranch: Stmt[];
  /** `otherwise if ...` chains are stored as a nested IfStmt in elseBranch. */
  elseBranch: Stmt[] | null;
  keyword: Token;
}

/** `repeat 5 times:` */
export interface RepeatTimesStmt {
  kind: "RepeatTimes";
  count: Expr;
  body: Stmt[];
  keyword: Token;
}

/** `repeat with i from 1 to 10:` (optional `by step`) */
export interface RepeatRangeStmt {
  kind: "RepeatRange";
  variable: Token;
  start: Expr;
  end: Expr;
  step: Expr | null;
  body: Stmt[];
  keyword: Token;
}

/** `repeat while count is less than 10:` */
export interface RepeatWhileStmt {
  kind: "RepeatWhile";
  condition: Expr;
  body: Stmt[];
  keyword: Token;
}

/** `for each name in collection:` */
export interface ForEachStmt {
  kind: "ForEach";
  variable: Token;
  collection: Expr;
  body: Stmt[];
  keyword: Token;
}

/** `define name with a, b:` */
export interface FunctionStmt {
  kind: "Function";
  name: Token;
  params: Token[];
  body: Stmt[];
  keyword: Token;
}

/** `give back value` (the value is optional) */
export interface ReturnStmt {
  kind: "Return";
  value: Expr | null;
  keyword: Token;
}

/** `stop` — leave the innermost loop. */
export interface StopStmt {
  kind: "Stop";
  keyword: Token;
}

/** `skip` — jump to the next turn of the innermost loop. */
export interface SkipStmt {
  kind: "Skip";
  keyword: Token;
}

/** A bare expression on its own line, e.g. a call made for its side effect. */
export interface ExpressionStmt {
  kind: "Expression";
  expression: Expr;
}

export type Stmt =
  | SetStmt
  | ChangeStmt
  | SayStmt
  | AddStmt
  | IfStmt
  | RepeatTimesStmt
  | RepeatRangeStmt
  | RepeatWhileStmt
  | ForEachStmt
  | FunctionStmt
  | ReturnStmt
  | StopStmt
  | SkipStmt
  | ExpressionStmt;

/** The root of every parsed file. */
export interface Program {
  kind: "Program";
  statements: Stmt[];
}

// ---------------------------------------------------------------------------
// Source-position helpers
// ---------------------------------------------------------------------------

/** The token that best identifies where an expression starts (for errors). */
export function exprToken(expr: Expr): Token {
  switch (expr.kind) {
    case "Literal":
      return expr.token;
    case "Variable":
      return expr.name;
    case "Unary":
      return expr.operatorToken;
    case "Binary":
      return expr.operatorToken;
    case "Logical":
      return expr.operatorToken;
    case "Call":
      return expr.paren;
    case "List":
      return expr.token;
    case "Index":
      return expr.token;
    case "Length":
      return expr.token;
    case "Grouping":
      return expr.token;
  }
}

/** The token that best identifies where a statement starts (for errors). */
export function stmtToken(stmt: Stmt): Token {
  switch (stmt.kind) {
    case "Set":
      return stmt.name;
    case "Change":
      return stmt.keyword;
    case "Say":
      return stmt.keyword;
    case "Add":
      return stmt.keyword;
    case "If":
      return stmt.keyword;
    case "RepeatTimes":
      return stmt.keyword;
    case "RepeatRange":
      return stmt.keyword;
    case "RepeatWhile":
      return stmt.keyword;
    case "ForEach":
      return stmt.keyword;
    case "Function":
      return stmt.name;
    case "Return":
      return stmt.keyword;
    case "Stop":
      return stmt.keyword;
    case "Skip":
      return stmt.keyword;
    case "Expression":
      return exprToken(stmt.expression);
  }
}
