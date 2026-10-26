/**
 * assistant/explain.ts — turning a parsed program back into English.
 *
 * The assistant does not guess what a program does by looking at the text. It
 * parses the program with the real parser and then walks the resulting AST,
 * producing one sentence per node.
 *
 * That makes this a FOURTH consumer of the tree, alongside the printer, the
 * interpreter and the code generator — and it is the one that most clearly
 * shows what an AST is for. Reading the source would need its own parser;
 * walking the tree is a switch over thirteen statement kinds.
 *
 * The output is deliberately prose rather than a tree. `--ast` already prints
 * the structure; this answers the different question of what the program
 * actually does.
 */

import {
  BinaryOperator,
  Expr,
  Program,
  Stmt,
} from "../ast";
import { formatNumber } from "../values";

// ---------------------------------------------------------------------------
// Expressions, described inline
// ---------------------------------------------------------------------------

const COMPARISON_WORDS: Partial<Record<BinaryOperator, string>> = {
  is: "is the same as",
  "is not": "is not",
  "is at least": "is at least",
  "is at most": "is at most",
  "is more than": "is more than",
  "is less than": "is less than",
};

const ARITHMETIC_WORDS: Partial<Record<BinaryOperator, string>> = {
  "+": "plus",
  "-": "minus",
  "*": "times",
  "/": "divided by",
  mod: "remainder after dividing by",
};

/** Join a list of phrases as English would: "a, b and c". */
function series(parts: string[]): string {
  if (parts.length === 0) return "nothing";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function describeExpr(expr: Expr): string {
  switch (expr.kind) {
    case "Literal": {
      const value = expr.value;
      if (value === null) return "nothing";
      if (typeof value === "string") return `the text ${JSON.stringify(value)}`;
      if (typeof value === "boolean") return value ? "yes" : "no";
      return formatNumber(value);
    }

    case "Variable":
      return `'${expr.name.lexeme}'`;

    case "Grouping":
      return describeExpr(expr.inner);

    case "Unary":
      return expr.operator === "not"
        ? `the opposite of (${describeExpr(expr.right)})`
        : `minus ${describeExpr(expr.right)}`;

    case "Logical":
      return `${describeExpr(expr.left)} ${expr.operator} ${describeExpr(expr.right)}`;

    case "Binary": {
      const comparison = COMPARISON_WORDS[expr.operator];
      if (comparison) {
        return `${describeExpr(expr.left)} ${comparison} ${describeExpr(expr.right)}`;
      }
      const arithmetic = ARITHMETIC_WORDS[expr.operator] ?? expr.operator;
      return `${describeExpr(expr.left)} ${arithmetic} ${describeExpr(expr.right)}`;
    }

    case "Call": {
      const name =
        expr.callee.kind === "Variable" ? `'${expr.callee.name.lexeme}'` : "it";
      if (expr.args.length === 0) return `the result of calling ${name}`;
      return `the result of calling ${name} with ${series(expr.args.map(describeExpr))}`;
    }

    case "List":
      return expr.items.length === 0
        ? "an empty list"
        : `a list of ${series(expr.items.map(describeExpr))}`;

    case "Index":
      return `item ${describeExpr(expr.index)} of ${describeExpr(expr.collection)}`;

    case "Length":
      return `how long ${describeExpr(expr.collection)} is`;
  }
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

function indent(depth: number): string {
  return "  ".repeat(depth);
}

function block(statements: Stmt[], depth: number, out: string[]): void {
  for (const statement of statements) describeStmt(statement, depth, out);
}

function describeStmt(stmt: Stmt, depth: number, out: string[]): void {
  const pad = indent(depth);

  switch (stmt.kind) {
    case "Set":
      out.push(`${pad}Give '${stmt.name.lexeme}' the value ${describeExpr(stmt.value)}.`);
      return;

    case "Change": {
      const target =
        stmt.target.kind === "Variable"
          ? `'${stmt.target.name.lexeme}'`
          : describeExpr(stmt.target);
      out.push(`${pad}Change ${target} to ${describeExpr(stmt.value)}.`);
      return;
    }

    case "Say":
      out.push(`${pad}Print ${describeExpr(stmt.value)}.`);
      return;

    case "Add":
      out.push(
        `${pad}Add ${describeExpr(stmt.value)} to the end of ${describeExpr(stmt.collection)}.`
      );
      return;

    case "If": {
      out.push(`${pad}If ${describeExpr(stmt.condition)}, then:`);
      block(stmt.thenBranch, depth + 1, out);
      // An `otherwise if` chain is stored as a nested If inside the else
      // branch. Walking the chain iteratively flattens it back out, so a
      // four-arm decision reads as four arms rather than as three nested
      // decisions.
      let current: Extract<Stmt, { kind: "If" }> = stmt;
      for (;;) {
        const elseBranch = current.elseBranch;
        if (!elseBranch) break;

        const only = elseBranch.length === 1 ? elseBranch[0] : null;
        if (only && only.kind === "If") {
          out.push(`${pad}Otherwise, if ${describeExpr(only.condition)}, then:`);
          block(only.thenBranch, depth + 1, out);
          current = only;
          continue;
        }

        out.push(`${pad}Otherwise:`);
        block(elseBranch, depth + 1, out);
        break;
      }
      return;
    }

    case "RepeatTimes":
      out.push(`${pad}Repeat ${describeExpr(stmt.count)} times:`);
      block(stmt.body, depth + 1, out);
      return;

    case "RepeatRange": {
      const step = stmt.step ? `, in steps of ${describeExpr(stmt.step)}` : "";
      out.push(
        `${pad}Count '${stmt.variable.lexeme}' from ${describeExpr(stmt.start)} to ${describeExpr(stmt.end)}${step}, and each time:`
      );
      block(stmt.body, depth + 1, out);
      return;
    }

    case "RepeatWhile":
      out.push(`${pad}Keep going while ${describeExpr(stmt.condition)}:`);
      block(stmt.body, depth + 1, out);
      return;

    case "ForEach":
      out.push(
        `${pad}For every '${stmt.variable.lexeme}' in ${describeExpr(stmt.collection)}:`
      );
      block(stmt.body, depth + 1, out);
      return;

    case "Function": {
      const inputs = stmt.params.length
        ? `, taking ${series(stmt.params.map((p) => `'${p.lexeme}'`))}`
        : ", taking no input";
      out.push(`${pad}Define '${stmt.name.lexeme}'${inputs}:`);
      block(stmt.body, depth + 1, out);
      return;
    }

    case "Return":
      out.push(
        stmt.value
          ? `${pad}Give back ${describeExpr(stmt.value)}.`
          : `${pad}Give back nothing.`
      );
      return;

    case "Stop":
      out.push(`${pad}Leave the loop.`);
      return;

    case "Skip":
      out.push(`${pad}Move on to the next turn of the loop.`);
      return;

    case "Expression":
      out.push(`${pad}Work out ${describeExpr(stmt.expression)}.`);
      return;
  }
}

// ---------------------------------------------------------------------------
// Whole programs
// ---------------------------------------------------------------------------

/** Counts used for the one-line summary. */
export interface Shape {
  statements: number;
  definitions: number;
  loops: number;
  conditionals: number;
  prints: number;
}

export function shapeOf(program: Program): Shape {
  const shape: Shape = {
    statements: program.statements.length,
    definitions: 0,
    loops: 0,
    conditionals: 0,
    prints: 0,
  };

  const walk = (statements: Stmt[]): void => {
    for (const statement of statements) {
      switch (statement.kind) {
        case "Function":
          shape.definitions++;
          walk(statement.body);
          break;
        case "RepeatTimes":
        case "RepeatRange":
        case "RepeatWhile":
        case "ForEach":
          shape.loops++;
          walk(statement.body);
          break;
        case "If":
          shape.conditionals++;
          walk(statement.thenBranch);
          if (statement.elseBranch) walk(statement.elseBranch);
          break;
        case "Say":
          shape.prints++;
          break;
        default:
          break;
      }
    }
  };

  walk(program.statements);
  return shape;
}

function countPhrase(n: number, one: string, many: string): string | null {
  if (n === 0) return null;
  return `${n} ${n === 1 ? one : many}`;
}

/** A single sentence describing the size and shape of a program. */
export function summarise(program: Program): string {
  const shape = shapeOf(program);
  const parts = [
    countPhrase(shape.definitions, "definition", "definitions"),
    countPhrase(shape.loops, "loop", "loops"),
    countPhrase(shape.conditionals, "decision", "decisions"),
    countPhrase(shape.prints, "printed line", "printed lines"),
  ].filter((p): p is string => p !== null);

  const top = `${shape.statements} top-level ${shape.statements === 1 ? "statement" : "statements"}`;
  return parts.length === 0 ? top : `${top}, containing ${series(parts)}`;
}

/** The full walk-through, one line per statement. */
export function explainProgram(program: Program): string {
  if (program.statements.length === 0) {
    return "The program is empty — there is nothing for it to do yet.";
  }

  const lines: string[] = [];
  block(program.statements, 0, lines);

  return [`This program has ${summarise(program)}.`, "", ...lines].join("\n");
}
