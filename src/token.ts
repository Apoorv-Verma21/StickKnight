/**
 * token.ts — Stickynight token contract (Day 1 deliverable).
 *
 * This file is the frozen interface between the LEXER (front end) and the
 * PARSER (back end). Both tracks were built in parallel against these
 * definitions: the parser was first exercised with a hand-written mock token
 * list (see src/dev/mock-tokens.ts) before the real lexer existed.
 *
 * DESIGN NOTE — single-word tokens only.
 * Stickynight has multi-word operator phrases ("is at least", "give back",
 * "otherwise if"). Those are NOT merged here. The lexer stays a pure
 * character-level DFA that emits one token per word; the parser folds the
 * words into phrases with fixed lookahead. See SPEC.md section 9.
 */

export enum TokenType {
  // ---- literals ------------------------------------------------------
  NUMBER = "NUMBER",
  TEXT = "TEXT",
  IDENTIFIER = "IDENTIFIER",

  // ---- statement keywords --------------------------------------------
  SET = "SET",
  TO = "TO",
  CHANGE = "CHANGE",
  SAY = "SAY",
  IF = "IF",
  OTHERWISE = "OTHERWISE",
  REPEAT = "REPEAT",
  TIMES = "TIMES", // also the word-form multiply operator: 3 times 4
  WITH = "WITH",
  FROM = "FROM",
  BY = "BY",
  WHILE = "WHILE",
  FOR = "FOR",
  EACH = "EACH",
  IN = "IN",
  DEFINE = "DEFINE",
  GIVE = "GIVE",
  BACK = "BACK",
  STOP = "STOP",
  SKIP = "SKIP",
  ADD = "ADD",

  // ---- comparison / logic words --------------------------------------
  IS = "IS",
  NOT = "NOT",
  AT = "AT",
  LEAST = "LEAST",
  MOST = "MOST",
  MORE = "MORE",
  LESS = "LESS",
  GREATER = "GREATER",
  THAN = "THAN",
  EQUAL = "EQUAL",
  AND = "AND",
  OR = "OR",

  // ---- arithmetic ------------------------------------------------------
  PLUS = "PLUS",       // '+'  or  'plus'
  MINUS = "MINUS",     // '-'  or  'minus'
  STAR = "STAR",       // '*'
  SLASH = "SLASH",     // '/'
  DIVIDED = "DIVIDED", // 'divided'  (always followed by 'by')
  PERCENT = "PERCENT", // '%'
  MOD = "MOD",         // 'mod'

  // ---- collections -----------------------------------------------------
  LIST = "LIST",
  OF = "OF",
  EMPTY = "EMPTY",
  ITEM = "ITEM",
  LENGTH = "LENGTH",

  // ---- literal keywords ------------------------------------------------
  YES = "YES",
  NO = "NO",
  NOTHING = "NOTHING",

  // ---- punctuation -----------------------------------------------------
  COLON = "COLON",
  COMMA = "COMMA",
  LPAREN = "LPAREN",
  RPAREN = "RPAREN",

  // ---- layout (synthesised by the lexer, never present in the source) ---
  NEWLINE = "NEWLINE",
  INDENT = "INDENT",
  DEDENT = "DEDENT",
  EOF = "EOF",
}

/** The literal value carried by NUMBER / TEXT / YES / NO / NOTHING tokens. */
export type TokenLiteral = number | string | boolean | null | undefined;

/**
 * A single token.
 *
 *  lexeme  — the exact source text ("plus", "+", "score")
 *  literal — the decoded value for literal tokens, otherwise undefined
 *  line    — 1-based line number, used by every error message
 *  column  — 1-based column of the first character
 *  length  — how many source characters the token spans (drives the ^^^ caret)
 */
export interface Token {
  type: TokenType;
  lexeme: string;
  literal: TokenLiteral;
  line: number;
  column: number;
  length: number;
}

/**
 * The complete Stickynight keyword table.
 *
 * Note that '+', '-', '*' and '/' are folded onto the same token types as
 * their word forms, so the parser has exactly one rule per operator:
 *   'plus' and '+'  -> PLUS
 *   'times' and '*' -> TIMES / STAR (kept apart, see SPEC.md section 9.2)
 */
export const KEYWORDS: Readonly<Record<string, TokenType>> = Object.freeze({
  set: TokenType.SET,
  to: TokenType.TO,
  change: TokenType.CHANGE,
  say: TokenType.SAY,
  if: TokenType.IF,
  otherwise: TokenType.OTHERWISE,
  repeat: TokenType.REPEAT,
  times: TokenType.TIMES,
  with: TokenType.WITH,
  from: TokenType.FROM,
  by: TokenType.BY,
  while: TokenType.WHILE,
  for: TokenType.FOR,
  each: TokenType.EACH,
  in: TokenType.IN,
  define: TokenType.DEFINE,
  give: TokenType.GIVE,
  back: TokenType.BACK,
  stop: TokenType.STOP,
  skip: TokenType.SKIP,
  add: TokenType.ADD,

  is: TokenType.IS,
  not: TokenType.NOT,
  at: TokenType.AT,
  least: TokenType.LEAST,
  most: TokenType.MOST,
  more: TokenType.MORE,
  less: TokenType.LESS,
  greater: TokenType.GREATER,
  than: TokenType.THAN,
  equal: TokenType.EQUAL,
  and: TokenType.AND,
  or: TokenType.OR,

  plus: TokenType.PLUS,
  minus: TokenType.MINUS,
  divided: TokenType.DIVIDED,
  mod: TokenType.MOD,

  list: TokenType.LIST,
  of: TokenType.OF,
  empty: TokenType.EMPTY,
  item: TokenType.ITEM,
  length: TokenType.LENGTH,

  yes: TokenType.YES,
  no: TokenType.NO,
  true: TokenType.YES,
  false: TokenType.NO,
  nothing: TokenType.NOTHING,
});

/** Every reserved word, for error messages and the playground highlighter. */
export const KEYWORD_LIST: readonly string[] = Object.freeze(
  Object.keys(KEYWORDS).sort()
);

/** Human-readable name for a token, used in "I expected X" messages. */
export function describeToken(token: Token): string {
  switch (token.type) {
    case TokenType.EOF:
      return "the end of the program";
    case TokenType.NEWLINE:
      return "the end of the line";
    case TokenType.INDENT:
      return "an indented block";
    case TokenType.DEDENT:
      return "the end of the indented block";
    case TokenType.TEXT:
      return `the text ${JSON.stringify(token.literal)}`;
    case TokenType.NUMBER:
      return `the number ${token.lexeme}`;
    case TokenType.IDENTIFIER:
      return `the name '${token.lexeme}'`;
    default:
      return `'${token.lexeme}'`;
  }
}

/** Convenience constructor — used by tests and by src/dev/mock-tokens.ts. */
export function makeToken(
  type: TokenType,
  lexeme: string,
  line = 1,
  column = 1,
  literal: TokenLiteral = undefined
): Token {
  return { type, lexeme, literal, line, column, length: lexeme.length || 1 };
}
