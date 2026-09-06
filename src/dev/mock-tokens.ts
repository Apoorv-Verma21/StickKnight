/**
 * dev/mock-tokens.ts — the scaffold that let both halves of the project be
 * built at the same time.
 *
 * The lexer -> parser -> interpreter chain is sequential, so a naive split of
 * the work ("you do days 1-4, I do days 5-8") would have left one person
 * waiting. Instead the two tracks split by pipeline half, and this file is
 * what made that possible: it is a HAND-WRITTEN token stream for the program
 * below, typed out on Day 1 straight from the agreed Token type.
 *
 * The back-end track developed and tested the whole parser against this
 * constant while the front-end track was still writing the scanner. The
 * moment lexer.ts worked, the two were swapped over — and
 * tests/integration.test.ts still pins that swap in place by asserting that
 * the real lexer produces exactly this stream. If someone changes the lexer
 * in a way that breaks the contract, that test says so.
 *
 * Positions (line/column) are deliberately NOT part of the comparison: they
 * could not have been predicted by hand before the scanner existed, and the
 * contract that mattered was the shape of the stream, not its coordinates.
 */

import { makeToken, Token, TokenType } from "../token";

const T = TokenType;

/** The program the mock stream corresponds to, character for character. */
export const MOCK_SOURCE = `define classify with score:
    if score is at least 90:
        give back "A"
    otherwise if score is at least 75:
        give back "B"
    otherwise:
        give back "C"

set marks to 82
say classify(marks)
`;

/**
 * The same program as a token stream, written out by hand.
 * Read it top to bottom against MOCK_SOURCE: every word became one token,
 * and the four INDENT / five DEDENT tokens are the block structure that the
 * source only expresses through spacing.
 */
export const MOCK_TOKENS: Token[] = [
  // define classify with score:
  makeToken(T.DEFINE, "define"),
  makeToken(T.IDENTIFIER, "classify"),
  makeToken(T.WITH, "with"),
  makeToken(T.IDENTIFIER, "score"),
  makeToken(T.COLON, ":"),
  makeToken(T.NEWLINE, "\\n"),
  makeToken(T.INDENT, ""),

  //     if score is at least 90:
  makeToken(T.IF, "if"),
  makeToken(T.IDENTIFIER, "score"),
  makeToken(T.IS, "is"),
  makeToken(T.AT, "at"),
  makeToken(T.LEAST, "least"),
  makeToken(T.NUMBER, "90", 1, 1, 90),
  makeToken(T.COLON, ":"),
  makeToken(T.NEWLINE, "\\n"),
  makeToken(T.INDENT, ""),

  //         give back "A"
  makeToken(T.GIVE, "give"),
  makeToken(T.BACK, "back"),
  makeToken(T.TEXT, '"A"', 1, 1, "A"),
  makeToken(T.NEWLINE, "\\n"),
  makeToken(T.DEDENT, ""),

  //     otherwise if score is at least 75:
  makeToken(T.OTHERWISE, "otherwise"),
  makeToken(T.IF, "if"),
  makeToken(T.IDENTIFIER, "score"),
  makeToken(T.IS, "is"),
  makeToken(T.AT, "at"),
  makeToken(T.LEAST, "least"),
  makeToken(T.NUMBER, "75", 1, 1, 75),
  makeToken(T.COLON, ":"),
  makeToken(T.NEWLINE, "\\n"),
  makeToken(T.INDENT, ""),

  //         give back "B"
  makeToken(T.GIVE, "give"),
  makeToken(T.BACK, "back"),
  makeToken(T.TEXT, '"B"', 1, 1, "B"),
  makeToken(T.NEWLINE, "\\n"),
  makeToken(T.DEDENT, ""),

  //     otherwise:
  makeToken(T.OTHERWISE, "otherwise"),
  makeToken(T.COLON, ":"),
  makeToken(T.NEWLINE, "\\n"),
  makeToken(T.INDENT, ""),

  //         give back "C"
  makeToken(T.GIVE, "give"),
  makeToken(T.BACK, "back"),
  makeToken(T.TEXT, '"C"', 1, 1, "C"),
  makeToken(T.NEWLINE, "\\n"),
  makeToken(T.DEDENT, ""),
  makeToken(T.DEDENT, ""),

  // set marks to 82
  makeToken(T.SET, "set"),
  makeToken(T.IDENTIFIER, "marks"),
  makeToken(T.TO, "to"),
  makeToken(T.NUMBER, "82", 1, 1, 82),
  makeToken(T.NEWLINE, "\\n"),

  // say classify(marks)
  makeToken(T.SAY, "say"),
  makeToken(T.IDENTIFIER, "classify"),
  makeToken(T.LPAREN, "("),
  makeToken(T.IDENTIFIER, "marks"),
  makeToken(T.RPAREN, ")"),
  makeToken(T.NEWLINE, "\\n"),

  makeToken(T.EOF, ""),
];

/** The part of a token the two tracks actually agreed on. */
export interface TokenShape {
  type: TokenType;
  lexeme: string;
  literal: unknown;
}

export function shapeOf(tokens: Token[]): TokenShape[] {
  return tokens.map((t) => ({
    type: t.type,
    lexeme: t.lexeme,
    literal: t.literal === undefined ? null : t.literal,
  }));
}
