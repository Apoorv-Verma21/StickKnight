/**
 * tests/wasm.test.ts — the code-generation back end.
 *
 * The real assertion in this file is the last group: for a set of programs,
 * COMPILE to WebAssembly, hand the bytes to the engine built into Node, run
 * them, and check the output matches what the interpreter printed for the same
 * source. Two independent back ends agreeing on an answer is much stronger
 * evidence than either one being inspected on its own.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { StickynightError } from "../src/errors";
import {
  compileSource,
  runCompiled,
  runSource,
  wasmBytes,
  watReport,
} from "../src/stickynight";

/**
 * WebAssembly has no boolean type, so a compiled program prints 1 and 0 where
 * the interpreter prints yes and no. That is a documented consequence of the
 * value representation rather than a disagreement about the answer, so it is
 * normalised away before the two outputs are compared.
 */
function normalise(lines: string[]): string[] {
  return lines.map((line) => (line === "yes" ? "1" : line === "no" ? "0" : line));
}

/** Both back ends, on the same source. */
async function bothWays(source: string): Promise<{ tree: string[]; compiled: string[] }> {
  const interpreted = runSource(source, { maxSteps: 5_000_000 });
  assert.equal(interpreted.error, null, `interpreter failed: ${interpreted.error?.short()}`);

  const compiled = await runCompiled(source);
  assert.equal(compiled.error, null, `compiler failed: ${compiled.error?.short()}`);

  return { tree: normalise(interpreted.output), compiled: compiled.output };
}

/**
 * WebAssembly.validate wants a plain ArrayBuffer; copy the bytes out of the
 * Uint8Array so the call is well typed whatever buffer backs it.
 */
function bufferFor(source: string): ArrayBuffer {
  const bytes = wasmBytes(source);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function expectCodegenError(source: string): StickynightError {
  try {
    compileSource(source);
  } catch (error) {
    assert.ok(error instanceof StickynightError);
    assert.equal(error.stage, "Code generation");
    return error;
  }
  assert.fail("expected the code generator to refuse this program");
}

describe("wasm: the binary is well formed", () => {
  it("starts with the WebAssembly magic number and version", () => {
    const bytes = wasmBytes("say 1\n");
    assert.deepEqual([...bytes.slice(0, 8)], [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
  });

  it("is accepted by the engine's own validator", () => {
    assert.ok(WebAssembly.validate(bufferFor("say 1 + 2\n")));
  });

  it("validates for every shape of control flow", () => {
    const sources = [
      "if yes:\n    say 1\notherwise:\n    say 2\n",
      "repeat 3 times:\n    say 1\n",
      "repeat with i from 1 to 3:\n    say i\n",
      "repeat with i from 5 to 1 by -1:\n    say i\n",
      "set n to 0\nrepeat while n is less than 3:\n    change n to n + 1\n    say n\n",
      "repeat with i from 1 to 5:\n    if i is 3:\n        stop\n    say i\n",
      "repeat with i from 1 to 5:\n    if i mod 2 is 0:\n        skip\n    say i\n",
      "define f with n:\n    give back n times 2\nsay f(4)\n",
    ];
    for (const source of sources) {
      assert.ok(WebAssembly.validate(bufferFor(source)), `did not validate:\n${source}`);
    }
  });

  it("exports main and every definition", () => {
    const module = compileSource("define f with n:\n    give back n\nsay f(1)\n");
    const exported = module.functions.filter((fn) => fn.exported).map((fn) => fn.name);
    assert.ok(exported.includes("main"));
    assert.ok(exported.includes("f"));
  });

  it("imports say from the host", () => {
    const module = compileSource("say 1\n");
    assert.deepEqual(module.imports.map((i) => `${i.module}.${i.field}`), ["stickynight.say"]);
  });
});

describe("wasm: the text format", () => {
  it("is a module with the import, the globals and the functions", () => {
    const wat = watReport("set total to 1\ndefine f:\n    give back 2\nsay total\n");
    assert.match(wat, /\(module/);
    assert.match(wat, /\(import "stickynight" "say"/);
    assert.match(wat, /\(global \$total \(mut f64\)/);
    assert.match(wat, /\(func \$f \(result f64\)/);
    assert.match(wat, /\(export "main"/);
  });

  it("shows branch depths next to their labels", () => {
    const wat = watReport("repeat with i from 1 to 3:\n    if i is 2:\n        stop\n    say i\n");
    assert.match(wat, /br \d+ \(;break;\)/);
    assert.match(wat, /block \$next/);
    assert.match(wat, /loop \$again/);
  });

  it("gives a shadowing name its own slot", () => {
    const source = [
      "define f:",
      "    set x to 1",
      "    if yes:",
      "        set x to 2",
      "    give back x",
      "",
    ].join("\n");
    assert.match(watReport(source), /\(local \$x~1 f64\)/);
  });
});

describe("wasm: what it cannot do, it says clearly", () => {
  const refusals: [string, RegExp][] = [
    ['say "hello"\n', /cannot compile text/],
    ["set xs to list of 1, 2\n", /cannot compile lists/],
    ["set xs to empty list\nfor each x in xs:\n    say x\n", /cannot compile lists/],
    ["set xs to empty list\nadd 1 to xs\n", /cannot compile/],
    ["say length of 1\n", /cannot compile/],
    ["define outer:\n    define inner:\n        say 1\n", /cannot compile/],
    ["say uppercase(1)\n", /does not know anything called 'uppercase'/],
  ];

  for (const [source, pattern] of refusals) {
    it(`refuses: ${source.split("\n")[0]}`, () => {
      const error = expectCodegenError(source);
      assert.match(error.message, pattern);
      assert.ok(error.line >= 1);
    });
  }

  it("points at the interpreter instead", () => {
    const error = expectCodegenError('say "hi"\n');
    assert.match(error.hint ?? "", /interpreter runs the whole language/);
  });
});

describe("wasm: compiled output matches the interpreter", () => {
  const programs: [string, string][] = [
    ["arithmetic", "say 2 + 3 * 4\nsay (2 + 3) * 4\nsay 10 divided by 4\nsay -7 + 2\n"],
    ["remainder", "say 17 mod 5\nsay 10 mod 2\nsay 7 mod 7\n"],
    ["comparisons", "say 1 is 1\nsay 1 is not 2\nsay 3 is at least 3\nsay 2 is less than 1\n"],
    ["logic", "say yes and no\nsay yes or no\nsay not yes\n"],
    [
      "conditions",
      ["repeat with n from 1 to 6:", "    if n mod 15 is 0:", "        say 15", "    otherwise if n mod 3 is 0:", "        say 3", "    otherwise:", "        say n", ""].join("\n"),
    ],
    ["count loop", "repeat 4 times:\n    say 7\n"],
    ["range loop", "repeat with i from 2 to 10 by 2:\n    say i\n"],
    ["backwards loop", "repeat with i from 5 to 1 by -1:\n    say i\n"],
    ["implicit backwards loop", "repeat with i from 3 to 1:\n    say i\n"],
    [
      "while loop",
      ["set n to 1", "repeat while n is less than 60:", "    change n to n times 2", "    say n", ""].join("\n"),
    ],
    [
      "stop and skip",
      ["repeat with i from 1 to 10:", "    if i mod 2 is 0:", "        skip", "    if i is more than 7:", "        stop", "    say i", ""].join("\n"),
    ],
    [
      "nested loops with stop",
      ["repeat with i from 1 to 3:", "    repeat with j from 1 to 5:", "        if j is 3:", "            stop", "        say i times 10 + j", ""].join("\n"),
    ],
    [
      "recursion",
      ["define factorial with n:", "    if n is at most 1:", "        give back 1", "    give back n times factorial(n minus 1)", "repeat with i from 1 to 10:", "    say factorial(i)", ""].join("\n"),
    ],
    [
      "several inputs",
      ["define gcd with a, b:", "    repeat while b is not 0:", "        set held to b", "        change b to a mod b", "        change a to held", "    give back a", "say gcd(1071, 462)", "say gcd(17, 5)", ""].join("\n"),
    ],
    [
      "globals",
      ["set total to 0", "repeat with i from 1 to 100:", "    change total to total + i", "say total", ""].join("\n"),
    ],
    [
      "shadowing",
      ["define f:", "    set x to 1", "    if yes:", "        set x to 99", "    give back x", "say f()", ""].join("\n"),
    ],
    [
      "short-circuit and",
      ["define boom:", "    say 999", "    give back 1", "if no and boom() is 1:", "    say 1", "say 2", ""].join("\n"),
    ],
    ["numeric built-ins", "say square_root(16)\nsay absolute(-3)\nsay floor(2.9)\nsay ceiling(2.1)\nsay minimum(3, 1)\nsay maximum(3, 1)\n"],
    [
      "collatz",
      ["define collatz with start:", "    set current to start", "    set steps to 0", "    repeat while current is not 1:", "        if current mod 2 is 0:", "            change current to current divided by 2", "        otherwise:", "            change current to 3 times current + 1", "        change steps to steps + 1", "    give back steps", "repeat with n from 1 to 20:", "    say collatz(n)", ""].join("\n"),
    ],
  ];

  for (const [name, source] of programs) {
    it(name, async () => {
      const { tree, compiled } = await bothWays(source);
      assert.deepEqual(compiled, tree, `\n--- source ---\n${source}`);
    });
  }

  it("agrees on the whole numeric example program", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(__dirname, "..", "..", "examples", "11-wasm-demo.sn");
    const source = fs.readFileSync(file, "utf8");
    const { tree, compiled } = await bothWays(source);
    assert.deepEqual(compiled, tree);
    assert.deepEqual(tree, ["3628800", "21", "111", "5050"]);
  });
});

describe("wasm: yes/no cross the boundary as 1 and 0", () => {
  it("prints 1 for yes and 0 for no", async () => {
    const compiled = await runCompiled("say 1 is 1\nsay 1 is 2\n");
    assert.equal(compiled.error, null);
    assert.deepEqual(compiled.output, ["1", "0"]);
  });

  it("which is the one place the two back ends differ, on purpose", () => {
    const interpreted = runSource("say 1 is 1\n");
    assert.deepEqual(interpreted.output, ["yes"]);
  });
});
