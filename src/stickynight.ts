/**
 * stickynight.ts — the front door.
 *
 * Everything a host needs, whether that host is the command line, the test
 * suite or the browser playground. Each function runs the pipeline up to a
 * particular stage, so the same code path is exercised however Stickynight is
 * being used:
 *
 *     source ──tokenize──▶ tokens ──parse──▶ AST ──┬──interpret──▶ output
 *                                                  └──compile────▶ .wat / .wasm
 */

import { ask, explainProgram, ModelBackend } from "./assistant";
import type { Answer } from "./assistant";
import { Program } from "./ast";
import { printAst, toSExpression } from "./ast-printer";
import { StickynightError } from "./errors";
import { Interpreter, InterpreterOptions } from "./interpreter";
import { formatTokens, tokenize } from "./lexer";
import { parse, parseWithRecovery } from "./parser";
import { Token } from "./token";
import { compileToWasm } from "./wasm/compiler";
import { emitBinary, runWasm } from "./wasm/binary";
import { emitWat } from "./wasm/wat";
import { WasmModule } from "./wasm/ir";

export const LANGUAGE_NAME = "Stickynight";
export const VERSION = "1.0.0";
export const FILE_EXTENSION = ".sn";

// --- stage by stage ---------------------------------------------------------

export function tokenizeSource(source: string): Token[] {
  return tokenize(source);
}

export function parseSource(source: string): Program {
  return parse(tokenize(source));
}

/** Parse without stopping at the first mistake — used by the CLI. */
export function parseSourceReportingAll(source: string): {
  program: Program;
  errors: StickynightError[];
} {
  return parseWithRecovery(tokenize(source));
}

export function compileSource(source: string): WasmModule {
  return compileToWasm(parseSource(source));
}

// --- running ----------------------------------------------------------------

export interface RunResult {
  /** Everything `say` printed, one entry per line. */
  output: string[];
  /** The first error that stopped the program, if any. */
  error: StickynightError | null;
}

/**
 * Run a program and collect its output rather than printing it. Errors are
 * returned instead of thrown, because every host wants to render them itself.
 */
export function runSource(
  source: string,
  options: Omit<InterpreterOptions, "output"> & { output?: (line: string) => void } = {}
): RunResult {
  const output: string[] = [];
  const sink = options.output ?? ((line: string) => output.push(line));

  try {
    const program = parseSource(source);
    const interpreter = new Interpreter({ ...options, output: sink });
    interpreter.interpret(program);
    return { output, error: null };
  } catch (error) {
    if (error instanceof StickynightError) return { output, error };
    if (error instanceof RangeError) {
      // A JavaScript stack overflow can still slip past the depth guard on
      // deeply nested expressions; report it in the same voice as the rest.
      return {
        output,
        error: new StickynightError(
          "Runtime",
          "This program nested too deeply for me to finish it.",
          1,
          1,
          1,
          "This usually means a definition calls itself without ever stopping."
        ),
      };
    }
    throw error;
  }
}

// --- inspection, for the CLI flags and the playground tabs -------------------

export function tokenReport(source: string): string {
  return formatTokens(tokenize(source));
}

export function astReport(source: string): string {
  return printAst(parseSource(source));
}

export function sexpressionReport(source: string): string {
  return toSExpression(parseSource(source));
}

export function watReport(source: string): string {
  return emitWat(compileSource(source));
}

export function wasmBytes(source: string): Uint8Array {
  return emitBinary(compileSource(source));
}

/**
 * Compile to WebAssembly, instantiate it, and run it — the proof that the code
 * generator emits something a real WebAssembly engine accepts.
 */
export async function runCompiled(
  source: string,
  options: { output?: (line: string) => void } = {}
): Promise<RunResult> {
  const output: string[] = [];
  const sink = options.output ?? ((line: string) => output.push(line));

  try {
    const bytes = wasmBytes(source);
    await runWasm(bytes, (value) => sink(formatWasmNumber(value)));
    return { output, error: null };
  } catch (error) {
    if (error instanceof StickynightError) return { output, error };
    throw error;
  }
}

/** The compiled program only has numbers, so this is all the printing it needs. */
function formatWasmNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(12)));
}

// --- the assistant -----------------------------------------------------------

/**
 * Answer a question about Stickynight, optionally about a particular program.
 *
 * Everything it can answer from the compiler, it answers from the compiler:
 * a broken program gets the real error, a working one gets a walk over the
 * real AST. A model backend is only consulted for what is left over, and only
 * when the host supplies one.
 */
export async function askAssistant(
  question: string,
  program?: string,
  backend?: ModelBackend | null
): Promise<Answer> {
  return ask({ question, program, backend });
}

/** Describe what a program does, in English, by walking its AST. */
export function explainSource(source: string): string {
  return explainProgram(parseSource(source));
}

// --- error rendering ---------------------------------------------------------

export function formatError(
  error: StickynightError,
  source: string,
  filename = "program.sn",
  color = false
): string {
  return error.format(source, filename, color);
}

// --- re-exports so hosts only ever import this one module --------------------

export { StickynightError } from "./errors";
export { Interpreter } from "./interpreter";
export { Environment } from "./environment";
export { Lexer, tokenize, formatTokens } from "./lexer";
export { Parser, parse, parseWithRecovery } from "./parser";
export { printAst, toSExpression } from "./ast-printer";
export { TokenType, KEYWORD_LIST } from "./token";
export { BUILTIN_NAMES, builtinHelp } from "./builtins";
export { ask, explainProgram, summarise, rank, topics, systemPrompt, ENTRIES } from "./assistant";
export type { Answer, AskRequest, ModelBackend, Source } from "./assistant";
export { compileToWasm } from "./wasm/compiler";
export { emitWat } from "./wasm/wat";
export { emitBinary, runWasm } from "./wasm/binary";
export type { Token } from "./token";
export type { Program, Stmt, Expr } from "./ast";
export type { WasmModule } from "./wasm/ir";
