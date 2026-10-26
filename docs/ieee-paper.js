/* Stickynight — IEEE conference-format paper. */

const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, SectionType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  convertInchesToTwip, PageOrientation,
} = require("docx");

const OUT =
  "C:/Users/HP/OneDrive/Desktop/College Projects/StickKnight/docs/Stickynight-IEEE-Paper.docx";

const SERIF = "Times New Roman";
const MONO = "Courier New";

// IEEE conference: US Letter, 0.75" top, 1" bottom, 0.625" sides.
const PAGE = {
  size: { width: 12240, height: 15840 },
  margin: {
    top: convertInchesToTwip(0.75),
    bottom: convertInchesToTwip(1.0),
    left: convertInchesToTwip(0.625),
    right: convertInchesToTwip(0.625),
  },
};

// ---------------------------------------------------------------- helpers

/** Body paragraph: 10pt, justified, first-line indent, no spacing. */
function body(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: opts.noIndent ? undefined : { firstLine: convertInchesToTwip(0.2) },
    spacing: { after: 0, line: 240 },
    children: runs(text),
  });
}

/**
 * Split a string on *markers* into styled runs:
 *   **bold**   _italic_   `monospace`
 */
function runs(text, size = 20) {
  const out = [];
  const pattern = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g;
  let last = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      out.push(new TextRun({ text: text.slice(last, match.index), font: SERIF, size }));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      out.push(new TextRun({ text: token.slice(2, -2), font: SERIF, size, bold: true }));
    } else if (token.startsWith("_")) {
      out.push(new TextRun({ text: token.slice(1, -1), font: SERIF, size, italics: true }));
    } else {
      out.push(new TextRun({ text: token.slice(1, -1), font: MONO, size: size - 2 }));
    }
    last = match.index + token.length;
  }

  if (last < text.length) {
    out.push(new TextRun({ text: text.slice(last), font: SERIF, size }));
  }
  return out;
}

let sectionNumber = 0;
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

function head(title) {
  sectionNumber++;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 100 },
    children: [
      new TextRun({
        text: `${ROMAN[sectionNumber]}.  ${title}`,
        font: SERIF,
        size: 20,
        smallCaps: true,
      }),
    ],
  });
}

function subhead(letter, title) {
  return new Paragraph({
    spacing: { before: 140, after: 60 },
    children: [
      new TextRun({ text: `${letter}.  ${title}`, font: SERIF, size: 20, italics: true }),
    ],
  });
}

/** A monospace block, 8pt, used for code and the architecture figure. */
function code(lines, opts = {}) {
  return lines.map(
    (line, i) =>
      new Paragraph({
        alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: {
          after: 0,
          before: i === 0 ? 80 : 0,
          line: 200,
        },
        children: [
          new TextRun({ text: line || " ", font: MONO, size: opts.size || 15 }),
        ],
      })
  );
}

function caption(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: opts.after === undefined ? 160 : opts.after },
    children: runs(text, 16),
  });
}

/** Table caption: IEEE puts these ABOVE the table, in small caps. */
function tableCaption(number, title) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 0 },
      children: [new TextRun({ text: `TABLE ${number}`, font: SERIF, size: 16 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: title, font: SERIF, size: 16, smallCaps: true })],
    }),
  ];
}

const NO_SIDE_BORDERS = {
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

/** An IEEE-style table: horizontal rules only, 8pt. */
function table(widths, rows) {
  const total = widths.reduce((a, b) => a + b, 0);

  return new Table({
    columnWidths: widths,
    width: { size: total, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
      ...NO_SIDE_BORDERS,
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: rows.map((cells, rowIndex) =>
      new TableRow({
        children: cells.map((cell, columnIndex) =>
          new TableCell({
            width: { size: widths[columnIndex], type: WidthType.DXA },
            margins: { top: 30, bottom: 30, left: 60, right: 60 },
            borders:
              rowIndex === 0
                ? {
                    bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
                    ...NO_SIDE_BORDERS,
                  }
                : NO_SIDE_BORDERS,
            children: [
              new Paragraph({
                alignment:
                  columnIndex === 0 ? AlignmentType.LEFT : AlignmentType.LEFT,
                spacing: { after: 0, line: 200 },
                children: runs(cell, 16).map((run) => run),
              }),
            ],
          })
        ),
      })
    ),
  });
}

function bullet(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { left: convertInchesToTwip(0.18), hanging: convertInchesToTwip(0.12) },
    spacing: { after: 40, line: 240 },
    children: runs(text),
  });
}

// =========================================================================
// Front matter — single column
// =========================================================================

const front = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [
      new TextRun({
        text: "Stickynight: A Natural-Syntax Programming Language with Dual Execution Backends and a Compiler-Grounded Assistant",
        font: SERIF,
        size: 48,
      }),
    ],
  }),

  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 20 },
    children: [
      new TextRun({ text: "Apoorv Verma", font: SERIF, size: 22 }),
      new TextRun({ text: "                    ", font: SERIF, size: 22 }),
      new TextRun({ text: "Surjadeep Das", font: SERIF, size: 22 }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 20 },
    children: [
      new TextRun({ text: "Department of Computer Science and Engineering", font: SERIF, size: 20, italics: true }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [
      new TextRun({ text: "[Institution name], [City], [Country]", font: SERIF, size: 20, italics: true }),
    ],
  }),
];

// =========================================================================
// Body — two columns
// =========================================================================

const content = [];
const P = (t, o) => content.push(body(t, o));
const B = (t) => content.push(bullet(t));
const CODE = (lines, o) => content.push(...code(lines, o));
const CAP = (t, o) => content.push(caption(t, o));

// --- abstract -------------------------------------------------------------
content.push(
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 80, line: 220 },
    children: [
      new TextRun({ text: "Abstract—", font: SERIF, size: 18, bold: true, italics: true }),
      ...runs(
        "Most student compiler projects reimplement a C-like syntax, which exercises implementation technique but asks no language-design questions, because every such question has already been answered by the language being copied. We present Stickynight, an original programming language whose syntax is composed of English phrases rather than symbols, together with a complete compiler implemented from scratch: a hand-written lexical analyser that recovers block structure from indentation, a recursive-descent parser derived from a context-free grammar written in advance, a tree-walking interpreter with lexical scoping and closures, and a WebAssembly code-generation backend that emits both text and binary modules. Removing symbolic operators forces concrete design decisions, and we document each with its cost — including a genuine grammatical ambiguity that arises from combining phrase-based operators with keyword-led statements. Correctness is established by differential testing: twenty programs are executed by both backends and their outputs compared, which is stronger evidence than inspecting either backend alone. The compiled backend runs 34x to 271x faster than the interpreter on the numeric subset it supports, with sub-millisecond code generation. We further describe a programming assistant that is grounded in the compiler rather than in a language model: it diagnoses faults from the real error objects, explains programs by walking the abstract syntax tree, and answers reference questions by retrieval, reaching an external model only for what none of those cover. The implementation comprises 8,294 lines of TypeScript with no runtime dependencies, validated by 386 automated tests.",
        18
      ).map((r) => new TextRun({ ...r, bold: true })),
    ],
  })
);

// docx-js TextRun spread above does not carry options; rebuild explicitly.
content.pop();
content.push(
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 80, line: 220 },
    children: [
      new TextRun({ text: "Abstract—", font: SERIF, size: 18, bold: true, italics: true }),
      new TextRun({
        text:
          "Most student compiler projects reimplement a C-like syntax, which exercises implementation technique but asks no language-design questions, because every such question has already been answered by the language being copied. We present Stickynight, an original programming language whose syntax is composed of English phrases rather than symbols, together with a complete compiler implemented from scratch: a hand-written lexical analyser that recovers block structure from indentation, a recursive-descent parser derived from a context-free grammar written in advance, a tree-walking interpreter with lexical scoping and closures, and a WebAssembly code-generation backend emitting both text and binary modules. Removing symbolic operators forces concrete design decisions, and we document each with its cost — including a genuine grammatical ambiguity arising from the combination of phrase-based operators with keyword-led statements. Correctness is established by differential testing: twenty programs are executed by both backends and their outputs compared, which is stronger evidence than inspecting either backend alone. The compiled backend runs 34x to 271x faster than the interpreter on the numeric subset it supports, with sub-millisecond code generation. We further describe a programming assistant grounded in the compiler rather than in a language model: it diagnoses faults from the real error objects, explains programs by walking the abstract syntax tree, and answers reference questions by retrieval, reaching an external model only for what none of those cover. The implementation comprises 8,294 lines of TypeScript with no runtime dependencies, validated by 386 automated tests.",
        font: SERIF,
        size: 18,
        bold: true,
      }),
    ],
  })
);

content.push(
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 160, line: 220 },
    children: [
      new TextRun({ text: "Index Terms—", font: SERIF, size: 18, bold: true, italics: true }),
      new TextRun({
        text:
          "compiler design, programming language design, lexical analysis, recursive-descent parsing, abstract syntax tree, code generation, WebAssembly, error reporting, computing education.",
        font: SERIF,
        size: 18,
        bold: true,
      }),
    ],
  })
);

// =========================================================================
content.push(head("Introduction"));

P(
  "A compiler design course asks a student to build a lexer, a parser and an evaluator. The conventional way to satisfy that requirement is to define a small language resembling C or Java and implement it. The exercise is sound, but it is incomplete in one respect: the syntax is inherited, so no design decision is ever made. Whether blocks are delimited by braces, whether comparison uses `>=`, whether array indices begin at zero — all of these arrive already settled, and the student never has to defend one.",
  { noIndent: true }
);

P(
  "This paper reports on a project that deliberately gave those decisions back. Stickynight is an original language whose surface syntax is made of English phrases: it has no braces, no statement terminators, and no symbolic comparison operators. Block structure is carried by indentation. A conditional is written:"
);

CODE([
  "if score is at least 90:",
  '    give back "A"',
  "otherwise if score is at least 75:",
  '    give back "B"',
  "otherwise:",
  '    give back "C"',
]);

CAP("Fig. 1.  A fragment of Stickynight. Comparison is a phrase; the block is delimited by indentation alone.");

P(
  "The premise is not novel in itself — AppleScript [3], HyperTalk [4] and Inform 7 [5] all explored English-like syntax, and empirical work by Pane et al. [7] found that non-programmers naturally describe solutions in a form much closer to this than to C. What those systems do not provide is an open artefact to learn from: they are products, and none publishes a grammar alongside an implementation showing how phrase-level operators are actually tokenised and parsed. That gap is what this project addresses.",
  { noIndent: true }
);

P("The contributions of this work are:");

B("**A documented language design.** A 47-keyword language with a formal EBNF grammar of 36 productions, in which every non-obvious decision is recorded together with what it costs (Section III).");

B("**A hand-written front end.** A lexical analyser using no regular expressions, synthesising INDENT and DEDENT tokens from column positions, and a recursive-descent parser that folds multi-word operator phrases with fixed lookahead and no backtracking (Section V-A, V-B).");

B("**An identified grammatical ambiguity and its resolution.** Combining phrase operators with keyword-led statements produces a real ambiguity on the word `times`, which we resolve with a scoped suppression rule that preserves an escape hatch (Section V-B).");

B("**Two independent backends over one intermediate representation**, validated against each other by differential testing [16] rather than by inspection (Sections V-E, VI-B).");

B("**A compiler-grounded assistant.** A question-answering component that derives its answers from the compiler's own error objects, syntax trees and interpreter, treating a language model as a fallback rather than as the mechanism (Section V-F).");

// =========================================================================
content.push(head("Related Work"));

content.push(subhead("A", "Natural-language-inspired syntax"));

P(
  "HyperTalk [4], shipped with HyperCard in 1987, demonstrated that English-like scripting could reach a non-programmer audience at scale, but it was bound to a single authoring environment and was never a general-purpose language. AppleScript [3] carried the idea into a production operating system. Cook's retrospective is unusually candid about the outcome: the English-like surface made programs easy to read and surprisingly hard to write, because many plausible phrasings were not accepted and the user had no model of which would be. We treat that as the central cautionary result for this class of language, and respond to it in two ways — by keeping the grammar small enough to specify completely, and by designing the rejection messages as the primary teaching surface (Section V-D).",
  { noIndent: true }
);

P(
  "Inform 7 [5] showed that natural language can drive a genuine compiler, but its domain is interactive fiction and its grammar is correspondingly specialised. Scratch [6] takes the opposite approach, eliminating syntax errors by eliminating syntax; it is highly effective pedagogically, but what a learner acquires does not transfer directly to a text-based language. Myers et al. [8] survey the broader natural-programming agenda, and Green and Petre's cognitive-dimensions framework [9] supplies vocabulary — notably _error-proneness_ and _role-expressiveness_ — for the trade-offs catalogued in Section III-B."
);

content.push(subhead("B", "Error messages"));

P(
  "A substantial literature establishes that compiler diagnostics are a significant obstacle for novices. Becker et al. [10] survey the field and find the evidence for message quality mattering to be real but uneven; Barik et al. [11] show through eye-tracking that developers do read error messages, and that reading them is cognitively expensive. Denny et al. [12] report a negative result worth stating plainly: in their study, enhancing syntax error messages did not measurably improve student outcomes. We therefore make no efficacy claim for our diagnostics. What we do claim is narrower and verifiable: because the language rejects `>=` deliberately rather than incidentally, the rejection can name the construct to use instead, and that property is testable (Section VI-C).",
  { noIndent: true }
);

content.push(subhead("C", "Implementation technique"));

P(
  "The pipeline follows Aho et al. [1]. The recursive-descent and tree-walking structure follows Nystrom [2]. Indentation-sensitive tokenisation using an indentation stack follows the approach documented for Python [15]. The code generator targets WebAssembly [13], [14], chosen because it is a stack machine with structured control flow, which makes the lowering of nested loops an explicit and inspectable exercise rather than a register-allocation problem.",
  { noIndent: true }
);

// =========================================================================
content.push(head("Language Design"));

content.push(subhead("A", "Principles"));

P("Four commitments, in priority order, generated every rule in the language:", { noIndent: true });

B("**A line should read like an instruction.** A rule that makes a program read less like something one could say aloud requires strong justification.");

B("**A rejection should teach.** Wherever the language refuses a construct, it must be possible to state what was probably intended. This is why symbolic operators are rejected explicitly rather than merely being unrecognised characters.");

B("**One obvious way.** The few constructs with two spellings exist because both were already familiar to the intended reader, not for variety.");

B("**No concept before it is needed.** One numeric type, not four. Positions count from one. Nothing about the machine appears in the language.");

content.push(subhead("B", "Syntactic decisions and their costs"));

P(
  "Table I gives the operator phrases. Table II records the decisions that could reasonably have gone the other way, each with the cost it imposes. We regard the cost column as the substantive part: a design decision stated without its cost has not really been made.",
  { noIndent: true }
);

content.push(...tableCaption("I", "Operator phrases and their symbolic equivalents"));
content.push(
  table([1500, 1300, 2000], [
    ["Phrase", "Symbol", "Meaning"],
    ["`plus`", "`+`", "add; joins text"],
    ["`minus`", "`-`", "subtract, negate"],
    ["`times`", "`*`", "multiply"],
    ["`divided by`", "`/`", "divide"],
    ["`mod`", "`%`", "remainder"],
    ["`is`", "—", "equal"],
    ["`is not`", "—", "not equal"],
    ["`is at least`", "—", "greater or equal"],
    ["`is at most`", "—", "less or equal"],
    ["`is more than`", "—", "greater than"],
    ["`is less than`", "—", "less than"],
    ["`and` `or` `not`", "—", "logical"],
  ])
);
CAP("Symbolic comparison operators are rejected by the lexer with a message naming the phrase to use.", { after: 160 });

content.push(...tableCaption("II", "Design decisions and their costs"));
content.push(
  table([1350, 1750, 1700], [
    ["Decision", "Rationale", "Cost"],
    [
      "Indentation, not braces",
      "Block structure matches what the reader already sees",
      "Whitespace significant; tabs must be rejected",
    ],
    [
      "Phrases for comparison",
      "`>=` must be taught; `is at least` need not",
      "Longer lines; larger keyword set",
    ],
    [
      "Arithmetic symbols kept",
      "Learned in school before programming",
      "Two spellings per operator",
    ],
    [
      "`set` creates, `change` updates",
      "Permits a mistyped name to be reported, not silently created",
      "One extra keyword",
    ],
    [
      "Indices start at 1",
      "Matches ordinary use of the word \u201citem\u201d",
      "One subtraction in the implementation",
    ],
    [
      "No truthiness",
      "`0` and `\u201c\u201d` as false trade a clear message for a silent wrong answer",
      "Conditions must be written out",
    ],
  ])
);

P(
  "The fourth row deserves emphasis because it is the one with a semantic consequence. Because `set` introduces a binding and `change` only updates an existing one, the statement `change totl to 5` can be reported as an unknown name. In a language where assignment also creates, that line silently produces a second variable and the fault surfaces elsewhere.",
  { noIndent: true }
);

content.push(subhead("C", "Formal grammar"));

P(
  "A grammar of 36 productions was written in EBNF before any implementation, and the parser was derived from it directly: each non-terminal has one method of the same name. The comparison production is the one that distinguishes this language:",
  { noIndent: true }
);

CODE([
  'comparison     = term { compare_phrase term } ;',
  "",
  'compare_phrase = "is" [ "not"',
  '                      | "at" ( "least" | "most" )',
  '                      | "more" "than"',
  '                      | "less" "than" ] ;',
]);

CAP("Fig. 2.  The comparison production. Multi-word operators are grammar, not lexis.");

P(
  "`NEWLINE`, `INDENT` and `DEDENT` appear as terminals in the grammar although no such characters exist in a source file; they are synthesised by the lexer (Section V-A). This is what allows the grammar to describe block structure without braces while remaining a conventional context-free grammar.",
  { noIndent: true }
);

// =========================================================================
content.push(head("System Architecture"));

P(
  "Fig. 3 shows the pipeline. Each stage communicates with the next through a plain data structure and never calls back into its predecessor, which is what permits each to be tested in isolation.",
  { noIndent: true }
);

CODE(
  [
    "        source (.sn)",
    "             |",
    "      +------v-------+",
    "      |    Lexer     |  characters to tokens",
    "      +------+-------+  + INDENT / DEDENT",
    "             | Token[]",
    "      +------v-------+",
    "      |   Parser     |  recursive descent",
    "      +------+-------+  + phrase folding",
    "             | AST   <-- the IR",
    "    +--------+--------+----------+",
    "    v        v        v          v",
    " Printer  Interp.  WASM gen   Explainer",
    "    |        |        |          |",
    "  tree    output   .wat/.wasm  English",
  ],
  { center: true, size: 14 }
);

CAP("Fig. 3.  The pipeline. The AST has four independent consumers, which is the operational test of whether it is genuinely an intermediate representation.");

P(
  "Two type declarations — the `Token` record and the AST node union — were fixed before any stage was written, and act as the contract between them. This had a practical consequence for a two-person project: because the chain is sequential, dividing the work by stage would have left one author idle. Instead the work was divided by pipeline half, and the backend author developed the parser against a hand-written token stream while the frontend author was still writing the scanner. A regression test asserts that the real lexer still produces exactly that stream, so the contract cannot silently decay.",
  { noIndent: true }
);

// =========================================================================
content.push(head("Implementation"));

content.push(subhead("A", "Lexical analysis"));

P(
  "The scanner is written by hand and uses no regular expressions. The recognition rules for numbers, text and identifiers are expressed as the transitions a DFA constructed from the corresponding regular expressions would have; writing them out keeps that correspondence visible, which is the pedagogical point of the stage.",
  { noIndent: true }
);

P(
  "Its distinctive responsibility is converting layout into tokens. The scanner maintains a stack of indentation columns initialised to [0]. A line indented further than the top of the stack pushes and emits `INDENT`; a line indented less pops, emitting one `DEDENT` per level closed; a width matching no entry is an error naming the columns it could have matched. Blank and comment-only lines are skipped entirely and never disturb the stack, which is what allows a blank line inside a block. An open bracket suppresses `NEWLINE`, permitting a statement to span lines. End of file closes every block still open."
);

P(
  "A deliberate decision is that the lexer does **not** merge multi-word operators. `is at least` leaves the scanner as three tokens. Merging them would make the scanner context-sensitive — it would need to know that the `at` in `is at least` belongs to an operator while an `at` elsewhere does not — and would require backtracking when a word run turned out not to be a phrase. Deferring the fold to the parser keeps the scanner a one-character-lookahead machine."
);

content.push(subhead("B", "Syntax analysis"));

P(
  "The parser is recursive descent with one method per grammar production. Multi-word phrases are folded in the `comparison` method, which consumes `is` and then selects the operator from the following one or two tokens. No backtracking occurs anywhere in the parser.",
  { noIndent: true }
);

P(
  "**An ambiguity.** Combining phrase operators with keyword-led statements produces one genuine ambiguity. The word `times` is both the multiplication operator and part of the counted loop header:"
);

CODE([
  "repeat 3 times:          <- loop header",
  "set total to 3 times 4   <- multiplication",
]);

P(
  "In `repeat n times:`, the parser cannot decide locally whether `n times` begins a multiplication. We resolve it by suppressing `times` as an operator while, and only while, the count expression of a `repeat` is being parsed. Because `*` is a distinct token that is never suppressed, `repeat rows * cols times:` still parses — the rule removes a capability and the symbol form restores it. We note this explicitly because an ambiguity that is resolved silently is indistinguishable, to a reader, from one that was never noticed.",
  { noIndent: true }
);

P(
  "**Error recovery.** The parser implements panic-mode recovery: on a syntax error it records the diagnostic, discards tokens until a position where a statement could begin, and continues. One pass therefore reports every malformed statement in a file rather than only the first. An implementation subtlety surfaced during testing: a line can begin after any of the three layout tokens, not only after `NEWLINE`, because a block opening emits `INDENT` and a block closing emits `DEDENT`. Resynchronising only on `NEWLINE` caused recovery to run to end of file after any error preceding an indented block, suppressing all subsequent diagnostics."
);

content.push(subhead("C", "Semantic analysis and interpretation"));

P(
  "Name resolution uses a chain of scopes, each block receiving one whose parent is the enclosing block. Lookup proceeds outwards. The `set`/`change` distinction described in Section III-B is implemented as two distinct operations on this structure — `define` introduces locally, `assign` updates the nearest existing binding — and an unresolved name is reported with a suggestion computed by edit distance over the names currently visible.",
  { noIndent: true }
);

P(
  "Closures follow from capturing the defining scope rather than the calling scope; definitions are first-class values. Control flow — `give back`, `stop`, `skip` — unwinds an arbitrary depth of recursive evaluation and is implemented with private signal exceptions, which are module-scoped classes so they cannot be confused with diagnostics."
);

P(
  "Two guards make the evaluator safe to embed in a web page that executes arbitrary input: a statement budget converts a non-terminating loop into a diagnostic, and an explicit call-depth limit catches unbounded recursion before the host stack overflows, which is what makes that condition reportable rather than fatal."
);

content.push(subhead("D", "Unified error reporting"));

P(
  "All four stages — lexer, parser, interpreter and code generator — emit the same diagnostic object and the same rendering: stage, file, line, the offending source line, a caret spanning the exact token, one sentence of explanation, and a suggested correction. Runtime diagnostics additionally carry a call stack.",
  { noIndent: true }
);

CODE([
  "Lexical error in demo.sn, line 3:",
  "",
  "   2 | set age to 20",
  "   3 | if age >= 18:",
  "     |        ^^",
  "",
  "  '>=' is not part of Stickynight.",
  "  hint: Write 'is at least', as in:",
  "        if score is at least 90:",
]);

CAP("Fig. 4.  A diagnostic. The suggestion is available precisely because the rejection is deliberate.");

content.push(subhead("E", "WebAssembly code generation"));

P(
  "The code generator consumes the same AST the interpreter consumes and lowers it to a secondary, low-level intermediate representation: per function, a list of typed locals and an instruction sequence in WebAssembly's structured form. Two emitters consume that IR — one producing text format, one producing binary — which is what prevents the two outputs from diverging.",
  { noIndent: true }
);

P("Three problems arise in the lowering.");

P(
  "**Types.** WebAssembly has neither a boolean nor a dynamic type. All values become `f64`, with yes/no represented as 1.0 and 0.0. Comparisons yield `i32`, so results used as values rather than as conditions are widened with `f64.convert_i32_u`."
);

P(
  "**Scopes.** WebAssembly locals are flat across a function, whereas Stickynight blocks shadow. Names are therefore alpha-renamed: a `set` in an inner scope that reuses an outer name receives a fresh slot, while a `set` of a name already bound in the same scope reuses it. This preserves the interpreter's scoping exactly."
);

P(
  "**Branch targets.** `br` takes the number of enclosing labels to exit, so the index for `stop` depends on how deeply it is nested. The generator tracks label depth during the walk and subtracts. Every loop form is lowered to one shape:"
);

CODE([
  "block $break         ; `stop` exits here",
  "  loop $again",
  "    <cond>  br_if $break when false",
  "    block $next      ; `skip` exits here",
  "      <body>",
  "    end",
  "    <step>           ; runs after `skip`",
  "    br $again",
  "  end",
  "end",
]);

CAP("Fig. 5.  Uniform loop lowering. The inner block is what makes `skip` reach the increment; without it a counted loop would not terminate.");

P(
  "`f64` has no remainder instruction, so `a mod b` is synthesised as `a - b * trunc(a / b)` using two scratch locals. Short-circuit `and` and `or` lower to `if (result i32)` rather than `i32.and`/`i32.or`, so that evaluation order matches the interpreter.",
  { noIndent: true }
);

P(
  "The project specification required only text format. We additionally implemented the binary encoder — LEB128 integers, length-prefixed sections — for a methodological reason: text format cannot be executed without a separate assembler, so a generator emitting only text has never actually been run. The binary encoder is what makes the differential evaluation of Section VI-B possible."
);

content.push(subhead("F", "A compiler-grounded assistant"));

P(
  "We added a question-answering assistant for the language. Its design premise is that a compiler already contains most of what a learner needs to be told, and that a language model should therefore be the fallback rather than the mechanism. Four of its five answer paths require no network:",
  { noIndent: true }
);

B("_What is wrong with this?_ — the program is parsed and executed; the resulting diagnostic object, with its own suggestion, is reported and linked to the relevant reference entry.");

B("_What does this do?_ — the AST is walked and rendered as prose. This makes the explainer a fourth consumer of the tree.");

B("_What does it print?_ — the interpreter is run and its output returned.");

B("_How do I write a loop?_ — retrieval over a 23-entry reference using synonym expansion from the learner's vocabulary into the language's, light suffix stemming, field-weighted terms and inverse document frequency.");

P(
  "Only questions none of these cover reach a model, and that backend is injected rather than imported, so the browser bundle cannot contain credentials and the compiler retains its property of having no runtime dependencies. A consequence of grounding worth noting: every example program the assistant can emit is executed by the test suite, so it cannot return code that does not compile.",
  { noIndent: true }
);

// =========================================================================
content.push(head("Evaluation"));

content.push(subhead("A", "Methodology"));

P(
  "We evaluate four properties: behavioural equivalence of the two backends, coverage of the test suite, the specific diagnostic property claimed in Section II-B, and execution performance. Measurements were taken on Node.js v22.15.1 on a Windows 11 host; timings are medians of five runs.",
  { noIndent: true }
);

content.push(subhead("B", "Correctness by differential testing"));

P(
  "The strongest correctness evidence available to this project is that two independently written backends agree. Twenty programs covering arithmetic, comparison, short-circuit logic, all four loop forms, `stop` and `skip`, nested loops, recursion, multiple parameters, global state and variable shadowing are executed by the interpreter and then compiled to binary WebAssembly, instantiated, and executed by the host engine. Outputs are compared. All twenty agree.",
  { noIndent: true }
);

P(
  "One systematic difference is normalised before comparison and is a consequence of the value representation rather than a disagreement: WebAssembly has no boolean type, so a compiled program prints 1 and 0 where the interpreter prints `yes` and `no`."
);

content.push(...tableCaption("III", "Test suite composition"));
content.push(
  table([1700, 700, 2400], [
    ["Component", "Tests", "What is asserted"],
    ["Lexer", "31", "Tokens, indentation, every rejection message"],
    ["Parser", "45", "Precedence, phrase folding, recovery"],
    ["Interpreter", "58", "Scope, closures, loops, lists, built-ins"],
    ["Diagnostics", "29", "One format across stages; caret column"],
    ["Front-end contract", "4", "Lexer matches the agreed token stream"],
    ["Sample programs", "109", "All 11 run; all 15 faults at the right stage"],
    ["Code generator", "38", "Validity, and 20 differential comparisons"],
    ["Assistant", "72", "Retrieval, grounding, every example runs"],
    ["**Total**", "**386**", ""],
  ])
);

content.push(subhead("C", "Diagnostic property"));

P(
  "We make no claim that our messages improve learning outcomes; Denny et al. [12] give good reason for caution. We verify only the mechanical property: for each of the symbolic operators the language rejects (`>=`, `<=`, `==`, `!=`, `&&`, `||`, `!`, `=`, `;`, `{`, `}`, `[`, `]`), the diagnostic names the Stickynight construct to use instead. This is asserted by test rather than by inspection. Fifteen programs each exhibiting a distinct fault class are also tested to confirm that each fails at the intended stage with a line number and a suggestion.",
  { noIndent: true }
);

content.push(subhead("D", "Performance"));

P(
  "Front-end throughput over the 11 example programs (292 lines, 1,315 tokens) is 605,000 tokens/s for lexing and 457,000 tokens/s for parsing. Table IV compares the two backends on three numeric workloads.",
  { noIndent: true }
);

content.push(...tableCaption("IV", "Interpreter versus compiled execution"));
content.push(
  table([1200, 850, 800, 800, 750], [
    ["Workload", "Interp. (ms)", "Codegen (ms)", "WASM (ms)", "Speedup"],
    ["fib(20), recursive", "29.8", "0.47", "0.11", "271x"],
    ["10^6-iteration loop", "113.5", "0.36", "3.31", "34x"],
    ["Collatz, n=1..3000", "86.2", "0.66", "0.93", "93x"],
  ])
);
CAP("Medians of five runs. Code generation is measured separately from execution; module sizes were 147, 196 and 371 bytes respectively.", { after: 160 });

P(
  "The speedups are large but should be read carefully. They compare a naive tree-walking interpreter against a native engine, not an optimised interpreter against an optimising compiler; they apply only to the numeric subset the backend supports; and the ratio varies by an order of magnitude across workloads. The relevant observation is a different one: code generation itself costs under a millisecond for programs of this size, so compilation is not the bottleneck at this scale.",
  { noIndent: true }
);

content.push(subhead("E", "Implementation size"));

content.push(...tableCaption("V", "Implementation size, in lines of TypeScript"));
content.push(
  table([1950, 850, 2000], [
    ["Component", "Lines", "Principal content"],
    ["Lexer", "557", "Scanner, indentation stack"],
    ["Parser", "983", "36 productions, recovery"],
    ["Interpreter", "846", "Evaluator, control flow"],
    ["Built-ins", "421", "25 library definitions"],
    ["Code generator", "1,493", "IR, lowering, both emitters"],
    ["Assistant", "1,791", "Retrieval, explainer, backend"],
    ["Types, errors, scope", "1,042", "Contracts and diagnostics"],
    ["Hosts (CLI, REPL, API)", "733", "Entry points"],
    ["**Source total**", "**8,294**", "No runtime dependencies"],
    ["Tests", "1,932", "386 assertions"],
  ])
);

// =========================================================================
content.push(head("Discussion and Limitations"));

P(
  "**Backend coverage.** The code generator handles the numeric subset: numbers, arithmetic, comparison, logic, all loop forms, `stop`, `skip`, definitions and recursion. Text, lists, iteration over collections and nested definitions are refused with a diagnostic naming the feature. Supporting them requires a heap and a boxed value representation, which is a project of comparable size to the one reported here. The honest claim is therefore that a numeric subset compiles, not that the language compiles.",
  { noIndent: true }
);

P(
  "**No separate semantic pass.** Name resolution and arity checking occur during execution, so a fault on a branch that never executes is never reported. The AST is already in the correct form for a resolver pass walking it before execution, and this is the first item of future work."
);

P(
  "**Recovery granularity.** Panic-mode recovery operates between statements. A single malformed expression therefore discards the remainder of its line."
);

P(
  "**A syntactic cost.** The list constructor `list of a, b` is greedy: it consumes commas to the end of the expression, so a list written directly as a call argument absorbs the separators. The alternative reading is worse, and the condition is detected and explained at run time, but it is the one place where the absence of bracket syntax has a real cost."
);

P(
  "**Evaluation scope.** We report no user study. The claims in Section VI are confined to correctness, coverage and performance, all of which are mechanically verifiable. Whether phrase-based syntax measurably helps novices is an open question that this work does not answer, and the literature [12] suggests it should not be assumed."
);

// =========================================================================
content.push(head("Conclusion and Future Work"));

P(
  "We have described an original programming language and a complete compiler for it, built to make language-design decisions explicit rather than inherited. The implementation covers the full pipeline taught in a compiler design course — lexical analysis without regular expressions, a grammar written before the parser derived from it, scope resolution, and code generation to a real target — and is validated by 386 automated tests, including differential execution of twenty programs across two independent backends.",
  { noIndent: true }
);

P(
  "Three directions follow. First, a resolver pass over the existing AST, making name and arity errors static. Second, a heap representation for the code generator, so that text and list operations compile rather than being refused. Third, finer-grained error recovery within a statement. A fourth, longer-term question is whether the phrase-based surface measurably assists novices — a controlled study of the kind Denny et al. [12] describe would be required to answer it, and the artefact described here is small enough to serve as its instrument."
);

// =========================================================================
content.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 100 },
    children: [new TextRun({ text: "Acknowledgment", font: SERIF, size: 20, smallCaps: true })],
  })
);

P(
  "The authors thank [Faculty name] for supervision of this project, and the reviewers of the interim presentations for questions that materially shaped Sections III-B and V-B.",
  { noIndent: true }
);

// =========================================================================
content.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 100 },
    children: [new TextRun({ text: "References", font: SERIF, size: 20, smallCaps: true })],
  })
);

const REFERENCES = [
  'A. V. Aho, M. S. Lam, R. Sethi, and J. D. Ullman, Compilers: Principles, Techniques, and Tools, 2nd ed. Boston, MA, USA: Addison-Wesley, 2006.',
  'R. Nystrom, Crafting Interpreters. Genever Benning, 2021.',
  'W. R. Cook, "AppleScript," in Proc. 3rd ACM SIGPLAN Conf. History of Programming Languages (HOPL III), San Diego, CA, USA, 2007, pp. 1-1-1-21.',
  'Apple Computer, Inc., HyperCard Script Language Guide: The HyperTalk Language. Reading, MA, USA: Addison-Wesley, 1988.',
  'G. Nelson, "Natural language, semantic analysis, and interactive fiction," IF Theory Reader, 2006.',
  'M. Resnick et al., "Scratch: Programming for all," Communications of the ACM, vol. 52, no. 11, pp. 60-67, Nov. 2009.',
  'J. F. Pane, C. A. Ratanamahatana, and B. A. Myers, "Studying the language and structure in non-programmers\u2019 solutions to programming problems," International Journal of Human-Computer Studies, vol. 54, no. 2, pp. 237-264, Feb. 2001.',
  'B. A. Myers, J. F. Pane, and A. Ko, "Natural programming languages and environments," Communications of the ACM, vol. 47, no. 9, pp. 47-52, Sep. 2004.',
  'T. R. G. Green and M. Petre, "Usability analysis of visual programming environments: A \u2018cognitive dimensions\u2019 framework," Journal of Visual Languages and Computing, vol. 7, no. 2, pp. 131-174, Jun. 1996.',
  'B. A. Becker et al., "Compiler error messages considered unhelpful: The landscape of text-based programming error message research," in Proc. ITiCSE Working Group Reports, 2019, pp. 177-210.',
  'T. Barik et al., "Do developers read compiler error messages?," in Proc. 39th Int. Conf. Software Engineering (ICSE), Buenos Aires, Argentina, 2017, pp. 575-585.',
  'P. Denny, A. Luxton-Reilly, and D. Carpenter, "Enhancing syntax error messages appears ineffectual," in Proc. ITiCSE, Uppsala, Sweden, 2014, pp. 273-278.',
  'A. Haas et al., "Bringing the web up to speed with WebAssembly," in Proc. 38th ACM SIGPLAN Conf. Programming Language Design and Implementation (PLDI), Barcelona, Spain, 2017, pp. 185-200.',
  'World Wide Web Consortium, WebAssembly Core Specification, W3C Recommendation, Dec. 2019.',
  'Python Software Foundation, The Python Language Reference, Section 2: Lexical Analysis. [Online]. Available: https://docs.python.org/3/reference/lexical_analysis.html',
  'W. M. McKeeman, "Differential testing for software," Digital Technical Journal, vol. 10, no. 1, pp. 100-107, 1998.',
];

REFERENCES.forEach((reference, index) => {
  content.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.25) },
      spacing: { after: 40, line: 200 },
      children: [
        new TextRun({ text: `[${index + 1}]\t`, font: SERIF, size: 16 }),
        new TextRun({ text: reference, font: SERIF, size: 16 }),
      ],
    })
  );
});

// =========================================================================

const doc = new Document({
  creator: "Apoorv Verma and Surjadeep Das",
  title: "Stickynight: A Natural-Syntax Programming Language",
  description: "IEEE conference-format paper",
  sections: [
    { properties: { page: PAGE, column: { count: 1 } }, children: front },
    {
      properties: {
        type: SectionType.CONTINUOUS,
        page: PAGE,
        column: { count: 2, space: convertInchesToTwip(0.22), equalWidth: true },
      },
      children: content,
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(OUT, buffer);
  console.log(`wrote ${OUT} (${(buffer.length / 1024).toFixed(1)} kB)`);
});
