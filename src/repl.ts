/**
 * repl.ts — the interactive prompt.
 *
 * One Interpreter is kept alive across lines, so names defined at the prompt
 * stay defined. The only real work here is knowing when a statement is
 * finished: a line ending in ':' opens a block, and the prompt keeps reading
 * until a blank line closes it.
 */

import * as readline from "readline";

import { builtinHelp } from "./builtins";
import { StickynightError } from "./errors";
import { Interpreter } from "./interpreter";
import { formatTokens, tokenize } from "./lexer";
import { printAst } from "./ast-printer";
import { parse } from "./parser";
import { stringify } from "./values";
import { LANGUAGE_NAME, VERSION } from "./stickynight";

const BANNER = `${LANGUAGE_NAME} ${VERSION}
Type a statement and press Enter. A line ending in ':' starts a block —
keep typing, and press Enter on an empty line to run it.
Commands: .help  .builtins  .vars  .tokens <code>  .ast <code>  .clear  .quit`;

export async function startRepl(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });

  let interpreter = new Interpreter({
    output: (line) => console.log(line),
    maxSteps: 5_000_000,
  });

  /** Lines collected so far for a multi-line block. */
  let buffer: string[] = [];

  console.log(BANNER);
  rl.prompt();

  rl.on("line", (raw) => {
    const line = raw.replace(/\s+$/, "");

    // --- inside a block --------------------------------------------------
    if (buffer.length > 0) {
      if (line.trim() === "") {
        const source = buffer.join("\n");
        buffer = [];
        evaluate(source);
        rl.setPrompt("> ");
        rl.prompt();
        return;
      }
      buffer.push(line);
      rl.prompt();
      return;
    }

    // --- commands -----------------------------------------------------------
    if (line.startsWith(".")) {
      const [command, ...rest] = line.split(" ");
      const argument = rest.join(" ");

      switch (command) {
        case ".quit":
        case ".exit":
          rl.close();
          return;

        case ".help":
          console.log(BANNER);
          break;

        case ".builtins":
          console.log(builtinHelp());
          break;

        case ".vars": {
          const entries = interpreter.globals
            .ownEntries()
            .filter(([, value]) => !(typeof value === "object" && value !== null && "callableName" in (value as object) && !(value as { isUserDefined: boolean }).isUserDefined));
          if (entries.length === 0) {
            console.log("Nothing has been given a value yet.");
          } else {
            const width = Math.max(...entries.map(([name]) => name.length));
            for (const [name, value] of entries) {
              console.log(`  ${name.padEnd(width)}  ${stringify(value)}`);
            }
          }
          break;
        }

        case ".clear":
          interpreter = new Interpreter({
            output: (out) => console.log(out),
            maxSteps: 5_000_000,
          });
          console.log("Everything has been forgotten.");
          break;

        case ".tokens":
          try {
            console.log(formatTokens(tokenize(argument)));
          } catch (error) {
            report(error, argument);
          }
          break;

        case ".ast":
          try {
            console.log(printAst(parse(tokenize(argument))));
          } catch (error) {
            report(error, argument);
          }
          break;

        default:
          console.log(`I do not know the command '${command}'. Try .help`);
      }

      rl.prompt();
      return;
    }

    // --- a line that opens a block -----------------------------------------
    if (line.trimEnd().endsWith(":")) {
      buffer.push(line);
      rl.setPrompt("... ");
      rl.prompt();
      return;
    }

    if (line.trim() !== "") evaluate(line);
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("Goodbye.");
  });

  function evaluate(source: string): void {
    try {
      const program = parse(tokenize(source));

      // A lone expression at the prompt prints its value, so that typing
      // `2 plus 2` does something useful without needing `say`.
      if (
        program.statements.length === 1 &&
        program.statements[0].kind === "Expression"
      ) {
        const value = interpreter.evaluate(program.statements[0].expression);
        if (value !== null) console.log(stringify(value));
        return;
      }

      interpreter.interpret(program);
    } catch (error) {
      report(error, source);
    }
  }

  function report(error: unknown, source: string): void {
    if (error instanceof StickynightError) {
      console.error(error.format(source, "the prompt", process.stdout.isTTY === true));
    } else {
      console.error(error);
    }
  }

  await new Promise<void>((resolve) => rl.on("close", resolve));
}
