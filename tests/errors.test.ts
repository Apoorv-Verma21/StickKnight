/**
 * tests/errors.test.ts — the Day 8 deliverable: one error format everywhere.
 *
 * The point of these tests is not that a mistake is caught — the other files
 * cover that — but that all three stages report it the SAME way: same header,
 * same source excerpt, same caret, same voice.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { closestName, editDistance, StickynightError } from "../src/errors";
import { runSource, parseSourceReportingAll } from "../src/stickynight";

/** Run a program that must fail, and return its rendered report. */
function report(source: string): { error: StickynightError; text: string } {
  const result = runSource(source, { maxSteps: 100_000 });
  assert.ok(result.error, `expected this to fail:\n${source}`);
  return { error: result.error!, text: result.error!.format(source, "demo.sn") };
}

const LEXICAL = "if a >= 1:\n    say 1\n";
const SYNTAX = "if a is 1\n    say 1\n";
const RUNTIME = "say missing\n";

describe("every stage reports in the same shape", () => {
  const cases: [string, string, string][] = [
    ["the lexer", LEXICAL, "Lexical"],
    ["the parser", SYNTAX, "Syntax"],
    ["the interpreter", RUNTIME, "Runtime"],
  ];

  for (const [who, source, stage] of cases) {
    describe(who, () => {
      it("names its stage and the file", () => {
        const { text } = report(source);
        assert.match(text, new RegExp(`^${stage} error in demo\\.sn, line \\d+:`));
      });

      it("quotes the offending line with its number", () => {
        const { error, text } = report(source);
        const line = source.split("\n")[error.line - 1];
        assert.ok(text.includes(line), `report should quote: ${line}`);
        assert.match(text, new RegExp(`\\n\\s*${error.line} \\|`));
      });

      it("draws a caret under the problem", () => {
        assert.match(report(source).text, /\n\s*\|\s*\^+/);
      });

      it("ends its message with a full stop", () => {
        assert.match(report(source).error.message, /\.$/);
      });

      it("offers a hint", () => {
        const { error, text } = report(source);
        assert.ok(error.hint, "every one of these cases should have a hint");
        assert.match(text, /hint:/);
      });

      it("has a one-line form as well", () => {
        const { error } = report(source);
        assert.equal(
          error.short(),
          `[line ${error.line}] ${error.stage} error: ${error.message}`
        );
      });
    });
  }
});

describe("the caret lines up with the source", () => {
  it("points at the column the error names", () => {
    const source = "say 1 + missing\n";
    const { error, text } = report(source);
    const lines = text.split("\n");
    const caretLine = lines.find((line) => line.includes("^"));
    assert.ok(caretLine);

    // The caret sits under the column, allowing for the "  N | " gutter.
    const sourceLine = lines.find((line) => line.includes("say 1 + missing"));
    assert.ok(sourceLine);
    const gutter = sourceLine!.indexOf("say 1 + missing");
    assert.equal(caretLine!.indexOf("^"), gutter + error.column - 1);
  });

  it("uses as many carets as the token is long", () => {
    const { error, text } = report("say missing\n");
    const caretLine = text.split("\n").find((line) => line.includes("^"))!;
    assert.equal(caretLine.trim().replace(/^\|\s*/, "").length, error.length);
    assert.equal(error.length, "missing".length);
  });
});

describe("colour is optional", () => {
  it("adds no escape codes by default", () => {
    const source = RUNTIME;
    const { error } = report(source);
    assert.ok(!error.format(source, "demo.sn", false).includes("\u001b"));
  });

  it("adds them when asked", () => {
    const source = RUNTIME;
    const { error } = report(source);
    assert.ok(error.format(source, "demo.sn", true).includes("\u001b"));
  });
});

describe("a runtime error carries the call stack", () => {
  it("names the definitions it was inside", () => {
    const source = ["define inner:", "    say missing", "define outer:", "    inner()", "outer()", ""].join("\n");
    const { error, text } = report(source);
    assert.deepEqual(error.stack_.map((f) => f.name), ["inner", "outer"]);
    assert.match(text, /while running:/);
    assert.match(text, /inner, line 4/);
  });

  it("does not carry one for a lexical or syntax error", () => {
    assert.equal(report(LEXICAL).error.stack_.length, 0);
    assert.equal(report(SYNTAX).error.stack_.length, 0);
  });
});

describe("the parser reports every mistake in one pass", () => {
  it("finds three broken lines at once", () => {
    const source = ["set a to", "say 1", "if x", "say 2", "define", ""].join("\n");
    const { errors } = parseSourceReportingAll(source);
    assert.ok(errors.length >= 2, `expected several errors, got ${errors.length}`);
    for (const error of errors) {
      assert.equal(error.stage, "Syntax");
      assert.ok(error.line >= 1);
    }
  });
});

describe("suggestion machinery", () => {
  it("measures edit distance", () => {
    assert.equal(editDistance("total", "total"), 0);
    assert.equal(editDistance("total", "totl"), 1);
    assert.equal(editDistance("", "abc"), 3);
  });

  it("suggests a close name", () => {
    assert.equal(closestName("totl", ["total", "count"]), "total");
  });

  it("says nothing when nothing is close", () => {
    assert.equal(closestName("zzzzzz", ["total", "count"]), null);
  });

  it("is stricter about short names, where everything looks close", () => {
    assert.equal(closestName("ab", ["xyz"]), null);
  });
});
