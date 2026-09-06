/**
 * wasm/ir.ts — the low-level intermediate representation.
 *
 * The AST is the high-level IR shared by the interpreter and this back end.
 * It is still far too abstract to encode directly, so the code generator
 * lowers it into THIS: a flat instruction list per function, with names
 * already resolved to slots and control flow already turned into WebAssembly's
 * structured block/loop/br form.
 *
 * Having a real IR in the middle is what lets one code generator feed two
 * emitters that agree by construction:
 *
 *     AST --compiler.ts--> WasmModule --+--> wat.ts    (.wat text, readable)
 *                                       +--> binary.ts (.wasm bytes, runnable)
 */

export type WasmType = "i32" | "f64";

/** Every instruction the code generator can produce. */
export type Instr =
  // constants and names
  | { op: "f64.const"; value: number }
  | { op: "i32.const"; value: number }
  | { op: "local.get"; name: string }
  | { op: "local.set"; name: string }
  | { op: "local.tee"; name: string }
  | { op: "global.get"; name: string }
  | { op: "global.set"; name: string }

  // f64 arithmetic
  | { op: "f64.add" }
  | { op: "f64.sub" }
  | { op: "f64.mul" }
  | { op: "f64.div" }
  | { op: "f64.neg" }
  | { op: "f64.abs" }
  | { op: "f64.floor" }
  | { op: "f64.ceil" }
  | { op: "f64.trunc" }
  | { op: "f64.nearest" }
  | { op: "f64.sqrt" }
  | { op: "f64.min" }
  | { op: "f64.max" }

  // comparisons: take two f64, leave an i32 (0 or 1)
  | { op: "f64.eq" }
  | { op: "f64.ne" }
  | { op: "f64.lt" }
  | { op: "f64.gt" }
  | { op: "f64.le" }
  | { op: "f64.ge" }

  // i32 helpers, used only for conditions
  | { op: "i32.eqz" }
  | { op: "i32.and" }
  | { op: "i32.or" }
  | { op: "f64.convert_i32_u" }

  // control flow
  | { op: "block"; label: string; result: WasmType | null; body: Instr[] }
  | { op: "loop"; label: string; result: WasmType | null; body: Instr[] }
  | { op: "if"; result: WasmType | null; then: Instr[]; else: Instr[] | null }
  | { op: "br"; depth: number; label: string }
  | { op: "br_if"; depth: number; label: string }
  | { op: "return" }
  | { op: "call"; name: string }
  | { op: "drop" }
  | { op: "unreachable" };

export interface WasmParam {
  name: string;
  type: WasmType;
}

export interface WasmFunction {
  name: string;
  params: WasmParam[];
  /** Extra slots the generator needed; all f64. */
  locals: WasmParam[];
  results: WasmType[];
  body: Instr[];
  exported: boolean;
  /** The Stickynight name this came from, for the .wat comments. */
  sourceName: string;
}

export interface WasmGlobal {
  name: string;
  type: WasmType;
  mutable: boolean;
  /** Globals must be initialised with a constant; real values are set in main. */
  init: number;
}

export interface WasmImport {
  /** JavaScript object the host supplies, e.g. "stickynight". */
  module: string;
  field: string;
  name: string;
  params: WasmType[];
  results: WasmType[];
}

export interface WasmModule {
  imports: WasmImport[];
  globals: WasmGlobal[];
  functions: WasmFunction[];
  /** Notes rendered as comments at the top of the .wat file. */
  notes: string[];
}

/** A function signature, deduplicated into the type section. */
export interface FuncType {
  params: WasmType[];
  results: WasmType[];
}

export function typeKey(type: FuncType): string {
  return `${type.params.join(",")}->${type.results.join(",")}`;
}

/**
 * Collect the distinct signatures a module uses, in the order they are first
 * seen. Both emitters need exactly this list: the binary one to build the
 * type section, the text one to keep function indices lined up with it.
 */
export function collectTypes(module: WasmModule): FuncType[] {
  const seen = new Map<string, FuncType>();

  const add = (type: FuncType) => {
    const key = typeKey(type);
    if (!seen.has(key)) seen.set(key, type);
  };

  for (const imported of module.imports) {
    add({ params: imported.params, results: imported.results });
  }
  for (const fn of module.functions) {
    add({ params: fn.params.map((p) => p.type), results: fn.results });
  }

  return [...seen.values()];
}

/**
 * Index of a function by name. Imported functions come first in
 * WebAssembly's single function index space, then the defined ones.
 */
export function functionIndex(module: WasmModule, name: string): number {
  const importIndex = module.imports.findIndex((i) => i.name === name);
  if (importIndex >= 0) return importIndex;

  const localIndex = module.functions.findIndex((f) => f.name === name);
  if (localIndex < 0) {
    throw new Error(`internal error: no function called '${name}' in the module`);
  }
  return module.imports.length + localIndex;
}

/** Index of a local (parameters first, then declared locals). */
export function localIndex(fn: WasmFunction, name: string): number {
  const paramIndex = fn.params.findIndex((p) => p.name === name);
  if (paramIndex >= 0) return paramIndex;

  const index = fn.locals.findIndex((l) => l.name === name);
  if (index < 0) {
    throw new Error(`internal error: '${name}' is not a slot in '${fn.name}'`);
  }
  return fn.params.length + index;
}

export function globalIndex(module: WasmModule, name: string): number {
  const index = module.globals.findIndex((g) => g.name === name);
  if (index < 0) {
    throw new Error(`internal error: no global called '${name}' in the module`);
  }
  return index;
}
