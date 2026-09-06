/**
 * environment.ts — the scope chain (Days 6-7).
 *
 * This is the semantic-analysis half of the project. Stickynight resolves
 * names at run time, so the Environment is where "does this name exist, and
 * which one does it refer to?" is actually answered.
 *
 * Structure: a chain of maps. Each block that introduces names gets its own
 * Environment whose `enclosing` points at the one around it. A lookup walks
 * outwards until it finds the name or runs out of scopes.
 *
 *     global          set total to 0, define add_all
 *       └── add_all   its inputs, plus anything `set` inside it
 *             └── repeat body   the loop counter
 *
 * The two operations are kept apart on purpose:
 *   define() introduces a name HERE          (`set x to 1`)
 *   assign() updates the nearest existing one (`change x to 2`)
 *
 * That split is what makes a mistyped name reportable. In a language where
 * assignment also creates, `change totl to 5` silently makes a second
 * variable and the bug shows up somewhere else entirely.
 */

import { Token } from "./token";
import { CallFrame, closestName, runtimeError, StickynightError } from "./errors";
import { Value } from "./values";

export class Environment {
  private readonly values = new Map<string, Value>();
  public readonly enclosing: Environment | null;
  /** Only for diagnostics: "the main program", "classify", "a repeat block". */
  public readonly label: string;

  constructor(enclosing: Environment | null = null, label = "block") {
    this.enclosing = enclosing;
    this.label = label;
  }

  /** Introduce a name in THIS scope, replacing any earlier one here. */
  define(name: string, value: Value): void {
    this.values.set(name, value);
  }

  /** Is the name bound in this scope or any scope around it? */
  has(name: string): boolean {
    if (this.values.has(name)) return true;
    return this.enclosing ? this.enclosing.has(name) : false;
  }

  /** Is the name bound in THIS scope specifically? */
  hasLocally(name: string): boolean {
    return this.values.has(name);
  }

  /** Read a name, walking outwards. Throws a runtime error if unknown. */
  get(name: Token, stack: CallFrame[] = []): Value {
    let scope: Environment | null = this;
    while (scope !== null) {
      if (scope.values.has(name.lexeme)) {
        return scope.values.get(name.lexeme) as Value;
      }
      scope = scope.enclosing;
    }
    throw this.undefinedNameError(name, stack);
  }

  /** Update the nearest existing binding. Throws if there is not one. */
  assign(name: Token, value: Value, stack: CallFrame[] = []): void {
    let scope: Environment | null = this;
    while (scope !== null) {
      if (scope.values.has(name.lexeme)) {
        scope.values.set(name.lexeme, value);
        return;
      }
      scope = scope.enclosing;
    }
    throw this.undefinedNameError(name, stack, true);
  }

  /** Every name visible from here, innermost first — drives suggestions. */
  visibleNames(): string[] {
    const names: string[] = [];
    let scope: Environment | null = this;
    while (scope !== null) {
      for (const key of scope.values.keys()) {
        if (!names.includes(key)) names.push(key);
      }
      scope = scope.enclosing;
    }
    return names;
  }

  /** Snapshot of just this scope, used by the REPL's `.vars` command. */
  ownEntries(): [string, Value][] {
    return [...this.values.entries()];
  }

  private undefinedNameError(
    name: Token,
    stack: CallFrame[],
    forAssignment = false
  ): StickynightError {
    const suggestion = closestName(name.lexeme, this.visibleNames());

    let hint: string;
    if (suggestion) {
      hint = `Did you mean '${suggestion}'?`;
    } else if (forAssignment) {
      hint = `'change' updates a name that already exists. To create it, write: set ${name.lexeme} to <a value>`;
    } else {
      hint = `Give it a value first, for example: set ${name.lexeme} to 0`;
    }

    return runtimeError(
      `I do not know anything called '${name.lexeme}'.`,
      name.line,
      name.column,
      name.length,
      hint,
      stack
    );
  }
}
