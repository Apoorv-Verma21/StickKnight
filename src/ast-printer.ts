/**
 * ast-printer.ts — turn an AST back into something a human can check.
 *
 * This was the verification tool for the parser: before the interpreter
 * existed, the only way to know that `if a is at least 1 and b is 2:` had
 * been grouped correctly was to print the tree and look at it. It is still
 * what `stickynight --ast` and the playground's AST tab use.
 *
 * Two renderings are provided:
 *   printAst()          a drawn tree, easy to read
 *   toSExpression()     one line per node, easy to assert on in a test
 */

import {
  Expr,
  Program,
  Stmt,
} from "./ast";

// ---------------------------------------------------------------------------
// Drawn tree
// ---------------------------------------------------------------------------

interface Node {
  label: string;
  children: Node[];
}

function node(label: string, ...children: (Node | null)[]): Node {
  return { label, children: children.filter((c): c is Node => c !== null) };
}

/** A labelled group, used for things like "then:" / "otherwise:". */
function group(label: string, statements: Stmt[]): Node {
  return node(label, ...statements.map(stmtNode));
}

export function printAst(program: Program): string {
  const root = node("Program", ...program.statements.map(stmtNode));
  const lines: string[] = [root.label];
  drawChildren(root.children, "", lines);
  return lines.join("\n");
}

function drawChildren(children: Node[], prefix: string, out: string[]): void {
  children.forEach((child, index) => {
    const last = index === children.length - 1;
    out.push(`${prefix}${last ? "└── " : "├── "}${child.label}`);
    drawChildren(child.children, `${prefix}${last ? "    " : "│   "}`, out);
  });
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

function stmtNode(stmt: Stmt): Node {
  switch (stmt.kind) {
    case "Set":
      return node(`Set ${stmt.name.lexeme}`, exprNode(stmt.value));

    case "Change": {
      const target =
        stmt.target.kind === "Variable"
          ? node(`target ${stmt.target.name.lexeme}`)
          : node("target", exprNode(stmt.target));
      return node("Change", target, node("value", exprNode(stmt.value)));
    }

    case "Say":
      return node("Say", exprNode(stmt.value));

    case "Add":
      return node(
        "Add",
        node("value", exprNode(stmt.value)),
        node("to", exprNode(stmt.collection))
      );

    case "If": {
      const children: Node[] = [
        node("condition", exprNode(stmt.condition)),
        group("then", stmt.thenBranch),
      ];
      if (stmt.elseBranch) children.push(group("otherwise", stmt.elseBranch));
      return node("If", ...children);
    }

    case "RepeatTimes":
      return node(
        "RepeatTimes",
        node("count", exprNode(stmt.count)),
        group("body", stmt.body)
      );

    case "RepeatRange": {
      const children: Node[] = [
        node(`counter ${stmt.variable.lexeme}`),
        node("from", exprNode(stmt.start)),
        node("to", exprNode(stmt.end)),
      ];
      if (stmt.step) children.push(node("by", exprNode(stmt.step)));
      children.push(group("body", stmt.body));
      return node("RepeatRange", ...children);
    }

    case "RepeatWhile":
      return node(
        "RepeatWhile",
        node("condition", exprNode(stmt.condition)),
        group("body", stmt.body)
      );

    case "ForEach":
      return node(
        `ForEach ${stmt.variable.lexeme}`,
        node("in", exprNode(stmt.collection)),
        group("body", stmt.body)
      );

    case "Function": {
      const params = stmt.params.map((p) => p.lexeme).join(", ");
      return node(
        `Function ${stmt.name.lexeme}(${params})`,
        group("body", stmt.body)
      );
    }

    case "Return":
      return stmt.value
        ? node("Return", exprNode(stmt.value))
        : node("Return (nothing)");

    case "Stop":
      return node("Stop");

    case "Skip":
      return node("Skip");

    case "Expression":
      return node("Expression", exprNode(stmt.expression));
  }
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

function exprNode(expr: Expr): Node {
  switch (expr.kind) {
    case "Literal":
      return node(`Literal ${formatValue(expr.value)}`);

    case "Variable":
      return node(`Variable ${expr.name.lexeme}`);

    case "Unary":
      return node(`Unary ${expr.operator}`, exprNode(expr.right));

    case "Binary":
      return node(
        `Binary ${expr.operator}`,
        exprNode(expr.left),
        exprNode(expr.right)
      );

    case "Logical":
      return node(
        `Logical ${expr.operator}`,
        exprNode(expr.left),
        exprNode(expr.right)
      );

    case "Call":
      return node(
        "Call",
        node("callee", exprNode(expr.callee)),
        expr.args.length
          ? node("arguments", ...expr.args.map(exprNode))
          : node("arguments (none)")
      );

    case "List":
      return expr.items.length
        ? node("List", ...expr.items.map(exprNode))
        : node("List (empty)");

    case "Index":
      return node(
        "Index",
        node("position", exprNode(expr.index)),
        node("of", exprNode(expr.collection))
      );

    case "Length":
      return node("Length", exprNode(expr.collection));

    case "Grouping":
      return node("Grouping", exprNode(expr.inner));
  }
}

function formatValue(value: number | string | boolean | null): string {
  if (value === null) return "nothing";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

// ---------------------------------------------------------------------------
// S-expressions — compact, and easy to assert on in tests
// ---------------------------------------------------------------------------

export function toSExpression(program: Program): string {
  return program.statements.map(stmtSexp).join("\n");
}

export function exprToSExpression(expr: Expr): string {
  return exprSexp(expr);
}

function stmtSexp(stmt: Stmt): string {
  switch (stmt.kind) {
    case "Set":
      return `(set ${stmt.name.lexeme} ${exprSexp(stmt.value)})`;
    case "Change":
      return `(change ${exprSexp(stmt.target)} ${exprSexp(stmt.value)})`;
    case "Say":
      return `(say ${exprSexp(stmt.value)})`;
    case "Add":
      return `(add ${exprSexp(stmt.value)} ${exprSexp(stmt.collection)})`;
    case "If":
      return `(if ${exprSexp(stmt.condition)} (then ${stmt.thenBranch
        .map(stmtSexp)
        .join(" ")})${
        stmt.elseBranch ? ` (otherwise ${stmt.elseBranch.map(stmtSexp).join(" ")})` : ""
      })`;
    case "RepeatTimes":
      return `(repeat-times ${exprSexp(stmt.count)} ${stmt.body.map(stmtSexp).join(" ")})`;
    case "RepeatRange":
      return `(repeat-range ${stmt.variable.lexeme} ${exprSexp(stmt.start)} ${exprSexp(
        stmt.end
      )}${stmt.step ? ` by ${exprSexp(stmt.step)}` : ""} ${stmt.body.map(stmtSexp).join(" ")})`;
    case "RepeatWhile":
      return `(repeat-while ${exprSexp(stmt.condition)} ${stmt.body.map(stmtSexp).join(" ")})`;
    case "ForEach":
      return `(for-each ${stmt.variable.lexeme} ${exprSexp(stmt.collection)} ${stmt.body
        .map(stmtSexp)
        .join(" ")})`;
    case "Function":
      return `(define ${stmt.name.lexeme} (${stmt.params
        .map((p) => p.lexeme)
        .join(" ")}) ${stmt.body.map(stmtSexp).join(" ")})`;
    case "Return":
      return stmt.value ? `(give-back ${exprSexp(stmt.value)})` : "(give-back)";
    case "Stop":
      return "(stop)";
    case "Skip":
      return "(skip)";
    case "Expression":
      return exprSexp(stmt.expression);
  }
}

function exprSexp(expr: Expr): string {
  switch (expr.kind) {
    case "Literal":
      return formatValue(expr.value);
    case "Variable":
      return expr.name.lexeme;
    case "Unary":
      return `(${expr.operator} ${exprSexp(expr.right)})`;
    case "Binary":
      return `(${expr.operator} ${exprSexp(expr.left)} ${exprSexp(expr.right)})`;
    case "Logical":
      return `(${expr.operator} ${exprSexp(expr.left)} ${exprSexp(expr.right)})`;
    case "Call":
      return `(call ${exprSexp(expr.callee)}${
        expr.args.length ? " " + expr.args.map(exprSexp).join(" ") : ""
      })`;
    case "List":
      return `(list${expr.items.length ? " " + expr.items.map(exprSexp).join(" ") : ""})`;
    case "Index":
      return `(item ${exprSexp(expr.index)} ${exprSexp(expr.collection)})`;
    case "Length":
      return `(length ${exprSexp(expr.collection)})`;
    case "Grouping":
      return exprSexp(expr.inner);
  }
}
