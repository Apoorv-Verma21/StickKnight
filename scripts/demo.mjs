/**
 * scripts/demo.mjs — the guided tour, for a live demonstration.
 *
 * Walks one program through every stage of the pipeline in order, pausing
 * between them, so the whole thing can be shown without typing five commands
 * and without anyone losing their place.
 *
 *     npm run demo                        the default program
 *     npm run demo examples/03-fizzbuzz.sn
 *     npm run demo -- --no-pause          straight through, for a transcript
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const SN = require(path.join(root, "dist", "src", "stickynight.js"));

const args = process.argv.slice(2);
const pause = !args.includes("--no-pause");
const file =
  args.find((a) => !a.startsWith("-")) ?? path.join("examples", "11-wasm-demo.sn");

const source = fs.readFileSync(path.join(root, file), "utf8");

const colour = process.stdout.isTTY && !process.env.NO_COLOR;
const c = colour
  ? { reset: "\u001b[0m", bold: "\u001b[1m", dim: "\u001b[2m", cyan: "\u001b[36m", yellow: "\u001b[33m" }
  : { reset: "", bold: "", dim: "", cyan: "", yellow: "" };

function heading(step, title, explanation) {
  console.log("");
  console.log(`${c.cyan}${"=".repeat(72)}${c.reset}`);
  console.log(`${c.bold}  ${step}. ${title}${c.reset}`);
  console.log(`${c.dim}  ${explanation}${c.reset}`);
  console.log(`${c.cyan}${"=".repeat(72)}${c.reset}`);
  console.log("");
}

/** Print at most `limit` lines, saying how many were left out. */
function excerpt(text, limit = 30) {
  const lines = text.split("\n");
  console.log(lines.slice(0, limit).join("\n"));
  if (lines.length > limit) {
    console.log(`${c.dim}... ${lines.length - limit} more lines${c.reset}`);
  }
}

const rl = pause
  ? readline.createInterface({ input: process.stdin, output: process.stdout })
  : null;

function waitForEnter() {
  if (!rl) return Promise.resolve();
  return new Promise((resolve) =>
    rl.question(`\n${c.dim}  [Enter to continue]${c.reset}`, () => resolve())
  );
}

async function main() {
  console.log(`${c.bold}Stickynight ${SN.VERSION}${c.reset} — ${file}`);

  heading(1, "The source", "A program written in Stickynight.");
  excerpt(source, 40);
  await waitForEnter();

  heading(
    2,
    "Lexical analysis",
    "lexer.ts scans it character by character. Note the INDENT and DEDENT tokens: they are not in the source, the lexer made them from the layout."
  );
  excerpt(SN.tokenReport(source), 28);
  await waitForEnter();

  heading(
    3,
    "Syntax analysis",
    "parser.ts turns the flat token stream into a tree. 'is at least' was three tokens; it is one operator now."
  );
  excerpt(SN.astReport(source), 34);
  await waitForEnter();

  heading(4, "Execution", "interpreter.ts walks that tree and runs it.");
  const interpreted = SN.runSource(source, { maxSteps: 5_000_000 });
  if (interpreted.error) {
    console.log(interpreted.error.format(source, file, colour));
  } else {
    console.log(interpreted.output.join("\n"));
  }
  await waitForEnter();

  heading(
    5,
    "Code generation",
    "wasm/compiler.ts walks the SAME tree and emits WebAssembly instead of running it."
  );

  let generated = true;
  try {
    excerpt(SN.watReport(source), 34);
  } catch (error) {
    generated = false;
    if (error && typeof error.format === "function") {
      console.log(error.format(source, file, colour));
      console.log(
        `\n${c.dim}  (the code generator handles the numeric subset — see SPEC.md section 11)${c.reset}`
      );
    } else {
      throw error;
    }
  }
  await waitForEnter();

  if (generated) {
    heading(
      6,
      "Running the compiled code",
      "The generated module is handed to the WebAssembly engine and run. Compare this with step 4."
    );
    const compiled = await SN.runCompiled(source);
    if (compiled.error) {
      console.log(compiled.error.format(source, file, colour));
    } else {
      console.log(compiled.output.join("\n"));
      const same =
        JSON.stringify(compiled.output) ===
        JSON.stringify(interpreted.output.map((l) => (l === "yes" ? "1" : l === "no" ? "0" : l)));
      console.log("");
      console.log(
        same
          ? `${c.yellow}  Identical to the interpreter's output.${c.reset}`
          : `${c.yellow}  Differs from the interpreter — see SPEC.md section 11.${c.reset}`
      );
    }
    await waitForEnter();
  }

  heading(
    generated ? 7 : 6,
    "Error handling",
    "Every stage reports in the same shape: line, caret, plain sentence, suggestion."
  );

  const broken = [
    "errors/symbol-comparison.sn",
    "errors/bad-indent.sn",
    "errors/unknown-name.sn",
    "errors/wrong-args.sn",
  ];

  for (const name of broken) {
    const brokenPath = path.join(root, "examples", name);
    if (!fs.existsSync(brokenPath)) continue;
    const brokenSource = fs.readFileSync(brokenPath, "utf8");
    const result = SN.runSource(brokenSource, { maxSteps: 5000 });
    if (result.error) {
      console.log(result.error.format(brokenSource, `examples/${name}`, colour));
      console.log("");
    }
  }

  console.log(`${c.dim}  Full details: SPEC.md, docs/ARCHITECTURE.md, docs/VIVA.md${c.reset}`);
  console.log("");
  rl?.close();
}

main().catch((error) => {
  console.error(error);
  rl?.close();
  process.exit(1);
});
