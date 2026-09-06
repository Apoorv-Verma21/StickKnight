/**
 * tests/integration.test.ts — the Day-1 contract, pinned down.
 *
 * The two tracks agreed a Token shape on Day 1 and then built in parallel: the
 * back end parsed a hand-written token list (src/dev/mock-tokens.ts) while the
 * front end was still writing the scanner. This file is the swap-over point
 * from the roadmap, kept as a test so it stays true.
 *
 * If the lexer is ever changed in a way that breaks the agreement, this fails
 * with a diff of the two streams rather than with a mystery further down the
 * pipeline.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { toSExpression } from "../src/ast-printer";
import { MOCK_SOURCE, MOCK_TOKENS, shapeOf } from "../src/dev/mock-tokens";
import { Interpreter } from "../src/interpreter";
import { tokenize } from "../src/lexer";
import { parse } from "../src/parser";

describe("integration: the hand-written token stream matches the real lexer", () => {
  it("produces the same tokens, in the same order", () => {
    assert.deepEqual(shapeOf(tokenize(MOCK_SOURCE)), shapeOf(MOCK_TOKENS));
  });

  it("produces the same number of INDENT and DEDENT tokens", () => {
    const real = tokenize(MOCK_SOURCE);
    const count = (tokens: typeof real, type: string) =>
      tokens.filter((t) => t.type === type).length;
    assert.equal(count(real, "INDENT"), count(MOCK_TOKENS, "INDENT"));
    assert.equal(count(real, "DEDENT"), count(MOCK_TOKENS, "DEDENT"));
  });

  it("parses to the same tree from either stream", () => {
    const fromMock = toSExpression(parse(MOCK_TOKENS));
    const fromLexer = toSExpression(parse(tokenize(MOCK_SOURCE)));
    assert.equal(fromMock, fromLexer);
  });

  it("runs to the same output from either stream", () => {
    const run = (tokens: typeof MOCK_TOKENS) => {
      const output: string[] = [];
      new Interpreter({ output: (line) => output.push(line) }).interpret(parse(tokens));
      return output;
    };

    assert.deepEqual(run(MOCK_TOKENS), ["B"]);
    assert.deepEqual(run(tokenize(MOCK_SOURCE)), ["B"]);
  });
});
