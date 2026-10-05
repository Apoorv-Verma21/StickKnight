/* Stickynight — Review 1 deck. 12 slides. */

const path = require("path");
const pptxgen = require("pptxgenjs");

const SKILL =
  "C:/Users/HP/AppData/Roaming/Claude/local-agent-mode-sessions/skills-plugin/577aad88-24f5-4fc3-9f36-20ad8ee302b8/4051cba5-4d0c-46ea-a362-132dd556a341/skills/pptx";
const { applyTheme } = require(path.join(SKILL, "scripts", "apply_theme.js"));

const OUT = "C:/Users/HP/OneDrive/Desktop/College Projects/StickKnight/docs/Stickynight-Review-1.pptx";

// --- palette: night + sticky note -----------------------------------------
const INK = "0E1020";
const NIGHT = "1E2340";
const PAPER = "FFFFFF";
const MIST = "F2F3F8";
const AMBER = "FFC857";
const MUTED = "6B7187";
const VIOLET = "7C5CFF";
const BLUE = "3D7DD6";
const GREEN = "4E9163";
const RED = "C4404B";

const THEME = {
  name: "Stickynight",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: INK, lt1: PAPER, dk2: NIGHT, lt2: MIST,
    accent1: AMBER, accent2: VIOLET, accent3: BLUE,
    accent4: GREEN, accent5: RED, accent6: MUTED,
    hlink: BLUE, folHlink: VIOLET,
  },
};

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.3 x 7.5
pres.theme = { headFontFace: "Cambria", bodyFontFace: "Calibri" };
pres.author = "Stickynight team";
pres.title = "Stickynight — Review 1";

const W = 13.33;
const M = 0.62;             // page margin
const CW = W - M * 2;       // content width = 12.09

// --- layouts ---------------------------------------------------------------
pres.defineSlideMaster({
  title: "LIGHT",
  background: { color: PAPER },
  objects: [
    {
      placeholder: {
        options: {
          name: "title", type: "title", x: M, y: 0.42, w: CW, h: 0.72,
          fontSize: 32, bold: true, color: INK, fontFace: "Cambria",
          align: "left", valign: "middle", margin: 0,
        },
        text: "",
      },
    },
    { text: { text: "Stickynight · Review 1", options: { x: M, y: 6.92, w: 5, h: 0.3, fontSize: 9, color: MUTED, isTextBox: true, margin: 0 } } },
  ],
  slideNumber: { x: W - M - 0.5, y: 6.92, w: 0.5, h: 0.3, fontSize: 9, color: MUTED, align: "right" },
});

pres.defineSlideMaster({
  title: "DARK",
  background: { color: NIGHT },
  objects: [
    {
      placeholder: {
        options: {
          name: "title", type: "title", x: M, y: 0.42, w: CW, h: 0.72,
          fontSize: 32, bold: true, color: PAPER, fontFace: "Cambria",
          align: "left", valign: "middle", margin: 0,
        },
        text: "",
      },
    },
  ],
  slideNumber: { x: W - M - 0.5, y: 6.92, w: 0.5, h: 0.3, fontSize: 9, color: MUTED, align: "right" },
});

pres.defineSlideMaster({ title: "COVER", background: { color: NIGHT } });

// --- small helpers ---------------------------------------------------------

/** The repeated motif: a tilted amber sticky square. */
function mark(slide, x, y, size) {
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w: size, h: size, rectRadius: 0.04,
    fill: { color: AMBER }, rotate: 352, line: { color: AMBER },
    objectName: "sticky-mark",
  });
}

/** A monospace code block on a tinted card. */
function code(slide, text, o) {
  slide.addShape(pres.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: 0.03,
    fill: { color: o.bg || MIST }, line: { color: o.border || MIST },
    objectName: o.name || "code-card",
  });
  slide.addText(text, {
    x: o.x + 0.16, y: o.y + 0.12, w: o.w - 0.32, h: o.h - 0.24,
    fontSize: o.size || 12, fontFace: "Courier New",
    color: o.color || INK, align: "left", valign: "top",
    lineSpacingMultiple: 1.12, isTextBox: true, margin: 0,
  });
}

/** A light card for grouping content. */
function card(slide, o) {
  slide.addShape(pres.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: 0.03,
    fill: { color: o.fill || MIST }, line: { color: o.line || MIST },
    objectName: o.name || "card",
  });
}

/** Numbered amber disc + heading + body, used for lists of points. */
function numbered(slide, n, head, body, o) {
  slide.addShape(pres.ShapeType.ellipse, {
    x: o.x, y: o.y, w: 0.34, h: 0.34,
    fill: { color: AMBER }, line: { color: AMBER },
    objectName: `num-${n}`,
  });
  slide.addText(String(n), {
    x: o.x, y: o.y, w: 0.34, h: 0.34, fontSize: 13, bold: true,
    color: INK, align: "center", valign: "middle", isTextBox: true, margin: 0,
  });
  slide.addText(head, {
    x: o.x + 0.52, y: o.y - 0.03, w: o.w - 0.52, h: 0.3,
    fontSize: 15, bold: true, color: INK, isTextBox: true, margin: 0, valign: "middle",
  });
  slide.addText(body, {
    x: o.x + 0.52, y: o.y + 0.28, w: o.w - 0.52, h: o.bh || 0.46,
    fontSize: 12.5, color: MUTED, isTextBox: true, margin: 0, valign: "top",
    lineSpacingMultiple: 1.05,
  });
}

/** A status chip. */
function chip(slide, text, color, o) {
  slide.addShape(pres.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: 0.26, rectRadius: 0.12,
    fill: { color }, line: { color }, objectName: "chip",
  });
  slide.addText(text, {
    x: o.x, y: o.y, w: o.w, h: 0.26, fontSize: 9.5, bold: true,
    color: o.ink || PAPER, align: "center", valign: "middle",
    isTextBox: true, margin: 0,
  });
}

// ===========================================================================
// 1 — Cover
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "COVER" });
  mark(s, M, 1.62, 0.46);
  s.addText("Stickynight", {
    x: M, y: 2.2, w: 9.2, h: 1.0, fontSize: 54, bold: true,
    color: PAPER, fontFace: "Cambria", isTextBox: true, margin: 0, valign: "middle",
  });
  s.addText("A programming language with English-phrase syntax, and its compiler", {
    x: M, y: 3.2, w: 9.6, h: 0.42, fontSize: 18, color: AMBER,
    isTextBox: true, margin: 0,
  });
  s.addText(
    "No braces. No semicolons. No symbolic comparison operators.\nBlock structure recovered from indentation.",
    { x: M, y: 3.78, w: 9.6, h: 0.72, fontSize: 13.5, color: "B9BFD2", isTextBox: true, margin: 0, lineSpacingMultiple: 1.2 }
  );
  s.addShape(pres.ShapeType.line, {
    x: M, y: 4.86, w: 3.2, h: 0, line: { color: "3A4160", width: 1 }, objectName: "rule",
  });
  s.addText(
    [
      { text: "Review 1", options: { bold: true, color: PAPER } },
      { text: "   ·   Compiler Design course project", options: { color: "B9BFD2" } },
    ],
    { x: M, y: 5.06, w: 9.6, h: 0.3, fontSize: 13, isTextBox: true, margin: 0 }
  );
  s.addText("Presented by  [Your name]  and  [Partner's name]      Guide: [Faculty name]", {
    x: M, y: 5.46, w: 11, h: 0.3, fontSize: 12, color: MUTED, isTextBox: true, margin: 0,
  });
  s.addNotes("Review 1. We present the problem, the literature, the design, and the first two phases of implementation.");
}

// ===========================================================================
// 2 — Introduction / problem
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("Beginners meet syntax before they meet logic", { placeholder: "title" });

  s.addText(
    [
      { text: "A student writing their first conditional has to be told what ", options: {} },
      { text: ">=", options: { fontFace: "Courier New", bold: true } },
      { text: ", ", options: {} },
      { text: "{ }", options: { fontFace: "Courier New", bold: true } },
      { text: " and ", options: {} },
      { text: ";", options: { fontFace: "Courier New", bold: true } },
      { text: " mean — none of which is about the decision they are trying to express.", options: {} },
    ],
    { x: M, y: 1.42, w: 5.5, h: 1.0, fontSize: 14.5, color: INK, isTextBox: true, margin: 0, lineSpacingMultiple: 1.25 }
  );

  s.addText(
    [
      { text: "Symbols are learned as vocabulary before they are useful as notation.", options: { bullet: true, breakLine: true } },
      { text: "A missing semicolon produces an error about a token, not about the mistake.", options: { bullet: true, breakLine: true } },
      { text: "Most student compiler projects clone C-like syntax, so no design decision is ever made.", options: { bullet: true } },
    ],
    { x: M, y: 2.54, w: 5.5, h: 1.9, fontSize: 13.5, color: MUTED, isTextBox: true, margin: 0, paraSpaceAfter: 9 }
  );

  const cx = 6.6;
  const cwid = CW - (cx - M);

  s.addText("WHAT A BEGINNER MEETS FIRST", {
    x: cx, y: 1.42, w: cwid, h: 0.24, fontSize: 10, bold: true, color: MUTED,
    charSpacing: 1.2, isTextBox: true, margin: 0,
  });
  code(s, 'if (score >= 90) {\n    printf("A");\n}', {
    x: cx, y: 1.72, w: cwid, h: 1.15, size: 13, bg: MIST, border: "E2E5EE",
    name: "code-c",
  });

  s.addText("THE SAME DECISION IN STICKYNIGHT", {
    x: cx, y: 3.18, w: cwid, h: 0.24, fontSize: 10, bold: true, color: MUTED,
    charSpacing: 1.2, isTextBox: true, margin: 0,
  });
  code(s, 'if score is at least 90:\n    say "A"', {
    x: cx, y: 3.48, w: cwid, h: 0.92, size: 13, bg: NIGHT, border: NIGHT, color: PAPER,
    name: "code-sn",
  });

  s.addText("Same logic, same control flow — five fewer things to explain before the lesson starts.", {
    x: cx, y: 4.6, w: cwid, h: 0.5, fontSize: 12, italic: true, color: MUTED,
    isTextBox: true, margin: 0,
  });

  s.addNotes("The problem is not that C is hard. It is that the symbols arrive before the ideas they encode.");
}

// ===========================================================================
// 3 — Objectives
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("Objectives", { placeholder: "title" });

  const items = [
    ["Design a complete original language", "Keyword set, operator phrases, indentation rules, and the value model — fixed before any code is written."],
    ["Write a formal EBNF grammar first", "A context-free grammar that the parser is derived from directly, rather than documented afterwards."],
    ["Build a hand-written lexical analyser", "Character-level scanning with no regular expressions, synthesising INDENT and DEDENT from column positions."],
    ["Build a recursive-descent parser", "Producing an AST, and resolving multi-word operator phrases such as \"is at least\" without backtracking."],
    ["Execute, and explain every failure", "A tree-walking interpreter, and errors that carry a line number, a caret, and a suggested fix at every stage."],
  ];

  let y = 1.44;
  items.forEach(([h, b], i) => {
    numbered(s, i + 1, h, b, { x: M, y, w: CW, bh: 0.44 });
    y += 1.05;
  });

  s.addNotes("Five objectives. The first two are design; the last three are the classical compiler pipeline.");
}

// ===========================================================================
// 4 — Literature survey
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("Literature survey", { placeholder: "title" });

  const head = (t) => ({ text: t, options: { bold: true, color: PAPER, fill: { color: NIGHT }, fontSize: 11.5 } });
  const rows = [
    [head("Prior work"), head("What it established"), head("Limitation for this problem")],
    ["HyperTalk  (1987)", "English-like scripting reached non-programmers at real scale", "Tied to HyperCard; never a general-purpose language"],
    ["AppleScript  (1993)", "Natural-language syntax shipped in a production OS", "Cook (HOPL III, 2007): easy to read, surprisingly hard to write"],
    ["Inform 7  (2006)", "Natural language can drive a genuine compiler", "Domain-specific — interactive fiction only"],
    ["Scratch  (2007)", "Removing syntax errors measurably raises beginner success", "Block-based; nothing transfers to a typed text language"],
    ["Pane & Myers  (2001)", "Non-programmers describe solutions in natural-language form", "An empirical study, not an implemented general language"],
    ["Python", "Indentation as block structure is practical at scale", "Retains symbolic comparison operators (>=, ==, !=)"],
  ].map((r, i) =>
    i === 0 ? r : r.map((c, j) => ({
      text: c,
      options: { fontSize: 11.5, color: j === 0 ? INK : MUTED, bold: j === 0 },
    }))
  );

  s.addTable(rows, {
    x: M, y: 1.44, w: CW, colW: [2.55, 4.3, 5.24],
    border: { type: "solid", color: "E2E5EE", pt: 1 },
    rowH: 0.42, valign: "middle", margin: 0.08, autoPage: false,
  });

  s.addText(
    "Implementation methodology follows Aho, Lam, Sethi & Ullman, Compilers: Principles, Techniques and Tools (2/e, 2006), and Nystrom, Crafting Interpreters (2021).",
    { x: M, y: 5.9, w: CW, h: 0.4, fontSize: 10.5, italic: true, color: MUTED, isTextBox: true, margin: 0 }
  );

  s.addNotes("Six prior works. The pattern: readable syntax has been attempted repeatedly, but either tied to a product or confined to one domain.");
}

// ===========================================================================
// 5 — Research gap
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("The gap", { placeholder: "title" });

  const gaps = [
    ["Readable is not the same as writable", "AppleScript showed English-like syntax can make a language harder to write, because many phrasings look valid. Readability has to be designed against a grammar, not assumed from vocabulary."],
    ["Block languages remove syntax entirely", "Scratch avoids syntax errors by removing syntax. It works, but a learner gains nothing that transfers the day they open a text editor."],
    ["No open grammar to learn from", "These are products, not teaching artefacts. There is no published EBNF plus implementation showing how phrase-level operators are actually tokenised and parsed."],
  ];

  const gw = (CW - 0.44 * 2) / 3;
  gaps.forEach(([h, b], i) => {
    const x = M + i * (gw + 0.44);
    card(s, { x, y: 1.5, w: gw, h: 3.0, fill: MIST, line: "E2E5EE", name: `gap-${i}` });
    mark(s, x + 0.26, 1.78, 0.2);
    s.addText(h, {
      x: x + 0.26, y: 2.12, w: gw - 0.52, h: 0.76, fontSize: 15, bold: true,
      color: INK, isTextBox: true, margin: 0, valign: "top", lineSpacingMultiple: 1.05,
    });
    s.addText(b, {
      x: x + 0.26, y: 2.92, w: gw - 0.52, h: 1.44, fontSize: 12, color: MUTED,
      isTextBox: true, margin: 0, valign: "top", lineSpacingMultiple: 1.12,
    });
  });

  card(s, { x: M, y: 4.74, w: CW, h: 0.92, fill: NIGHT, line: NIGHT, name: "gap-summary" });
  s.addText(
    [
      { text: "Our gap:  ", options: { bold: true, color: AMBER } },
      { text: "an English-phrase language small enough to specify formally, and implemented openly across the full pipeline — so the design decisions are visible rather than buried in a product.", options: { color: PAPER } },
    ],
    { x: M + 0.3, y: 4.9, w: CW - 0.6, h: 0.6, fontSize: 13.5, isTextBox: true, margin: 0, valign: "middle", lineSpacingMultiple: 1.1 }
  );

  s.addNotes("Three gaps, and the one-line statement of what we are doing about them.");
}

// ===========================================================================
// 6 — Novelty
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("Novelty of the approach", { placeholder: "title" });

  const items = [
    ["Phrase-level operators resolved in the parser, not the lexer", "The scanner emits one token per word, so \"is at least\" arrives as IS AT LEAST. Merging phrases in the lexer would make it context-sensitive and need backtracking. Our parser folds them with fixed lookahead instead.", VIOLET],
    ["Indentation and phrase grammar combined", "Python has significant indentation; AppleScript has phrases. Combining them creates a genuine ambiguity — \"times\" is both an operator and part of a loop header — which we resolve explicitly rather than by accident.", BLUE],
    ["Error messages designed as the teaching surface", "We reject >= deliberately, so that rejecting it can say \"write is at least\". Every rejection in the specification carries the phrase to use instead.", AMBER],
    ["One AST, two planned consumers", "The tree is designed as a true intermediate representation: an interpreter and, later, a code generator both consume it, which is what proves it is an IR and not an interpreter's private data structure.", GREEN],
  ];

  const colW = (CW - 0.44) / 2;
  items.forEach(([h, b, accent], i) => {
    const x = M + (i % 2) * (colW + 0.44);
    const y = 1.5 + Math.floor(i / 2) * 2.4;
    card(s, { x, y, w: colW, h: 2.12, fill: PAPER, line: "DDE1EC", name: `nov-${i}` });
    s.addShape(pres.ShapeType.ellipse, {
      x: x + 0.28, y: y + 0.28, w: 0.3, h: 0.3,
      fill: { color: accent }, line: { color: accent }, objectName: `nov-dot-${i}`,
    });
    s.addText(h, {
      x: x + 0.7, y: y + 0.2, w: colW - 1.0, h: 0.52, fontSize: 14.5, bold: true,
      color: INK, isTextBox: true, margin: 0, valign: "middle", lineSpacingMultiple: 1.0,
    });
    s.addText(b, {
      x: x + 0.28, y: y + 0.82, w: colW - 0.56, h: 1.14, fontSize: 11.5, color: MUTED,
      isTextBox: true, margin: 0, valign: "top", lineSpacingMultiple: 1.12,
    });
  });

  s.addNotes("Four claims to novelty. The first is the one an examiner is most likely to probe.");
}

// ===========================================================================
// 7 — Architecture (dark)
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "DARK" });
  s.addText("Proposed system architecture", { placeholder: "title" });

  s.addText("The classical pipeline. The AST in the middle is the intermediate representation.", {
    x: M, y: 1.2, w: CW, h: 0.3, fontSize: 13, color: "B9BFD2", isTextBox: true, margin: 0,
  });

  const stages = [
    ["Source", ".sn file", "", ""],
    ["Lexer", "characters to tokens\nsynthesises INDENT / DEDENT", "COMPLETE", GREEN],
    ["Parser", "tokens to AST\nfolds operator phrases", "IN PROGRESS", AMBER],
    ["Interpreter", "walks the AST\nscope, calls, control flow", "PLANNED", MUTED],
    ["Output", "program result", "", ""],
  ];

  const bw = 2.1;
  const gap = (CW - bw * 5) / 4;
  stages.forEach(([name, sub, status, color], i) => {
    const x = M + i * (bw + gap);
    const isEdge = i === 0 || i === 4;
    card(s, {
      x, y: 1.86, w: bw, h: 1.92,
      fill: isEdge ? "171B30" : "2A3154",
      line: isEdge ? "2A3154" : "3C4675",
      name: `stage-${i}`,
    });
    s.addText(name, {
      x: x + 0.14, y: 2.02, w: bw - 0.28, h: 0.34, fontSize: 15, bold: true,
      color: isEdge ? "B9BFD2" : PAPER, align: "center", isTextBox: true, margin: 0,
    });
    s.addText(sub, {
      x: x + 0.14, y: 2.42, w: bw - 0.28, h: 0.74, fontSize: 10.5,
      color: isEdge ? MUTED : "B9BFD2", align: "center", isTextBox: true, margin: 0,
      lineSpacingMultiple: 1.1,
    });
    if (status) {
      chip(s, status, color, { x: x + (bw - 1.3) / 2, y: 3.3, w: 1.3, ink: status === "PLANNED" ? PAPER : INK });
    }
    if (i < 4) {
      s.addShape(pres.ShapeType.line, {
        x: x + bw + 0.06, y: 2.82, w: gap - 0.12, h: 0,
        line: { color: "4B548A", width: 1.5, endArrowType: "triangle" },
        objectName: `arrow-${i}`,
      });
    }
  });

  s.addText("Token stream", { x: M + bw + gap * 0.02, y: 3.86, w: bw + gap, h: 0.26, fontSize: 10, italic: true, color: MUTED, align: "center", isTextBox: true, margin: 0 });
  s.addText("Abstract syntax tree", { x: M + (bw + gap) * 2 + gap * 0.02, y: 3.86, w: bw + gap, h: 0.26, fontSize: 10, italic: true, color: MUTED, align: "center", isTextBox: true, margin: 0 });

  card(s, { x: M, y: 4.44, w: CW, h: 1.5, fill: "171B30", line: "2A3154", name: "arch-note" });
  s.addText("Why the AST matters", {
    x: M + 0.32, y: 4.62, w: CW - 0.64, h: 0.3, fontSize: 13, bold: true, color: AMBER,
    isTextBox: true, margin: 0,
  });
  s.addText(
    "A second consumer of the same tree — a code generator — is planned for the final phase. Designing the AST so that two independent back ends can walk it is what makes it an intermediate representation rather than an implementation detail of the interpreter.",
    { x: M + 0.32, y: 4.94, w: CW - 0.64, h: 0.86, fontSize: 12.5, color: "B9BFD2", isTextBox: true, margin: 0, lineSpacingMultiple: 1.15 }
  );

  s.addNotes("Five stages. Two chips show where we are: lexer complete, parser in progress.");
}

// ===========================================================================
// 8 — Design decisions
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("Language design decisions, and what each costs", { placeholder: "title" });

  const head = (t) => ({ text: t, options: { bold: true, color: PAPER, fill: { color: NIGHT }, fontSize: 11.5 } });
  const rows = [
    [head("Decision"), head("Why"), head("What it costs")],
    ["Indentation, not braces", "Block structure matches what the reader already sees on the page", "Whitespace becomes significant; tabs must be rejected outright"],
    ["Phrases, not symbols, for comparison", "\">=\" has to be taught; \"is at least\" does not", "Longer lines, and a larger keyword set"],
    ["Arithmetic symbols kept (+ \u2212 * /)", "Learned in school years before programming", "Two spellings of one operator to support"],
    ["\"set\" to create, \"change\" to update", "A mistyped name can be reported instead of silently creating a second variable", "One extra keyword to learn on day one"],
    ["Positions count from 1", "\"item 1\" is the first item, as the word is used outside programming", "One subtraction in the implementation"],
  ].map((r, i) =>
    i === 0 ? r : r.map((c, j) => ({
      text: c,
      options: { fontSize: 12, color: j === 0 ? INK : MUTED, bold: j === 0 },
    }))
  );

  s.addTable(rows, {
    x: M, y: 1.44, w: CW, colW: [3.5, 4.6, 3.99],
    border: { type: "solid", color: "E2E5EE", pt: 1 },
    rowH: 0.52, valign: "middle", margin: 0.1, autoPage: false,
  });

  s.addText(
    "Each decision is recorded in the specification with its trade-off stated, so it can be defended rather than merely asserted.",
    { x: M, y: 5.72, w: CW, h: 0.4, fontSize: 11.5, italic: true, color: MUTED, isTextBox: true, margin: 0 }
  );

  s.addNotes("The cost column matters most. Any design decision without a stated cost has not really been made.");
}

// ===========================================================================
// 9 — Formal grammar
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("Formal grammar, written before the implementation", { placeholder: "title" });

  const gw = 7.3;
  code(
    s,
    [
      "program         = { statement } EOF ;",
      "",
      "if_stmt         = \"if\" expression block",
      "                  { \"otherwise\" \"if\" expression block }",
      "                  [ \"otherwise\" block ] ;",
      "",
      "block           = \":\" NEWLINE INDENT",
      "                      statement { statement }",
      "                  DEDENT ;",
      "",
      "comparison      = term { compare_phrase term } ;",
      "",
      "compare_phrase  = \"is\" [ \"not\"",
      "                       | \"at\" ( \"least\" | \"most\" )",
      "                       | \"more\" \"than\"",
      "                       | \"less\" \"than\" ] ;",
    ].join("\n"),
    { x: M, y: 1.44, w: gw, h: 3.62, size: 11.5, bg: MIST, border: "E2E5EE", name: "code-ebnf" }
  );

  const rx = M + gw + 0.44;
  const rw = CW - gw - 0.44;

  s.addText("How it is used", {
    x: rx, y: 1.44, w: rw, h: 0.32, fontSize: 15, bold: true, color: INK, isTextBox: true, margin: 0,
  });
  s.addText(
    [
      { text: "Every non-terminal above becomes one method of the same name in the parser, so the grammar and the code can be read side by side.", options: { bullet: true, breakLine: true } },
      { text: "INDENT and DEDENT are not characters. The lexer produces them, which is what lets the grammar describe blocks without braces.", options: { bullet: true, breakLine: true } },
      { text: "compare_phrase is where the multi-word operators are folded — decided by the next one or two tokens, never by backtracking.", options: { bullet: true } },
    ],
    { x: rx, y: 1.86, w: rw, h: 3.2, fontSize: 12, color: MUTED, isTextBox: true, margin: 0, paraSpaceAfter: 10, lineSpacingMultiple: 1.12 }
  );

  const stats = [["47", "keywords"], ["6", "value types"], ["LL(k)", "no backtracking"]];
  const sw = (CW - 0.4 * 2) / 3;
  stats.forEach(([n, l], i) => {
    const x = M + i * (sw + 0.4);
    card(s, { x, y: 5.3, w: sw, h: 0.94, fill: MIST, line: "E2E5EE", name: `stat-${i}` });
    s.addText(n, {
      x: x + 0.24, y: 5.42, w: sw - 0.48, h: 0.42, fontSize: 24, bold: true, color: INK,
      fontFace: "Cambria", isTextBox: true, margin: 0, valign: "middle",
    });
    s.addText(l, {
      x: x + 0.24, y: 5.84, w: sw - 0.48, h: 0.28, fontSize: 11, color: MUTED,
      isTextBox: true, margin: 0,
    });
  });

  s.addNotes("The grammar came first. This is the context-free grammar component of the syllabus.");
}

// ===========================================================================
// 10 — Work progress: status
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("Work progress", { placeholder: "title" });

  const stats = [
    ["2 of 6", "phases complete", GREEN],
    ["~30%", "of implementation", AMBER],
    ["47", "keywords specified", BLUE],
  ];
  const sw = (CW - 0.4 * 2) / 3;
  stats.forEach(([n, l, color], i) => {
    const x = M + i * (sw + 0.4);
    card(s, { x, y: 1.42, w: sw, h: 1.16, fill: MIST, line: "E2E5EE", name: `prog-stat-${i}` });
    s.addText(n, {
      x: x + 0.28, y: 1.54, w: sw - 0.56, h: 0.56, fontSize: 32, bold: true, color,
      fontFace: "Cambria", isTextBox: true, margin: 0, valign: "middle",
    });
    s.addText(l, {
      x: x + 0.28, y: 2.1, w: sw - 0.56, h: 0.3, fontSize: 12, color: MUTED,
      isTextBox: true, margin: 0,
    });
  });

  const phases = [
    ["Phase 1", "Language design, keyword set, EBNF grammar", "COMPLETE", GREEN],
    ["Phase 2", "Lexical analyser with INDENT / DEDENT synthesis", "COMPLETE", GREEN],
    ["Phase 3", "Recursive-descent parser and AST construction", "IN PROGRESS", AMBER],
    ["Phase 4", "Scope handling and tree-walking interpreter", "PLANNED", MUTED],
    ["Phase 5", "Unified error reporting across every stage", "PLANNED", MUTED],
    ["Phase 6", "Code generation back end and browser playground", "PLANNED", MUTED],
  ];

  let y = 2.92;
  phases.forEach(([p, d, status, color], i) => {
    if (i % 2 === 0) card(s, { x: M, y: y - 0.06, w: CW, h: 0.56, fill: MIST, line: MIST, name: `row-${i}` });
    s.addText(p, {
      x: M + 0.24, y, w: 1.0, h: 0.44, fontSize: 12.5, bold: true, color: INK,
      isTextBox: true, margin: 0, valign: "middle",
    });
    s.addText(d, {
      x: M + 1.3, y, w: 8.3, h: 0.44, fontSize: 12.5, color: MUTED,
      isTextBox: true, margin: 0, valign: "middle",
    });
    chip(s, status, color, { x: W - M - 1.55, y: y + 0.09, w: 1.3, ink: status === "PLANNED" ? PAPER : INK });
    y += 0.62;
  });

  s.addNotes("Two phases complete, one under way. Evidence for Phase 2 is on the next slide.");
}

// ===========================================================================
// 11 — Evidence: lexer output
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("Phase 2 output: the lexical analyser", { placeholder: "title" });

  const lw = 7.3;

  s.addText("SOURCE", {
    x: M, y: 1.4, w: lw, h: 0.24, fontSize: 10, bold: true, color: MUTED,
    charSpacing: 1.2, isTextBox: true, margin: 0,
  });
  code(s, 'define classify with score:\n    if score is at least 90:\n        give back "A"', {
    x: M, y: 1.68, w: lw, h: 1.0, size: 12, bg: NIGHT, border: NIGHT, color: PAPER, name: "code-src",
  });

  s.addText("TOKEN STREAM PRODUCED", {
    x: M, y: 2.86, w: lw, h: 0.24, fontSize: 10, bold: true, color: MUTED,
    charSpacing: 1.2, isTextBox: true, margin: 0,
  });

  const tokenLines = [
    ["DEFINE        define", INK],
    ["IDENTIFIER    classify", INK],
    ["WITH          with", INK],
    ["IDENTIFIER    score", INK],
    ["COLON         :", INK],
    ["NEWLINE       \\n", INK],
    ["INDENT                      <- synthesised", RED],
    ["  IS          is", VIOLET],
    ["  AT          at", VIOLET],
    ["  LEAST       least", VIOLET],
    ["  NUMBER      90", INK],
    ["  ...", MUTED],
    ["DEDENT                      <- synthesised", RED],
  ];

  card(s, { x: M, y: 3.14, w: lw, h: 2.74, fill: MIST, line: "E2E5EE", name: "code-tokens" });
  s.addText(
    tokenLines.map(([t, color], i) => ({
      text: t,
      options: { color, breakLine: i < tokenLines.length - 1, bold: color === RED },
    })),
    {
      x: M + 0.16, y: 3.26, w: lw - 0.32, h: 2.5, fontSize: 11,
      fontFace: "Courier New", isTextBox: true, margin: 0, valign: "top",
      lineSpacingMultiple: 1.02,
    }
  );

  const rx = M + lw + 0.44;
  const rw = CW - lw - 0.44;

  card(s, { x: rx, y: 1.4, w: rw, h: 2.1, fill: PAPER, line: "DDE1EC", name: "note-indent" });
  s.addText("Indentation becomes tokens", {
    x: rx + 0.26, y: 1.56, w: rw - 0.52, h: 0.56, fontSize: 14.5, bold: true, color: INK,
    isTextBox: true, margin: 0, valign: "top", lineSpacingMultiple: 1.0,
  });
  s.addText(
    "INDENT and DEDENT appear nowhere in the source. The scanner keeps a stack of indentation columns and emits them where the depth changes — the technique CPython's own tokenizer uses. The parser then sees explicit block delimiters and never looks at a column.",
    { x: rx + 0.26, y: 2.14, w: rw - 0.52, h: 1.22, fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0, lineSpacingMultiple: 1.12 }
  );

  card(s, { x: rx, y: 3.66, w: rw, h: 2.22, fill: PAPER, line: "DDE1EC", name: "note-phrase" });
  s.addText("Phrases stay unmerged", {
    x: rx + 0.26, y: 3.82, w: rw - 0.52, h: 0.3, fontSize: 14.5, bold: true, color: INK,
    isTextBox: true, margin: 0,
  });
  s.addText(
    "\"is at least\" leaves the lexer as three separate tokens, shown in violet above. Merging them here would make the scanner context-sensitive and require backtracking; the parser folds them instead, which is Phase 3.",
    { x: rx + 0.26, y: 4.16, w: rw - 0.52, h: 1.3, fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0, lineSpacingMultiple: 1.12 }
  );

  s.addNotes("This is the working output of the lexer, not a mock-up. Point at the two red lines first.");
}

// ===========================================================================
// 12 — Conclusion (dark)
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "DARK" });
  s.addText("Conclusion and next steps", { placeholder: "title" });

  const colW = (CW - 0.5) / 2;

  s.addText("ESTABLISHED SO FAR", {
    x: M, y: 1.34, w: colW, h: 0.26, fontSize: 10, bold: true, color: AMBER,
    charSpacing: 1.2, isTextBox: true, margin: 0,
  });
  s.addText(
    [
      { text: "A complete language specification with 47 keywords, a formal EBNF grammar, and every design decision recorded with its cost.", options: { bullet: true, breakLine: true } },
      { text: "A working lexical analyser, hand-written with no regular expressions, recovering block structure from indentation.", options: { bullet: true, breakLine: true } },
      { text: "A token and AST contract fixed up front, which let the two of us build the front end and back end in parallel rather than in sequence.", options: { bullet: true } },
    ],
    { x: M, y: 1.72, w: colW, h: 2.8, fontSize: 13, color: "D5D9E6", isTextBox: true, margin: 0, paraSpaceAfter: 11, lineSpacingMultiple: 1.15 }
  );

  s.addText("NEXT, FOR REVIEW 2", {
    x: M + colW + 0.5, y: 1.34, w: colW, h: 0.26, fontSize: 10, bold: true, color: AMBER,
    charSpacing: 1.2, isTextBox: true, margin: 0,
  });
  s.addText(
    [
      { text: "Complete the recursive-descent parser, including the multi-word phrase folding and the \"times\" ambiguity.", options: { bullet: true, breakLine: true } },
      { text: "Build the scope chain and the tree-walking interpreter, so real programs run end to end.", options: { bullet: true, breakLine: true } },
      { text: "Unify error reporting so the lexer, parser and interpreter all produce the same line-numbered format.", options: { bullet: true } },
    ],
    { x: M + colW + 0.5, y: 1.72, w: colW, h: 2.8, fontSize: 13, color: "D5D9E6", isTextBox: true, margin: 0, paraSpaceAfter: 11, lineSpacingMultiple: 1.15 }
  );

  card(s, { x: M, y: 4.76, w: CW, h: 1.12, fill: "171B30", line: "2A3154", name: "closing" });
  mark(s, M + 0.34, 5.14, 0.24);
  s.addText(
    "The design phase is finished and the front end runs. What remains is the pipeline the course is about — parser, semantic analysis, and execution.",
    { x: M + 0.86, y: 4.96, w: CW - 1.2, h: 0.72, fontSize: 14, color: PAPER, isTextBox: true, margin: 0, valign: "middle", lineSpacingMultiple: 1.15 }
  );

  s.addNotes("Close on what is next, not on what is done. Invite questions.");
}

// ===========================================================================

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote " + OUT);
})();
