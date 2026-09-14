/**
 * tests/examples.test.ts — the sample programs are part of the deliverable,
 * so they are tested like everything else.
 *
 * Every program in examples/ must run cleanly and print what it is supposed
 * to; every program in examples/errors/ must fail at the stage it is there to
 * demonstrate, with a line number and a hint. That way a broken example can
 * never survive into the submission.
 */

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";

import { Stage } from "../src/errors";
import { runSource, tokenizeSource, parseSource } from "../src/stickynight";

const EXAMPLES = path.join(__dirname, "..", "..", "examples");
const ERRORS = path.join(EXAMPLES, "errors");

function read(dir: string, name: string): string {
  return fs.readFileSync(path.join(dir, name), "utf8");
}

function run(name: string): string[] {
  const source = read(EXAMPLES, name);
  const result = runSource(source, { maxSteps: 5_000_000 });
  if (result.error) {
    assert.fail(`${name} should run cleanly:\n${result.error.format(source, name)}`);
  }
  return result.output;
}

const EXPECTED: Record<string, string[]> = {
  "01-hello.sn": [
    "Hello, world!",
    "Hello, Sahaj!",
    "The year is 2026",
    "Goodbye, everyone!",
  ],
  "02-grades.sn": ["B", "95 -> A", "82 -> B", "61 -> C", "38 -> F"],
  "04-fibonacci.sn": [
    "The first eleven, worked out recursively:",
    "0",
    "1",
    "1",
    "2",
    "3",
    "5",
    "8",
    "13",
    "21",
    "34",
    "55",
    "The thirtieth, worked out with a loop:",
    "832040",
  ],
  "08-closures.sn": ["1", "2", "3", "1", "20"],
  "10-sorting.sn": [
    "Before:    list of 5, 3, 9, 1, 7, 2",
    "After:     list of 1, 2, 3, 5, 7, 9",
    "Untouched: list of 5, 3, 9, 1, 7, 2",
  ],
  "11-wasm-demo.sn": ["3628800", "21", "111", "5050"],
};

describe("examples: every program runs", () => {
  const names = fs.readdirSync(EXAMPLES).filter((n) => n.endsWith(".sn")).sort();

  it("there are examples to run", () => {
    assert.ok(names.length >= 10, `expected at least ten examples, found ${names.length}`);
  });

  for (const name of names) {
    describe(name, () => {
      it("tokenizes and parses", () => {
        const source = read(EXAMPLES, name);
        assert.doesNotThrow(() => parseSource(source));
        assert.ok(tokenizeSource(source).length > 0);
      });

      it("runs and prints something", () => {
        assert.ok(run(name).length > 0);
      });

      if (EXPECTED[name]) {
        it("prints exactly what it should", () => {
          assert.deepEqual(run(name), EXPECTED[name]);
        });
      }
    });
  }
});

describe("examples: spot checks on the longer ones", () => {
  it("fizzbuzz gets the pattern right", () => {
    const output = run("03-fizzbuzz.sn");
    assert.equal(output.length, 20);
    assert.equal(output[0], "1");
    assert.equal(output[2], "Fizz");
    assert.equal(output[4], "Buzz");
    assert.equal(output[14], "FizzBuzz");
  });

  it("the primes example finds the right fifteen", () => {
    const output = run("09-primes.sn");
    assert.equal(
      output[1],
      "list of 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47"
    );
    assert.equal(output[2], "That is 15 of them.");
  });

  it("the loops example shows every loop form", () => {
    const output = run("07-loops.sn");
    assert.ok(output.includes("Counting down:"));
    assert.equal(output.filter((line) => line === "hello").length, 3);
    assert.ok(output.includes("128"));
  });

  it("the list example keeps positions 1-based", () => {
    const output = run("05-lists.sn");
    assert.match(output[1], /The first one: 88$/);
    assert.match(output[2], /The last one:  95$/);
  });
});

describe("error examples: each fails at the stage it demonstrates", () => {
  const expectedStage: Record<string, Stage> = {
    "bad-indent.sn": "Lexical",
    "curly-braces.sn": "Lexical",
    "symbol-comparison.sn": "Lexical",
    "unclosed-text.sn": "Lexical",
    "missing-colon.sn": "Syntax",
    "keyword-as-name.sn": "Syntax",
    "divide-by-zero.sn": "Runtime",
    "endless-loop.sn": "Runtime",
    "index-out-of-range.sn": "Runtime",
    "number-as-condition.sn": "Runtime",
    "runaway-recursion.sn": "Runtime",
    "several-mistakes.sn": "Syntax",
    "type-mix.sn": "Runtime",
    "unknown-name.sn": "Runtime",
    "wrong-args.sn": "Runtime",
  };

  const names = fs.readdirSync(ERRORS).filter((n) => n.endsWith(".sn")).sort();

  it("every error example is accounted for", () => {
    assert.deepEqual(names, Object.keys(expectedStage).sort());
  });

  for (const name of names) {
    describe(name, () => {
      const source = read(ERRORS, name);
      const result = runSource(source, { maxSteps: 2000 });

      it("fails", () => {
        assert.ok(result.error, `${name} was supposed to fail but did not`);
      });

      it(`fails at the ${expectedStage[name]} stage`, () => {
        assert.equal(result.error?.stage, expectedStage[name]);
      });

      it("points at a real line", () => {
        const lines = source.split("\n").length;
        assert.ok(result.error!.line >= 1 && result.error!.line <= lines);
      });

      it("offers a hint", () => {
        assert.ok(result.error!.hint, `${name} should suggest what to do`);
      });

      it("renders without throwing", () => {
        assert.ok(result.error!.format(source, name).length > 0);
      });
    });
  }
});
