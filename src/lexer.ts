/**
 * lexer.ts — Stickynight lexical analyser (Days 2-3).
 *
 * Turns source text into a flat Token[] stream. Everything is done by hand,
 * character by character: no regular expressions are used anywhere in this
 * file. The recognition rules for numbers, text and identifiers are exactly
 * the transition rules a DFA built from the corresponding regular expressions
 * would have; writing them out by hand makes that correspondence visible.
 *
 * The one thing that lifts this above a textbook scanner is INDENT/DEDENT
 * synthesis. Stickynight has no braces, so the block structure has to be
 * recovered from column positions and handed to the parser as real tokens.
 * That is done with an indentation stack, the same technique CPython's
 * tokenizer uses.
 */

import { KEYWORDS, Token, TokenLiteral, TokenType } from "./token";
import { lexicalError } from "./errors";

export class Lexer {
  private readonly source: string;
  private readonly tokens: Token[] = [];

  /** Absolute index of the next character to consume. */
  private current = 0;
  /** Index of the first character of the current line, for column maths. */
  private lineStart = 0;
  private line = 1;

  /**
   * Indentation stack. It always starts with 0 and can only ever grow by
   * pushing a strictly larger column, which is what makes DEDENT unambiguous.
   */
  private readonly indents: number[] = [0];

  /** True while we are positioned at the very start of a logical line. */
  private atLineStart = true;

  /**
   * Depth of unclosed '('. While it is above 0 a physical newline does NOT
   * end the statement, which is how a long condition can span several lines.
   */
  private parenDepth = 0;

  /** Did the current logical line produce any real tokens? */
  private lineHasContent = false;

  constructor(source: string) {
    // Normalise line endings once so that column maths never sees a CR.
    this.source = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  // -----------------------------------------------------------------------
  // Driver
  // -----------------------------------------------------------------------

  scanTokens(): Token[] {
    while (!this.isAtEnd()) {
      if (this.atLineStart && this.parenDepth === 0) {
        this.handleLineStart();
        if (this.isAtEnd()) break;
        continue;
      }
      this.scanToken();
    }

    // A file that ends without a trailing newline still ends its last
    // statement, otherwise the parser would see the statement run into EOF.
    if (this.lineHasContent) {
      this.push(TokenType.NEWLINE, "\\n", this.currentColumn());
      this.lineHasContent = false;
    }

    // Close every block that is still open at end of file.
    while (this.indents.length > 1) {
      this.indents.pop();
      this.push(TokenType.DEDENT, "", this.currentColumn());
    }

    this.push(TokenType.EOF, "", this.currentColumn());
    return this.tokens;
  }

  // -----------------------------------------------------------------------
  // Indentation
  // -----------------------------------------------------------------------

  /**
   * Measure the indentation of the line we are sitting at and emit
   * INDENT / DEDENT tokens as required.
   *
   * Blank lines and comment-only lines are invisible to the block structure:
   * they produce no NEWLINE and never touch the indentation stack. That is
   * what lets a program put a blank line inside a block without closing it.
   */
  private handleLineStart(): void {
    this.atLineStart = false;

    let width = 0;

    // Count leading whitespace.
    for (;;) {
      const c = this.peek();
      if (c === " ") {
        width++;
        this.current++;
      } else if (c === "\t") {
        throw lexicalError(
          "This line is indented with a tab.",
          this.line,
          width + 1,
          1,
          "Stickynight indents with spaces so a block always looks the same everywhere. Use 4 spaces per level."
        );
      } else {
        break;
      }
    }

    // Blank line: skip it entirely, it has no effect on block structure.
    if (this.peek() === "\n") {
      this.current++;
      this.line++;
      this.lineStart = this.current;
      this.atLineStart = true;
      return;
    }

    // A line holding nothing but a comment is skipped the same way.
    if (this.peek() === "#") {
      while (!this.isAtEnd() && this.peek() !== "\n") this.current++;
      if (!this.isAtEnd()) {
        this.current++;
        this.line++;
        this.lineStart = this.current;
      }
      this.atLineStart = true;
      return;
    }

    if (this.isAtEnd()) return;

    const top = this.indents[this.indents.length - 1];

    if (width > top) {
      this.indents.push(width);
      this.push(TokenType.INDENT, "", width + 1);
      return;
    }

    // Remember the open blocks before unwinding, so that a mismatch can name
    // every column the line could have lined up with.
    const openColumns = this.indents.map((i) => i + 1);

    while (width < this.indents[this.indents.length - 1]) {
      this.indents.pop();
      this.push(TokenType.DEDENT, "", width + 1);
    }

    if (width !== this.indents[this.indents.length - 1]) {
      // e.g. a block indented 8, then a line indented 6: 6 matches nothing.
      const columns = openColumns.join(", ");
      throw lexicalError(
        `This line starts ${width} space${width === 1 ? "" : "s"} in, which does not line up with any block that is open here.`,
        this.line,
        1,
        Math.max(1, width),
        `The blocks open at this point start at column${openColumns.length === 1 ? "" : "s"} ${columns}. Line this statement up with one of them.`
      );
    }
  }

  // -----------------------------------------------------------------------
  // Token scanning
  // -----------------------------------------------------------------------

  private scanToken(): void {
    const startCol = this.currentColumn();
    const c = this.advance();

    switch (c) {
      // --- whitespace inside a line --------------------------------------
      case " ":
        return;

      case "\t":
        throw lexicalError(
          "There is a tab character in the middle of this line.",
          this.line,
          startCol,
          1,
          "Use ordinary spaces between words."
        );

      // --- end of line -----------------------------------------------------
      case "\n": {
        if (this.parenDepth > 0) {
          // Inside brackets a newline is just whitespace: this is how a long
          // expression may be split across several lines.
          this.line++;
          this.lineStart = this.current;
          return;
        }
        if (this.lineHasContent) {
          this.push(TokenType.NEWLINE, "\\n", startCol);
          this.lineHasContent = false;
        }
        this.line++;
        this.lineStart = this.current;
        this.atLineStart = true;
        return;
      }

      // --- comments ---------------------------------------------------------
      case "#":
        while (!this.isAtEnd() && this.peek() !== "\n") this.current++;
        return;

      // --- single-character punctuation --------------------------------------
      case ":":
        return this.push(TokenType.COLON, ":", startCol);
      case ",":
        return this.push(TokenType.COMMA, ",", startCol);
      case "(":
        this.parenDepth++;
        return this.push(TokenType.LPAREN, "(", startCol);
      case ")":
        if (this.parenDepth > 0) this.parenDepth--;
        return this.push(TokenType.RPAREN, ")", startCol);
      case "+":
        return this.push(TokenType.PLUS, "+", startCol);
      case "-":
        return this.push(TokenType.MINUS, "-", startCol);
      case "*":
        return this.push(TokenType.STAR, "*", startCol);
      case "/":
        return this.push(TokenType.SLASH, "/", startCol);
      case "%":
        return this.push(TokenType.PERCENT, "%", startCol);

      // --- text literals -------------------------------------------------------
      case '"':
        return this.text(startCol);

      case "'":
        throw lexicalError(
          "Text has to be written with double quotes.",
          this.line,
          startCol,
          1,
          'Write "like this" rather than ‘like this’.'
        );

      default:
        if (isDigit(c)) return this.number(startCol);
        if (isAlpha(c)) return this.word(startCol);
        return this.rejectCharacter(c, startCol);
    }
  }

  // -----------------------------------------------------------------------
  // Literals
  // -----------------------------------------------------------------------

  /**
   * NUMBER -> digit+ ( '.' digit+ )?
   *
   * A dot with no digit after it is rejected here rather than silently
   * producing 12 followed by a stray dot, because the message we can give at
   * this point ("12. is not a complete number") is far better than the one
   * the parser could give later.
   */
  private number(startCol: number): void {
    const start = this.current - 1;
    while (isDigit(this.peek())) this.current++;

    if (this.peek() === "." && isDigit(this.peekNext())) {
      this.current++; // consume the dot
      while (isDigit(this.peek())) this.current++;
    } else if (this.peek() === ".") {
      const lexeme = this.source.slice(start, this.current + 1);
      throw lexicalError(
        `'${lexeme}' is not a complete number.`,
        this.line,
        startCol,
        lexeme.length,
        `Write '${lexeme}0' if you meant a decimal, or remove the dot.`
      );
    }

    const lexeme = this.source.slice(start, this.current);
    this.push(TokenType.NUMBER, lexeme, startCol, Number(lexeme));
  }

  /**
   * TEXT -> '"' ( escape | any-but-quote-or-newline )* '"'
   *
   * A newline inside text is an error rather than a silent multi-line string.
   * The usual cause is a forgotten closing quote, and blaming the line the
   * text started on is much more useful than blaming wherever it ran to.
   */
  private text(startCol: number): void {
    const startLine = this.line;
    const startIndex = this.current - 1;
    let value = "";

    for (;;) {
      if (this.isAtEnd() || this.peek() === "\n") {
        throw lexicalError(
          "This text is never closed.",
          startLine,
          startCol,
          Math.max(1, this.current - startIndex),
          'Add a closing " at the end of the text.'
        );
      }

      const c = this.advance();
      if (c === '"') break;

      if (c === "\\") {
        const escapeCol = this.currentColumn() - 1;
        const e = this.advance();
        switch (e) {
          case "n":
            value += "\n";
            break;
          case "t":
            value += "\t";
            break;
          case '"':
            value += '"';
            break;
          case "\\":
            value += "\\";
            break;
          default:
            throw lexicalError(
              `'\\${e}' is not something that can follow a backslash inside text.`,
              this.line,
              escapeCol,
              2,
              'The ones that work are \\n (new line), \\t (tab), \\" (a quote) and \\\\ (a backslash).'
            );
        }
        continue;
      }

      value += c;
    }

    const lexeme = this.source.slice(startIndex, this.current);
    this.push(TokenType.TEXT, lexeme, startCol, value);
  }

  /**
   * IDENTIFIER -> letter ( letter | digit | '_' )*
   *
   * The word is then looked up in the keyword table. Keywords are always
   * lowercase, and a word that differs only in case is reported rather than
   * quietly treated as a variable name, because `Say "hi"` is far more likely
   * to be a mistake than a genuine variable called `Say`.
   */
  private word(startCol: number): void {
    const start = this.current - 1;
    while (isAlphaNumeric(this.peek())) this.current++;
    const lexeme = this.source.slice(start, this.current);

    const keyword = KEYWORDS[lexeme];
    if (keyword !== undefined) {
      let literal: TokenLiteral = undefined;
      if (keyword === TokenType.YES) literal = true;
      else if (keyword === TokenType.NO) literal = false;
      else if (keyword === TokenType.NOTHING) literal = null;
      this.push(keyword, lexeme, startCol, literal);
      return;
    }

    const lower = lexeme.toLowerCase();
    if (KEYWORDS[lower] !== undefined) {
      throw lexicalError(
        `'${lexeme}' looks like the keyword '${lower}' written with capital letters.`,
        this.line,
        startCol,
        lexeme.length,
        `Stickynight keywords are always lowercase. Write '${lower}'.`
      );
    }

    this.push(TokenType.IDENTIFIER, lexeme, startCol);
  }

  // -----------------------------------------------------------------------
  // Rejecting characters, with a guess at what was meant
  // -----------------------------------------------------------------------

  /**
   * Stickynight deliberately has no symbolic comparison operators, so the
   * characters someone arriving from C or Python reaches for first are
   * exactly the ones we can give the best advice about. Turning the most
   * likely mistakes into teaching moments is most of the value of the whole
   * error-handling phase.
   */
  private rejectCharacter(c: string, startCol: number): never {
    const twoChars = c + this.peek();

    const pairs: Record<string, [string, string]> = {
      ">=": ["'>=' is not part of Stickynight.", "Write 'is at least', as in: if score is at least 90:"],
      "<=": ["'<=' is not part of Stickynight.", "Write 'is at most', as in: if score is at most 40:"],
      "==": ["'==' is not part of Stickynight.", "Write 'is', as in: if answer is 42:"],
      "!=": ["'!=' is not part of Stickynight.", "Write 'is not', as in: if answer is not 42:"],
      "&&": ["'&&' is not part of Stickynight.", "Write 'and'."],
      "||": ["'||' is not part of Stickynight.", "Write 'or'."],
    };

    if (pairs[twoChars]) {
      const [message, hint] = pairs[twoChars];
      throw lexicalError(message, this.line, startCol, 2, hint);
    }

    const singles: Record<string, [string, string]> = {
      ">": ["'>' is not part of Stickynight.", "Write 'is more than', as in: if age is more than 18:"],
      "<": ["'<' is not part of Stickynight.", "Write 'is less than', as in: if age is less than 18:"],
      "=": ["'=' is not part of Stickynight.", "To give a name a value write: set total to 0"],
      "!": ["'!' is not part of Stickynight.", "Write 'not', as in: if not finished:"],
      ";": ["Stickynight does not use semicolons.", "Just end the line; nothing goes at the end of it."],
      "{": ["Stickynight does not use curly braces.", "A block is written by indenting the lines under a ':'."],
      "}": ["Stickynight does not use curly braces.", "A block ends when the indentation goes back out."],
      "[": ["'[' is not part of Stickynight.", "Write a list as: set scores to list of 1, 2, 3"],
      "]": ["']' is not part of Stickynight.", "Write a list as: set scores to list of 1, 2, 3"],
      ".": ["A dot on its own does not mean anything here.", "Numbers are written like 3.5, with digits on both sides of the dot."],
      "@": ["'@' is not part of Stickynight.", "Names are made of letters, digits and underscores."],
      "$": ["'$' is not part of Stickynight.", "Names are made of letters, digits and underscores."],
    };

    if (singles[c]) {
      const [message, hint] = singles[c];
      throw lexicalError(message, this.line, startCol, 1, hint);
    }

    throw lexicalError(
      `I do not know what to do with the character '${c}'.`,
      this.line,
      startCol,
      1,
      null
    );
  }

  // -----------------------------------------------------------------------
  // Small helpers
  // -----------------------------------------------------------------------

  private push(
    type: TokenType,
    lexeme: string,
    column: number,
    literal: TokenLiteral = undefined
  ): void {
    this.tokens.push({
      type,
      lexeme,
      literal,
      line: this.line,
      column,
      length: Math.max(1, lexeme.length),
    });

    if (
      type !== TokenType.NEWLINE &&
      type !== TokenType.INDENT &&
      type !== TokenType.DEDENT &&
      type !== TokenType.EOF
    ) {
      this.lineHasContent = true;
    }
  }

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  private advance(): string {
    return this.source[this.current++];
  }

  private peek(): string {
    return this.current < this.source.length ? this.source[this.current] : "\0";
  }

  private peekNext(): string {
    return this.current + 1 < this.source.length ? this.source[this.current + 1] : "\0";
  }

  private currentColumn(): number {
    return this.current - this.lineStart + 1;
  }
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isAlpha(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
}

function isAlphaNumeric(c: string): boolean {
  return isAlpha(c) || isDigit(c);
}

/** Convenience wrapper: source text in, token stream out. */
export function tokenize(source: string): Token[] {
  return new Lexer(source).scanTokens();
}

/**
 * Pretty-print a token stream. This is the Day 2-3 "token stream demo"
 * deliverable, and it also drives the playground's Tokens tab. Nesting is
 * shown by indenting between INDENT and DEDENT so that the block structure
 * the lexer recovered is visible at a glance.
 */
export function formatTokens(tokens: Token[]): string {
  const rows: string[][] = [["LINE:COL", "TYPE", "LEXEME", "VALUE"]];
  let depth = 0;

  for (const t of tokens) {
    if (t.type === TokenType.DEDENT) depth = Math.max(0, depth - 1);

    const shown =
      t.type === TokenType.NEWLINE
        ? "\\n"
        : t.type === TokenType.INDENT || t.type === TokenType.DEDENT || t.type === TokenType.EOF
        ? ""
        : t.lexeme;

    rows.push([
      `${t.line}:${t.column}`,
      "  ".repeat(depth) + t.type,
      shown,
      t.literal === undefined ? "" : JSON.stringify(t.literal),
    ]);

    if (t.type === TokenType.INDENT) depth++;
  }

  const widths = [0, 0, 0, 0];
  for (const row of rows) {
    for (let i = 0; i < 4; i++) widths[i] = Math.max(widths[i], row[i].length);
  }

  const lines = rows.map((row) =>
    row.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd()
  );

  return [lines[0], "-".repeat(Math.max(...lines.map((l) => l.length))), ...lines.slice(1)].join("\n");
}
