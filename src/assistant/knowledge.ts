/**
 * assistant/knowledge.ts — what the assistant knows about Stickynight.
 *
 * Every entry is a short lesson: what the thing is called, how it is written,
 * and a complete program that demonstrates it.
 *
 * THE EXAMPLES ARE NOT DECORATION. tests/assistant.test.ts runs every single
 * `code` field below through the real interpreter and fails if any of them
 * does not run. The assistant therefore cannot hand out a program that does
 * not work — which is the one thing that would make a teaching assistant
 * worse than no assistant at all.
 *
 * The keyword and built-in lists are imported from the language itself rather
 * than retyped, so they cannot drift away from what the lexer accepts.
 */

import { KEYWORD_LIST } from "../token";
import { BUILTINS } from "../builtins";

export interface Entry {
  /** Stable id, used for cross-references and by the tests. */
  id: string;
  title: string;
  /**
   * Words and phrases that should pull this entry up. These are matched
   * against the question after synonym expansion, so "loop" finds "repeat"
   * without anyone writing "loop" in the language.
   */
  triggers: string[];
  /** The explanation, in the same plain voice the error messages use. */
  body: string;
  /** A complete, runnable program. Verified by the test suite. */
  code?: string;
  /** Ids of entries worth reading next. */
  see?: string[];
}

export const ENTRIES: Entry[] = [
  // --- getting started -----------------------------------------------------
  {
    id: "printing",
    title: "Printing something",
    triggers: [
      "print", "say", "output", "display", "show", "write", "console",
      "hello world", "first program",
    ],
    body:
      "`say` prints one line. It takes any value — a number, some text, a list, " +
      "or the result of a calculation.",
    code: 'say "Hello, world!"\nsay 2 + 2\nsay yes\n',
    see: ["variables", "text"],
  },

  {
    id: "variables",
    title: "Giving a name to a value",
    triggers: [
      "variable", "set", "change", "assign", "store", "name", "declare",
      "value", "update", "reassign",
    ],
    body:
      "`set` creates a name. `change` updates one that already exists.\n\n" +
      "They are different words on purpose: because `change` only ever updates " +
      "something that is already there, a mistyped name is reported as a mistake " +
      "instead of quietly becoming a second variable.",
    code:
      "set total to 0\nchange total to total + 5\nsay total\n",
    see: ["scope", "printing"],
  },

  {
    id: "text",
    title: "Working with text",
    triggers: [
      "text", "string", "quote", "join", "concatenate", "concat", "letters",
      "characters", "uppercase", "lowercase", "word", "sentence", "split",
    ],
    body:
      'Text is written in double quotes. `+` joins two pieces of text — and if ' +
      "either side of a `+` is text, the other side is turned into text too, so " +
      '`say "Score: " + 90` works.\n\n' +
      "Useful built-ins: `uppercase`, `lowercase`, `trim`, `split`, `join`, " +
      "`characters`, `reverse`, `length of`.",
    code:
      'set name to "ada"\n' +
      'say "Hello, " + uppercase(name) + "!"\n' +
      'say "Letters: " + length of name\n' +
      'say join(split("a,b,c", ","), " and ")\n',
    see: ["printing", "builtins", "lists"],
  },

  {
    id: "numbers",
    title: "Arithmetic",
    triggers: [
      "number", "arithmetic", "maths", "math", "add", "subtract", "multiply",
      "divide", "plus", "minus", "times", "remainder", "mod", "modulo",
      "calculate", "sum", "average", "round", "square root",
    ],
    body:
      "There is one number type, so 2 and 2.0 are the same value.\n\n" +
      "Every operator has a symbol and a word, and they mean exactly the same " +
      "thing: `+` or `plus`, `-` or `minus`, `*` or `times`, `/` or " +
      "`divided by`, `%` or `mod`.\n\n" +
      "Dividing by zero is an error rather than infinity.",
    code:
      "say 2 + 3 * 4\nsay (2 + 3) * 4\nsay 17 mod 5\nsay 10 divided by 4\n" +
      "say square_root(144)\nsay round(3.14159, 2)\n",
    see: ["comparing", "builtins"],
  },

  // --- deciding -------------------------------------------------------------
  {
    id: "conditions",
    title: "Making a decision",
    triggers: [
      "if", "else", "otherwise", "condition", "conditional", "branch",
      "decide", "when", "elif", "else if", "switch", "case",
    ],
    body:
      "`if` runs a block when a condition is yes. `otherwise if` adds another " +
      "question, and `otherwise` catches everything else.\n\n" +
      "The line ends with `:` and the lines belonging to it are indented by four " +
      "spaces. `otherwise` lines up underneath its `if`, at the same indentation.",
    code:
      "set score to 82\n\n" +
      "if score is at least 90:\n" +
      '    say "A"\n' +
      "otherwise if score is at least 50:\n" +
      '    say "pass"\n' +
      "otherwise:\n" +
      '    say "try again"\n',
    see: ["comparing", "logic", "indentation"],
  },

  {
    id: "comparing",
    title: "Comparing two values",
    triggers: [
      "compare", "comparison", "equal", "equals", "greater", "less", "bigger",
      "smaller", "at least", "at most", "more than", "less than", "not equal",
      "gte", "lte", "greater than or equal",
    ],
    body:
      "Comparisons are written as phrases, not symbols:\n\n" +
      "  `is`              equal\n" +
      "  `is not`          not equal\n" +
      "  `is at least`     greater than or equal\n" +
      "  `is at most`      less than or equal\n" +
      "  `is more than`    greater than\n" +
      "  `is less than`    less than\n\n" +
      "`>=`, `<=`, `==` and `!=` are deliberately not part of the language — " +
      "if you type one, the error message tells you which phrase to use.",
    code:
      "set age to 20\n" +
      "say age is at least 18\n" +
      "say age is not 21\n" +
      'say "apple" is less than "banana"\n',
    see: ["conditions", "logic"],
  },

  {
    id: "logic",
    title: "Combining conditions",
    triggers: [
      "and", "or", "not", "both", "either", "logic", "logical", "boolean",
      "true", "false", "yes", "no", "truth",
      // The symbols the lexer rejects, so that typing one finds this lesson.
      "&&", "||", "!",
    ],
    body:
      "`and`, `or` and `not` combine yes/no values. `and` and `or` stop early: " +
      "if the left side already decides the answer, the right side is never " +
      "looked at.\n\n" +
      "Only yes and no can be used as a condition. A number is not a condition " +
      "on its own — compare it first.",
    code:
      "set age to 20\nset member to yes\n\n" +
      "if age is at least 18 and member:\n" +
      '    say "allowed in"\n\n' +
      "if not member or age is more than 65:\n" +
      '    say "different price"\n',
    see: ["comparing", "conditions"],
  },

  // --- repeating ------------------------------------------------------------
  {
    id: "loops",
    title: "Repeating something",
    triggers: [
      "loop", "repeat", "iterate", "iteration", "again", "while", "for",
      "times", "counting", "count", "each", "over and over",
    ],
    body:
      "There are four ways to repeat, and each reads as what it does:\n\n" +
      "  `repeat 3 times:`                   a fixed number of turns\n" +
      "  `repeat with i from 1 to 10:`       counting, both ends included\n" +
      "  `repeat with i from 10 to 1 by -1:` counting the other way\n" +
      "  `repeat while total is less than 100:`  until a condition stops holding\n" +
      "  `for each name in names:`           every item of a list or text\n\n" +
      "`stop` leaves the loop. `skip` moves on to the next turn.",
    code:
      'repeat 2 times:\n    say "hello"\n\n' +
      "repeat with i from 1 to 5:\n    say i\n\n" +
      "set n to 1\nrepeat while n is less than 50:\n    change n to n times 2\nsay n\n",
    see: ["loop-control", "lists", "conditions"],
  },

  {
    id: "loop-control",
    title: "Leaving a loop early",
    triggers: [
      "stop", "skip", "break", "continue", "exit loop", "leave loop",
      "next iteration", "early",
    ],
    body:
      "`stop` ends the innermost loop immediately. `skip` abandons the current " +
      "turn and starts the next one.\n\n" +
      "In a counting loop, `skip` still moves the counter on, so the loop always " +
      "finishes.",
    code:
      "repeat with i from 1 to 10:\n" +
      "    if i mod 2 is not 0:\n" +
      "        skip\n" +
      "    if i is more than 6:\n" +
      "        stop\n" +
      "    say i\n",
    see: ["loops"],
  },

  // --- data -----------------------------------------------------------------
  {
    id: "lists",
    title: "Lists",
    triggers: [
      "list", "array", "collection", "items", "elements", "append", "push",
      "add", "add to", "remove", "build a list", "empty list",
      "index", "first", "last", "length", "sort", "contains",
    ],
    body:
      "A list is written `list of 1, 2, 3`, and an empty one is `empty list`. " +
      "There are no square brackets anywhere in the language.\n\n" +
      "Positions start at 1, so `item 1 of scores` is the first one.\n\n" +
      "One thing to watch: `list of` takes every comma after it. Inside a call, " +
      "put the list in brackets — `join((list of 1, 2), \", \")`.",
    code:
      "set scores to list of 88, 92, 41\n" +
      "add 67 to scores\n\n" +
      "say item 1 of scores\n" +
      "say length of scores\n" +
      "say sum(scores)\n" +
      "say sort(scores)\n\n" +
      "change item 2 of scores to 100\n" +
      "say scores\n",
    see: ["for-each", "builtins", "indexing"],
  },

  {
    id: "indexing",
    title: "Getting one item out of a list",
    triggers: [
      "item", "index", "position", "nth", "element at", "subscript",
      "first item", "last item", "out of range",
    ],
    body:
      "`item 2 of scores` is the second item. Counting starts at 1, because " +
      '"item 1" is how the word is used outside programming.\n\n' +
      "The last item is `item (length of scores) of scores` — the brackets are " +
      "needed so the length is worked out first.\n\n" +
      "`item ... of` works on text too, giving one character.",
    code:
      "set scores to list of 10, 20, 30\n" +
      "say item 1 of scores\n" +
      "say item (length of scores) of scores\n" +
      'say item 1 of "abc"\n',
    see: ["lists", "for-each"],
  },

  {
    id: "for-each",
    title: "Going through every item",
    triggers: [
      "for each", "foreach", "every item", "walk", "traverse", "go through",
      "loop over list", "iterate list",
    ],
    body:
      "`for each` visits every item of a list, or every character of some text.\n\n" +
      "It works on a snapshot, so adding to the list inside the loop is safe and " +
      "cannot make it run forever.",
    code:
      'set names to list of "Asha", "Ravi", "Meera"\n\n' +
      "for each name in names:\n" +
      '    say "Hello, " + name\n\n' +
      'for each letter in "abc":\n    say letter\n',
    see: ["lists", "loops"],
  },

  // --- definitions ----------------------------------------------------------
  {
    id: "definitions",
    title: "Defining your own thing",
    triggers: [
      "define", "definition", "definitions", "function", "method", "procedure",
      "subroutine", "give back", "return", "parameter", "argument", "input",
      "call", "reuse",
    ],
    body:
      "`define` makes something you can use again. Inputs are listed after " +
      "`with`, and `give back` sends a value out.\n\n" +
      "A definition can be used before the line it is written on, so a program " +
      "can be read from the top down.",
    code:
      "define greet with name:\n" +
      '    give back "Hello, " + name + "!"\n\n' +
      "define area with width, height:\n" +
      "    give back width times height\n\n" +
      'say greet("Ada")\nsay area(3, 4)\n',
    see: ["recursion", "closures", "scope"],
  },

  {
    id: "recursion",
    title: "A definition that uses itself",
    triggers: [
      "recursion", "recursive", "itself", "factorial", "fibonacci",
      "calls itself", "base case",
    ],
    body:
      "A definition may call itself. It needs a case where it stops, or it will " +
      "run until the assistant's runaway-recursion guard reports it.",
    code:
      "define factorial with n:\n" +
      "    if n is at most 1:\n" +
      "        give back 1\n" +
      "    give back n times factorial(n minus 1)\n\n" +
      "say factorial(6)\n",
    see: ["definitions", "loops"],
  },

  {
    id: "closures",
    title: "A definition that remembers",
    triggers: [
      "closure", "remember", "nested define", "inner function", "counter",
      "captures", "scope capture", "higher order",
    ],
    body:
      "A definition made inside another one keeps hold of the names that " +
      "surrounded it, even after the outer one has finished. Each call to the " +
      "outer definition makes a fresh, separate set of those names.\n\n" +
      "Definitions are ordinary values too, so one can be stored in a name or " +
      "handed to another definition.",
    code:
      "define make_counter:\n" +
      "    set count to 0\n" +
      "    define step:\n" +
      "        change count to count + 1\n" +
      "        give back count\n" +
      "    give back step\n\n" +
      "set tick to make_counter()\nsay tick()\nsay tick()\n\n" +
      "set other to make_counter()\nsay other()\n",
    see: ["definitions", "scope"],
  },

  {
    id: "scope",
    title: "Where a name can be seen",
    triggers: [
      "scope", "visible", "shadow", "shadowing", "block", "local", "global",
      "inside", "outside", "undefined variable", "not defined",
    ],
    body:
      "Each block gets its own set of names. Looking a name up searches the " +
      "current block, then the one around it, and so on outwards.\n\n" +
      "`set` inside a block makes a NEW name that hides any outer one for the " +
      "rest of that block. `change` reaches outwards and updates the existing one.",
    code:
      "set x to 1\n\n" +
      "if yes:\n" +
      "    set x to 2\n" +
      "    say x\n\n" +
      "say x\n\n" +
      "if yes:\n" +
      "    change x to 99\n\n" +
      "say x\n",
    see: ["variables", "closures"],
  },

  // --- the shape of a program -----------------------------------------------
  {
    id: "indentation",
    title: "Indentation and blocks",
    triggers: [
      "indent", "indentation", "whitespace", "spaces", "tab", "block",
      "braces", "brackets", "curly", "nesting", "colon",
    ],
    body:
      "There are no braces. A line ending in `:` opens a block, and the lines " +
      "indented under it belong to it.\n\n" +
      "Use spaces, four per level. Tabs are refused outright, because a tab " +
      "looks like a different width in every editor.\n\n" +
      "Blank lines and comment-only lines never close a block, so they can be " +
      "used freely inside one.",
    code:
      "if yes:\n" +
      '    say "inside"\n\n' +
      "    # a blank line and a comment do not close the block\n" +
      '    say "still inside"\n\n' +
      'say "outside"\n',
    see: ["conditions", "errors"],
  },

  {
    id: "comments",
    title: "Comments",
    triggers: ["comment", "note", "hash", "#", "remark", "document"],
    body:
      "`#` starts a comment that runs to the end of the line. There is no " +
      "block comment form.",
    code: '# this whole line is a comment\nsay "hi"   # and this part too\n',
    see: ["indentation"],
  },

  {
    id: "types",
    title: "The kinds of value",
    triggers: [
      "type", "types", "kind", "number", "text", "truth", "list", "nothing",
      "null", "none", "type_of", "data type",
    ],
    body:
      "There are six kinds of value: a number, some text, a yes/no truth value, " +
      "a list, a definition, and `nothing`.\n\n" +
      "`type_of(value)` tells you which one you have. A definition that never " +
      "says `give back` produces `nothing`.",
    code:
      "say type_of(42)\n" +
      'say type_of("hello")\n' +
      "say type_of(yes)\n" +
      "say type_of(list of 1, 2)\n" +
      "say type_of(nothing)\n",
    see: ["numbers", "text", "lists"],
  },

  // --- getting unstuck ------------------------------------------------------
  {
    id: "errors",
    title: "Reading an error message",
    triggers: [
      "error", "mistake", "wrong", "broken", "fail", "failed", "crash",
      "bug", "problem", "does not work", "doesn't work", "stuck", "help",
    ],
    body:
      "Every error names the stage it came from, the line, and what to do:\n\n" +
      "  Lexical  — the characters themselves (a stray `>=`, a tab, an unclosed quote)\n" +
      "  Syntax   — the shape of the line (a missing `:`, an unfinished statement)\n" +
      "  Runtime  — what happened while running (an unknown name, a bad position)\n\n" +
      "The caret under the line points at the exact spot, and the `hint:` line " +
      "says what to write instead.\n\n" +
      "If you paste your program into the editor and ask me 'what is wrong?', I " +
      "will read the actual error and explain it.",
    see: ["indentation", "comparing"],
  },

  {
    id: "builtins",
    title: "The built-in definitions",
    triggers: [
      "builtin", "built in", "library", "standard library", "functions",
      "available", "what can i use", "helpers",
    ],
    body:
      "These come ready to use, and a program may define its own with the same " +
      "name to replace one:\n\n" +
      BUILTINS.map((b) => `  ${b.callableName.padEnd(16)}${b.description}`).join("\n"),
    code:
      "say uppercase(\"abc\")\n" +
      "say round(2.567, 1)\n" +
      "say maximum(3, 9, 4)\n" +
      "say sort(list of 3, 1, 2)\n" +
      'say contains("hello", "ell")\n',
    see: ["text", "numbers", "lists"],
  },

  {
    id: "keywords",
    title: "Every keyword",
    triggers: ["keyword", "keywords", "reserved", "words", "vocabulary", "all words"],
    body:
      `Stickynight has ${KEYWORD_LIST.length} reserved words. They are always ` +
      "lowercase, and none of them can be used as a name:\n\n  " +
      KEYWORD_LIST.join("  "),
    see: ["builtins"],
  },

  {
    id: "about",
    title: "About Stickynight",
    triggers: [
      "what is stickynight", "about", "why", "purpose", "language", "who made",
      "design", "project", "goal",
    ],
    body:
      "Stickynight is a small language whose syntax is made of English phrases " +
      "rather than symbols. It has no braces, no semicolons and no symbolic " +
      "comparison operators, and blocks are marked by indentation.\n\n" +
      "It was built as a compiler design project: a hand-written lexer, a " +
      "recursive-descent parser, a tree-walking interpreter, and a WebAssembly " +
      "code generator — all from scratch.\n\n" +
      "Ask me about any part of it, or paste a program and ask what it does.",
    see: ["printing", "errors"],
  },
];

/** Entries by id, for cross-references. */
export const BY_ID: ReadonlyMap<string, Entry> = new Map(
  ENTRIES.map((entry) => [entry.id, entry])
);

/**
 * Words that a learner is likely to use, mapped onto the words Stickynight
 * actually uses. This is the only place the assistant translates vocabulary,
 * and it is what lets "how do I write a for loop" find `repeat`.
 */
export const SYNONYMS: Readonly<Record<string, string[]>> = Object.freeze({
  function: ["define", "definition"],
  func: ["define", "definition"],
  method: ["define", "definition"],
  procedure: ["define", "definition"],
  return: ["give", "back"],
  returns: ["give", "back"],
  print: ["say", "print"],
  printf: ["say"],
  echo: ["say"],
  log: ["say"],
  console: ["say"],
  array: ["list"],
  arrays: ["list"],
  vector: ["list"],
  append: ["add"],
  push: ["add"],
  variable: ["set", "name"],
  var: ["set", "name"],
  assign: ["set", "change"],
  loop: ["repeat"],
  loops: ["repeat"],
  looping: ["repeat"],
  iterate: ["repeat", "each"],
  foreach: ["each"],
  while: ["repeat", "while"],
  break: ["stop"],
  continue: ["skip"],
  elif: ["otherwise"],
  else: ["otherwise"],
  boolean: ["yes", "no", "truth"],
  bool: ["yes", "no", "truth"],
  true: ["yes"],
  false: ["no"],
  null: ["nothing"],
  none: ["nothing"],
  nil: ["nothing"],
  string: ["text"],
  strings: ["text"],
  char: ["text", "characters"],
  int: ["number"],
  integer: ["number"],
  float: ["number"],
  double: ["number"],
  modulo: ["mod", "remainder"],
  // Targets must be words an entry can actually be indexed on, so none of
  // them may be a stopword: "is" and "at" are dropped before scoring, and a
  // synonym pointing at one would silently expand to nothing.
  equals: ["equal"],
  "==": ["equal"],
  "!=": ["not", "equal"],
  ">=": ["least"],
  "<=": ["most"],
  ">": ["more", "than"],
  "<": ["less", "than"],
  "&&": ["and"],
  "||": ["or"],
  comment: ["comment", "hash"],
  indent: ["indentation", "spaces"],
  error: ["error", "mistake"],
  exception: ["error"],
  crash: ["error"],
  bug: ["error", "mistake"],
});

/**
 * Words carrying no signal, dropped before scoring.
 *
 * Built by filtering the list below against the language's own keywords. In
 * ordinary English "and", "or", "not", "if", "is", "at" and "for" are all
 * stopwords — but here they are OPERATORS, so a question containing one is
 * very often about exactly that operator. Removing them would make the
 * lesson on `and` / `or` unfindable by anyone typing `&&`.
 *
 * They are not dangerous to keep: a word appearing in nearly every entry
 * gets an inverse document frequency close to zero, so it contributes almost
 * nothing to the score anyway. Letting the maths handle it beats maintaining
 * two lists that have to agree.
 */
const COMMON_ENGLISH: readonly string[] = [
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "doing", "have", "has", "had", "i", "you", "we",
  "it", "this", "that", "these", "those", "my", "your", "me", "to", "of",
  "in", "on", "at", "for", "with", "and", "or", "but", "if", "then",
  "how", "what", "why", "when", "where", "which", "who", "can", "could",
  "would", "should", "will", "shall", "may", "might", "must", "please",
  "tell", "show", "explain", "about", "some", "any", "there", "here",
  "write", "make", "create", "need", "want", "get", "use", "using", "work",
  "works", "thing", "something", "anything", "way", "ways", "s", "t",
];

const RESERVED = new Set<string>(KEYWORD_LIST);

export const STOPWORDS: ReadonlySet<string> = new Set(
  COMMON_ENGLISH.filter((word) => !RESERVED.has(word))
);
