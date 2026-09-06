/**
 * builtins.ts — the standard library.
 *
 * Every built-in is an ordinary Callable, so from the interpreter's point of
 * view there is no difference between `uppercase(name)` and a function the
 * program defined itself. They live in the global environment, which means a
 * program can shadow one by defining its own — a small thing, but it keeps
 * the rule "a name is just a name" true with no exceptions.
 *
 * Names are spelled out (`square_root`, `random_between`) rather than
 * abbreviated, to match the rest of the language.
 */

import { Environment } from "./environment";
import {
  arityAccepts,
  bareTypeName,
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

class NativeFunction implements Callable {
  readonly isUserDefined = false;

  constructor(
    readonly callableName: string,
    readonly arity: number | [number, number],
    private readonly body: (args: Value[], context: CallContext) => Value,
    readonly description: string
  ) {}

  call(args: Value[], context: CallContext): Value {
    return this.body(args, context);
  }
}

// ---------------------------------------------------------------------------
// Argument checking helpers — one place, so every message reads the same
// ---------------------------------------------------------------------------

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

function ordinal(index: number): string {
  return ORDINALS[index] ?? `${index + 1}th`;
}

function wantNumber(args: Value[], index: number, name: string, ctx: CallContext): number {
  const value = args[index];
  if (typeof value !== "number") {
    ctx.fail(
      `The ${ordinal(index)} input to '${name}' has to be a number, but it was ${typeName(value)}.`,
      `You gave it: ${stringify(value)}`
    );
  }
  return value;
}

function wantText(args: Value[], index: number, name: string, ctx: CallContext): string {
  const value = args[index];
  if (typeof value !== "string") {
    ctx.fail(
      `The ${ordinal(index)} input to '${name}' has to be some text, but it was ${typeName(value)}.`,
      `You gave it: ${stringify(value)}. Use text(...) to turn a value into text first.`
    );
  }
  return value;
}

function wantList(args: Value[], index: number, name: string, ctx: CallContext): Value[] {
  const value = args[index];
  if (!isList(value)) {
    ctx.fail(
      `The ${ordinal(index)} input to '${name}' has to be a list, but it was ${typeName(value)}.`,
      `You gave it: ${stringify(value)}`
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

export const BUILTINS: NativeFunction[] = [
  // --- conversions -------------------------------------------------------
  new NativeFunction("text", 1, (args) => stringify(args[0]), "Turn any value into text."),

  new NativeFunction(
    "number",
    1,
    (args: Value[], ctx: CallContext) => {
      const value = args[0];
      if (typeof value === "number") return value;
      if (typeof value === "boolean") return value ? 1 : 0;
      if (typeof value !== "string") {
        ctx.fail(
          `'number' cannot turn ${typeName(value)} into a number.`,
          "It works on text like \"42\", and on yes/no."
        );
      }
      const trimmed = value.trim();
      if (trimmed === "" || Number.isNaN(Number(trimmed))) {
        ctx.fail(
          `'number' cannot read ${JSON.stringify(value)} as a number.`,
          'The text has to look like a number, for example "42" or "3.5".'
        );
      }
      return Number(trimmed);
    },
    "Turn text like \"42\" into the number 42."
  ),

  new NativeFunction("type_of", 1, (args) => bareTypeName(args[0]), "Name the kind of a value."),

  // --- size ---------------------------------------------------------------
  new NativeFunction(
    "length",
    1,
    (args: Value[], ctx: CallContext) => {
      const value = args[0];
      if (typeof value === "string") return value.length;
      if (isList(value)) return value.length;
      ctx.fail(
        `'length' works on text and on lists, but it was given ${typeName(value)}.`,
        null
      );
    },
    "How many characters are in some text, or items in a list."
  ),

  // --- text ---------------------------------------------------------------
  new NativeFunction(
    "uppercase",
    1,
    (args: Value[], ctx: CallContext) => wantText(args, 0, "uppercase", ctx).toUpperCase(),
    "Turn text into CAPITALS."
  ),

  new NativeFunction(
    "lowercase",
    1,
    (args: Value[], ctx: CallContext) => wantText(args, 0, "lowercase", ctx).toLowerCase(),
    "Turn text into small letters."
  ),

  new NativeFunction(
    "trim",
    1,
    (args: Value[], ctx: CallContext) => wantText(args, 0, "trim", ctx).trim(),
    "Remove spaces from both ends of some text."
  ),

  new NativeFunction(
    "characters",
    1,
    (args: Value[], ctx: CallContext) => [...wantText(args, 0, "characters", ctx)],
    "Split text into a list of single characters."
  ),

  new NativeFunction(
    "split",
    2,
    (args: Value[], ctx: CallContext) => {
      const text = wantText(args, 0, "split", ctx);
      const separator = wantText(args, 1, "split", ctx);
      return separator === "" ? [...text] : text.split(separator);
    },
    "Cut text into a list, wherever a separator appears."
  ),

  new NativeFunction(
    "join",
    2,
    (args: Value[], ctx: CallContext) => {
      const items = wantList(args, 0, "join", ctx);
      const separator = wantText(args, 1, "join", ctx);
      return items.map((item) => stringify(item)).join(separator);
    },
    "Glue a list together into one piece of text."
  ),

  // --- numbers -------------------------------------------------------------
  new NativeFunction(
    "round",
    [1, 2],
    (args: Value[], ctx: CallContext) => {
      const value = wantNumber(args, 0, "round", ctx);
      if (args.length === 1) return Math.round(value);
      const places = wantNumber(args, 1, "round", ctx);
      if (!Number.isInteger(places) || places < 0 || places > 15) {
        ctx.fail(
          `'round' can only round to a whole number of decimal places between 0 and 15, but it was given ${formatNumber(places)}.`,
          null
        );
      }
      const factor = Math.pow(10, places);
      return Math.round(value * factor) / factor;
    },
    "Round to the nearest whole number, or to a number of decimal places."
  ),

  new NativeFunction(
    "floor",
    1,
    (args: Value[], ctx: CallContext) => Math.floor(wantNumber(args, 0, "floor", ctx)),
    "Round down."
  ),

  new NativeFunction(
    "ceiling",
    1,
    (args: Value[], ctx: CallContext) => Math.ceil(wantNumber(args, 0, "ceiling", ctx)),
    "Round up."
  ),

  new NativeFunction(
    "absolute",
    1,
    (args: Value[], ctx: CallContext) => Math.abs(wantNumber(args, 0, "absolute", ctx)),
    "Drop the minus sign."
  ),

  new NativeFunction(
    "square_root",
    1,
    (args: Value[], ctx: CallContext) => {
      const value = wantNumber(args, 0, "square_root", ctx);
      if (value < 0) {
        ctx.fail(
          `'square_root' cannot work on the negative number ${formatNumber(value)}.`,
          null
        );
      }
      return Math.sqrt(value);
    },
    "The square root of a number."
  ),

  new NativeFunction(
    "minimum",
    [1, Infinity],
    (args: Value[], ctx: CallContext) => extreme(args, ctx, "minimum", (a, b) => a < b),
    "The smallest of several numbers, or of a list."
  ),

  new NativeFunction(
    "maximum",
    [1, Infinity],
    (args: Value[], ctx: CallContext) => extreme(args, ctx, "maximum", (a, b) => a > b),
    "The largest of several numbers, or of a list."
  ),

  new NativeFunction("random", 0, () => Math.random(), "A random number from 0 up to 1."),

  new NativeFunction(
    "random_between",
    2,
    (args: Value[], ctx: CallContext) => {
      const low = wantNumber(args, 0, "random_between", ctx);
      const high = wantNumber(args, 1, "random_between", ctx);
      if (low > high) {
        ctx.fail(
          `'random_between' was given ${formatNumber(low)} and ${formatNumber(high)}, but the first has to be the smaller one.`,
          `Try: random_between(${formatNumber(high)}, ${formatNumber(low)})`
        );
      }
      return Math.floor(Math.random() * (Math.floor(high) - Math.ceil(low) + 1)) + Math.ceil(low);
    },
    "A random whole number between two numbers, both included."
  ),

  // --- lists ---------------------------------------------------------------
  new NativeFunction(
    "contains",
    2,
    (args: Value[], ctx: CallContext) => {
      const haystack = args[0];
      if (typeof haystack === "string") {
        const needle = args[1];
        if (typeof needle !== "string") {
          ctx.fail(
            `When 'contains' is looking inside text, the thing it looks for also has to be text, but it was ${typeName(needle)}.`,
            null
          );
        }
        return haystack.includes(needle);
      }
      const list = wantList(args, 0, "contains", ctx);
      return list.some((item) => valuesEqual(item, args[1]));
    },
    "Is a value inside a list, or a piece of text inside another?"
  ),

  new NativeFunction(
    "position_of",
    2,
    (args: Value[], ctx: CallContext) => {
      const list = wantList(args, 1, "position_of", ctx);
      const index = list.findIndex((item) => valuesEqual(item, args[0]));
      return index + 1; // 1-based, and 0 means "not there"
    },
    "Where a value sits in a list, counting from 1. Gives 0 if it is not there."
  ),

  new NativeFunction(
    "sort",
    1,
    (args: Value[], ctx: CallContext) => {
      const list = wantList(args, 0, "sort", ctx).slice();
      const allNumbers = list.every((item) => typeof item === "number");
      const allText = list.every((item) => typeof item === "string");
      if (!allNumbers && !allText) {
        ctx.fail(
          "'sort' needs a list that is all numbers or all text.",
          `This list holds: ${[...new Set(list.map((i) => bareTypeName(i)))].join(", ")}.`
        );
      }
      list.sort((a, b) =>
        allNumbers ? (a as number) - (b as number) : String(a).localeCompare(String(b))
      );
      return list;
    },
    "A new list with the items in order."
  ),

  new NativeFunction(
    "reverse",
    1,
    (args: Value[], ctx: CallContext) => {
      const value = args[0];
      if (typeof value === "string") return [...value].reverse().join("");
      return wantList(args, 0, "reverse", ctx).slice().reverse();
    },
    "A new list, or piece of text, in the opposite order."
  ),

  new NativeFunction(
    "copy",
    1,
    (args: Value[], ctx: CallContext) => wantList(args, 0, "copy", ctx).slice(),
    "A separate copy of a list, so changing one does not change the other."
  ),

  new NativeFunction(
    "sum",
    1,
    (args: Value[], ctx: CallContext) => {
      const list = wantList(args, 0, "sum", ctx);
      let total = 0;
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (typeof item !== "number") {
          ctx.fail(
            `'sum' needs a list of numbers, but item ${i + 1} is ${typeName(item)}.`,
            null
          );
        }
        total += item;
      }
      return total;
    },
    "Add up every number in a list."
  ),
];

function extreme(
  args: Value[],
  ctx: CallContext,
  name: string,
  better: (a: number, b: number) => boolean
): number {
  // Accepts either minimum(a, b, c) or minimum(a_list).
  const candidates: Value[] = args.length === 1 && isList(args[0]) ? (args[0] as Value[]) : args;

  if (candidates.length === 0) {
    ctx.fail(`'${name}' needs at least one number to look at.`, "The list you gave it was empty.");
  }

  let best: number | null = null;
  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    if (typeof item !== "number") {
      ctx.fail(
        `'${name}' only works on numbers, but it was given ${typeName(item)}.`,
        `The problem is with: ${stringify(item)}`
      );
    }
    if (best === null || better(item, best)) best = item;
  }
  return best as number;
}

/** Install every built-in into a fresh global scope. */
export function defineBuiltins(globals: Environment): void {
  for (const builtin of BUILTINS) {
    globals.define(builtin.callableName, builtin);
  }
}

/** Names only — used for "did you mean?" suggestions and the playground. */
export const BUILTIN_NAMES: readonly string[] = BUILTINS.map((b) => b.callableName);

/** One-line documentation, printed by the REPL's `.help` command. */
export function builtinHelp(): string {
  const width = Math.max(...BUILTINS.map((b) => b.callableName.length));
  return BUILTINS.map(
    (b) =>
      `  ${b.callableName.padEnd(width)}  (${describeArity(b.arity)})`.padEnd(width + 22) +
      b.description
  ).join("\n");
}

export { NativeFunction };
