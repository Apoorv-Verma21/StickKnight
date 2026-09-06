# Stickynight — Project Report

Compiler Design course project. This document is the plan, what was actually
built against it, and what the choices cost.

---

## 1. What was built

An original programming language and its complete implementation:

* a hand-written lexer that recovers block structure from indentation
* a recursive-descent parser derived from a grammar written first
* a tree-walking interpreter with lexical scope and closures
* **both** stretch goals: a WebAssembly code-generation back end *and* a
  browser playground
* one error format shared by all four stages
* 308 tests, including nineteen programs whose compiled WebAssembly output is
  run and compared against the interpreter's

No parser generator, no runtime dependencies. TypeScript throughout, and the
only development dependency is the TypeScript compiler itself.

---

## 2. The language

Stickynight is dynamically typed, with English-phrase syntax and
indentation-based blocks.

```stickynight
define classify with score:
    if score is at least 90:
        give back "A"
    otherwise if score is at least 75:
        give back "B"
    otherwise:
        give back "C"

set marks to 82
say classify(marks)
```

Full definition in [SPEC.md](SPEC.md); the grammar on its own in
[docs/GRAMMAR.ebnf](docs/GRAMMAR.ebnf).

### 2.1 Why this language rather than a clone of an existing one

Most student compiler projects reimplement a C-like or Java-like syntax. That
tests implementation skill but asks no design questions, because every
decision has already been made. Choosing a natural-language syntax forces
real ones — where multi-word operators get resolved, what happens when a
keyword is also an operator, whether a list starts at 0 or 1 — and each of
those has a defensible answer and a cost. Section 9 of SPEC.md is that list.

There is precedent for the idea: AppleScript and HyperTalk were built on the
same premise, and readable syntax remains a live concern in education tooling.

### 2.2 Who it is for

| Audience | Why it helps |
| --- | --- |
| Absolute beginners | `set`, `say`, `if` / `otherwise`, `repeat ... from ... to` remove the intimidation of `{}`, `;` and `&&` before the logic itself has been grasped |
| Non-CS learners | Programs read close to pseudocode, so the language doubles as a way to teach algorithmic thinking without a syntax cliff |
| This course | A non-trivial custom grammar — multi-word tokens, significant indentation — implemented across the whole pipeline |

---

## 3. How the work was split

The lexer → parser → interpreter chain is sequential, so a split by day
("you take days 1-4, they take 5-8") would have left one person waiting on the
other. The work was split by **pipeline half** instead, after a joint first
day that fixed the contracts both halves build against.

**Day 1, together.** Finalise the keyword set, the operator phrases and the
indentation rules; write the EBNF grammar and worked examples; agree the
`Token` and AST node shapes — the *types only*, no logic. Deliverable:
`SPEC.md`, `src/token.ts`, `src/ast.ts`.

**From Day 2, two tracks.**

| | Track A — front end | Track B — back end |
| --- | --- | --- |
| Days 2-3 | `lexer.ts`: scanner, INDENT/DEDENT, strings, numbers, identifiers, comments | `parser.ts` against a **hand-written mock token list**, so parsing could start without waiting for the scanner |
| Days 4-5 | lexer edge cases, token-stream demo, first error messages | finish the recursive-descent parser, fold the multi-word phrases, write the AST printer |
| — | **Integration point:** swap the mock token list for the real lexer output, confirm the parser still passes | |
| Days 6-7 | lexer and parser error handling: line-numbered messages for bad tokens, malformed syntax, bad indentation | `Environment` (scoping) and the tree-walking `interpreter.ts` |
| Day 8 | merge the error conventions so all stages report identically | interpreter errors: undefined name, wrong argument count, type mismatch |
| Days 9-10 | one stretch track each | the other one |

The mock token list is `src/dev/mock-tokens.ts`, and it is still in the
repository. `tests/integration.test.ts` asserts that the real lexer produces
exactly that stream, so the Day-1 contract cannot quietly rot: a change to the
lexer that breaks it fails *there*, with a diff of two token streams, rather
than as a confusing failure three stages downstream.

That test is the single most useful thing to come out of the parallel
arrangement, and it would not exist if the work had been split by day.

---

## 4. Day by day, against the plan

| Day | Planned | Delivered |
| --- | --- | --- |
| 1 | Language design, EBNF, examples | `SPEC.md` (12 sections, including the design-decision rationale), `docs/GRAMMAR.ebnf`, `src/token.ts`, `src/ast.ts` |
| 2-3 | Lexer with INDENT/DEDENT | `src/lexer.ts`, plus `formatTokens` for the token-stream demo |
| 4-5 | Parser, AST types, AST printer | `src/parser.ts`, `src/ast-printer.ts` (tree and s-expression forms) |
| 6-7 | Environment, interpreter | `src/environment.ts`, `src/values.ts`, `src/builtins.ts` (26 built-ins), `src/interpreter.ts` |
| 8 | Consistent errors | `src/errors.ts` — one format for all stages, with carets, hints, edit-distance suggestions, and call stacks; plus panic-mode recovery so `--check` reports every error at once |
| 9-10 | **One** of: WebAssembly, or a playground | **Both.** `src/wasm/` (IR, code generator, text emitter, binary emitter) and `playground/` |
| 11 | README, architecture, report, samples | `README.md`, `docs/ARCHITECTURE.md`, this document, 11 examples and 14 broken ones |
| 12 | Viva preparation | `docs/VIVA.md`, and `scripts/demo.mjs` — a guided tour through all six stages |

### 4.1 What went beyond the plan

**Both stretch tracks, not one.** The roadmap said to pick either the
WebAssembly back end or the playground. Both were built, and they turned out
to reinforce each other: the playground's fourth tab shows the generated
WebAssembly, so the code generator is demonstrable interactively rather than
only as a file on disk.

**A real `.wasm` binary, not only the text format.** The plan asked for
WebAssembly *text* format. Text alone cannot be executed without a separate
assembler, so a generator that emits only text has never actually been run.
`src/wasm/binary.ts` therefore encodes the binary format directly — LEB128
integers, numbered sections, the lot — which is what makes
`tests/wasm.test.ts` able to run the compiled output and compare it against
the interpreter's. That comparison is the strongest correctness evidence in
the project, and it only exists because of the extra file.

**Panic-mode error recovery.** Not in the plan. `--check` reports every broken
statement in one pass instead of stopping at the first.

**A test suite.** Also not in the plan; 308 tests. It paid for itself twice
during the build — see section 6.

---

## 5. Where each course topic appears

| Course topic | Standard concept | In this project |
| --- | --- | --- |
| Lexical analysis | Source → token stream | `src/lexer.ts`, which also synthesises `INDENT`/`DEDENT` the way CPython's tokenizer does |
| Regular expressions / finite automata | Pattern rules recognising tokens | The number, text and identifier rules are written by hand as the transitions a DFA would have. No regular expression is used anywhere in the lexer |
| Context-free grammar | BNF/EBNF defining valid programs | `docs/GRAMMAR.ebnf`, written before the implementation and used directly to derive the parser: one method per non-terminal |
| Syntax analysis | Grammar → parse tree / AST | `src/parser.ts`, recursive descent, including the multi-word phrase folding |
| Semantic analysis | Scope, undefined names, type consistency | `src/environment.ts` — the scope chain, the `set`/`change` distinction, undefined-name errors with suggestions; type checks at the point of use in the interpreter |
| Intermediate representation | A structured form between source and execution | `src/ast.ts`, consumed by three independent back ends. The WebAssembly path lowers it further to a second IR in `src/wasm/ir.ts` |
| Code generation / execution | Machine code, bytecode, or direct execution | `src/interpreter.ts` executes the tree; `src/wasm/` compiles it to a real WebAssembly module that the engine runs |
| Error handling | Errors with location information | `src/errors.ts`: one format, four stages, line and column, a caret, a plain sentence and a suggestion |

---

## 6. What the tests caught

Worth recording, because it is the honest answer to "how do you know it
works".

**`length(x)` was unreachable.** `length` is a keyword, so it could never lex
as an identifier — which meant the `length` built-in, sitting in the global
scope, could not be called. `length of x` worked; `length(x)` was a syntax
error. The parser now accepts both spellings.

**A greedy list literal, found by a test that was itself wrong.** The test
`join(list of "a", "b", ", ")` failed with "needs 2 inputs, but it was given
1". The test was wrong, not the language — `list of` takes every comma that
follows it, so all three values became one list. But the arity message alone
did not explain *why*, so the interpreter now recognises this exact shape and
says so:

> A 'list of ...' takes every comma that follows it, including the ones meant
> to separate the inputs — so this counted as one input. Put brackets round
> the list: join((list of ...), ...)

The papercut is documented in SPEC.md §9.4 rather than hidden.

Two smaller things fixed the same way: the indentation error reported the
open blocks *after* unwinding them (so it advised "column 1" when it should
have said "columns 1, 9"), and arithmetic errors named the canonical operator
rather than the word the programmer typed — `'*' works on numbers` for a line
that said `times`.

---

## 7. Limitations

Stated plainly, because being caught out by them is worse than volunteering
them.

**The WebAssembly back end covers the numeric subset only.** Numbers,
arithmetic, comparisons, all three loop forms, `stop`/`skip`, definitions and
recursion all compile and run. Text, lists, `for each`, `add` and nested
definitions do not — they need a heap and a value representation, which is a
project of its own. A program using one gets a message naming the feature and
pointing at the interpreter, which runs the whole language.

**There is no separate semantic analysis pass.** Undefined names and argument
counts are checked at run time, so a mistake on a branch that never executes
is never reported. The AST is already the right shape for a resolver pass
walking it before execution; that is the first thing to add.

**Recovery is between statements, not inside them.** One bad expression
discards the rest of its line.

**`list of` is greedy.** SPEC.md §9.4 — the one place the symbol-free syntax
costs something real.

---

## 8. What comes next

1. A resolver pass, so undefined names and arity are caught before the program
   runs.
2. A heap layout for the WebAssembly back end, so text and lists compile.
3. Recovery inside a statement, not just between statements.

---

## 9. Everything in the repository

| | |
| --- | --- |
| [SPEC.md](SPEC.md) | the language: lexical structure, grammar, semantics, and the reasoning behind each decision |
| [README.md](README.md) | how to build, run and use it |
| [docs/GRAMMAR.ebnf](docs/GRAMMAR.ebnf) | the grammar on its own |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | how the code is laid out and why |
| [docs/VIVA.md](docs/VIVA.md) | the questions worth being able to answer |
| `src/` | the implementation |
| `examples/` | eleven programs, one per feature |
| `examples/errors/` | fourteen deliberately broken ones, one per error kind |
| `playground/` | the browser playground |
| `tests/` | 308 tests across six files |
| `scripts/demo.mjs` | the guided tour, for a live demonstration |
