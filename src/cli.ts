#!/usr/bin/env node
/**
 * cli.ts — the command line front end.
 *
 * Each flag stops the pipeline at a different stage, which is what makes the
 * phases demonstrable one at a time:
 *
 *   --tokens   stop after the lexer
 *   --ast      stop after the parser
 *   --wat      stop after code generation, print the text format
 *   --wasm     stop after code generation, write a runnable binary
 *   --compiled compile to WebAssembly and run THAT rather than the tree
 *   (nothing)  run the program with the interpreter
 */

import * as fs from "fs";
import * as path from "path";

import {
  askAssistant,
  astReport,
  FILE_EXTENSION,
  formatError,
  LANGUAGE_NAME,
  parseSourceReportingAll,
  runCompiled,
  runSource,
  sexpressionReport,
  StickynightError,
  explainSource,
  tokenReport,
  VERSION,
  wasmBytes,
  watReport,
} from "./stickynight";
import { startRepl } from "./repl";
import { createAnthropicBackend, status as backendStatus } from "./assistant/llm";

const USAGE = `${LANGUAGE_NAME} ${VERSION}

  stickynight <file${FILE_EXTENSION}>            run a program
  stickynight                        start the interactive prompt

Look inside each stage:
  --tokens <file>    the token stream the lexer produces
  --ast <file>       the syntax tree the parser builds
  --sexp <file>      the same tree on one line per statement
  --wat <file>       WebAssembly text format from the code generator
  --wasm <file>      write a runnable .wasm binary next to the source
  --compiled <file>  compile to WebAssembly and run that instead of the tree
  --check <file>     report every syntax error without running anything

Ask the assistant:
  ask "<question>" [file]   ask about the language, or about a program
  --explain <file>          say what a program does, in English
  --ai                      report whether the model backend is switched on

Other:
  --no-color         plain output, no escape codes
  --steps <n>        stop after n statements (guards against endless loops)
  --help, --version
`;

interface Options {
  mode:
    | "run"
    | "tokens"
    | "ast"
    | "sexp"
    | "wat"
    | "wasm"
    | "compiled"
    | "check"
    | "ask"
    | "explain"
    | "ai"
    | "repl"
    | "help"
    | "version";
  file: string | null;
  question: string | null;
  color: boolean;
  steps: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    mode: "repl",
    file: null,
    question: null,
    color: process.stdout.isTTY === true && !process.env.NO_COLOR,
    steps: Infinity,
  };

  const rest: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        options.mode = "help";
        return options;
      case "--version":
      case "-v":
        options.mode = "version";
        return options;
      case "--tokens":
        options.mode = "tokens";
        break;
      case "--ast":
        options.mode = "ast";
        break;
      case "--sexp":
        options.mode = "sexp";
        break;
      case "--wat":
        options.mode = "wat";
        break;
      case "--wasm":
        options.mode = "wasm";
        break;
      case "--compiled":
        options.mode = "compiled";
        break;
      case "--check":
        options.mode = "check";
        break;
      case "--explain":
        options.mode = "explain";
        break;
      case "--ai":
        options.mode = "ai";
        return options;
      case "ask":
        options.mode = "ask";
        break;
      case "run":
        options.mode = "run";
        break;
      case "--no-color":
        options.color = false;
        break;
      case "--steps":
        options.steps = Number(argv[++i]);
        break;
      default:
        if (arg.startsWith("-")) {
          console.error(`I do not know the option '${arg}'.\n`);
          console.error(USAGE);
          process.exit(2);
        }
        rest.push(arg);
    }
  }

  if (options.mode === "ask") {
    // Everything that is not a .sn path is part of the question.
    const files = rest.filter((arg) => /\.sn$/i.test(arg));
    const words = rest.filter((arg) => !/\.sn$/i.test(arg));
    options.question = words.join(" ").trim() || null;
    options.file = files[0] ?? null;
    return options;
  }

  if (rest.length > 0) {
    options.file = rest[0];
    if (options.mode === "repl") options.mode = "run";
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.mode === "help") {
    console.log(USAGE);
    return;
  }

  if (options.mode === "version") {
    console.log(`${LANGUAGE_NAME} ${VERSION}`);
    return;
  }

  if (options.mode === "repl") {
    await startRepl();
    return;
  }

  if (options.mode === "ai") {
    const current = backendStatus();
    if (current.available) {
      console.log(`The model backend is on, using ${current.model}.`);
      console.log("Questions the assistant cannot answer from the compiler go to it.");
    } else {
      console.log("The model backend is off, so the assistant answers offline only.");
      console.log(`  ${current.message}`);
      console.log("");
      console.log("Offline, it still reads your program's real errors, walks its syntax");
      console.log("tree to explain it, runs it, and answers from the language reference.");
    }
    return;
  }

  if (options.mode === "ask") {
    if (!options.question) {
      console.error('Ask me something, for example:  stickynight ask "how do I write a loop?"');
      process.exit(2);
    }

    const attached =
      options.file && fs.existsSync(options.file)
        ? fs.readFileSync(options.file, "utf8")
        : undefined;

    const answer = await askAssistant(
      options.question,
      attached,
      createAnthropicBackend()
    );

    console.log(answer.text);
    if (answer.code) {
      console.log("");
      console.log(answer.code.trimEnd());
    }
    if (answer.related && answer.related.length > 0) {
      console.log("");
      console.log(`Related: ${answer.related.join(", ")}`);
    }
    return;
  }

  const file = options.file as string;
  if (!fs.existsSync(file)) {
    console.error(`I cannot find the file '${file}'.`);
    process.exit(66);
  }

  const source = fs.readFileSync(file, "utf8");
  const shown = path.relative(process.cwd(), file) || file;

  try {
    switch (options.mode) {
      case "tokens":
        console.log(tokenReport(source));
        return;

      case "ast":
        console.log(astReport(source));
        return;

      case "sexp":
        console.log(sexpressionReport(source));
        return;

      case "wat":
        console.log(watReport(source));
        return;

      case "wasm": {
        const bytes = wasmBytes(source);
        const target = file.replace(/\.[^.]+$/, "") + ".wasm";
        fs.writeFileSync(target, bytes);
        console.log(
          `Wrote ${path.relative(process.cwd(), target)} (${bytes.length} bytes).`
        );
        return;
      }

      case "explain":
        console.log(explainSource(source));
        return;

      case "check": {
        const { errors } = parseSourceReportingAll(source);
        if (errors.length === 0) {
          console.log(`${shown} looks fine.`);
          return;
        }
        for (const error of errors) {
          console.error(formatError(error, source, shown, options.color));
          console.error("");
        }
        console.error(
          `${errors.length} problem${errors.length === 1 ? "" : "s"} found.`
        );
        process.exit(65);
        return;
      }

      case "compiled": {
        const result = await runCompiled(source);
        for (const line of result.output) console.log(line);
        if (result.error) {
          console.error(formatError(result.error, source, shown, options.color));
          process.exit(70);
        }
        return;
      }

      case "run":
      default: {
        const result = runSource(source, {
          output: (line) => console.log(line),
          maxSteps: options.steps,
        });
        if (result.error) {
          console.error("");
          console.error(formatError(result.error, source, shown, options.color));
          process.exit(70);
        }
        return;
      }
    }
  } catch (error) {
    if (error instanceof StickynightError) {
      console.error(formatError(error, source, shown, options.color));
      process.exit(65);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
