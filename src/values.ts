/**
 * values.ts — what a Stickynight value is at run time.
 *
 * Six kinds, chosen so that a beginner never has to think about the
 * difference between an int and a float, or between a char and a string:
 *
 *   number      42, 3.5          (one numeric type, IEEE-754 double)
 *   text        "hello"
 *   yes/no      yes, no
 *   list        list of 1, 2, 3
 *   definition  anything made with `define`, or a built-in
 *   nothing     nothing          (also what a `define` returns by default)
 */

import { Token } from "./token";

export type Value = number | string | boolean | null | Value[] | Callable;

/**
 * The context a callable is handed. Declared here rather than importing the
 * interpreter so that builtins.ts does not depend on interpreter.ts, which
 * would be a cycle.
 */
export interface CallContext {
  /** Where the call was written, for error positions. */
  readonly callToken: Token;
  /** Raise a runtime error positioned at the call. */
  fail(message: string, hint?: string | null): never;
  /** Print a line, honouring whatever output sink the host installed. */
  output(text: string): void;
}

export interface Callable {
  readonly callableName: string;
  /** Exact number of inputs, or [min, max] when some are optional. */
  readonly arity: number | [number, number];
  /** True for `define`d functions, false for built-ins. */
  readonly isUserDefined: boolean;
  call(args: Value[], context: CallContext): Value;
}

export function isCallable(value: Value): value is Callable {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Callable).call === "function"
  );
}

export function isList(value: Value): value is Value[] {
  return Array.isArray(value);
}

/** The name of a value's type, for use inside a sentence: "a number". */
export function typeName(value: Value): string {
  if (value === null) return "nothing";
  if (typeof value === "number") return "a number";
  if (typeof value === "string") return "some text";
  if (typeof value === "boolean") return "a yes/no value";
  if (isList(value)) return "a list";
  if (isCallable(value)) return "a definition";
  return "an unknown kind of value";
}

/** The bare noun, for `type_of(x)`. */
export function bareTypeName(value: Value): string {
  if (value === null) return "nothing";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "text";
  if (typeof value === "boolean") return "truth";
  if (isList(value)) return "list";
  if (isCallable(value)) return "definition";
  return "unknown";
}

/**
 * Display form of a number.
 *
 * Floating point arithmetic gives 0.1 + 0.2 = 0.30000000000000004, which is
 * a distraction in a language aimed at people meeting arithmetic for the
 * first time. Values are rounded to 12 significant digits for DISPLAY only —
 * the stored value is untouched, so nothing about the arithmetic changes.
 */
export function formatNumber(n: number): string {
  if (Number.isNaN(n)) return "not a number";
  if (n === Infinity) return "infinity";
  if (n === -Infinity) return "-infinity";
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return String(n);
  const rounded = Number(n.toPrecision(12));
  return String(rounded);
}

/**
 * How a value is printed by `say`.
 *
 * Lists print in the same shape they are written in the source, so the output
 * of a program can be pasted straight back into one.
 */
export function stringify(value: Value, seen: Set<Value[]> = new Set()): string {
  if (value === null) return "nothing";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "yes" : "no";

  if (isList(value)) {
    if (seen.has(value)) return "list of (itself)";
    if (value.length === 0) return "empty list";
    seen.add(value);
    const parts = value.map((item) => {
      const text = stringify(item, seen);
      // Nested lists get brackets so the nesting is not lost.
      return isList(item) ? `(${text})` : typeof item === "string" ? JSON.stringify(item) : text;
    });
    seen.delete(value);
    return `list of ${parts.join(", ")}`;
  }

  if (isCallable(value)) {
    return value.isUserDefined
      ? `<definition ${value.callableName}>`
      : `<built-in ${value.callableName}>`;
  }

  return String(value);
}

/**
 * Truthiness.
 *
 * Deliberately strict: only `yes`/`no` count as conditions. Treating 0 or ""
 * as false is a classic source of confusion, and in a language whose whole
 * point is readability there is no reason to inherit it. The interpreter
 * turns anything else into a clear error rather than guessing.
 */
export function isTruthy(value: Value): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

/** Structural equality: two lists are equal when their items are. */
export function valuesEqual(a: Value, b: Value): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;

  if (isList(a) && isList(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => valuesEqual(item, b[index]));
  }

  if (typeof a !== typeof b) return false;
  return a === b;
}

/** Copy used when a list is passed around; see SPEC.md section 7.3. */
export function shallowCopy(value: Value[]): Value[] {
  return value.slice();
}

/** Describe an arity for an error message: "2 inputs", "1 or 2 inputs". */
export function describeArity(arity: number | [number, number]): string {
  if (typeof arity === "number") {
    return arity === 1 ? "1 input" : `${arity} inputs`;
  }
  const [min, max] = arity;
  if (max === Infinity) return `at least ${min} input${min === 1 ? "" : "s"}`;
  return `${min} or ${max} inputs`;
}

export function arityAccepts(arity: number | [number, number], count: number): boolean {
  if (typeof arity === "number") return count === arity;
  return count >= arity[0] && count <= arity[1];
}
