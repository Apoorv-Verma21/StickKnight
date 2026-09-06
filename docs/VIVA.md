# Viva preparation

The questions an examiner is most likely to ask about this project, and honest
answers to them. Anywhere an answer names a file, open it — every claim here
is checkable against the code.

The three things to be able to do without notes:

1. Trace one line of source all the way to output, naming the data structure
   at each step.
2. Defend a design decision that could have gone the other way, including what
   it costs.
3. Say what the project does *not* do, and why.

---

## Part 1 — Trace a program

Have `examples/02-grades.sn` open, and run these three commands.

```bash
node dist/src/cli.js --tokens examples/02-grades.sn
node dist/src/cli.js --ast    examples/02-grades.sn
node dist/src/cli.js          examples/02-grades.sn
```

Take the line `if score is at least 90:`.

**After the lexer** it is nine tokens:

```
IF  IDENTIFIER(score)  IS  AT  LEAST  NUMBER(90)  COLON  NEWLINE  INDENT
```

Two things to point out: the phrase `is at least` is still three separate
tokens, and the `INDENT` at the end is not in the source at all — the lexer
made it from the indentation of the next line.

**After the parser** it is one node:

```
If
├── condition
│   └── Binary is at least
│       ├── Variable score
│       └── Literal 90
├── then
│   └── Return → Literal "A"
└── otherwise
    └── If ...        ← the `otherwise if` chain, nested
```

The three tokens have become one operator, and the `otherwise if` chain has
become a nested `If` in the else branch — which is why the interpreter and the
code generator only ever handle two arms.

**In the interpreter**, `evaluate()` on the `Binary` node evaluates both
sides, checks they are both numbers, and returns a truth value; `execute()` on
the `If` node runs one branch in a new `Environment` whose parent is the one
around it.

---

## Part 2 — Questions about design

### Why indentation instead of braces?

Braces make block structure explicit for the parser and invisible to the
reader, who is going to indent the code anyway. Removing them costs exactly
one piece of machinery: the lexer keeps a stack of indentation columns and
emits `INDENT`/`DEDENT` where they change. After that the parser is the same
parser a brace language would have.

**What it costs:** whitespace is now significant, so a stray space is an
error, and tabs have to be banned outright to keep a block looking the same in
every editor. Both are paid for with a specific message —
`examples/errors/bad-indent.sn` shows one.

### Why are `is at least` and the other phrases resolved in the parser, not the lexer?

If the lexer merged word runs, it would become context-sensitive: it would
need to know that the `at` in `is at least` is part of an operator while an
`at` elsewhere is not, and it would need to back up when a run turns out not
to be a phrase.

Folding in the parser keeps the lexer a pure character-level machine with one
character of lookahead, and the phrases are still decided with **fixed
lookahead and no backtracking** — see `comparison()` and `comparePhrase()` in
`src/parser.ts`.

### Is the grammar ambiguous anywhere?

Once, and it is worth volunteering:

> `times` is both the multiply operator (`3 times 4`) and part of the count
> loop (`repeat 3 times:`). In `repeat n times:`, is `n times` the start of a
> multiplication?

It is resolved by suppressing `times` as an operator while, and only while,
the count of a `repeat` is being read (`timesSuppressed` in `src/parser.ts`).
Because `*` is a *different token* from `times`, `repeat rows * cols times:`
still parses — which is the escape hatch for the case the rule takes away.
There is a test for exactly that in `tests/parser.test.ts`.

### Why does `not` bind looser than comparison?

So that `not score is 10` means `not (score is 10)`, which is how an English
speaker reads it. Python does the same thing for the same reason. Putting
`not` above comparison would make it mean `(not score) is 10`, which is either
a type error or a silent wrong answer.

### Why are `set` and `change` different words?

`set` introduces a name in the current block; `change` updates one that
already exists. Because they are different, `change totl to 5` can be reported
as a mistyped name — with a suggestion, using edit distance over the names in
scope. In a language where assignment also creates, that line silently makes a
second variable and the bug turns up somewhere else entirely.

**What it costs:** one extra keyword, and the reader has to learn the
distinction on day one.

### Why do list positions start at 1?

Counting from zero exists because of how array addresses are computed, which
is a fact about machines rather than about lists. `item 1 of scores` is the
first one. The cost is a single subtraction in `checkIndex()`; the benefit is
that nobody has to be told about off-by-one before they can print a list.

### Why is there no truthiness?

Only `yes` and `no` can be conditions — `0`, `""` and `empty list` are not
"false". Inheriting C's truthiness would trade a clear message for a silent
wrong answer, in a language whose whole point is that mistakes are
explicable. `if count:` produces:

> An 'if' needs a yes/no value to decide with, but it was given a number.
> hint: It was 3. A number is not a condition on its own — compare it, as in:
> if count is more than 0:

### Why keep `+` but reject `>=`?

Arithmetic symbols are learned in school years before programming; comparison
symbols are not. `>=` has to be taught, `is at least` does not. And rejecting
`>=` explicitly is more useful than accepting it, because the rejection can
name the phrase to use instead.

### `"Score: " + 90` works, but `"5" - 1` is an error. Isn't that inconsistent?

It is a deliberate asymmetry. `+` joins whenever either side is text, because
`say "Score: " + score` is the first line half of all beginners write. The
other operators have no such reading — there is nothing `-` could sensibly
mean between text and a number — so they are errors that name the side that
was wrong and suggest `number(...)`.

The general rule: convert where there is exactly one sensible meaning, and
refuse where there is not.

### What is the trade-off you are least happy with?

`list of` is greedy — it takes items until the end of the expression — so a
list written straight inside a call swallows the commas meant to separate the
inputs:

```stickynight
say join(list of "a", "b", ", ")     # ONE input, not two
say join((list of "a", "b"), ", ")   # correct
```

The alternative, stopping at the first comma inside a call, makes
`f(list of 1, 2)` mean "the list of 1, and also 2" — worse. So the greedy
reading is kept and the mistake is caught with a message that explains exactly
this. It is the one place where the syntax being symbol-free costs something
real.

---

## Part 3 — Questions about the implementation

### Which is the intermediate representation?

The AST (`src/ast.ts`). The test of whether something is genuinely an IR is
whether more than one thing consumes it, and here three do: the printer, the
interpreter, and the WebAssembly code generator. None of them knows about the
others.

The WebAssembly back end then lowers the AST to a *second*, lower-level IR
(`src/wasm/ir.ts`) which two emitters consume — the text one and the binary
one. That is why the `.wat` and the `.wasm` cannot drift apart.

### How does `stop` work in a tree-walking interpreter?

By throwing. `stop`, `skip` and `give back` all have to unwind an arbitrary
depth of recursive `evaluate()` calls, and an exception is the mechanism a
host language already has for that. The three signals are module-private
classes in `src/interpreter.ts`, so they can never be confused with an error.

### How does `stop` work in the compiled code?

Differently — WebAssembly has structured control flow, so it becomes a `br`
out of a labelled block. Every loop is lowered to the same three-layer shape:

```wat
block $break          ;; `stop` jumps out of this
  loop $again
    <condition>  br_if $break when false
    block $next       ;; `skip` jumps out of this
      <body>
    end
    <step>            ;; still runs after a `skip` — that is why it is here
    br $again
  end
end
```

The `block $next` layer is the interesting one: without it, `skip` would
branch straight back to the top of the loop and miss the increment, and a
counted loop would never finish.

### `br` takes a number. How do you know which number?

`br 2` means "jump out of two enclosing labels", so the number depends on how
deeply nested the `stop` is — `stop` inside two `if`s is a different number
from `stop` in the loop body. The generator carries a `labelDepth` counter,
increments it on entering every `block`, `loop` and `if`, and records for each
loop the depth of its two exits. The branch is then
`currentDepth - targetDepth`. The `.wat` output prints both
(`br 2 (;break;)`) so the arithmetic can be checked by eye.

### WebAssembly locals are flat, but your blocks shadow. How?

Alpha renaming. `declare()` in `src/wasm/compiler.ts` gives a name a fresh
slot when it is introduced in an *inner* scope, so:

```stickynight
define f:
    set x to 1
    if yes:
        set x to 2      ← a different local: $x~1
    give back x         ← still 1
```

A `set` of a name already bound in the *same* scope reuses its slot, which is
what makes `set` twice in one block update one variable. There is a test that
checks `$x~1` appears in the generated `.wat`.

### How do you know the code generator is correct?

`tests/wasm.test.ts` compiles nineteen programs to real `.wasm` bytes, hands
them to the WebAssembly engine built into Node, runs them, and compares the
output against what the interpreter printed for the same source. Two
independently written back ends agreeing on an answer is much stronger
evidence than inspecting either one.

The one deliberate difference: WebAssembly has no truth type, so a compiled
program prints `1` and `0` where the interpreter prints `yes` and `no`. The
test normalises that and says so.

### What can the code generator not do?

Text, lists, `for each`, `add`, and definitions inside definitions. All of
those need a heap and a value representation — a project of its own. A program
using one gets a message naming the feature and pointing back at the
interpreter, which runs the whole language.

This is worth stating first rather than being caught out by: the honest claim
is "a numeric subset compiles and runs", not "the language compiles".

### How do you stop an endless loop in the playground?

A step budget. The interpreter counts statements and stops at `maxSteps` with
"This program is taking too long to finish", and counts call depth separately
so runaway recursion is caught before the JavaScript stack overflows — which
is what makes *that* error reportable at all rather than a crash.

### Does the parser stop at the first error?

`parse()` does. `parseWithRecovery()` does not: it records the error, discards
tokens until a line that could begin a statement, and carries on. That is
panic-mode recovery, and `--check` uses it to report every broken line in one
pass.

### Why no parser generator?

The point of the course is the mechanism. A generator would have produced the
tables and hidden the thing being examined. Recursive descent also gives much
better control over error messages, which is most of this project's value —
a generated parser reports "syntax error at token 47", not "I expected 'least'
or 'most' after 'at'".

---

## Part 4 — Questions about the process

### How did two people work on a sequential pipeline at the same time?

Split by pipeline half, not by day. Day 1 was joint and produced the two type
contracts — `src/token.ts` and `src/ast.ts` — that both halves build against.

The back-end track then developed the whole parser against
`src/dev/mock-tokens.ts`, a token stream typed out by hand from the agreed
`Token` type, while the front-end track was still writing the scanner. When
both were ready, the mock was swapped for the real lexer.

`tests/integration.test.ts` keeps that honest: it asserts the real lexer still
produces exactly the stream that was agreed on Day 1, so a change to the lexer
that breaks the contract fails there rather than somewhere confusing further
down.

### What is the weakest part of the project?

The WebAssembly back end's coverage. It handles the numeric subset
convincingly — recursion, all three loop forms, `stop`/`skip`, shadowing — but
anything with text or lists is refused. Making it complete means designing a
heap layout and a value representation, which is where the next fortnight
would go.

Second weakest: there is no separate semantic analysis pass. Undefined names
and arity are checked at run time, so a mistake on a branch that never runs is
never reported. A resolver pass walking the AST before execution would catch
those statically, and the AST is already in the right shape for one.

### What would you do next?

1. A resolver pass, for the reason above.
2. A heap for the WebAssembly back end, so text and lists compile.
3. Better recovery inside a *statement*, not just between statements — at the
   moment one bad expression discards the whole line.
