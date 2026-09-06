/**
 * tests/lexer.test.ts — the front end.
 *
 * The interesting cases are the ones a scanner for a brace language never has
 * to face: indentation, blank lines inside blocks, and end of file with blocks
 * still open.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { StickynightError } from "../src/errors";
import { tokenize } from "../src/lexer";
import { Token, TokenType } from "../src/token";

const T = TokenType;

/** Just the token types, which is what most of these assertions care about. */
function types(source: string): TokenType[] {
  return tokenize(source).map((t) => t.type);
}

function lexemes(source: string): string[] {
  return tokenize(source)
    .filter((t) => ![T.NEWLINE, T.INDENT, T.DEDENT, T.EOF].includes(t.type))
    .map((t) => t.lexeme);
}

function expectLexicalError(source: string): StickynightError {
  try {
    tokenize(source);
  } catch (error) {
    assert.ok(error instanceof StickynightError, "expected a StickynightError");
    assert.equal(error.stage, "Lexical");
    return error;
  }
  assert.fail(`expected '${source}' to be rejected by the lexer`);
}

describe("lexer: words and symbols", () => {
  it("recognises keywords, names and punctuation", () => {
    assert.deepEqual(types("set total to 0\n"), [
      T.SET,
      T.IDENTIFIER,
      T.TO,
      T.NUMBER,
      T.NEWLINE,
      T.EOF,
    ]);
  });

  it("folds '+' and 'plus' onto one token type", () => {
    assert.deepEqual(types("say 1 + 2\n"), types("say 1 plus 2\n"));
  });

  it("keeps '*' and 'times' apart, because 'times' is also a loop word", () => {
    assert.equal(tokenize("say 2 * 3\n")[2].type, T.STAR);
    assert.equal(tokenize("say 2 times 3\n")[2].type, T.TIMES);
  });

  it("does not merge multi-word phrases — that is the parser's job", () => {
    assert.deepEqual(lexemes("if a is at least 3:"), [
      "if",
      "a",
      "is",
      "at",
      "least",
      "3",
      ":",
    ]);
  });

  it("allows underscores and digits inside names", () => {
    assert.deepEqual(lexemes("set my_score2 to 1"), ["set", "my_score2", "to", "1"]);
  });
});

describe("lexer: literals", () => {
  it("reads whole numbers and decimals", () => {
    const tokens = tokenize("say 42\nsay 3.5\n").filter((t) => t.type === T.NUMBER);
    assert.deepEqual(tokens.map((t) => t.literal), [42, 3.5]);
  });

  it("decodes escapes inside text", () => {
    const [, text] = tokenize('say "a\\nb\\tc\\"d\\\\e"\n');
    assert.equal(text.literal, 'a\nb\tc"d\\e');
  });

  it("gives yes / no / nothing their values", () => {
    const values = tokenize("say yes\nsay no\nsay nothing\n")
      .filter((t) => [T.YES, T.NO, T.NOTHING].includes(t.type))
      .map((t) => t.literal);
    assert.deepEqual(values, [true, false, null]);
  });

  it("treats true and false as spellings of yes and no", () => {
    assert.equal(tokenize("say true\n")[1].type, T.YES);
    assert.equal(tokenize("say false\n")[1].type, T.NO);
  });
});

describe("lexer: comments and blank lines", () => {
  it("drops a comment at the end of a line", () => {
    assert.deepEqual(lexemes("say 1 # this is ignored\n"), ["say", "1"]);
  });

  it("drops a whole-line comment without ending the statement", () => {
    assert.deepEqual(types("# nothing here\nsay 1\n"), [
      T.SAY,
      T.NUMBER,
      T.NEWLINE,
      T.EOF,
    ]);
  });

  it("does not close a block over a blank line or a comment", () => {
    const source = ["if yes:", "    say 1", "", "    # still inside", "    say 2", ""].join("\n");
    const counts = types(source);
    assert.equal(counts.filter((t) => t === T.INDENT).length, 1);
    assert.equal(counts.filter((t) => t === T.DEDENT).length, 1);
  });
});

describe("lexer: indentation", () => {
  it("emits one INDENT and one DEDENT for a simple block", () => {
    assert.deepEqual(types("if yes:\n    say 1\nsay 2\n"), [
      T.IF,
      T.YES,
      T.COLON,
      T.NEWLINE,
      T.INDENT,
      T.SAY,
      T.NUMBER,
      T.NEWLINE,
      T.DEDENT,
      T.SAY,
      T.NUMBER,
      T.NEWLINE,
      T.EOF,
    ]);
  });

  it("emits one DEDENT per level when several close at once", () => {
    const source = ["if yes:", "    if yes:", "        say 1", "say 2", ""].join("\n");
    const dedents = types(source).filter((t) => t === T.DEDENT);
    assert.equal(dedents.length, 2);
  });

  it("closes every open block at the end of the file", () => {
    const source = ["if yes:", "    if yes:", "        say 1", ""].join("\n");
    const dedents = types(source).filter((t) => t === T.DEDENT);
    assert.equal(dedents.length, 2);
  });

  it("ends the last statement even with no trailing newline", () => {
    const tokens = types("say 1");
    assert.deepEqual(tokens, [T.SAY, T.NUMBER, T.NEWLINE, T.EOF]);
  });

  it("accepts any consistent indent width, not just four", () => {
    assert.doesNotThrow(() => tokenize("if yes:\n  say 1\n"));
    assert.doesNotThrow(() => tokenize("if yes:\n        say 1\n"));
  });

  it("rejects a dedent that matches no open block", () => {
    const error = expectLexicalError(
      ["if yes:", "        say 1", "      say 2", ""].join("\n")
    );
    assert.equal(error.line, 3);
    assert.match(error.message, /does not line up/);
    assert.match(error.hint ?? "", /columns 1, 9/);
  });

  it("rejects a tab used for indentation, and says why", () => {
    const error = expectLexicalError("if yes:\n\tsay 1\n");
    assert.match(error.message, /indented with a tab/);
    assert.match(error.hint ?? "", /4 spaces/);
  });
});

describe("lexer: line continuation inside brackets", () => {
  it("ignores newlines while a bracket is open", () => {
    const source = "say (1 +\n     2)\n";
    const newlines = types(source).filter((t) => t === T.NEWLINE);
    assert.equal(newlines.length, 1);
  });

  it("still tracks line numbers across the continuation", () => {
    const tokens: Token[] = tokenize("say (1 +\n     2)\n");
    const two = tokens.find((t) => t.lexeme === "2");
    assert.equal(two?.line, 2);
  });
});

describe("lexer: errors point at the mistake and suggest the fix", () => {
  it("suggests 'is at least' for >=", () => {
    const error = expectLexicalError("if a >= 1:\n");
    assert.match(error.hint ?? "", /is at least/);
    assert.equal(error.column, 6);
  });

  it("suggests 'is more than' for >", () => {
    assert.match(expectLexicalError("if a > 1:\n").hint ?? "", /is more than/);
  });

  it("suggests 'is' for ==", () => {
    assert.match(expectLexicalError("if a == 1:\n").hint ?? "", /Write 'is'/);
  });

  it("suggests 'and' for &&", () => {
    assert.match(expectLexicalError("if a && b:\n").hint ?? "", /Write 'and'/);
  });

  it("explains that there are no braces", () => {
    assert.match(expectLexicalError("if a {\n").message, /curly braces/);
  });

  it("explains that there are no semicolons", () => {
    assert.match(expectLexicalError("say 1;\n").message, /semicolons/);
  });

  it("blames an unclosed text on the line it started on", () => {
    const error = expectLexicalError('say "oops\nsay 1\n');
    assert.equal(error.line, 1);
    assert.match(error.message, /never closed/);
  });

  it("rejects a number that ends in a dot", () => {
    const error = expectLexicalError("say 12.\n");
    assert.match(error.message, /not a complete number/);
  });

  it("rejects an unknown escape inside text", () => {
    assert.match(expectLexicalError('say "a\\qb"\n').message, /follow a backslash/);
  });

  it("catches a keyword written with capitals", () => {
    const error = expectLexicalError("Say 1\n");
    assert.match(error.message, /written with capital letters/);
    assert.match(error.hint ?? "", /always lowercase/);
  });
});
