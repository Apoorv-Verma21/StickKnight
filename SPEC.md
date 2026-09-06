# Stickynight — Language Specification

Version 1.0 · the Day 1 deliverable of the compiler design project, kept up to
date with the implementation.

This document defines the language. It is the contract that `src/lexer.ts`,
`src/parser.ts`, `src/interpreter.ts` and `src/wasm/compiler.ts` are all
written against, and every rule in it is covered by a test in `tests/`.

---

## 1. What Stickynight is

Stickynight is a small, dynamically typed language whose syntax is made of
English phrases rather than symbols. It has no braces, no semicolons and no
symbolic comparison operators. Blocks are marked by indentation.

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

Source files use the extension `.sn` and are read as UTF-8.

### 1.1 Design principles

Every rule in this document follows from four commitments, in this order of
priority:

1. **A line should read like an instruction.** If a rule would make a program
   read less like something you could say out loud, it needs a strong reason.
2. **A mistake should be explained, not merely detected.** Wherever the
   language rejects something, it must be possible to say what was probably
   meant. This is why symbolic operators are rejected explicitly (§3.7) rather
   than just being unknown characters.
3. **There should be one obvious way to write a thing.** The few places with
   two spellings (`+` and `plus`, `yes` and `true`) exist because both were
   already familiar to the intended reader, not for variety.
4. **No concept before it is needed.** There is one number type, not four. A
   list index starts at 1. Nothing about the machine leaks into the language.

Where these conflict with brevity, brevity loses.

---

## 2. Program structure

A program is a sequence of statements, one per line. There is no `main`; the
top level runs from the first line to the last.

Blocks are introduced by a line ending in `:` and are made of the lines
indented underneath it.

```stickynight
if raining:
    say "take an umbrella"
    say "and a coat"
say "goodbye"
```

### 2.1 Indentation

* Indentation is **spaces only**. A tab is a lexical error with a message
  saying so. Four spaces per level is the convention; any consistent width
  works.
* An indented line must line up with the block it belongs to. A line that
  matches no open block is a lexical error naming the columns it could have
  matched.
* **Blank lines and comment-only lines are invisible.** They never open or
  close a block, so a blank line may be used freely inside one.
* Every block still open at the end of the file is closed automatically.

Internally the lexer turns indentation into `INDENT` and `DEDENT` tokens
(§9.1), so the parser sees explicit block delimiters and never looks at
columns.

### 2.2 Line continuation

A statement normally ends at the end of the line. Inside brackets it does not,
so a long condition may be split:

```stickynight
if (score is at least 50
    and attendance is at least 75):
    say "pass"
```

### 2.3 Comments

`#` begins a comment that runs to the end of the line. There is no block
comment form.

---

## 3. Lexical structure

### 3.1 Keywords

There are 47 reserved words. They are always lowercase; a word that matches a
keyword except for its capitals is rejected with a message saying so, rather
than being quietly treated as a variable name.

```
add     and     at      back    by      change  define  divided each
empty   equal   false   for     from    give    greater if      in
is      item    least   length  less    list    minus   mod     more
no      not     nothing of      or      otherwise plus   repeat say
set     skip    stop    than    times   to      true    while   with
yes
```

A keyword cannot be used as a name. Doing so is a syntax error that says which
keyword was in the way.

### 3.2 Names

```ebnf
IDENTIFIER = ( letter | "_" ) { letter | digit | "_" } ;
```

Names are case-sensitive. `total`, `my_score2` and `_hidden` are all valid.

### 3.3 Numbers

```ebnf
NUMBER = digit { digit } [ "." digit { digit } ] ;
```

There is one numeric type. `2` and `2.0` are the same value. A dot with no
digit after it (`12.`) is rejected at the point it is read, because the message
available there is much better than one from the parser later.

### 3.4 Text

```ebnf
TEXT   = '"' { character | escape } '"' ;
escape = "\" ( "n" | "t" | '"' | "\" ) ;
```

Double quotes only. A newline inside text is an error blamed on the line where
the text *started*, since the usual cause is a forgotten closing quote.

### 3.5 Truth values and nothing

`yes` and `no` are the two truth values; `true` and `false` are accepted
spellings of them. `nothing` is the absence of a value, and is what a
definition produces when it does not say `give back`.

### 3.6 Operators

| Written | Also written | Meaning |
| --- | --- | --- |
| `plus` | `+` | add, or join text/lists |
| `minus` | `-` | subtract, or negate |
| `times` | `*` | multiply |
| `divided by` | `/` | divide |
| `mod` | `%` | remainder |
| `is` | `is equal to` | equal |
| `is not` | `is not equal to` | not equal |
| `is at least` | | greater than or equal |
| `is at most` | | less than or equal |
| `is more than` | `is greater than` | greater than |
| `is less than` | | less than |
| `and`, `or`, `not` | | logic |

### 3.7 Characters that are deliberately not part of the language

`> < >= <= == != && || ! = ; { } [ ]` are all rejected by the lexer with a
message naming the phrase to use instead. This is a feature, not an oversight:
the characters a programmer arriving from C or Python reaches for first are
exactly the ones where good advice is possible.

```
Lexical error in demo.sn, line 3:

   2 | set age to 20
   3 | if age >= 18:
     |        ^^

  '>=' is not part of Stickynight.
  hint: Write 'is at least', as in: if score is at least 90:
```

---

## 4. Grammar

Written in EBNF. `{ x }` is zero or more, `[ x ]` is optional, `|` is
alternation. `NEWLINE`, `INDENT` and `DEDENT` are produced by the lexer and do
not appear in the source text.

The same grammar is in `docs/GRAMMAR.ebnf` on its own, and each non-terminal
below has a method of the same name in `src/parser.ts`.

```ebnf
program         = { statement } EOF ;

statement       = set_stmt | change_stmt | say_stmt | add_stmt
                | if_stmt | repeat_stmt | for_each_stmt | define_stmt
                | return_stmt | stop_stmt | skip_stmt | expression_stmt ;

set_stmt        = "set" IDENTIFIER "to" expression NEWLINE ;
change_stmt     = "change" ( IDENTIFIER | index_expr ) "to" expression NEWLINE ;
say_stmt        = "say" expression NEWLINE ;
add_stmt        = "add" expression "to" expression NEWLINE ;

if_stmt         = "if" expression block
                  { "otherwise" "if" expression block }
                  [ "otherwise" block ] ;

repeat_stmt     = "repeat" count "times" block
                | "repeat" "with" IDENTIFIER "from" expression
                           "to" expression [ "by" expression ] block
                | "repeat" "while" expression block ;

for_each_stmt   = "for" "each" IDENTIFIER "in" expression block ;

define_stmt     = "define" IDENTIFIER
                  [ "with" IDENTIFIER { "," IDENTIFIER } ] block ;

return_stmt     = "give" "back" [ expression ] NEWLINE ;
stop_stmt       = "stop" NEWLINE ;
skip_stmt       = "skip" NEWLINE ;
expression_stmt = expression NEWLINE ;

block           = ":" NEWLINE INDENT statement { statement } DEDENT
                | ":" statement ;

(* count is an expression in which the word 'times' is not an operator,
   because the trailing 'times' belongs to the repeat. See section 9.2. *)
count           = expression ;

expression      = or_expr ;
or_expr         = and_expr { "or" and_expr } ;
and_expr        = not_expr { "and" not_expr } ;
not_expr        = "not" not_expr | comparison ;
comparison      = term { compare_phrase term } ;

compare_phrase  = "is" [ "not" [ "equal" "to" ]
                       | "at" ( "least" | "most" )
                       | ( "more" | "greater" ) "than"
                       | "less" "than"
                       | "equal" "to" ] ;

term            = factor { ( "+" | "plus" | "-" | "minus" ) factor } ;
factor          = unary { ( "*" | "times" | "/" | "divided" "by"
                          | "%" | "mod" ) unary } ;
unary           = ( "-" | "minus" ) unary | postfix ;
postfix         = primary { "(" [ arguments ] ")" } ;
arguments       = expression { "," expression } ;

primary         = NUMBER | TEXT
                | "yes" | "no" | "true" | "false" | "nothing"
                | IDENTIFIER
                | "(" expression ")"
                | "list" "of" expression { "," expression }
                | "empty" "list"
                | index_expr
                | "length" "of" postfix
                | "length" ;

index_expr      = "item" expression "of" postfix ;
```

### 4.1 Precedence

Loosest to tightest:

| | Level | Associativity |
| --- | --- | --- |
| 1 | `or` | left |
| 2 | `and` | left |
| 3 | `not` | prefix |
| 4 | comparisons | left |
| 5 | `+` `-` | left |
| 6 | `*` `/` `mod` | left |
| 7 | unary `-` | prefix |
| 8 | calls `f(...)` | postfix |
| 9 | literals, names, brackets, `list of`, `item ... of`, `length of` | |

`not` sits *below* comparison on purpose, so `not score is 10` means
`not (score is 10)` — the reading an English speaker expects.

---

## 5. Statements

### 5.1 `set` and `change`

```stickynight
set total to 0
change total to total + 1
change item 2 of scores to 99
```

`set` **introduces** a name in the current block. `change` **updates** a name
that already exists, looking outwards through the enclosing blocks.

Keeping the two apart is what makes a mistyped name reportable. In a language
where assignment also creates, `change totl to 5` quietly makes a second
variable and the bug appears somewhere else entirely.

### 5.2 `say`

```stickynight
say "Hello"
say 2 + 2
say scores
```

Prints one line. §7.4 gives the printed form of each kind of value.

### 5.3 `if` / `otherwise if` / `otherwise`

```stickynight
if score is at least 90:
    say "A"
otherwise if score is at least 50:
    say "pass"
otherwise:
    say "try again"
```

The condition must be a truth value. A number is not a condition (§7.3).

`otherwise if` and `otherwise` line up with their `if`, at the same
indentation. An `otherwise` with no `if` above it is a syntax error.

### 5.4 The three `repeat` forms and `for each`

```stickynight
repeat 3 times:                      # a fixed number of turns
repeat with i from 1 to 10:          # counting, both ends included
repeat with i from 10 to 1 by -1:    # counting downwards
repeat while total is less than 100: # until a condition stops holding
for each name in names:              # every item of a list, or of text
```

* `repeat N times` needs a whole number that is not negative.
* `from a to b` **includes both ends**: `from 1 to 3` runs three times.
* Without `by`, the step is `1` when `a <= b` and `-1` otherwise, so counting
  down needs no special syntax.
* `by 0` is an error, since the loop could never finish.
* `for each` iterates a **snapshot**, so adding to the list inside the loop is
  safe and cannot make it run forever.

`stop` leaves the innermost loop. `skip` moves on to its next turn.

### 5.5 `define` and `give back`

```stickynight
define greet with name:
    give back "Hello, " + name

define shout:
    say "HEY"
```

* Inputs are named after `with`, separated by commas. Listing the same name
  twice is a syntax error.
* `give back` sends a value out. A definition that finishes without one
  produces `nothing`.
* **Definitions are hoisted**: every `define` in a block is available
  throughout that block, so a program can call a helper written further down
  the file and be read top to bottom.
* Definitions are ordinary values. They can be stored in a name, passed as an
  input, and returned — and they keep hold of the scope they were written in,
  which is what makes closures work (§6.2).

### 5.6 Lists

```stickynight
set scores to list of 88, 92, 41
set empty to empty list
add 67 to scores
say item 1 of scores          # positions start at 1
say length of scores
change item 2 of scores to 99
```

---

## 6. Names and scope

### 6.1 The scope chain

Every block gets a scope whose parent is the block around it. Looking up a name
walks outwards until it is found; failing that is a runtime error that
suggests the closest name in scope.

```stickynight
set x to 1
if yes:
    set x to 2      # a new x, inside the if
    say x           # 2
say x               # 1 — the outer x was never touched

if yes:
    change x to 3   # reaches outwards to the existing x
say x               # 3
```

### 6.2 Closures

A definition captures the scope it was written in, not the scope it is called
from.

```stickynight
define make_counter:
    set count to 0
    define step:
        change count to count + 1
        give back count
    give back step

set tick to make_counter()
say tick()        # 1
say tick()        # 2
say make_counter()()   # 1 — a separate counter, with its own count
```

### 6.3 Built-ins

The built-ins listed in §8 live in the outermost scope, so a program may
define its own `uppercase` and shadow the built-in one. There are no
privileged names.

---

## 7. Values

### 7.1 The six kinds

| Kind | Examples | Notes |
| --- | --- | --- |
| number | `42`, `3.5`, `-1` | one type; IEEE-754 double |
| text | `"hello"` | |
| truth | `yes`, `no` | |
| list | `list of 1, 2`, `empty list` | ordered, may mix kinds |
| definition | anything from `define`, plus built-ins | |
| nothing | `nothing` | |

`type_of(v)` gives the kind as text.

### 7.2 What each operator accepts

* `+` — two numbers add; two lists join; **if either side is text, the two are
  joined as text**. That last rule is the one place the language converts a
  value for you, and it exists because `say "Score: " + score` is the first
  line half of all beginners write.
* `-` `*` `/` `mod` — numbers only. Anything else is an error naming which
  side was wrong and what kind it was.
* `/` by zero and `mod` by zero are errors, not infinity or "not a number".
* `is` / `is not` — any two values. Lists compare by their contents.
* `is at least` / `is at most` / `is more than` / `is less than` — two numbers,
  or two pieces of text (dictionary order). Comparing a number with text is an
  error rather than a silent conversion.
* `and` / `or` / `not` — truth values only, and `and`/`or` short-circuit.

### 7.3 Truthiness

**There is none.** Only `yes` and `no` can be conditions. `0`, `""` and
`empty list` are not "false" — using one as a condition is an error that
suggests the comparison that was probably meant.

Inheriting C's truthiness would trade a clear message for a silent wrong
answer, in a language whose whole point is that mistakes are explicable.

### 7.4 How values print

| Value | `say` prints |
| --- | --- |
| `42`, `4 / 2` | `42`, `2` — whole numbers have no decimal point |
| `0.1 + 0.2` | `0.3` — see below |
| `yes` | `yes` |
| `nothing` | `nothing` |
| `list of 1, 2` | `list of 1, 2` — the same shape it is written in |
| `empty list` | `empty list` |

Numbers are rounded to twelve significant digits **for display only**. The
stored value is untouched; nothing about the arithmetic changes. Without this,
`0.1 + 0.2` prints `0.30000000000000004`, which is a distraction for a reader
meeting arithmetic for the first time.

### 7.5 Lists are shared

A list is passed by reference: two names can refer to the same list, and
`add`ing through one is visible through the other. `copy(list)` makes a
separate one.

---

## 8. Built-in definitions

| Name | Inputs | What it does |
| --- | --- | --- |
| `text` | 1 | any value as text |
| `number` | 1 | text like `"42"` as a number |
| `type_of` | 1 | the kind of a value, as text |
| `length` | 1 | characters in text, or items in a list |
| `uppercase`, `lowercase`, `trim` | 1 | text |
| `characters` | 1 | text as a list of single characters |
| `split` | 2 | text cut at a separator |
| `join` | 2 | a list glued into text |
| `round` | 1 or 2 | nearest whole number, or to N decimal places |
| `floor`, `ceiling`, `absolute`, `square_root` | 1 | numbers |
| `minimum`, `maximum` | 1+ | smallest / largest of several numbers or a list |
| `random` | 0 | a number from 0 up to 1 |
| `random_between` | 2 | a whole number between two, both included |
| `sum` | 1 | every number in a list added up |
| `sort`, `reverse`, `copy` | 1 | a new list |
| `contains` | 2 | is a value in a list, or text inside text |
| `position_of` | 2 | where a value sits, counting from 1; `0` if absent |

`length` may be written either way: `length of scores` and `length(scores)`
mean the same thing.

---

## 9. Design decisions, and what they cost

The rest of this document is the reasoning behind the choices that were not
obvious. These are the questions worth being able to answer about the language.

### 9.1 Indentation instead of braces

Braces make block structure explicit for the parser and invisible to the
reader, who is going to indent the code anyway. Removing them costs one piece
of machinery — the lexer keeps a stack of indentation columns and emits
`INDENT`/`DEDENT` tokens where they change — and after that the parser is
exactly the parser a brace language would have.

The cost is real: indentation is now significant whitespace, so a stray space
is an error, and tabs have to be banned outright to keep a block looking the
same in every editor. Both are paid for with a specific error message rather
than a mysterious one.

### 9.2 Multi-word operators are resolved in the parser, not the lexer

`is at least` arrives as three separate tokens, `IS AT LEAST`, and
`comparison()` folds them into one operator.

The alternative — having the lexer greedily merge word runs — would make the
scanner context-sensitive: it would need to know that the `at` in `is at
least` is part of an operator while an `at` elsewhere is not, and it would need
to back up when a run turns out not to be a phrase. Keeping the fold in the
parser means the lexer stays a pure character-level machine with no lookahead
beyond one character, and the phrases are still decided with fixed lookahead —
no backtracking anywhere.

There is one genuine ambiguity, and it is worth knowing about:

> `times` is both the multiply operator (`3 times 4`) and part of the count
> loop (`repeat 3 times:`). In `repeat n times:`, is `n times` the start of a
> multiplication?

It is resolved by suppressing `times` as an operator while, and only while, the
count of a `repeat` is being read. Because `*` is a *different token* from
`times`, `repeat rows * cols times:` still works — which is how the language
keeps an escape hatch for the case the rule takes away.

### 9.3 Positions start at 1

`item 1 of scores` is the first item. Counting from zero exists because of how
array addresses are computed, which is a fact about machines, not about lists.
The cost is one subtraction in the interpreter; the benefit is that nobody has
to be told about off-by-one before they can print a list.

### 9.4 `list of` takes every comma after it

`list of 1, 2, 3` is greedy: it takes items until the expression ends. So a
list written straight inside a call swallows the commas meant to separate the
inputs:

```stickynight
say join(list of "a", "b", ", ")     # ONE input, not two
say join((list of "a", "b"), ", ")   # correct
```

The alternative — stopping at the first comma inside a call — makes
`f(list of 1, 2)` mean "the list of 1, and also 2", which is worse. The greedy
reading is the natural one, so it is kept and the mistake is caught with a
message that explains exactly this.

### 9.5 `set` and `change` are different words

See §5.1. The cost is one extra keyword; the benefit is that a mistyped name
is always caught.

### 9.6 No truthiness

See §7.3.

### 9.7 Symbols kept, symbols dropped

Arithmetic symbols (`+ - * / %`) are kept because they are learned in school
long before programming. Comparison symbols (`>= == && !`) are dropped because
they are not — `>=` has to be taught, `is at least` does not. Both spellings
of the arithmetic operators produce the same token, so the parser has one rule
per operator either way.

---

## 10. Errors

Every stage — lexer, parser, interpreter and the WebAssembly back end —
reports in the same shape:

```
<Stage> error in <file>, line <n>:

   <n-1> | <the line before, for orientation>
   <n>   | <the line with the problem>
         |        ^^^^

  <what went wrong, in a sentence>
  hint: <what to do about it>
```

Runtime errors also print the call stack.

The convention the four stages agreed on is: say what the program said, say
what was expected instead, and — where it can be guessed — say how to fix it,
using no word the reader has not already met in this document.

The parser does not stop at the first mistake. `stickynight --check file.sn`
reports every broken statement in one pass, using panic-mode recovery:
the error is recorded, tokens are discarded until a line that could begin a
statement, and parsing continues.

---

## 11. Two back ends

The AST is consumed by both the interpreter and the WebAssembly code
generator. The interpreter runs the whole language. The code generator handles
the numeric subset, and the differences are deliberate:

| | Interpreter | WebAssembly back end |
| --- | --- | --- |
| numbers, arithmetic, comparisons | yes | yes |
| `if` / `otherwise`, all loops, `stop`, `skip` | yes | yes |
| `define`, `give back`, recursion | yes | yes |
| text, lists, `for each`, `add` | yes | **no** — reported, with the line |
| definitions inside definitions | yes | **no** |
| built-ins | all of §8 | the numeric ones that are one instruction |
| `say yes` prints | `yes` | `1` — WebAssembly has no truth type |

Compiling text and lists needs a heap and a value representation, which is a
project of its own. A program that uses them gets a message naming the feature
and pointing back at the interpreter.

---

## 12. Worked examples

### 12.1 Grades

```stickynight
define classify with score:
    if score is at least 90:
        give back "A"
    otherwise if score is at least 75:
        give back "B"
    otherwise if score is at least 50:
        give back "C"
    otherwise:
        give back "F"

set results to list of 95, 82, 61, 38
for each mark in results:
    say mark + " -> " + classify(mark)
```

```
95 -> A
82 -> B
61 -> C
38 -> F
```

### 12.2 FizzBuzz

```stickynight
repeat with n from 1 to 20:
    if n mod 15 is 0:
        say "FizzBuzz"
    otherwise if n mod 3 is 0:
        say "Fizz"
    otherwise if n mod 5 is 0:
        say "Buzz"
    otherwise:
        say n
```

### 12.3 Bubble sort

```stickynight
define bubble_sort with values:
    set data to copy(values)
    set n to length of data

    repeat with pass from 1 to n minus 1:
        repeat with i from 1 to n minus pass:
            if item i of data is more than item (i + 1) of data:
                set held to item i of data
                change item i of data to item (i + 1) of data
                change item (i + 1) of data to held

    give back data

say bubble_sort(list of 5, 3, 9, 1, 7, 2)
```

```
list of 1, 2, 3, 5, 7, 9
```

More programs are in `examples/`, and every one of them is run by the test
suite.
