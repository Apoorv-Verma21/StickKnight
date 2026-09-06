# Architecture

How the code is laid out, what each piece is responsible for, and why the
boundaries fall where they do.

---

## 1. The shape of the whole thing

```
                          ┌──────────────────┐
   source text  ────────▶ │   lexer.ts       │
   (a .sn file)           │  character DFA   │
                          │  + indent stack  │
                          └────────┬─────────┘
                                   │  Token[]          ← contract: token.ts
                                   ▼
                          ┌──────────────────┐
                          │   parser.ts      │
                          │ recursive descent│
                          │ + phrase folding │
                          └────────┬─────────┘
                                   │  Program (AST)    ← contract: ast.ts
                                   │
             ┌─────────────────────┼─────────────────────┐
             ▼                     ▼                     ▼
    ┌────────────────┐   ┌──────────────────┐   ┌────────────────┐
    │ ast-printer.ts │   │ interpreter.ts   │   │ wasm/compiler  │
    │ tree / s-expr  │   │ tree walking     │   │ AST -> wasm IR │
    └────────────────┘   │  + environment   │   └───────┬────────┘
                         │  + builtins      │           │  WasmModule
                         └────────┬─────────┘           │
                                  │ printed lines       ├────────────┐
                                  ▼                     ▼            ▼
                              (stdout,            wasm/wat.ts   wasm/binary.ts
                           playground, tests)      .wat text     .wasm bytes
                                                                     │
                                                                     ▼
                                                          WebAssembly.instantiate
```

Every arrow is a plain data structure, never a callback into the stage above.
That is what lets each stage be tested on its own, and what let the two halves
of the project be built at the same time.

---

## 2. The two contracts

`src/token.ts` and `src/ast.ts` contain **types and no logic**. They were
written on Day 1, before any of the stages, and everything else is written
against them.

### token.ts

A `Token` is a tagged record: type, the exact source text, a decoded literal
for the literal kinds, and enough position information to draw a caret under
it (line, column, length).

The important decision here is what a token *is not*: multi-word operators are
**not** merged. `is at least` arrives as `IS AT LEAST`, three tokens. §9.2 of
SPEC.md gives the reasoning; the effect on the architecture is that the lexer
never needs to know context and never needs to back up.

### ast.ts

Plain discriminated unions on a `kind` field, rather than classes with an
`accept(visitor)` method.

The visitor pattern exists in textbook interpreters to get exhaustiveness: if
a node type is added, every consumer should fail to compile until it handles
it. TypeScript gives that directly — a `switch` over a discriminated union
with no `default` is checked for exhaustiveness — so the pattern would be
ceremony around a guarantee already in the type system.

Every node carries the `Token` it came from, which is what makes an error
message able to point at the right column three stages later.

---

## 3. Front end

### lexer.ts

A hand-written character scanner. No regular expressions are used anywhere in
it: the rules for numbers, text and identifiers are written out as the
transitions a DFA built from the equivalent regular expressions would have,
which is the whole point of the exercise.

Its one unusual job is turning layout into tokens. It keeps a stack of
indentation columns, starting `[0]`:

* a wider line pushes and emits `INDENT`
* a narrower one pops, emitting one `DEDENT` per level closed
* a width that matches nothing on the stack is an error naming the columns it
  could have matched
* blank and comment-only lines are skipped entirely and never touch the stack
* an open bracket suppresses `NEWLINE`, which is how a statement spans lines
* end of file closes every block still open

After that the parser sees explicit block delimiters and never looks at a
column.

### parser.ts

Recursive descent, one method per grammar rule, in the same order as
`docs/GRAMMAR.ebnf`.

Two things beyond a textbook parser:

**Phrase folding.** `comparison()` reads `IS`, then decides the operator from
the next one or two tokens. Fixed lookahead, no backtracking, so the grammar
stays LL(k) with a small k.

**Panic-mode recovery.** `parseWithRecovery()` catches a syntax error, records
it, discards tokens until a line that could begin a statement, and carries on.
One run reports every broken line in the file rather than the first.

There is one piece of parser state that is not a pure grammar rule: a counter
that suppresses `times` as an operator while the count of a `repeat` is being
read. It exists because `times` is both an operator and part of a statement,
and it is the only genuine ambiguity in the grammar. SPEC.md §9.2.

---

## 4. Back end: the interpreter

### values.ts

Six kinds of value and the operations that are shared by everything that
handles one: naming a type inside a sentence, printing, structural equality,
number formatting.

`Callable` is declared here rather than in `interpreter.ts` so that
`builtins.ts` does not have to depend on the interpreter — which would be a
cycle, since the interpreter installs the builtins.

### environment.ts

A chain of maps: each block gets one, whose parent is the block around it.
Lookup walks outwards.

The two operations are deliberately distinct — `define()` introduces a name
here, `assign()` updates the nearest existing one. That is what makes `change
totl to 5` reportable instead of silently creating a second variable, and it
is the whole of the project's semantic analysis.

### interpreter.ts

A recursive walk. Three things worth knowing:

**Control flow uses exceptions.** `give back`, `stop` and `skip` all have to
unwind an arbitrary depth of recursive `evaluate()` calls. Throwing a private
signal object is the standard way to do that in a tree-walker; the signals are
module-private classes, so they can never be mistaken for errors.

**Types are checked at the point of use.** Every failure names which side was
wrong and what kind it was, and where possible suggests the fix.

**There is a step budget.** The playground runs whatever is typed into it, so
an accidental endless loop has to end in a message rather than a frozen tab.
`maxSteps` counts statements; `maxDepth` catches runaway recursion before the
JavaScript stack does, which is what makes that error reportable at all.

### builtins.ts

Every built-in is an ordinary `Callable` living in the outermost scope, so
`uppercase(name)` and a user's own definition go through exactly the same
path — and a program can shadow a built-in, because there are no privileged
names.

---

## 5. Back end: WebAssembly

Three files, because the lowering and the two output formats are genuinely
separate problems.

### wasm/ir.ts

A low-level IR: per function, a list of parameters, locals, and instructions,
with names already resolved and control flow already in WebAssembly's
structured `block`/`loop`/`br` form.

Having a real IR here is what lets one code generator feed two emitters that
agree by construction. Without it, the text and binary emitters would each
re-derive the lowering and could drift apart.

### wasm/compiler.ts

AST → IR. Three problems have to be solved on the way down:

**Types.** WebAssembly has no boolean and no dynamic type. Everything becomes
an `f64`; `yes`/`no` become `1`/`0`. Comparisons produce an `i32`, so they are
widened with `f64.convert_i32_u` whenever the result is used as a value rather
than as a condition.

**Scopes.** WebAssembly locals are flat across a whole function, but
Stickynight blocks shadow. Names are alpha-renamed: a `set` inside a loop that
reuses an outer name gets its own slot (`total~1`), so the compiled program
keeps the interpreter's scoping exactly. A `set` of a name already bound *in
the same scope* reuses the slot, which is what makes `set` twice in one block
update one variable.

**Branch depths.** `br` takes the number of enclosing labels to jump out of,
so `stop` inside two `if`s inside a loop is a different number from `stop`
written directly in the loop body. The generator tracks the label depth as it
walks and subtracts.

Every loop is lowered to the same three-layer shape, which is what makes
`stop` and `skip` uniform across all three loop forms:

```wat
block $break          ;; `stop` jumps out of this
  loop $again
    <condition>  br_if $break when it is false
    block $next       ;; `skip` jumps out of this
      <body>
    end
    <step>            ;; runs even after a `skip` — that is the point
    br $again
  end
end
```

`f64` has no remainder instruction, so `a mod b` is built by hand as
`a - b * trunc(a / b)` using two scratch locals.

`and` and `or` lower to `if (result i32)` rather than `i32.and`/`i32.or`, so
that they short-circuit exactly as the interpreter does.

### wasm/wat.ts and wasm/binary.ts

Two walks over the same IR.

The text emitter prints branches with both their label and their numeric depth
(`br 2 (;break;)`), because the number is what goes into the binary and seeing
the two together is the quickest way to check the depth arithmetic.

The binary emitter writes the format directly: the magic number, then numbered
sections, each a length-prefixed vector, with integers in LEB128. The roadmap
only asked for text, but a code generator that has never been executed has not
really been tested — the binary is what lets `tests/wasm.test.ts` run the
compiled output and compare it with the interpreter's.

---

## 6. Hosts

`src/stickynight.ts` is the only module a host imports. It exposes one function
per stage plus `runSource`, which returns errors rather than throwing them,
because every host renders them differently.

* **`cli.ts` / `repl.ts`** — the command line. The only modules that touch
  `fs` and `readline`, which is why the bundler leaves them out automatically.
* **`playground/`** — `scripts/bundle.mjs` walks the module graph from
  `stickynight.ts`, wraps each compiled CommonJS module in a function, and
  gives them a twenty-line `require`. Nothing is reimplemented for the web;
  the browser runs the same compiler the tests do.
* **`tests/`** — 308 tests over six files.

---

## 7. Why CommonJS

The project compiles to CommonJS rather than ES modules. Node runs it with no
`type` field, no loader flags and no file-extension rules to get right, and
the browser bundle becomes a twenty-line module registry instead of a
dependency on a bundler.

The cost is that the source cannot use top-level `await`. Nothing here needs
it — the one asynchronous function, instantiating a WebAssembly module,
returns a promise like anything else.
