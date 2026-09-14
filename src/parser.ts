/**
 * parser.ts — Stickynight syntax analyser (Days 4-5).
 *
 * A hand-written recursive-descent parser. Every non-terminal in the EBNF
 * grammar in SPEC.md has exactly one method here with the same name, so the
 * grammar document and this file can be read side by side.
 *
 * Two things are worth pointing at during the viva:
 *
 * 1. MULTI-WORD PHRASE RESOLUTION.
 *    The lexer emits one token per word, so "is at least" arrives as
 *    IS AT LEAST. comparison() folds those runs of words into a single
 *    operator with fixed lookahead — no backtracking is ever needed, so the
 *    grammar stays LL(k) with a small k. Keeping this in the parser rather
 *    than the lexer means the lexer never has to know about context.
 *
 * 2. PANIC-MODE ERROR RECOVERY.
 *    parseWithRecovery() does not stop at the first mistake. It records the
 *    error, throws away tokens until it reaches a point where a new statement
 *    can plausibly start (synchronize()), and carries on, so one run reports
 *    every broken line in the file rather than just the first.
 */

import {
  BinaryOperator,
  Expr,
  FunctionStmt,
  IndexExpr,
  Program,
  Stmt,
  VariableExpr,
} from "./ast";
import { describeToken, Token, TokenType } from "./token";
import { StickynightError, syntaxError } from "./errors";

const T = TokenType;

/** Tokens that can legally begin a statement — used by error recovery. */
const STATEMENT_STARTERS = new Set<TokenType>([
  T.SET,
  T.CHANGE,
  T.SAY,
  T.ADD,
  T.IF,
  T.REPEAT,
  T.FOR,
  T.DEFINE,
  T.GIVE,
  T.STOP,
  T.SKIP,
  T.IDENTIFIER,
]);

export class Parser {
  private readonly tokens: Token[];
  private position = 0;

  /**
   * While this is above zero the word 'times' is not treated as the multiply
   * operator. It is raised only while reading the count of `repeat N times:`,
   * where the trailing 'times' belongs to the statement, not the expression.
   * The symbol form `*` is a different token and is never suppressed, so
   * `repeat rows * cols times:` still works.
   */
  private timesSuppressed = 0;

  /** Errors collected by parseWithRecovery(). */
  public readonly errors: StickynightError[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  // =======================================================================
  // Entry points
  // =======================================================================

  /** program -> statement* EOF   (throws on the first mistake) */
  parse(): Program {
    const statements: Stmt[] = [];
    this.skipBlankLines();
    while (!this.isAtEnd()) {
      statements.push(this.statement());
      this.skipBlankLines();
    }
    return { kind: "Program", statements };
  }

  /**
   * Same grammar, but a broken statement is recorded and skipped instead of
   * aborting the whole parse. Returns whatever tree could still be built plus
   * every error found.
   */
  parseWithRecovery(): { program: Program; errors: StickynightError[] } {
    const statements: Stmt[] = [];
    this.skipBlankLines();

    while (!this.isAtEnd()) {
      try {
        statements.push(this.statement());
      } catch (error) {
        if (!(error instanceof StickynightError)) throw error;
        this.errors.push(error);
        if (!this.synchronize()) break;
      }
      // Layout rather than blank lines: after a recovery the indentation no
      // longer lines up with anything, and re-reporting that is just noise.
      this.skipLayout();
    }

    return { program: { kind: "Program", statements }, errors: this.errors };
  }

  /**
   * Panic-mode recovery: drop tokens until the start of the next line that
   * could begin a statement. Returns false when there is nothing left.
   *
   * A line can start after any of the three layout tokens, not just NEWLINE:
   * a block opening produces INDENT and a block closing produces DEDENT, and
   * the first statement of the recovered line sits directly after one of
   * those. Only looking for NEWLINE means a mistake anywhere above an
   * indented block swallows the whole rest of the file.
   */
  private synchronize(): boolean {
    while (!this.isAtEnd()) {
      this.position++;
      if (this.isAtEnd()) return false;

      const previous = this.tokens[this.position - 1];
      const atLineStart =
        previous.type === T.NEWLINE ||
        previous.type === T.INDENT ||
        previous.type === T.DEDENT;

      if (atLineStart && STATEMENT_STARTERS.has(this.peek().type)) return true;
    }
    return false;
  }

  /**
   * Skip layout tokens outright.
   *
   * Used only while recovering. Once a statement has been abandoned the block
   * structure around it is no longer trustworthy, so a stray INDENT or DEDENT
   * left over from the broken line would otherwise be reported as a second,
   * imaginary mistake on top of the real one.
   */
  private skipLayout(): void {
    while (
      this.check(T.NEWLINE) ||
      this.check(T.INDENT) ||
      this.check(T.DEDENT)
    ) {
      this.position++;
    }
  }

  // =======================================================================
  // Statements
  // =======================================================================

  private statement(): Stmt {
    if (this.check(T.INDENT)) {
      const token = this.peek();
      throw syntaxError(
        "This line is indented, but the line above it does not open a block.",
        token.line,
        1,
        Math.max(1, token.column - 1),
        "Only a line ending in ':' opens an indented block. Move this line back to the left."
      );
    }

    if (this.match(T.SET)) return this.setStatement();
    if (this.match(T.CHANGE)) return this.changeStatement();
    if (this.match(T.SAY)) return this.sayStatement();
    if (this.match(T.ADD)) return this.addStatement();
    if (this.match(T.IF)) return this.ifStatement();
    if (this.match(T.REPEAT)) return this.repeatStatement();
    if (this.match(T.FOR)) return this.forEachStatement();
    if (this.match(T.DEFINE)) return this.functionStatement();
    if (this.match(T.GIVE)) return this.returnStatement();
    if (this.match(T.STOP)) return this.stopStatement();
    if (this.match(T.SKIP)) return this.skipStatement();

    if (this.check(T.OTHERWISE)) {
      const token = this.peek();
      throw syntaxError(
        "'otherwise' does not belong here — there is no 'if' for it to go with.",
        token.line,
        token.column,
        token.length,
        "An 'otherwise' has to line up underneath an 'if' at the same indentation."
      );
    }

    return this.expressionStatement();
  }

  /** setStmt -> 'set' IDENTIFIER 'to' expression NEWLINE */
  private setStatement(): Stmt {
    const name = this.consumeName("a name to give a value to", "set total to 0");
    this.consumeWord(T.TO, "to", `Write: set ${name.lexeme} to <a value>`);
    const value = this.expression();
    this.endStatement("set");
    return { kind: "Set", name, value };
  }

  /**
   * changeStmt -> 'change' ( IDENTIFIER | indexExpr ) 'to' expression NEWLINE
   *
   * `set` introduces a name, `change` updates one that already exists. Keeping
   * them apart is what lets the interpreter report a typo'd variable name
   * instead of silently creating a second variable.
   */
  private changeStatement(): Stmt {
    const keyword = this.previous();
    let target: VariableExpr | IndexExpr;

    if (this.match(T.ITEM)) {
      target = this.indexExpression(this.previous());
    } else {
      const name = this.consumeName("the name you want to change", "change total to 10");
      target = { kind: "Variable", name };
    }

    this.consumeWord(T.TO, "to", "Write: change total to <a new value>");
    const value = this.expression();
    this.endStatement("change");
    return { kind: "Change", target, value, keyword };
  }

  /** sayStmt -> 'say' expression NEWLINE */
  private sayStatement(): Stmt {
    const keyword = this.previous();
    const value = this.expression();
    this.endStatement("say");
    return { kind: "Say", value, keyword };
  }

  /** addStmt -> 'add' expression 'to' expression NEWLINE */
  private addStatement(): Stmt {
    const keyword = this.previous();
    const value = this.expression();
    this.consumeWord(T.TO, "to", "Write: add 5 to scores");
    const collection = this.expression();
    this.endStatement("add");
    return { kind: "Add", value, collection, keyword };
  }

  /**
   * ifStmt -> 'if' expression block ( 'otherwise' 'if' expression block )*
   *                                 ( 'otherwise' block )?
   *
   * An `otherwise if` chain is stored as a nested If in the else branch, which
   * is why the interpreter and the code generator only ever handle two arms.
   */
  private ifStatement(): Stmt {
    const keyword = this.previous();
    const condition = this.expression();
    const thenBranch = this.block("if");

    let elseBranch: Stmt[] | null = null;

    if (this.check(T.OTHERWISE)) {
      const otherwise = this.advance();
      if (this.match(T.IF)) {
        // 'otherwise if' — recurse, and wrap the result as a one-statement block.
        const nested = this.ifStatementFrom(otherwise);
        elseBranch = [nested];
      } else {
        elseBranch = this.block("otherwise");
      }
    }

    return { kind: "If", condition, thenBranch, elseBranch, keyword };
  }

  /** The tail of an `otherwise if`, with the 'if' already consumed. */
  private ifStatementFrom(keyword: Token): Stmt {
    const condition = this.expression();
    const thenBranch = this.block("otherwise if");

    let elseBranch: Stmt[] | null = null;
    if (this.check(T.OTHERWISE)) {
      const otherwise = this.advance();
      if (this.match(T.IF)) {
        elseBranch = [this.ifStatementFrom(otherwise)];
      } else {
        elseBranch = this.block("otherwise");
      }
    }

    return { kind: "If", condition, thenBranch, elseBranch, keyword };
  }

  /**
   * repeatStmt -> 'repeat' expression 'times' block
   *             | 'repeat' 'with' IDENTIFIER 'from' expression 'to' expression
   *                        ( 'by' expression )? block
   *             | 'repeat' 'while' expression block
   */
  private repeatStatement(): Stmt {
    const keyword = this.previous();

    if (this.match(T.WITH)) {
      const variable = this.consumeName(
        "a name for the counter",
        "repeat with i from 1 to 10:"
      );
      this.consumeWord(T.FROM, "from", "Write: repeat with i from 1 to 10:");
      const start = this.expression();
      this.consumeWord(T.TO, "to", "Write: repeat with i from 1 to 10:");
      const end = this.expression();
      const step = this.match(T.BY) ? this.expression() : null;
      const body = this.block("repeat");
      return { kind: "RepeatRange", variable, start, end, step, body, keyword };
    }

    if (this.match(T.WHILE)) {
      const condition = this.expression();
      const body = this.block("repeat while");
      return { kind: "RepeatWhile", condition, body, keyword };
    }

    // `repeat <count> times:` — see the note on timesSuppressed above.
    this.timesSuppressed++;
    let count: Expr;
    try {
      count = this.expression();
    } finally {
      this.timesSuppressed--;
    }

    this.consumeWord(
      T.TIMES,
      "times",
      "A count loop is written: repeat 3 times:  — or use 'repeat while' / 'repeat with'."
    );
    const body = this.block("repeat");
    return { kind: "RepeatTimes", count, body, keyword };
  }

  /** forEachStmt -> 'for' 'each' IDENTIFIER 'in' expression block */
  private forEachStatement(): Stmt {
    const keyword = this.previous();
    this.consumeWord(T.EACH, "each", "Write: for each name in names:");
    const variable = this.consumeName(
      "a name for each item",
      "for each score in scores:"
    );
    this.consumeWord(T.IN, "in", "Write: for each score in scores:");
    const collection = this.expression();
    const body = this.block("for each");
    return { kind: "ForEach", variable, collection, body, keyword };
  }

  /** functionStmt -> 'define' IDENTIFIER ( 'with' IDENTIFIER ( ',' IDENTIFIER )* )? block */
  private functionStatement(): FunctionStmt {
    const keyword = this.previous();
    const name = this.consumeName(
      "a name for the thing you are defining",
      "define greet with name:"
    );

    const params: Token[] = [];
    if (this.match(T.WITH)) {
      do {
        const param = this.consumeName(
          "the name of an input",
          `define ${name.lexeme} with first, second:`
        );
        if (params.some((p) => p.lexeme === param.lexeme)) {
          throw syntaxError(
            `'${param.lexeme}' is listed twice as an input to '${name.lexeme}'.`,
            param.line,
            param.column,
            param.length,
            "Each input needs its own name."
          );
        }
        params.push(param);
      } while (this.match(T.COMMA));
    }

    const body = this.block("define");
    return { kind: "Function", name, params, body, keyword };
  }

  /** returnStmt -> 'give' 'back' expression? NEWLINE */
  private returnStatement(): Stmt {
    const keyword = this.previous();
    this.consumeWord(
      T.BACK,
      "back",
      "To send a value out of a definition write: give back <a value>"
    );

    const value = this.check(T.NEWLINE) || this.isAtEnd() ? null : this.expression();
    this.endStatement("give back");
    return { kind: "Return", value, keyword };
  }

  private stopStatement(): Stmt {
    const keyword = this.previous();
    this.endStatement("stop");
    return { kind: "Stop", keyword };
  }

  private skipStatement(): Stmt {
    const keyword = this.previous();
    this.endStatement("skip");
    return { kind: "Skip", keyword };
  }

  /** expressionStmt -> expression NEWLINE */
  private expressionStatement(): Stmt {
    const start = this.peek();
    const expression = this.expression();

    // A bare name on a line is almost always a half-written statement.
    if (expression.kind === "Variable" && this.check(T.NEWLINE)) {
      throw syntaxError(
        `'${expression.name.lexeme}' on its own does not do anything.`,
        start.line,
        start.column,
        start.length,
        `Did you mean 'say ${expression.name.lexeme}' to print it, or 'set ${expression.name.lexeme} to ...' to give it a value?`
      );
    }

    this.endStatement("this");
    return { kind: "Expression", expression };
  }

  // =======================================================================
  // Blocks
  // =======================================================================

  /**
   * block -> ':' NEWLINE INDENT statement+ DEDENT
   *        | ':' statement                       (the one-line form)
   *
   * The one-line form exists so that `if score is at least 90: say "A"` reads
   * naturally; anything longer has to be indented.
   */
  private block(context: string): Stmt[] {
    if (!this.check(T.COLON)) {
      const token = this.peek();
      throw syntaxError(
        `I expected a ':' at the end of this '${context}' line, but found ${describeToken(token)}.`,
        token.line,
        token.column,
        token.length,
        `Every '${context}' line ends with ':' and the lines under it are indented.`
      );
    }
    const colon = this.advance();

    // One-line form: something other than a newline follows the colon.
    if (!this.check(T.NEWLINE)) {
      const single = this.statement();
      return [single];
    }

    this.advance(); // the NEWLINE

    if (!this.check(T.INDENT)) {
      const token = this.peek();
      throw syntaxError(
        `The '${context}' block is empty.`,
        colon.line,
        colon.column,
        1,
        `Indent the lines that belong to this '${context}' by 4 spaces, or put a single statement on the same line after the ':'.`
      );
    }
    this.advance(); // the INDENT

    const statements: Stmt[] = [];
    this.skipBlankLines();
    while (!this.check(T.DEDENT) && !this.isAtEnd()) {
      statements.push(this.statement());
      this.skipBlankLines();
    }

    if (!this.match(T.DEDENT) && !this.isAtEnd()) {
      const token = this.peek();
      throw syntaxError(
        `I lost track of where the '${context}' block ends.`,
        token.line,
        token.column,
        token.length,
        null
      );
    }

    if (statements.length === 0) {
      throw syntaxError(
        `The '${context}' block is empty.`,
        colon.line,
        colon.column,
        1,
        `Put at least one statement inside the '${context}'.`
      );
    }

    return statements;
  }

  // =======================================================================
  // Expressions — lowest precedence first
  // =======================================================================

  /** expression -> orExpr */
  expression(): Expr {
    return this.orExpr();
  }

  /** orExpr -> andExpr ( 'or' andExpr )* */
  private orExpr(): Expr {
    let left = this.andExpr();
    while (this.match(T.OR)) {
      const operatorToken = this.previous();
      const right = this.andExpr();
      left = { kind: "Logical", operator: "or", operatorToken, left, right };
    }
    return left;
  }

  /** andExpr -> notExpr ( 'and' notExpr )* */
  private andExpr(): Expr {
    let left = this.notExpr();
    while (this.match(T.AND)) {
      const operatorToken = this.previous();
      const right = this.notExpr();
      left = { kind: "Logical", operator: "and", operatorToken, left, right };
    }
    return left;
  }

  /**
   * notExpr -> 'not' notExpr | comparison
   *
   * 'not' sits below comparison on purpose, so `not score is 10` means
   * `not (score is 10)` — the reading an English speaker expects.
   */
  private notExpr(): Expr {
    if (this.match(T.NOT)) {
      const operatorToken = this.previous();
      const right = this.notExpr();
      return { kind: "Unary", operator: "not", operatorToken, right };
    }
    return this.comparison();
  }

  /**
   * comparison -> term ( comparePhrase term )*
   *
   * This is where the multi-word phrases are folded. Everything is decided by
   * looking at the next one or two tokens; the parser never backs up.
   */
  private comparison(): Expr {
    let left = this.term();

    while (this.check(T.IS)) {
      const operatorToken = this.advance();
      const operator = this.comparePhrase(operatorToken);
      const right = this.term();
      left = { kind: "Binary", operator, operatorToken, left, right };
    }

    return left;
  }

  /**
   * comparePhrase (the part after 'is') ->
   *     'not' 'equal'? 'to'?      -> is not
   *   | 'at' ( 'least' | 'most' ) -> is at least / is at most
   *   | ( 'more' | 'greater' ) 'than' -> is more than
   *   | 'less' 'than'             -> is less than
   *   | 'equal' 'to'              -> is
   *   | (nothing)                 -> is
   */
  private comparePhrase(isToken: Token): BinaryOperator {
    if (this.match(T.NOT)) {
      if (this.match(T.EQUAL)) {
        this.consumeWord(T.TO, "to", "Write: is not equal to  — or just: is not");
      }
      return "is not";
    }

    if (this.match(T.AT)) {
      if (this.match(T.LEAST)) return "is at least";
      if (this.match(T.MOST)) return "is at most";
      const token = this.peek();
      throw syntaxError(
        `I expected 'least' or 'most' after 'at', but found ${describeToken(token)}.`,
        token.line,
        token.column,
        token.length,
        "Write 'is at least 90' for 'greater than or equal to', or 'is at most 90' for 'less than or equal to'."
      );
    }

    if (this.match(T.MORE) || this.match(T.GREATER)) {
      this.consumeWord(T.THAN, "than", "Write: is more than 10");
      return "is more than";
    }

    if (this.match(T.LESS)) {
      this.consumeWord(T.THAN, "than", "Write: is less than 10");
      return "is less than";
    }

    if (this.match(T.EQUAL)) {
      this.consumeWord(T.TO, "to", "Write: is equal to 10  — or just: is 10");
      return "is";
    }

    // A bare 'is' means equality. Guard against a dangling 'is'.
    if (this.check(T.NEWLINE) || this.check(T.COLON) || this.isAtEnd()) {
      throw syntaxError(
        "'is' needs something to compare against.",
        isToken.line,
        isToken.column,
        isToken.length,
        "Write something like: if score is 10:"
      );
    }

    return "is";
  }

  /** term -> factor ( ( '+' | 'plus' | '-' | 'minus' ) factor )* */
  private term(): Expr {
    let left = this.factor();
    while (this.check(T.PLUS) || this.check(T.MINUS)) {
      const operatorToken = this.advance();
      const operator: BinaryOperator = operatorToken.type === T.PLUS ? "+" : "-";
      const right = this.factor();
      left = { kind: "Binary", operator, operatorToken, left, right };
    }
    return left;
  }

  /** factor -> unary ( ( '*' | 'times' | '/' | 'divided' 'by' | '%' | 'mod' ) unary )* */
  private factor(): Expr {
    let left = this.unary();

    for (;;) {
      let operator: BinaryOperator;
      let operatorToken: Token;

      if (this.check(T.STAR)) {
        operatorToken = this.advance();
        operator = "*";
      } else if (this.check(T.TIMES) && this.timesSuppressed === 0) {
        operatorToken = this.advance();
        operator = "*";
      } else if (this.check(T.SLASH)) {
        operatorToken = this.advance();
        operator = "/";
      } else if (this.check(T.DIVIDED)) {
        operatorToken = this.advance();
        this.consumeWord(T.BY, "by", "Division is written: a divided by b");
        operator = "/";
      } else if (this.check(T.PERCENT) || this.check(T.MOD)) {
        operatorToken = this.advance();
        operator = "mod";
      } else {
        break;
      }

      const right = this.unary();
      left = { kind: "Binary", operator, operatorToken, left, right };
    }

    return left;
  }

  /** unary -> '-' unary | postfix */
  private unary(): Expr {
    if (this.match(T.MINUS)) {
      const operatorToken = this.previous();
      const right = this.unary();
      return { kind: "Unary", operator: "-", operatorToken, right };
    }
    return this.postfix();
  }

  /** postfix -> primary ( '(' arguments? ')' )* */
  private postfix(): Expr {
    let expr = this.primary();

    while (this.check(T.LPAREN)) {
      this.advance();
      const args: Expr[] = [];
      if (!this.check(T.RPAREN)) {
        do {
          args.push(this.expression());
        } while (this.match(T.COMMA));
      }
      const paren = this.consumeWord(
        T.RPAREN,
        ")",
        "Every '(' needs a matching ')'."
      );
      expr = { kind: "Call", callee: expr, paren, args };
    }

    return expr;
  }

  /**
   * primary -> NUMBER | TEXT | 'yes' | 'no' | 'nothing' | IDENTIFIER
   *          | '(' expression ')'
   *          | 'list' 'of' expression ( ',' expression )*
   *          | 'empty' 'list'
   *          | 'item' expression 'of' postfix
   *          | 'length' 'of' postfix
   */
  private primary(): Expr {
    if (this.match(T.NUMBER)) {
      const token = this.previous();
      return { kind: "Literal", value: token.literal as number, token };
    }

    if (this.match(T.TEXT)) {
      const token = this.previous();
      return { kind: "Literal", value: token.literal as string, token };
    }

    if (this.match(T.YES)) {
      return { kind: "Literal", value: true, token: this.previous() };
    }

    if (this.match(T.NO)) {
      return { kind: "Literal", value: false, token: this.previous() };
    }

    if (this.match(T.NOTHING)) {
      return { kind: "Literal", value: null, token: this.previous() };
    }

    if (this.match(T.IDENTIFIER)) {
      return { kind: "Variable", name: this.previous() };
    }

    if (this.match(T.LPAREN)) {
      const token = this.previous();
      // A parenthesised expression may span lines: the lexer suppresses
      // NEWLINE while a '(' is open.
      const inner = this.expression();
      this.consumeWord(T.RPAREN, ")", "Every '(' needs a matching ')'.");
      return { kind: "Grouping", inner, token };
    }

    // `empty list`
    if (this.match(T.EMPTY)) {
      const token = this.previous();
      this.consumeWord(T.LIST, "list", "An empty list is written: empty list");
      return { kind: "List", items: [], token };
    }

    /**
     * `list of a, b, c` takes items greedily up to the end of the expression.
     * That is why a list passed straight to a call has to be wrapped:
     * `f((list of 1, 2), 3)`. The trade is documented in SPEC.md section 6.4;
     * it buys a list literal that needs no bracket characters at all.
     */
    if (this.match(T.LIST)) {
      const token = this.previous();
      this.consumeWord(T.OF, "of", "A list is written: list of 1, 2, 3  (or: empty list)");
      const items: Expr[] = [];
      do {
        items.push(this.expression());
      } while (this.match(T.COMMA));
      return { kind: "List", items, token };
    }

    if (this.match(T.ITEM)) {
      return this.indexExpression(this.previous());
    }

    if (this.match(T.LENGTH)) {
      const token = this.previous();

      // `length(xs)` is the same thing as `length of xs`. Returning a plain
      // name here lets postfix() attach the call, so it goes through exactly
      // the same path as any other built-in.
      if (this.check(T.LPAREN)) {
        return { kind: "Variable", name: token };
      }

      this.consumeWord(
        T.OF,
        "of",
        "Write 'length of scores', or call it like any other built-in: length(scores)"
      );
      const collection = this.postfix();
      return { kind: "Length", collection, token };
    }

    return this.reportUnexpected();
  }

  /** indexExpr -> 'item' expression 'of' postfix   (1-based) */
  private indexExpression(token: Token): IndexExpr {
    const index = this.expression();
    this.consumeWord(T.OF, "of", "Write: item 1 of scores");
    const collection = this.postfix();
    return { kind: "Index", index, collection, token };
  }

  /**
   * Nothing in primary() matched. The message tries to name the most likely
   * cause rather than dumping the token type.
   */
  private reportUnexpected(): never {
    const token = this.peek();

    const advice: Partial<Record<TokenType, [string, string]>> = {
      [T.NEWLINE]: [
        "This line stops before it says what to do.",
        "Something is missing at the end of the line.",
      ],
      [T.EOF]: [
        "The program ends in the middle of a statement.",
        "Something is missing at the end of the last line.",
      ],
      [T.COLON]: [
        "A ':' turned up before anything to work with.",
        "Check that the condition or value before the ':' is complete.",
      ],
      [T.TO]: [
        "'to' turned up where a value was expected.",
        "Check for a missing value, as in: set total to 0",
      ],
      [T.OF]: [
        "'of' turned up where a value was expected.",
        "Write 'length of scores' or 'item 1 of scores'.",
      ],
      [T.RPAREN]: [
        "There is a ')' with nothing before it.",
        "Check for an extra ')' or a missing value inside the brackets.",
      ],
      [T.COMMA]: [
        "There is a ',' with nothing before it.",
        "Check for an extra comma.",
      ],
      [T.DEDENT]: [
        "The block ends in the middle of a statement.",
        "The last line of the block looks incomplete.",
      ],
    };

    const known = advice[token.type];
    if (known) {
      throw syntaxError(known[0], token.line, token.column, token.length, known[1]);
    }

    if (token.type === T.OTHERWISE || token.type === T.IF) {
      throw syntaxError(
        `'${token.lexeme}' cannot be used as a value.`,
        token.line,
        token.column,
        token.length,
        "Keywords like this start a statement; they do not stand for a value."
      );
    }

    throw syntaxError(
      `I expected a value here, but found ${describeToken(token)}.`,
      token.line,
      token.column,
      token.length,
      "A value is a number, some text, yes/no, a name, or something in brackets."
    );
  }

  // =======================================================================
  // Token plumbing
  // =======================================================================

  private endStatement(context: string): void {
    if (this.isAtEnd()) return;
    if (this.match(T.NEWLINE)) return;
    if (this.check(T.DEDENT)) return;

    const token = this.peek();
    throw syntaxError(
      `I did not expect ${describeToken(token)} at the end of this line.`,
      token.line,
      token.column,
      token.length,
      `The '${context}' statement already looks complete before this. Each statement goes on its own line.`
    );
  }

  private consumeName(what: string, example: string): Token {
    if (this.check(T.IDENTIFIER)) return this.advance();

    const token = this.peek();

    // A reserved word used as a variable name is a common beginner mistake.
    if (token.lexeme && /^[a-z_][a-z0-9_]*$/i.test(token.lexeme) && token.type !== T.EOF) {
      throw syntaxError(
        `'${token.lexeme}' is a Stickynight keyword, so it cannot be used as ${what}.`,
        token.line,
        token.column,
        token.length,
        `Pick a different name. For example: ${example}`
      );
    }

    throw syntaxError(
      `I expected ${what}, but found ${describeToken(token)}.`,
      token.line,
      token.column,
      token.length,
      `For example: ${example}`
    );
  }

  private consumeWord(type: TokenType, word: string, hint: string): Token {
    if (this.check(type)) return this.advance();

    const token = this.peek();
    throw syntaxError(
      `I expected '${word}' here, but found ${describeToken(token)}.`,
      token.line,
      token.column,
      token.length,
      hint
    );
  }

  /** Blank lines never reach the parser, but stray NEWLINEs are harmless. */
  private skipBlankLines(): void {
    while (this.check(T.NEWLINE)) this.advance();
  }

  private match(type: TokenType): boolean {
    if (!this.check(type)) return false;
    this.advance();
    return true;
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.position++;
    return this.tokens[this.position - 1];
  }

  private peek(): Token {
    return this.tokens[this.position];
  }

  private previous(): Token {
    return this.tokens[this.position - 1];
  }

  private isAtEnd(): boolean {
    return this.peek().type === T.EOF;
  }
}

/** Token stream in, AST out. Throws on the first syntax error. */
export function parse(tokens: Token[]): Program {
  return new Parser(tokens).parse();
}

/** Token stream in, AST plus every syntax error found, out. */
export function parseWithRecovery(tokens: Token[]): {
  program: Program;
  errors: StickynightError[];
} {
  return new Parser(tokens).parseWithRecovery();
}
