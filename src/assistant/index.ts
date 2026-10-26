/**
 * assistant/index.ts — the Stickynight assistant.
 *
 * A question comes in, optionally with whatever program is currently in the
 * editor, and an answer goes out. The important design decision is that the
 * assistant is GROUNDED IN THE COMPILER rather than in a model's memory:
 *
 *   "what is wrong with this?"  -> the real error from the real lexer/parser,
 *                                  with its real hint, plus the lesson it
 *                                  belongs to
 *   "what does this do?"        -> a walk over the real AST (explain.ts)
 *   "what does it print?"       -> the real interpreter, actually run
 *   "how do I write a loop?"    -> retrieval over knowledge.ts, whose every
 *                                  example is executed by the test suite
 *
 * Only when none of those apply does it reach for a language model, and that
 * backend is INJECTED rather than imported. Three reasons:
 *
 *   1. The assistant works with no API key, no network, and no account. That
 *      is what makes it usable in a classroom or an exam hall.
 *   2. The browser bundle must never contain an API key. The playground's
 *      backend talks to a small server route instead; the key stays on the
 *      server.
 *   3. This module stays free of any dependency, so the compiler keeps its
 *      "no runtime dependencies" property.
 */

import { Program } from "../ast";
import { StickynightError } from "../errors";
import { Interpreter } from "../interpreter";
import { tokenize } from "../lexer";
import { parse } from "../parser";
import { explainProgram, summarise } from "./explain";
import { BY_ID, Entry } from "./knowledge";
import { best, rank, topics } from "./retrieve";

export { ENTRIES } from "./knowledge";
export { explainProgram, summarise } from "./explain";
export { rank, topics } from "./retrieve";

// ---------------------------------------------------------------------------
// The shape of a conversation
// ---------------------------------------------------------------------------

/** Where an answer came from — shown in the UI so nothing is passed off. */
export type Source =
  | "diagnosis"   // read from the compiler's own error
  | "explanation" // walked from the AST
  | "output"      // the program was actually run
  | "knowledge"   // retrieved from the knowledge base
  | "model"       // answered by a language model
  | "unsure";     // nothing matched well enough

export interface Answer {
  text: string;
  /** A program worth putting straight into the editor. */
  code?: string;
  source: Source;
  /** The knowledge entry behind the answer, when there was one. */
  topic?: string;
  /** Follow-up questions worth asking next. */
  related?: string[];
}

export interface AskRequest {
  question: string;
  /** Whatever is in the editor right now, if anything. */
  program?: string;
  /** An optional language model, supplied by the host. */
  backend?: ModelBackend | null;
}

/**
 * A language model the host has wired up. The assistant hands it a grounded
 * system prompt and the question; everything else is the host's business.
 */
export interface ModelBackend {
  readonly name: string;
  complete(input: {
    system: string;
    question: string;
    program?: string;
  }): Promise<string>;
}

// ---------------------------------------------------------------------------
// What the question is asking for
// ---------------------------------------------------------------------------

const WANTS_DIAGNOSIS =
  /\b(what(?:'s| is| am i doing)? wrong|wrong with|error|broken|not working|doesn'?t work|does not work|won'?t run|fix (this|it|my)|bug|why (does|is|am|won'?t|doesn'?t))\b/i;

const WANTS_EXPLANATION =
  /\b(explain|what does (this|my|it)|what is (this|my) (program|code)|walk me through|describe (this|my)|how does (this|my|it) work|understand (this|my))\b/i;

const WANTS_OUTPUT =
  /\b(what (does|will) (it|this|my program) (print|say|output|show)|what'?s the output|run (it|this|my)|result of (this|my))\b/i;

const IS_GREETING = /^\s*(hi|hey|hello|yo|sup|good (morning|afternoon|evening))\b/i;

const WANTS_TOPICS =
  /\b(what can you (do|help)|help me|what do you know|topics|list.*topics|commands)\b/i;

// ---------------------------------------------------------------------------
// Mapping a compiler error onto the lesson it belongs to
// ---------------------------------------------------------------------------

const ERROR_TOPICS: [RegExp, string][] = [
  [/is not part of Stickynight/i, "comparing"],
  [/curly braces|semicolons/i, "indentation"],
  [/indented|line up|tab/i, "indentation"],
  [/expected a ':'/i, "indentation"],
  [/never closed|double quotes|backslash/i, "text"],
  [/do not know anything called/i, "variables"],
  [/needs \d+ input|listed twice/i, "definitions"],
  [/works on numbers|divided by zero|'mod'/i, "numbers"],
  [/yes\/no value|'and'|'or'|'not'/i, "logic"],
  [/there is no item|position/i, "indexing"],
  [/called itself/i, "recursion"],
  [/taking too long/i, "loops"],
  [/'give back' only makes sense|cannot be called/i, "definitions"],
  [/'add' puts a value into a list|'for each'/i, "lists"],
  [/keyword/i, "keywords"],
  [/block is empty|does not open a block/i, "indentation"],
];

function entryForError(error: StickynightError): Entry | undefined {
  const haystack = `${error.message} ${error.hint ?? ""}`;
  for (const [pattern, id] of ERROR_TOPICS) {
    if (pattern.test(haystack)) return BY_ID.get(id);
  }
  return BY_ID.get("errors");
}

// ---------------------------------------------------------------------------
// Compiling the attached program, without throwing
// ---------------------------------------------------------------------------

interface Compiled {
  program: Program | null;
  error: StickynightError | null;
}

function compile(source: string): Compiled {
  try {
    return { program: parse(tokenize(source)), error: null };
  } catch (error) {
    if (error instanceof StickynightError) return { program: null, error };
    throw error;
  }
}

/**
 * Run a program only to find out whether it fails, discarding its output.
 *
 * A program that parses cleanly can still fail the moment it runs — an
 * unknown name, a bad position, arithmetic on text. Someone asking "what is
 * wrong with this?" means that too, so the diagnosis path has to actually run
 * it rather than stopping at "it parses".
 */
function runQuietly(source: string): StickynightError | null {
  try {
    const program = parse(tokenize(source));
    const interpreter = new Interpreter({
      output: () => {},
      maxSteps: 200_000,
    });
    interpreter.interpret(program);
    return null;
  } catch (error) {
    if (error instanceof StickynightError) return error;
    throw error;
  }
}

function hasContent(source: string | undefined): source is string {
  if (!source) return false;
  // A program that is only blank lines and comments has nothing to talk about.
  return source
    .split("\n")
    .some((line) => line.trim() !== "" && !line.trim().startsWith("#"));
}

// ---------------------------------------------------------------------------
// Composing answers
// ---------------------------------------------------------------------------

function fromEntry(entry: Entry, lead?: string): Answer {
  const parts: string[] = [];
  if (lead) parts.push(lead, "");
  parts.push(entry.body);

  return {
    text: parts.join("\n"),
    code: entry.code,
    source: "knowledge",
    topic: entry.id,
    related: (entry.see ?? [])
      .map((id) => BY_ID.get(id)?.title)
      .filter((t): t is string => Boolean(t)),
  };
}

function diagnose(error: StickynightError, source: string): Answer {
  const entry = entryForError(error);

  const parts: string[] = [];
  parts.push(
    `Your program stops at line ${error.line}, and it is a ${error.stage.toLowerCase()} problem — ${stageMeaning(error.stage)}.`
  );
  parts.push("");
  parts.push(error.format(source, "your program", false));

  if (error.hint) {
    parts.push("");
    parts.push(`In other words: ${error.hint}`);
  }

  if (entry && entry.id !== "errors") {
    parts.push("");
    parts.push(`This is about ${entry.title.toLowerCase()}. ${firstSentence(entry.body)}`);
  }

  return {
    text: parts.join("\n"),
    code: entry?.code,
    source: "diagnosis",
    topic: entry?.id,
    related: entry ? [entry.title] : undefined,
  };
}

function stageMeaning(stage: StickynightError["stage"]): string {
  switch (stage) {
    case "Lexical":
      return "something about the characters themselves";
    case "Syntax":
      return "the shape of the line is not something the grammar allows";
    case "Runtime":
      return "the program parsed fine, but something went wrong while running it";
    case "Code generation":
      return "the WebAssembly back end cannot compile this part";
  }
}

/**
 * The opening line of a lesson, for the one-line pointer at the end of a
 * diagnosis. Entry bodies contain formatted blocks, so this takes the first
 * paragraph only, and stops at the first sentence inside it.
 */
function firstSentence(text: string): string {
  const paragraph = text.split("\n")[0].trim();
  const stop = paragraph.search(/\.(\s|$)/);
  const sentence = stop === -1 ? paragraph : paragraph.slice(0, stop + 1);
  return sentence.length > 160 ? sentence.slice(0, 157).trimEnd() + "..." : sentence;
}

function runProgram(source: string): Answer {
  const output: string[] = [];
  try {
    const program = parse(tokenize(source));
    const interpreter = new Interpreter({
      output: (line) => output.push(line),
      maxSteps: 1_000_000,
    });
    interpreter.interpret(program);
  } catch (error) {
    if (error instanceof StickynightError) {
      const partial = output.length
        ? `It printed this much before stopping:\n\n${output.join("\n")}\n\n`
        : "";
      return {
        text: `${partial}${diagnose(error, source).text}`,
        source: "diagnosis",
      };
    }
    throw error;
  }

  if (output.length === 0) {
    return {
      text:
        "It runs without any trouble, but it never prints anything.\n\n" +
        'Add a `say` line to see a value — for example `say total`.',
      source: "output",
    };
  }

  return {
    text: `It prints ${output.length} ${output.length === 1 ? "line" : "lines"}:\n\n${output.join("\n")}`,
    source: "output",
  };
}

// ---------------------------------------------------------------------------
// The system prompt handed to a model backend
// ---------------------------------------------------------------------------

/**
 * Everything a model needs to answer about Stickynight correctly, built from
 * the same knowledge entries the offline assistant uses. Without this a model
 * would answer from whatever it assumes a language called Stickynight looks
 * like, which is exactly the failure a grounded assistant exists to avoid.
 */
export function systemPrompt(): string {
  const lessons = BY_ID;
  const sections: string[] = [];

  sections.push(
    "You are the built-in assistant for Stickynight, a small programming language.",
    "Answer ONLY from the reference below. Stickynight is not a language you have",
    "seen before, so do not fall back on the conventions of any other language.",
    "",
    "Rules for your answers:",
    "- Keep it short. Two or three sentences, then a code example if one helps.",
    "- Write code examples in Stickynight, never in another language.",
    "- Indent blocks with four spaces. Never use braces, semicolons, or >= and ==.",
    "- If the reference does not cover the question, say so plainly.",
    "",
    "=== STICKYNIGHT REFERENCE ===",
    ""
  );

  for (const entry of lessons.values()) {
    sections.push(`## ${entry.title}`);
    sections.push(entry.body);
    if (entry.code) {
      sections.push("Example:");
      sections.push(entry.code.trimEnd());
    }
    sections.push("");
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

export async function ask(request: AskRequest): Promise<Answer> {
  const question = request.question.trim();

  if (question === "") {
    return {
      text: "Ask me something about Stickynight — how to write a loop, what an error means, or what your program does.",
      source: "unsure",
    };
  }

  if (IS_GREETING.test(question) && question.length < 24) {
    return {
      text:
        "Hello. I can explain any part of Stickynight, read your program and say what it does, or work out why it is not running.\n\n" +
        "Try: \"how do I write a loop?\", \"what is wrong with my program?\", or \"what does this do?\"",
      source: "knowledge",
      topic: "about",
    };
  }

  if (WANTS_TOPICS.test(question)) {
    return {
      text:
        "I can help with any of these:\n\n" +
        topics().map((t) => `  • ${t}`).join("\n") +
        "\n\nI can also read whatever is in the editor — ask what it does, what it prints, or what is wrong with it.",
      source: "knowledge",
    };
  }

  // --- questions about the program in the editor --------------------------
  const source = hasContent(request.program) ? (request.program as string) : null;

  if (source) {
    const { program, error } = compile(source);

    if (WANTS_OUTPUT.test(question)) return runProgram(source);

    if (error && WANTS_DIAGNOSIS.test(question)) return diagnose(error, source);

    if (program && WANTS_EXPLANATION.test(question)) {
      return {
        text: explainProgram(program),
        source: "explanation",
      };
    }

    // An error plus a question we cannot place is almost always about the
    // error, so say so rather than answering something else confidently.
    if (error && !best(question, 6)) return diagnose(error, source);

    if (program && WANTS_DIAGNOSIS.test(question)) {
      // It parses, but that is only half the question — run it and see.
      const atRuntime = runQuietly(source);
      if (atRuntime) return diagnose(atRuntime, source);

      return {
        text:
          `I cannot find anything wrong with it. It parses cleanly, it runs to the end without an error, and it has ${summarise(program)}.\n\n` +
          "If it is not doing what you expected, ask me what it prints, or what it does step by step — the mistake is in the logic rather than in the language.",
        source: "explanation",
      };
    }
  }

  if (!source && (WANTS_EXPLANATION.test(question) || WANTS_DIAGNOSIS.test(question) || WANTS_OUTPUT.test(question))) {
    return {
      text:
        "There is nothing in the editor yet, so I cannot look at your program.\n\n" +
        "Write some Stickynight on the left and ask me again — or ask me how to write something, and I will give you a starting point.",
      source: "unsure",
    };
  }

  // --- general questions ---------------------------------------------------
  const match = best(question);
  if (match) return fromEntry(match.entry);

  // --- fall back to a model, if the host supplied one ---------------------
  if (request.backend) {
    try {
      const text = await request.backend.complete({
        system: systemPrompt(),
        question,
        program: source ?? undefined,
      });
      if (text.trim()) {
        return { text: text.trim(), source: "model" };
      }
    } catch (error) {
      // A model that is unreachable must never take the assistant down with
      // it — fall through to the offline answer below.
      const reason = error instanceof Error ? error.message : String(error);
      const weak = rank(question).slice(0, 3);
      return {
        text:
          `I could not reach the language model (${reason}).\n\n` +
          (weak.length
            ? `The closest things I know about are: ${weak.map((m) => m.entry.title).join(", ")}.`
            : "Try asking about loops, lists, definitions, or what an error means."),
        source: "unsure",
      };
    }
  }

  // --- nothing matched -----------------------------------------------------
  const nearby = rank(question).slice(0, 3);
  return {
    text:
      "I am not sure about that one.\n\n" +
      (nearby.length > 0
        ? `You might mean one of these: ${nearby.map((m) => m.entry.title).join(", ")}.`
        : "I know about printing, variables, conditions, loops, lists, definitions, scope, errors and the built-ins.") +
      "\n\nAsk \"what can you help with?\" to see everything I cover.",
    source: "unsure",
    related: nearby.map((m) => m.entry.title),
  };
}

/** Synchronous answer, for hosts with no model backend. */
export function askOffline(question: string, program?: string): Promise<Answer> {
  return ask({ question, program, backend: null });
}
