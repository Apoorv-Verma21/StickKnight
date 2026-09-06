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
  astReport,
  FILE_EXTENSION,
  formatError,
  LANGUAGE_NAME,
  parseSourceReportingAll,
  runCompiled,
  runSource,
  sexpressionReport,
  StickynightError,
  tokenReport,
  VERSION,
  wasmBytes,
  watReport,
} from "./stickynight";
import { startRepl } from "./repl";

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
    | "repl"
    | "help"
    | "version";
  file: string | null;
  color: boolean;
  steps: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    mode: "repl",
    file: null,
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
