/**
 * tests/parser.test.ts — the grammar.
 *
 * Almost everything here is checked through the s-expression printer, because
 * the shape of the tree is exactly what these tests are about: `2 + 3 times 4`
 * either groups as `(+ 2 (* 3 4))` or the precedence is wrong, and nothing
 * else needs to be inspected to know which.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { toSExpression } from "../src/ast-printer";
import { StickynightError } from "../src/errors";
import { tokenize } from "../src/lexer";
import { parse, parseWithRecovery } from "../src/parser";

function sexp(source: string): string {
  return toSExpression(parse(tokenize(source)));
}

function expectSyntaxError(source: string): StickynightError {
  try {
    parse(tokenize(source));
  } catch (error) {
    assert.ok(error instanceof StickynightError, `expected an error, got ${error}`);
    assert.equal(error.stage, "Syntax");
    return error;
  }
  assert.fail(`expected '${source}' to be a syntax error`);
}

describe("parser: precedence", () => {
  it("multiplies before it adds", () => {
    assert.equal(sexp("say 2 + 3 * 4"), "(say (+ 2 (* 3 4)))");
  });

  it("treats the word forms exactly like the symbols", () => {
    assert.equal(sexp("say 2 plus 3 times 4"), sexp("say 2 + 3 * 4"));
    assert.equal(sexp("say 8 divided by 2"), sexp("say 8 / 2"));
    assert.equal(sexp("say 7 mod 2"), sexp("say 7 % 2"));
  });

  it("associates arithmetic to the left", () => {
    assert.equal(sexp("say 10 - 3 - 2"), "(say (- (- 10 3) 2))");
  });

  it("compares after it adds", () => {
    assert.equal(sexp("say 1 + 2 is 3"), "(say (is (+ 1 2) 3))");
  });

  it("puts 'and' below comparison and 'or' below 'and'", () => {
    assert.equal(
      sexp("say a is 1 and b is 2 or c is 3"),
      "(say (or (and (is a 1) (is b 2)) (is c 3)))"
    );
  });

  it("reads 'not' as covering the whole comparison", () => {
    assert.equal(sexp("say not a is 1"), "(say (not (is a 1)))");
  });

  it("lets brackets override everything", () => {
    assert.equal(sexp("say (2 + 3) * 4"), "(say (* (+ 2 3) 4))");
  });

  it("reads a leading minus as negation", () => {
    assert.equal(sexp("say -3 + 1"), "(say (+ (- 3) 1))");
  });
});

describe("parser: multi-word phrases", () => {
  const cases: [string, string][] = [
    ["a is b", "(is a b)"],
    ["a is not b", "(is not a b)"],
    ["a is at least b", "(is at least a b)"],
    ["a is at most b", "(is at most a b)"],
    ["a is more than b", "(is more than a b)"],
    ["a is greater than b", "(is more than a b)"],
    ["a is less than b", "(is less than a b)"],
    ["a is equal to b", "(is a b)"],
    ["a is not equal to b", "(is not a b)"],
  ];

  for (const [phrase, expected] of cases) {
    it(`folds '${phrase}'`, () => {
      assert.equal(sexp(`say ${phrase}`), `(say ${expected})`);
    });
  }

  it("says what is missing after a half-written phrase", () => {
    const error = expectSyntaxError("if a is at 3:\n    say 1\n");
    assert.match(error.message, /expected 'least' or 'most'/);
    assert.match(error.hint ?? "", /is at least/);
  });

  it("insists on 'than' after 'more'", () => {
    assert.match(expectSyntaxError("if a is more 3:\n    say 1\n").message, /'than'/);
  });

  it("insists on 'back' after 'give'", () => {
    assert.match(
      expectSyntaxError("define f:\n    give 1\n").message,
      /expected 'back'/
    );
  });
});

describe("parser: statements", () => {
  it("parses set and change", () => {
    assert.equal(sexp("set x to 1"), "(set x 1)");
    assert.equal(sexp("change x to 2"), "(change x 2)");
  });

  it("parses a change to one item of a list", () => {
    assert.equal(sexp("change item 2 of xs to 9"), "(change (item 2 xs) 9)");
  });

  it("parses all three loop forms", () => {
    assert.equal(sexp("repeat 3 times:\n    say 1"), "(repeat-times 3 (say 1))");
    assert.equal(
      sexp("repeat with i from 1 to 3:\n    say i"),
      "(repeat-range i 1 3 (say i))"
    );
    assert.equal(
      sexp("repeat with i from 1 to 9 by 2:\n    say i"),
      "(repeat-range i 1 9 by 2 (say i))"
    );
    assert.equal(
      sexp("repeat while a is 1:\n    say 1"),
      "(repeat-while (is a 1) (say 1))"
    );
  });

  it("keeps 'times' out of the repeat count, but allows '*' there", () => {
    assert.equal(sexp("repeat 3 times:\n    say 1"), "(repeat-times 3 (say 1))");
    assert.equal(
      sexp("repeat rows * cols times:\n    say 1"),
      "(repeat-times (* rows cols) (say 1))"
    );
  });

  it("builds an otherwise-if chain as a nested if", () => {
    const source = ["if a:", "    say 1", "otherwise if b:", "    say 2", "otherwise:", "    say 3", ""].join("\n");
    assert.equal(
      sexp(source),
      "(if a (then (say 1)) (otherwise (if b (then (say 2)) (otherwise (say 3)))))"
    );
  });

  it("parses a definition with and without inputs", () => {
    assert.equal(sexp("define f:\n    say 1"), "(define f () (say 1))");
    assert.equal(sexp("define f with a, b:\n    say 1"), "(define f (a b) (say 1))");
  });

  it("accepts a one-line block after the colon", () => {
    assert.equal(sexp("if a: say 1"), "(if a (then (say 1)))");
  });

  it("parses list literals and the empty list", () => {
    assert.equal(sexp("set xs to list of 1, 2, 3"), "(set xs (list 1 2 3))");
    assert.equal(sexp("set xs to empty list"), "(set xs (list))");
  });

  it("accepts 'length' as a call as well as a phrase", () => {
    assert.equal(sexp("say length(xs)"), "(say (call length xs))");
    assert.equal(sexp("say length of xs"), "(say (length xs))");
  });

  it("parses 'item ... of' and 'length of'", () => {
    assert.equal(sexp("say item 1 of xs"), "(say (item 1 xs))");
    assert.equal(sexp("say length of xs"), "(say (length xs))");
  });

  it("binds 'length of' tightly, so arithmetic applies afterwards", () => {
    assert.equal(sexp("say length of xs + 1"), "(say (+ (length xs) 1))");
  });

  it("nests 'length of' around 'item ... of'", () => {
    assert.equal(sexp("say length of item 1 of xs"), "(say (length (item 1 xs)))");
  });

  it("parses calls, including calls with no inputs", () => {
    assert.equal(sexp("say f(1, 2)"), "(say (call f 1 2))");
    assert.equal(sexp("say f()"), "(say (call f))");
  });
});

describe("parser: errors", () => {
  it("asks for the colon that opens a block", () => {
    const error = expectSyntaxError("if a is 1\n    say 1\n");
    assert.match(error.message, /expected a ':'/);
    assert.equal(error.line, 1);
  });

  it("reports an empty block", () => {
    assert.match(expectSyntaxError("if a is 1:\nsay 2\n").message, /block is empty/);
  });

  it("reports a line indented for no reason", () => {
    assert.match(
      expectSyntaxError("say 1\n    say 2\n").message,
      /does not open a block/
    );
  });

  it("reports an 'otherwise' with no 'if'", () => {
    assert.match(expectSyntaxError("otherwise:\n    say 1\n").message, /no 'if'/);
  });

  it("reports a keyword used as a name", () => {
    assert.match(expectSyntaxError("set repeat to 1\n").message, /is a Stickynight keyword/);
  });

  it("nudges a bare name towards say or set", () => {
    const error = expectSyntaxError("total\n");
    assert.match(error.message, /does not do anything/);
    assert.match(error.hint ?? "", /say total/);
  });

  it("reports a missing closing bracket", () => {
    assert.match(expectSyntaxError("say f(1\n").message, /expected '\)'/);
  });

  it("rejects the same input name twice", () => {
    assert.match(
      expectSyntaxError("define f with a, a:\n    say 1\n").message,
      /listed twice/
    );
  });
});

describe("parser: panic-mode recovery", () => {
  it("reports every broken statement in one pass, not just the first", () => {
    const source = ["set a to", "say 1", "set b to", "say 2", ""].join("\n");
    const { errors } = parseWithRecovery(tokenize(source));
    assert.equal(errors.length, 2);
    assert.deepEqual(errors.map((e) => e.line), [1, 3]);
  });

  it("still returns the statements that did parse", () => {
    const source = ["set a to", "say 1", ""].join("\n");
    const { program, errors } = parseWithRecovery(tokenize(source));
    assert.equal(errors.length, 1);
    assert.equal(program.statements.length, 1);
    assert.equal(toSExpression(program), "(say 1)");
  });

  it("finds nothing wrong with a correct program", () => {
    const { errors } = parseWithRecovery(tokenize("set a to 1\nsay a\n"));
    assert.equal(errors.length, 0);
  });
});
