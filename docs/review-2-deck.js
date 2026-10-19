/* Stickynight — Review 2 deck. 12 slides. Same visual identity as Review 1. */

const path = require("path");
const pptxgen = require("pptxgenjs");

const SKILL =
  "C:/Users/HP/AppData/Roaming/Claude/local-agent-mode-sessions/skills-plugin/577aad88-24f5-4fc3-9f36-20ad8ee302b8/4051cba5-4d0c-46ea-a362-132dd556a341/skills/pptx";
const { applyTheme } = require(path.join(SKILL, "scripts", "apply_theme.js"));

const OUT = "C:/Users/HP/OneDrive/Desktop/College Projects/StickKnight/docs/Stickynight-Review-2.pptx";

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
pres.layout = "LAYOUT_WIDE";
pres.theme = { headFontFace: "Cambria", bodyFontFace: "Calibri" };
pres.author = "Apoorv Verma and Surjadeep Das";
pres.title = "Stickynight — Review 2";

const W = 13.33;
const M = 0.62;
const CW = W - M * 2;

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
    { text: { text: "Stickynight · Review 2", options: { x: M, y: 6.92, w: 5, h: 0.3, fontSize: 9, color: MUTED, isTextBox: true, margin: 0 } } },
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

// --- helpers ---------------------------------------------------------------

function mark(slide, x, y, size) {
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w: size, h: size, rectRadius: 0.04,
    fill: { color: AMBER }, rotate: 352, line: { color: AMBER },
    objectName: "sticky-mark",
  });
}

function card(slide, o) {
  slide.addShape(pres.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: 0.03,
    fill: { color: o.fill || MIST }, line: { color: o.line || MIST },
    objectName: o.name || "card",
  });
}

function code(slide, text, o) {
  card(slide, { x: o.x, y: o.y, w: o.w, h: o.h, fill: o.bg || MIST, line: o.border || (o.bg || MIST), name: o.name || "code" });
  slide.addText(text, {
    x: o.x + 0.16, y: o.y + 0.12, w: o.w - 0.32, h: o.h - 0.24,
    fontSize: o.size || 11.5, fontFace: "Courier New",
    color: o.color || INK, align: "left", valign: "top",
    lineSpacingMultiple: o.ls || 1.06, isTextBox: true, margin: 0,
  });
}

function label(slide, text, o) {
  slide.addText(text, {
    x: o.x, y: o.y, w: o.w, h: 0.24, fontSize: 10, bold: true,
    color: o.color || MUTED, charSpacing: 1.2, isTextBox: true, margin: 0,
  });
}

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
  mark(s, M, 1.5, 0.46);
  s.addText("Stickynight", {
    x: M, y: 2.08, w: 9.2, h: 1.0, fontSize: 54, bold: true,
    color: PAPER, fontFace: "Cambria", isTextBox: true, margin: 0, valign: "middle",
  });
  s.addText("A programming language with English-phrase syntax, and its compiler", {
    x: M, y: 3.08, w: 9.8, h: 0.42, fontSize: 18, color: AMBER, isTextBox: true, margin: 0,
  });
  s.addText("Lexer, parser, interpreter and error reporting complete.\nCode generation under way.", {
    x: M, y: 3.64, w: 9.8, h: 0.72, fontSize: 13.5, color: "B9BFD2",
    isTextBox: true, margin: 0, lineSpacingMultiple: 1.2,
  });
  s.addShape(pres.ShapeType.line, {
    x: M, y: 4.72, w: 3.2, h: 0, line: { color: "3A4160", width: 1 }, objectName: "rule",
  });
  s.addText(
    [
      { text: "Review 2", options: { bold: true, color: PAPER } },
      { text: "   ·   Compiler Design course project", options: { color: "B9BFD2" } },
    ],
    { x: M, y: 4.92, w: 9.8, h: 0.3, fontSize: 13, isTextBox: true, margin: 0 }
  );
  s.addText("Apoorv Verma  ·  Surjadeep Das", {
    x: M, y: 5.3, w: 9.8, h: 0.32, fontSize: 15, bold: true, color: PAPER,
    isTextBox: true, margin: 0,
  });
  s.addText("Guide: [Faculty name]", {
    x: M, y: 5.66, w: 9.8, h: 0.3, fontSize: 12, color: MUTED, isTextBox: true, margin: 0,
  });

  card(s, { x: 10.0, y: 2.08, w: 2.71, h: 1.62, fill: "171B30", line: "2A3154", name: "cover-stat" });
  s.addText("80%", {
    x: 10.0, y: 2.22, w: 2.71, h: 0.88, fontSize: 44, bold: true, color: AMBER,
    fontFace: "Cambria", align: "center", isTextBox: true, margin: 0, valign: "middle",
  });
  s.addText("implementation\ncomplete", {
    x: 10.0, y: 3.06, w: 2.71, h: 0.56, fontSize: 12, color: "B9BFD2",
    align: "center", isTextBox: true, margin: 0, lineSpacingMultiple: 1.1,
  });

  s.addNotes("Review 2. Five of six phases complete, the sixth under way.");
}

// ===========================================================================
// 2 — Progress since Review 1
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("Progress since Review 1", { placeholder: "title" });

  // progress bar
  label(s, "IMPLEMENTATION COMPLETED", { x: M, y: 1.38, w: 6 });
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 1.68, w: CW, h: 0.44, rectRadius: 0.08,
    fill: { color: MIST }, line: { color: "E2E5EE" }, objectName: "bar-track",
  });
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 1.68, w: CW * 0.3, h: 0.44, rectRadius: 0.08,
    fill: { color: "C8CDDC" }, line: { color: "C8CDDC" }, objectName: "bar-r1",
  });
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 1.68, w: CW * 0.8, h: 0.44, rectRadius: 0.08,
    fill: { color: AMBER }, line: { color: AMBER }, objectName: "bar-r2",
    transparency: 0,
  });
  // redraw the Review-1 portion on top so both are visible
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 1.68, w: CW * 0.3, h: 0.44, rectRadius: 0.08,
    fill: { color: "E0A93B" }, line: { color: "E0A93B" }, objectName: "bar-r1b",
  });
  s.addText("Review 1  ·  30%", {
    x: M + 0.18, y: 1.68, w: 2.4, h: 0.44, fontSize: 11.5, bold: true, color: INK,
    isTextBox: true, margin: 0, valign: "middle",
  });
  s.addText("Review 2  ·  80%", {
    x: M + CW * 0.8 - 2.2, y: 1.68, w: 2.0, h: 0.44, fontSize: 11.5, bold: true,
    color: INK, align: "right", isTextBox: true, margin: 0, valign: "middle",
  });

  const cols = [
    ["Completed at Review 1", ["Language specification and EBNF grammar", "Lexical analyser with INDENT / DEDENT synthesis"], "C8CDDC"],
    ["Completed since", ["Recursive-descent parser and AST construction", "Scope chain and tree-walking interpreter", "Unified error reporting across all three stages", "Automated test suite covering every stage"], GREEN],
    ["Under way", ["Code generation back end targeting WebAssembly", "Browser playground for live demonstration"], AMBER],
  ];

  const cwid = (CW - 0.44 * 2) / 3;
  cols.forEach(([head, items, accent], i) => {
    const x = M + i * (cwid + 0.44);
    card(s, { x, y: 2.56, w: cwid, h: 3.4, fill: i === 1 ? MIST : PAPER, line: "DDE1EC", name: `col-${i}` });
    s.addShape(pres.ShapeType.ellipse, {
      x: x + 0.26, y: 2.78, w: 0.22, h: 0.22,
      fill: { color: accent }, line: { color: accent }, objectName: `dot-${i}`,
    });
    s.addText(head, {
      x: x + 0.58, y: 2.72, w: cwid - 0.84, h: 0.34, fontSize: 14, bold: true,
      color: INK, isTextBox: true, margin: 0, valign: "middle",
    });
    s.addText(
      items.map((t, k) => ({ text: t, options: { bullet: true, breakLine: k < items.length - 1 } })),
      { x: x + 0.26, y: 3.16, w: cwid - 0.52, h: 2.64, fontSize: 12, color: MUTED, isTextBox: true, margin: 0, paraSpaceAfter: 9, lineSpacingMultiple: 1.1 }
    );
  });

  s.addNotes("Three columns: what was done, what is new, what remains.");
}

// ===========================================================================
// 3 — Architecture, updated
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "DARK" });
  s.addText("The pipeline, as it now stands", { placeholder: "title" });

  const stages = [
    ["Source", ".sn file", "", ""],
    ["Lexer", "characters to tokens", "COMPLETE", GREEN],
    ["Parser", "tokens to AST", "COMPLETE", GREEN],
    ["Interpreter", "walks the AST", "COMPLETE", GREEN],
    ["Output", "program result", "", ""],
  ];

  const bw = 2.1;
  const gap = (CW - bw * 5) / 4;
  stages.forEach(([name, sub, status, color], i) => {
    const x = M + i * (bw + gap);
    const isEdge = i === 0 || i === 4;
    card(s, {
      x, y: 1.56, w: bw, h: 1.62,
      fill: isEdge ? "171B30" : "2A3154",
      line: isEdge ? "2A3154" : "3C4675",
      name: `stage-${i}`,
    });
    s.addText(name, {
      x: x + 0.14, y: 1.7, w: bw - 0.28, h: 0.32, fontSize: 15, bold: true,
      color: isEdge ? "B9BFD2" : PAPER, align: "center", isTextBox: true, margin: 0,
    });
    s.addText(sub, {
      x: x + 0.14, y: 2.04, w: bw - 0.28, h: 0.34, fontSize: 10.5,
      color: isEdge ? MUTED : "B9BFD2", align: "center", isTextBox: true, margin: 0,
    });
    if (status) chip(s, status, color, { x: x + (bw - 1.3) / 2, y: 2.52, w: 1.3, ink: INK });
    if (i < 4) {
      s.addShape(pres.ShapeType.line, {
        x: x + bw + 0.06, y: 2.37, w: gap - 0.12, h: 0,
        line: { color: "4B548A", width: 1.5, endArrowType: "triangle" },
        objectName: `arrow-${i}`,
      });
    }
  });

  // branch to code generator
  const genX = M + (bw + gap) * 2;
  s.addShape(pres.ShapeType.line, {
    x: genX + bw / 2, y: 3.18, w: 0, h: 0.72,
    line: { color: "4B548A", width: 1.5, dashType: "dash", endArrowType: "triangle" },
    objectName: "arrow-gen",
  });
  card(s, { x: genX - 0.5, y: 3.9, w: bw + 1.0, h: 1.0, fill: "2A3154", line: AMBER, name: "stage-gen" });
  s.addText("Code generator", {
    x: genX - 0.5, y: 4.02, w: bw + 1.0, h: 0.3, fontSize: 14, bold: true,
    color: PAPER, align: "center", isTextBox: true, margin: 0,
  });
  chip(s, "IN PROGRESS", AMBER, { x: genX - 0.5 + (bw + 1.0 - 1.5) / 2, y: 4.38, w: 1.5, ink: INK });

  s.addText("the same AST, walked by a second back end", {
    x: genX + bw + 0.7, y: 4.26, w: 4.0, h: 0.3, fontSize: 11.5, italic: true,
    color: MUTED, isTextBox: true, margin: 0,
  });

  card(s, { x: M, y: 5.22, w: CW, h: 0.92, fill: "171B30", line: "2A3154", name: "arch-note" });
  s.addText(
    [
      { text: "Everything from source to output now works end to end.  ", options: { bold: true, color: AMBER } },
      { text: "The remaining work attaches a second consumer to the existing tree rather than changing anything above it.", options: { color: "B9BFD2" } },
    ],
    { x: M + 0.32, y: 5.38, w: CW - 0.64, h: 0.6, fontSize: 13, isTextBox: true, margin: 0, valign: "middle", lineSpacingMultiple: 1.1 }
  );

  s.addNotes("Three green chips. The dashed branch is the work in progress.");
}

// ===========================================================================
// 4 — Parser output
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("Phase 3: the parser builds the syntax tree", { placeholder: "title" });

  const lw = 5.2;
  label(s, "SOURCE", { x: M, y: 1.38, w: lw });
  code(s, 'define classify with score:\n    if score is at least 90:\n        give back "A"\n    otherwise:\n        give back "B"\n\nsay classify(82)', {
    x: M, y: 1.66, w: lw, h: 1.74, size: 11.5, bg: NIGHT, border: NIGHT, color: PAPER, name: "code-src",
  });

  card(s, { x: M, y: 3.6, w: lw, h: 2.3, fill: PAPER, line: "DDE1EC", name: "note-fold" });
  s.addText("Three tokens become one operator", {
    x: M + 0.26, y: 3.78, w: lw - 0.52, h: 0.56, fontSize: 14.5, bold: true, color: INK,
    isTextBox: true, margin: 0, valign: "top", lineSpacingMultiple: 1.0,
  });
  s.addText(
    "The lexer handed over IS, AT and LEAST separately. The parser folds them into a single comparison, deciding from the next one or two tokens — never by backtracking. The otherwise-if chain becomes a nested If, so every later stage handles only two branches.",
    { x: M + 0.26, y: 4.38, w: lw - 0.52, h: 1.4, fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0, lineSpacingMultiple: 1.12 }
  );

  const rx = M + lw + 0.44;
  const rw = CW - lw - 0.44;
  label(s, "ABSTRACT SYNTAX TREE PRODUCED", { x: rx, y: 1.38, w: rw });

  const tree = [
    ["Program", INK],
    ["\u251c\u2500\u2500 Function classify(score)", INK],
    ["\u2502   \u2514\u2500\u2500 body", MUTED],
    ["\u2502       \u2514\u2500\u2500 If", INK],
    ["\u2502           \u251c\u2500\u2500 condition", MUTED],
    ["\u2502           \u2502   \u2514\u2500\u2500 Binary is at least", VIOLET],
    ["\u2502           \u2502       \u251c\u2500\u2500 Variable score", INK],
    ["\u2502           \u2502       \u2514\u2500\u2500 Literal 90", INK],
    ["\u2502           \u251c\u2500\u2500 then", MUTED],
    ["\u2502           \u2502   \u2514\u2500\u2500 Return \u2192 Literal \"A\"", INK],
    ["\u2502           \u2514\u2500\u2500 otherwise", MUTED],
    ["\u2502               \u2514\u2500\u2500 Return \u2192 Literal \"B\"", INK],
    ["\u2514\u2500\u2500 Say", INK],
    ["    \u2514\u2500\u2500 Call classify ( Literal 82 )", INK],
  ];

  card(s, { x: rx, y: 1.66, w: rw, h: 4.24, fill: MIST, line: "E2E5EE", name: "code-ast" });
  s.addText(
    tree.map(([t, color], i) => ({
      text: t,
      options: { color, breakLine: i < tree.length - 1, bold: color === VIOLET },
    })),
    {
      x: rx + 0.18, y: 1.8, w: rw - 0.36, h: 3.96, fontSize: 12,
      fontFace: "Courier New", isTextBox: true, margin: 0, valign: "top",
      lineSpacingMultiple: 1.1,
    }
  );

  s.addNotes("Point at the violet line: that is the folded phrase.");
}

// ===========================================================================
// 5 — The ambiguity
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("A real grammar ambiguity, and how it is resolved", { placeholder: "title" });

  card(s, { x: M, y: 1.4, w: CW, h: 0.84, fill: NIGHT, line: NIGHT, name: "amb-q" });
  s.addText(
    [
      { text: "The problem:  ", options: { bold: true, color: AMBER } },
      { text: "\"times\" is both the multiplication operator (3 times 4) and part of the count loop (repeat 3 times:). In \"repeat n times:\", is \"n times\" the start of a multiplication?", options: { color: PAPER } },
    ],
    { x: M + 0.3, y: 1.52, w: CW - 0.6, h: 0.6, fontSize: 13, isTextBox: true, margin: 0, valign: "middle", lineSpacingMultiple: 1.1 }
  );

  const half = (CW - 0.44) / 2;

  label(s, "BOTH READINGS ARE GRAMMATICAL", { x: M, y: 2.46, w: half });
  code(s, 'repeat 3 times:          <- a loop\n    say "hello"\n\nset total to 3 times 4   <- multiplication\n\nrepeat rows * cols times:\n    say "still a loop"', {
    x: M, y: 2.74, w: half, h: 1.76, size: 11.5, bg: MIST, border: "E2E5EE", name: "code-amb",
  });

  label(s, "THE RESOLUTION", { x: M + half + 0.44, y: 2.46, w: half });
  card(s, { x: M + half + 0.44, y: 2.74, w: half, h: 1.76, fill: PAPER, line: "DDE1EC", name: "amb-fix" });
  s.addText(
    [
      { text: "The word \"times\" is suppressed as an operator while, and only while, the count of a repeat is being read.", options: { bullet: true, breakLine: true } },
      { text: "The symbol \"*\" is a different token and is never suppressed — so the third example above still parses, giving an escape hatch for the case the rule takes away.", options: { bullet: true } },
    ],
    { x: M + half + 0.7, y: 2.94, w: half - 0.52, h: 1.4, fontSize: 12, color: MUTED, isTextBox: true, margin: 0, paraSpaceAfter: 9, lineSpacingMultiple: 1.12 }
  );

  card(s, { x: M, y: 4.78, w: CW, h: 1.12, fill: MIST, line: "E2E5EE", name: "amb-why" });
  mark(s, M + 0.34, 5.16, 0.22);
  s.addText(
    "This is the only ambiguity in the grammar, and it is a direct consequence of combining phrase-based operators with keyword-led statements. Finding it was the main design work of this phase.",
    { x: M + 0.84, y: 4.96, w: CW - 1.2, h: 0.76, fontSize: 13, color: INK, isTextBox: true, margin: 0, valign: "middle", lineSpacingMultiple: 1.15 }
  );

  s.addNotes("Volunteer this before being asked. It is the strongest thing on the parser.");
}

// ===========================================================================
// 6 — Interpreter: scope and closures
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("Phase 4: scope handling and the interpreter", { placeholder: "title" });

  const lw = 6.0;
  label(s, "THE SCOPE CHAIN", { x: M, y: 1.38, w: lw });

  const scopes = [
    ["global", "built-ins, top-level names", 0],
    ["make_counter", "count", 1],
    ["step", "(sees count through its parent)", 2],
  ];
  scopes.forEach(([name, holds, depth], i) => {
    const x = M + depth * 0.5;
    const w = lw - depth * 0.5;
    card(s, { x, y: 1.68 + i * 0.92, w, h: 0.78, fill: i === 2 ? MIST : PAPER, line: "DDE1EC", name: `scope-${i}` });
    s.addText(name, {
      x: x + 0.22, y: 1.76 + i * 0.92, w: w - 0.44, h: 0.3, fontSize: 13.5, bold: true,
      color: INK, fontFace: "Courier New", isTextBox: true, margin: 0,
    });
    s.addText(holds, {
      x: x + 0.22, y: 2.06 + i * 0.92, w: w - 0.44, h: 0.28, fontSize: 11, color: MUTED,
      isTextBox: true, margin: 0,
    });
  });

  s.addText(
    "A name is looked up here, then outwards. \"set\" creates in the current block; \"change\" updates the nearest existing one — which is what lets a mistyped name be reported instead of silently creating a second variable.",
    { x: M, y: 4.5, w: lw, h: 1.0, fontSize: 12, color: MUTED, isTextBox: true, margin: 0, lineSpacingMultiple: 1.15 }
  );

  const rx = M + lw + 0.44;
  const rw = CW - lw - 0.44;

  label(s, "CLOSURES: A DEFINITION KEEPS ITS SCOPE", { x: rx, y: 1.38, w: rw });
  code(s, 'define make_counter:\n    set count to 0\n    define step:\n        change count to count + 1\n        give back count\n    give back step\n\nset tick to make_counter()\nsay tick()\nsay tick()\nsay tick()\n\nset other to make_counter()\nsay other()', {
    x: rx, y: 1.66, w: rw, h: 3.2, size: 11.5, bg: NIGHT, border: NIGHT, color: PAPER, name: "code-clo",
  });

  label(s, "OUTPUT", { x: rx, y: 4.98, w: rw });
  code(s, "1    2    3        1", {
    x: rx, y: 5.26, w: rw, h: 0.56, size: 15, bg: MIST, border: "E2E5EE", color: GREEN, name: "code-clo-out",
  });
  s.addText("the second counter has its own count", {
    x: rx, y: 5.88, w: rw, h: 0.3, fontSize: 10.5, italic: true, color: MUTED,
    isTextBox: true, margin: 0,
  });

  s.addNotes("Closures are the proof that the scope chain is real and not a flat symbol table.");
}

// ===========================================================================
// 7 — Programs running
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("Real programs, running end to end", { placeholder: "title" });

  const demos = [
    ["Recursion and conditionals", 'define is_prime with n:\n    if n is less than 2:\n        give back no\n    repeat with d from 2 to n:\n        if d times d is more than n:\n            stop\n        if n mod d is 0:\n            give back no\n    give back yes', "list of 2, 3, 5, 7, 11, 13,\n17, 19, 23, 29, 31, 37, 41,\n43, 47\n\nThat is 15 of them."],
    ["Lists, indexing and mutation", 'define bubble_sort with values:\n    set data to copy(values)\n    repeat with pass from 1 to n minus 1:\n        repeat with i from 1 to n minus pass:\n            if item i of data is more than\n               item (i + 1) of data:\n                ... swap ...\n    give back data', "Before:    list of 5, 3, 9, 1, 7, 2\nAfter:     list of 1, 2, 3, 5, 7, 9\nUntouched: list of 5, 3, 9, 1, 7, 2"],
  ];

  const cwid = (CW - 0.44) / 2;
  demos.forEach(([title, src, out], i) => {
    const x = M + i * (cwid + 0.44);
    s.addText(title, {
      x, y: 1.38, w: cwid, h: 0.3, fontSize: 14.5, bold: true, color: INK,
      isTextBox: true, margin: 0,
    });
    code(s, src, {
      x, y: 1.74, w: cwid, h: 2.42, size: 10.5, bg: NIGHT, border: NIGHT, color: PAPER,
      name: `demo-src-${i}`,
    });
    label(s, "OUTPUT", { x, y: 4.26, w: cwid });
    code(s, out, {
      x, y: 4.54, w: cwid, h: 1.36, size: 11.5, bg: MIST, border: "E2E5EE", color: GREEN,
      name: `demo-out-${i}`,
    });
  });

  s.addNotes("Both of these run live from the command line — show them rather than reading the slide.");
}

// ===========================================================================
// 8 — Unified error reporting
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("Phase 5: one error format for every stage", { placeholder: "title" });

  const errs = [
    ["LEXICAL", RED, "Lexical error in demo.sn, line 3:\n\n   2 | set age to 20\n   3 | if age >= 18:\n     |        ^^\n\n  '>=' is not part of Stickynight.\n  hint: Write 'is at least'"],
    ["SYNTAX", VIOLET, "Syntax error in demo.sn, line 3:\n\n   2 | set score to 90\n   3 | if score is at least 50\n     |                        ^\n\n  I expected a ':' at the end of\n  this 'if' line.\n  hint: Every 'if' line ends with ':'"],
    ["RUNTIME", BLUE, "Runtime error in demo.sn, line 4:\n\n   3 | set count to 2\n   4 | say totl + count\n     |     ^^^^\n\n  I do not know anything called\n  'totl'.\n  hint: Did you mean 'total'?"],
  ];

  const cwid = (CW - 0.4 * 2) / 3;
  errs.forEach(([stage, color, body], i) => {
    const x = M + i * (cwid + 0.4);
    chip(s, stage, color, { x, y: 1.38, w: 1.5 });
    code(s, body, {
      x, y: 1.78, w: cwid, h: 2.76, size: 10, bg: MIST, border: "E2E5EE", name: `err-${i}`,
    });
  });

  card(s, { x: M, y: 4.74, w: CW, h: 1.16, fill: NIGHT, line: NIGHT, name: "err-note" });
  s.addText("Same shape every time: stage, file, line, the source quoted, a caret, a plain sentence, and a suggestion.", {
    x: M + 0.32, y: 4.88, w: CW - 0.64, h: 0.32, fontSize: 13, bold: true, color: AMBER,
    isTextBox: true, margin: 0,
  });
  s.addText(
    "Rejecting \">=\" is deliberate rather than accidental, which is exactly what lets the message name the phrase to use instead. Suggestions for mistyped names are found by edit distance over the names currently in scope.",
    { x: M + 0.32, y: 5.22, w: CW - 0.64, h: 0.56, fontSize: 12, color: "B9BFD2", isTextBox: true, margin: 0, lineSpacingMultiple: 1.12 }
  );

  s.addNotes("Three stages, one format. This was the integration work of Phase 5.");
}

// ===========================================================================
// 9 — Error recovery
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("Error recovery: every mistake in a single pass", { placeholder: "title" });

  const lw = 5.6;
  label(s, "A FILE WITH FOUR SEPARATE MISTAKES", { x: M, y: 1.38, w: lw });
  code(s, 'set total to\n\nif total is at least 10\n    say "missing colon above"\n\ndefine add_up with a, a:\n    give back a\n\nsay total +', {
    x: M, y: 1.66, w: lw, h: 2.3, size: 11.5, bg: NIGHT, border: NIGHT, color: PAPER, name: "code-bad",
  });

  card(s, { x: M, y: 4.16, w: lw, h: 1.74, fill: PAPER, line: "DDE1EC", name: "rec-note" });
  s.addText("Panic-mode recovery", {
    x: M + 0.26, y: 4.34, w: lw - 0.52, h: 0.3, fontSize: 14.5, bold: true, color: INK,
    isTextBox: true, margin: 0,
  });
  s.addText(
    "The parser records the error, discards tokens until a line that could begin a new statement, and carries on. Running the file stops at the first mistake, as most compilers do; checking it reports all four.",
    { x: M + 0.26, y: 4.68, w: lw - 0.52, h: 1.1, fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0, lineSpacingMultiple: 1.12 }
  );

  const rx = M + lw + 0.44;
  const rw = CW - lw - 0.44;
  label(s, "OUTPUT OF  stickynight --check", { x: rx, y: 1.38, w: rw });

  const lines = [
    ["line 11  This line stops before it says", INK],
    ["         what to do.", MUTED],
    ["", MUTED],
    ["line 14  I expected a ':' at the end of", INK],
    ["         this 'if' line.", MUTED],
    ["", MUTED],
    ["line 17  'a' is listed twice as an input", INK],
    ["         to 'add_up'.", MUTED],
    ["", MUTED],
    ["line 20  This line stops before it says", INK],
    ["         what to do.", MUTED],
    ["", MUTED],
    ["4 problems found.", GREEN],
  ];

  card(s, { x: rx, y: 1.66, w: rw, h: 4.24, fill: MIST, line: "E2E5EE", name: "code-check" });
  s.addText(
    lines.map(([t, color], i) => ({
      text: t,
      options: { color, breakLine: i < lines.length - 1, bold: color === GREEN },
    })),
    {
      x: rx + 0.18, y: 1.84, w: rw - 0.36, h: 3.9, fontSize: 11.5,
      fontFace: "Courier New", isTextBox: true, margin: 0, valign: "top",
      lineSpacingMultiple: 1.08,
    }
  );

  s.addNotes("Building this example found a genuine bug in our recovery — worth mentioning if asked how we validated.");
}

// ===========================================================================
// 10 — Testing
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("Validation: an automated test suite", { placeholder: "title" });

  const stats = [["314", "tests, all passing", GREEN], ["6", "test files, one per stage", BLUE], ["26", "sample programs covered", AMBER]];
  const sw = (CW - 0.4 * 2) / 3;
  stats.forEach(([n, l, color], i) => {
    const x = M + i * (sw + 0.4);
    card(s, { x, y: 1.4, w: sw, h: 1.14, fill: MIST, line: "E2E5EE", name: `t-stat-${i}` });
    s.addText(n, {
      x: x + 0.28, y: 1.52, w: sw - 0.56, h: 0.54, fontSize: 32, bold: true, color,
      fontFace: "Cambria", isTextBox: true, margin: 0, valign: "middle",
    });
    s.addText(l, {
      x: x + 0.28, y: 2.06, w: sw - 0.56, h: 0.3, fontSize: 12, color: MUTED,
      isTextBox: true, margin: 0,
    });
  });

  const rows = [
    ["Lexical analyser", "31", "Tokens, indentation, blank lines inside blocks, every rejection message"],
    ["Parser", "45", "Precedence, phrase folding, block forms, panic-mode recovery"],
    ["Interpreter", "58", "Scope, closures, loops, lists, built-ins, runtime errors"],
    ["Error reporting", "29", "All stages share one format, caret in the correct column"],
    ["Front-end contract", "4", "The real lexer still matches the token stream agreed on day one"],
    ["Sample programs", "109", "Every example runs; every broken one fails at the stage it demonstrates"],
  ];

  let y = 2.86;
  rows.forEach(([area, n, what], i) => {
    if (i % 2 === 0) card(s, { x: M, y: y - 0.06, w: CW, h: 0.54, fill: MIST, line: MIST, name: `trow-${i}` });
    s.addText(area, {
      x: M + 0.24, y, w: 2.4, h: 0.42, fontSize: 12.5, bold: true, color: INK,
      isTextBox: true, margin: 0, valign: "middle",
    });
    s.addText(n, {
      x: M + 2.7, y, w: 0.6, h: 0.42, fontSize: 12.5, bold: true, color: GREEN,
      align: "right", isTextBox: true, margin: 0, valign: "middle",
    });
    s.addText(what, {
      x: M + 3.5, y, w: CW - 3.8, h: 0.42, fontSize: 12, color: MUTED,
      isTextBox: true, margin: 0, valign: "middle",
    });
    y += 0.6;
  });

  s.addText(
    "A further 38 tests cover the code generator now under development, bringing the total to 314.",
    { x: M, y: 6.5, w: CW, h: 0.3, fontSize: 11, italic: true, color: MUTED, isTextBox: true, margin: 0 }
  );

  s.addNotes("The suite runs in under half a second. Offer to run it live.");
}

// ===========================================================================
// 11 — Code generation in progress
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "LIGHT" });
  s.addText("Phase 6, under way: generating WebAssembly", { placeholder: "title" });

  const lw = 5.0;
  label(s, "SOURCE", { x: M, y: 1.38, w: lw });
  code(s, "define double with n:\n    give back n times 2\n\nsay double(21)", {
    x: M, y: 1.66, w: lw, h: 1.1, size: 12, bg: NIGHT, border: NIGHT, color: PAPER, name: "cg-src",
  });

  card(s, { x: M, y: 2.96, w: lw, h: 2.94, fill: PAPER, line: "DDE1EC", name: "cg-note" });
  s.addText("Why this matters", {
    x: M + 0.26, y: 3.14, w: lw - 0.52, h: 0.3, fontSize: 14.5, bold: true, color: INK,
    isTextBox: true, margin: 0,
  });
  s.addText(
    [
      { text: "The generator walks the same AST the interpreter walks. Nothing above it changes.", options: { bullet: true, breakLine: true } },
      { text: "Having two independent consumers of the tree is what proves it is a genuine intermediate representation.", options: { bullet: true, breakLine: true } },
      { text: "Text format for the numeric subset works today. A binary emitter and the browser playground are the remaining work.", options: { bullet: true } },
    ],
    { x: M + 0.26, y: 3.5, w: lw - 0.52, h: 2.22, fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0, paraSpaceAfter: 9, lineSpacingMultiple: 1.12 }
  );

  const rx = M + lw + 0.44;
  const rw = CW - lw - 0.44;
  label(s, "GENERATED WEBASSEMBLY TEXT FORMAT", { x: rx, y: 1.38, w: rw });
  code(s, '(module\n  (import "stickynight" "say" (func $say (param f64)))\n\n  ;; double\n  (func $double (param $n f64) (result f64)\n    local.get $n\n    f64.const 2\n    f64.mul\n    return\n  )\n\n  ;; the main program\n  (func $main\n    f64.const 21\n    call $double\n    call $say\n  )\n\n  (export "double" (func $double))\n  (export "main" (func $main))\n)', {
    x: rx, y: 1.66, w: rw, h: 4.24, size: 11, bg: MIST, border: "E2E5EE", name: "cg-wat", ls: 1.08,
  });

  s.addNotes("Be clear this is partial: the numeric subset only. Say so before being asked.");
}

// ===========================================================================
// 12 — Remaining work
// ===========================================================================
{
  const s = pres.addSlide({ masterName: "DARK" });
  s.addText("Remaining work, and conclusion", { placeholder: "title" });

  const colW = (CW - 0.5) / 2;

  s.addText("WORKING TODAY", {
    x: M, y: 1.3, w: colW, h: 0.26, fontSize: 10, bold: true, color: AMBER,
    charSpacing: 1.2, isTextBox: true, margin: 0,
  });
  s.addText(
    [
      { text: "The full pipeline from source to output: lexer, parser, interpreter.", options: { bullet: true, breakLine: true } },
      { text: "Variables, conditionals, three loop forms, lists, text, definitions, recursion and closures.", options: { bullet: true, breakLine: true } },
      { text: "One error format across every stage, with recovery that reports all mistakes at once.", options: { bullet: true, breakLine: true } },
      { text: "314 automated tests covering each stage and every sample program.", options: { bullet: true } },
    ],
    { x: M, y: 1.66, w: colW, h: 3.0, fontSize: 12.5, color: "D5D9E6", isTextBox: true, margin: 0, paraSpaceAfter: 10, lineSpacingMultiple: 1.14 }
  );

  s.addText("TO COMPLETE FOR THE FINAL REVIEW", {
    x: M + colW + 0.5, y: 1.3, w: colW, h: 0.26, fontSize: 10, bold: true, color: AMBER,
    charSpacing: 1.2, isTextBox: true, margin: 0,
  });
  s.addText(
    [
      { text: "Finish the code generator and emit a runnable binary module, not only text.", options: { bullet: true, breakLine: true } },
      { text: "Verify it by running the compiled output and comparing it against the interpreter.", options: { bullet: true, breakLine: true } },
      { text: "Build the browser playground, so the language can be demonstrated without any setup.", options: { bullet: true, breakLine: true } },
      { text: "Known limitation to address: names are checked at run time, so a mistake on a branch that never executes is not reported.", options: { bullet: true } },
    ],
    { x: M + colW + 0.5, y: 1.66, w: colW, h: 3.0, fontSize: 12.5, color: "D5D9E6", isTextBox: true, margin: 0, paraSpaceAfter: 10, lineSpacingMultiple: 1.14 }
  );

  card(s, { x: M, y: 4.92, w: CW, h: 1.12, fill: "171B30", line: "2A3154", name: "closing" });
  mark(s, M + 0.34, 5.3, 0.24);
  s.addText(
    "Every stage the course covers now runs end to end. What remains is a second back end on the tree we already have.",
    { x: M + 0.86, y: 5.12, w: CW - 1.2, h: 0.72, fontSize: 14, color: PAPER, isTextBox: true, margin: 0, valign: "middle", lineSpacingMultiple: 1.15 }
  );

  s.addNotes("Close on what remains. Offer a live run of anything on the slides.");
}

// ===========================================================================

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote " + OUT);
})();
