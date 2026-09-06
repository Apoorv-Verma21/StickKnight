/**
 * errors.ts — one error format for all three compiler stages (Day 8).
 *
 * Every stage (lexer, parser, interpreter) throws the same StickynightError,
 * so a broken program always produces the same shape of message:
 *
 *     Syntax error in examples/bad.sn, line 4:
 *
 *       4 |     if score is at 90:
 *         |                   ^^
 *
 *       I expected 'least' or 'most' after 'at'.
 *       hint: write 'is at least 90' or 'is at most 90'.
 *
 * The rule the three stages agreed on: a message says what the program said,
 * what was expected instead, and (where we can guess) how to fix it. No
 * jargon the reader has not already met in SPEC.md.
 */

export type Stage = "Lexical" | "Syntax" | "Runtime" | "Code generation";

export interface CallFrame {
  /** Function name, or "main program" for the top level. */
  name: string;
  line: number;
}

export class StickynightError extends Error {
  public readonly stage: Stage;
  public readonly line: number;
  public readonly column: number;
  public readonly length: number;
  public readonly hint: string | null;
  /** Innermost-first call stack, filled in by the interpreter only. */
  public readonly stack_: CallFrame[];

  constructor(
    stage: Stage,
    message: string,
    line: number,
    column: number,
    length = 1,
    hint: string | null = null,
    stack_: CallFrame[] = []
  ) {
    super(message);
    this.name = `${stage}Error`;
    this.stage = stage;
    this.line = line;
    this.column = Math.max(1, column);
    this.length = Math.max(1, length);
    this.hint = hint;
    this.stack_ = stack_;
  }

  /** Render the full report. `source` is the original program text. */
  format(source: string, filename = "program.sn", color = false): string {
    const c = color ? ANSI : NO_ANSI;
    const lines = source.split(/\r\n|\r|\n/);
    const out: string[] = [];

    out.push(
      `${c.bold}${c.red}${this.stage} error${c.reset} in ${c.cyan}${filename}${c.reset}, line ${this.line}:`
    );
    out.push("");

    const gutter = String(this.line).length + 1;
    const pad = (n: string) => n.padStart(gutter, " ");

    // one line of context above, for orientation
    if (this.line - 2 >= 0 && lines[this.line - 2] !== undefined) {
      out.push(`  ${c.dim}${pad(String(this.line - 1))} | ${lines[this.line - 2]}${c.reset}`);
    }

    const bad = lines[this.line - 1] ?? "";
    out.push(`  ${c.dim}${pad(String(this.line))} |${c.reset} ${bad}`);

    const caretPad = " ".repeat(Math.max(0, this.column - 1));
    const carets = "^".repeat(Math.max(1, Math.min(this.length, Math.max(1, bad.length - this.column + 1))));
    out.push(`  ${c.dim}${pad("")} |${c.reset} ${caretPad}${c.red}${carets}${c.reset}`);
    out.push("");
    out.push(`  ${this.message}`);
    if (this.hint) out.push(`  ${c.dim}hint:${c.reset} ${this.hint}`);

    if (this.stack_.length > 0) {
      out.push("");
      out.push(`  ${c.dim}while running:${c.reset}`);

      // Runaway recursion produces hundreds of identical frames, so only the
      // innermost few and the outermost one are worth printing.
      const frames = this.stack_;
      const shown = frames.length <= 8 ? frames : frames.slice(0, 5);

      for (const frame of shown) {
        out.push(`  ${c.dim}  ${frame.name}, line ${frame.line}${c.reset}`);
      }

      if (frames.length > shown.length) {
        const hidden = frames.length - shown.length - 1;
        out.push(`  ${c.dim}  ... ${hidden} more like this${c.reset}`);
        const last = frames[frames.length - 1];
        out.push(`  ${c.dim}  ${last.name}, line ${last.line}${c.reset}`);
      }
    }

    return out.join("\n");
  }

  /** A single compact line — used by the playground gutter and by tests. */
  short(): string {
    return `[line ${this.line}] ${this.stage} error: ${this.message}`;
  }
}

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  cyan: "\u001b[36m",
};

const NO_ANSI = { reset: "", bold: "", dim: "", red: "", cyan: "" };

// --- convenience constructors, one per stage -------------------------------

export function lexicalError(
  message: string,
  line: number,
  column: number,
  length = 1,
  hint: string | null = null
): StickynightError {
  return new StickynightError("Lexical", message, line, column, length, hint);
}

export function syntaxError(
  message: string,
  line: number,
  column: number,
  length = 1,
  hint: string | null = null
): StickynightError {
  return new StickynightError("Syntax", message, line, column, length, hint);
}

export function runtimeError(
  message: string,
  line: number,
  column: number,
  length = 1,
  hint: string | null = null,
  stack_: CallFrame[] = []
): StickynightError {
  return new StickynightError("Runtime", message, line, column, length, hint, stack_);
}

/**
 * Raised by the WebAssembly back end when a program uses something the
 * generator cannot lower (text, lists, closures). It is a limitation of that
 * one back end, never of the language, so the message always says so.
 */
export function codegenError(
  message: string,
  line: number,
  column: number,
  length = 1,
  hint: string | null = null
): StickynightError {
  return new StickynightError("Code generation", message, line, column, length, hint);
}

/**
 * Levenshtein distance, used to turn "I don't know 'lenght'" into
 * "did you mean 'length'?". Kept here so lexer, parser and interpreter can
 * all offer the same style of suggestion.
 */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Closest candidate within a sensible distance, or null. */
export function closestName(target: string, candidates: Iterable<string>): string | null {
  let best: string | null = null;
  let bestScore = Infinity;
  const limit = target.length <= 4 ? 1 : 2;
  for (const candidate of candidates) {
    const score = editDistance(target.toLowerCase(), candidate.toLowerCase());
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore <= limit ? best : null;
}
