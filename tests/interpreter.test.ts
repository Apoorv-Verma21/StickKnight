/**
 * tests/interpreter.test.ts — the semantics.
 *
 * Everything is checked by running a program and reading what it printed,
 * which is the only thing a user of the language can actually observe.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { runSource } from "../src/stickynight";

/** Run a program and return its printed lines, failing on any error. */
function run(source: string): string[] {
  const result = runSource(source, { maxSteps: 2_000_000 });
  if (result.error) {
    assert.fail(`${result.error.short()}\n${result.error.format(source)}`);
  }
  return result.output;
}

/** Run a program that is expected to fail, and return the error. */
function fails(source: string) {
  const result = runSource(source, { maxSteps: 200_000 });
  assert.ok(result.error, `expected this program to fail:\n${source}`);
  return result.error!;
}

/** Run a single expression and return what `say` printed. */
function value(expression: string): string {
  const output = run(`say ${expression}\n`);
  assert.equal(output.length, 1);
  return output[0];
}

describe("interpreter: values and printing", () => {
  it("prints whole numbers without a decimal point", () => {
    assert.equal(value("4 / 2"), "2");
  });

  it("hides floating-point noise when printing", () => {
    assert.equal(value("0.1 + 0.2"), "0.3");
  });

  it("prints yes and no rather than true and false", () => {
    assert.equal(value("1 is 1"), "yes");
    assert.equal(value("1 is 2"), "no");
  });

  it("prints nothing as 'nothing'", () => {
    assert.equal(value("nothing"), "nothing");
  });

  it("prints a list the way it is written", () => {
    assert.equal(value("list of 1, 2, 3"), "list of 1, 2, 3");
    assert.equal(value("empty list"), "empty list");
  });
});

describe("interpreter: arithmetic and text", () => {
  it("does the usual arithmetic", () => {
    assert.equal(value("2 + 3 * 4"), "14");
    assert.equal(value("(2 + 3) * 4"), "20");
    assert.equal(value("7 mod 3"), "1");
    assert.equal(value("10 divided by 4"), "2.5");
    assert.equal(value("-5 + 2"), "-3");
  });

  it("joins text with '+'", () => {
    assert.equal(value('"a" + "b"'), "ab");
  });

  it("joins text to a number, because that is what beginners write first", () => {
    assert.equal(value('"Score: " + 90'), "Score: 90");
    assert.equal(value('90 + " points"'), "90 points");
  });

  it("joins two lists with '+'", () => {
    assert.equal(value("(list of 1, 2) + (list of 3)"), "list of 1, 2, 3");
  });

  it("compares text in dictionary order", () => {
    assert.equal(value('"apple" is less than "banana"'), "yes");
  });

  it("compares lists by their contents", () => {
    assert.equal(value("(list of 1, 2) is (list of 1, 2)"), "yes");
    assert.equal(value("(list of 1, 2) is (list of 2, 1)"), "no");
  });
});

describe("interpreter: conditions", () => {
  it("runs the branch that matches", () => {
    const source = [
      "set score to 82",
      "if score is at least 90:",
      '    say "A"',
      "otherwise if score is at least 75:",
      '    say "B"',
      "otherwise:",
      '    say "C"',
      "",
    ].join("\n");
    assert.deepEqual(run(source), ["B"]);
  });

  it("short-circuits 'and' so the right side is not even looked at", () => {
    const source = [
      "define boom:",
      "    say \"this should not run\"",
      "    give back yes",
      "if no and boom():",
      "    say \"nor this\"",
      'say "done"',
      "",
    ].join("\n");
    assert.deepEqual(run(source), ["done"]);
  });

  it("short-circuits 'or' the same way", () => {
    const source = [
      "define boom:",
      "    say \"this should not run\"",
      "    give back no",
      "if yes or boom():",
      '    say "chosen"',
      "",
    ].join("\n");
    assert.deepEqual(run(source), ["chosen"]);
  });

  it("refuses a number as a condition", () => {
    const error = fails("if 1:\n    say 1\n");
    assert.match(error.message, /yes\/no value/);
  });
});

describe("interpreter: loops", () => {
  it("counts up and down, and by a step", () => {
    assert.deepEqual(run("repeat with i from 1 to 3:\n    say i\n"), ["1", "2", "3"]);
    assert.deepEqual(run("repeat with i from 3 to 1:\n    say i\n"), ["3", "2", "1"]);
    assert.deepEqual(run("repeat with i from 0 to 6 by 3:\n    say i\n"), ["0", "3", "6"]);
  });

  it("includes both ends of the range", () => {
    assert.equal(run("repeat with i from 1 to 5:\n    say i\n").length, 5);
  });

  it("repeats a fixed number of times", () => {
    assert.deepEqual(run('repeat 2 times:\n    say "x"\n'), ["x", "x"]);
  });

  it("repeats while a condition holds", () => {
    const source = ["set n to 1", "repeat while n is less than 10:", "    change n to n times 3", "say n", ""].join("\n");
    assert.deepEqual(run(source), ["27"]);
  });

  it("walks a list and a piece of text", () => {
    assert.deepEqual(run("for each x in list of 1, 2:\n    say x\n"), ["1", "2"]);
    assert.deepEqual(run('for each c in "ab":\n    say c\n'), ["a", "b"]);
  });

  it("leaves the loop on 'stop'", () => {
    const source = ["repeat with i from 1 to 10:", "    if i is 3:", "        stop", "    say i", ""].join("\n");
    assert.deepEqual(run(source), ["1", "2"]);
  });

  it("moves to the next turn on 'skip'", () => {
    const source = ["repeat with i from 1 to 4:", "    if i mod 2 is 1:", "        skip", "    say i", ""].join("\n");
    assert.deepEqual(run(source), ["2", "4"]);
  });

  it("stops only the innermost loop", () => {
    const source = [
      "repeat with i from 1 to 2:",
      "    repeat with j from 1 to 5:",
      "        if j is 2:",
      "            stop",
      "        say i + j",
      "",
    ].join("\n");
    assert.deepEqual(run(source), ["2", "3"]);
  });

  it("refuses to count by zero", () => {
    assert.match(
      fails("repeat with i from 1 to 5 by 0:\n    say i\n").message,
      /never finish/
    );
  });

  it("iterates a snapshot, so adding inside the loop is safe", () => {
    const source = [
      "set xs to list of 1, 2",
      "for each x in xs:",
      "    add x to xs",
      "say length of xs",
      "",
    ].join("\n");
    assert.deepEqual(run(source), ["4"]);
  });
});

describe("interpreter: definitions and scope", () => {
  it("gives a value back", () => {
    assert.deepEqual(run("define double with x:\n    give back x times 2\nsay double(4)\n"), ["8"]);
  });

  it("gives back 'nothing' when it never says so", () => {
    assert.deepEqual(run('define f:\n    say "side effect"\nsay f()\n'), [
      "side effect",
      "nothing",
    ]);
  });

  it("can be called before it is written, because definitions are hoisted", () => {
    assert.deepEqual(run("say later()\ndefine later:\n    give back 7\n"), ["7"]);
  });

  it("recurses", () => {
    const source = [
      "define factorial with n:",
      "    if n is at most 1:",
      "        give back 1",
      "    give back n times factorial(n minus 1)",
      "say factorial(6)",
      "",
    ].join("\n");
    assert.deepEqual(run(source), ["720"]);
  });

  it("keeps hold of the names around it — closures", () => {
    const source = [
      "define make_counter:",
      "    set count to 0",
      "    define step:",
      "        change count to count + 1",
      "        give back count",
      "    give back step",
      "set a to make_counter()",
      "set b to make_counter()",
      "say a()",
      "say a()",
      "say b()",
      "",
    ].join("\n");
    assert.deepEqual(run(source), ["1", "2", "1"]);
  });

  it("passes a definition around as an ordinary value", () => {
    const source = [
      "define twice with f, x:",
      "    give back f(f(x))",
      "define add_one with n:",
      "    give back n + 1",
      "say twice(add_one, 5)",
      "",
    ].join("\n");
    assert.deepEqual(run(source), ["7"]);
  });

  it("shadows an outer name inside a block, and restores it after", () => {
    const source = [
      "set x to 1",
      "if yes:",
      "    set x to 2",
      "    say x",
      "say x",
      "",
    ].join("\n");
    assert.deepEqual(run(source), ["2", "1"]);
  });

  it("reaches outwards with 'change', rather than making a second name", () => {
    const source = ["set x to 1", "if yes:", "    change x to 2", "say x", ""].join("\n");
    assert.deepEqual(run(source), ["2"]);
  });

  it("refuses to change a name that does not exist", () => {
    const error = fails("change nowhere to 1\n");
    assert.match(error.message, /do not know anything called 'nowhere'/);
  });

  it("suggests a near-miss name", () => {
    const error = fails("set total to 1\nsay totl\n");
    assert.match(error.hint ?? "", /Did you mean 'total'/);
  });
});

describe("interpreter: lists", () => {
  it("counts positions from 1", () => {
    assert.equal(value("item 1 of list of 10, 20"), "10");
    assert.equal(value("item 2 of list of 10, 20"), "20");
  });

  it("indexes text as well as lists", () => {
    assert.equal(value('item 1 of "abc"'), "a");
  });

  it("adds to a list and replaces an item", () => {
    const source = [
      "set xs to empty list",
      "add 1 to xs",
      "add 2 to xs",
      "change item 1 of xs to 9",
      "say xs",
      "",
    ].join("\n");
    assert.deepEqual(run(source), ["list of 9, 2"]);
  });

  it("reports a position that is not there", () => {
    const error = fails("say item 5 of list of 1, 2\n");
    assert.match(error.message, /only has 2 items/);
    assert.match(error.hint ?? "", /1 to 2/);
  });

  it("explains that positions start at 1", () => {
    assert.match(fails("say item 0 of list of 1\n").hint ?? "", /start at 1/);
  });
});

describe("interpreter: built-ins", () => {
  it("converts between text and numbers", () => {
    assert.equal(value('number("42") + 1'), "43");
    assert.equal(value("text(42) + text(1)"), "421");
  });

  it("measures length two ways", () => {
    assert.equal(value('length of "abc"'), "3");
    assert.equal(value('length("abc")'), "3");
  });

  it("works on text", () => {
    assert.equal(value('uppercase("ab")'), "AB");
    assert.equal(value('trim("  a  ")'), "a");
    assert.equal(value('join((list of "a", "b"), ", ")'), "a, b");
    assert.equal(value('length of split("a,b,c", ",")'), "3");
    assert.equal(value('reverse("abc")'), "cba");
  });

  it("works on numbers", () => {
    assert.equal(value("round(2.5)"), "3");
    assert.equal(value("round(3.14159, 2)"), "3.14");
    assert.equal(value("floor(2.9)"), "2");
    assert.equal(value("ceiling(2.1)"), "3");
    assert.equal(value("absolute(0 - 4)"), "4");
    assert.equal(value("square_root(16)"), "4");
    assert.equal(value("minimum(3, 1, 2)"), "1");
    assert.equal(value("maximum(list of 3, 1, 2)"), "3");
  });

  it("works on lists", () => {
    assert.equal(value("sum(list of 1, 2, 3)"), "6");
    assert.equal(value("sort(list of 3, 1, 2)"), "list of 1, 2, 3");
    assert.equal(value("reverse(list of 1, 2)"), "list of 2, 1");
    assert.equal(value("contains((list of 1, 2), 2)"), "yes");
    assert.equal(value("position_of(2, (list of 1, 2, 3))"), "2");
    assert.equal(value("position_of(9, (list of 1, 2))"), "0");
    assert.equal(value("type_of(1)"), "number");
  });

  it("keeps a copy separate from the original", () => {
    const source = [
      "set a to list of 1, 2",
      "set b to copy(a)",
      "change item 1 of b to 9",
      "say a",
      "say b",
      "",
    ].join("\n");
    assert.deepEqual(run(source), ["list of 1, 2", "list of 9, 2"]);
  });

  it("explains why a bare 'list of' inside a call counted as one input", () => {
    const error = fails('say join(list of "a", "b", ", ")\n');
    assert.match(error.message, /needs 2 inputs, but it was given 1/);
    assert.match(error.hint ?? "", /takes every comma that follows it/);
    assert.match(error.hint ?? "", /Put brackets round the list/);
  });

  it("says which input was wrong", () => {
    const error = fails("say uppercase(1)\n");
    assert.match(error.message, /1st input to 'uppercase' has to be some text/);
  });

  it("checks how many inputs it was given", () => {
    assert.match(fails("say uppercase()\n").message, /needs 1 input, but it was given 0/);
  });

  it("can be shadowed by a definition of the same name", () => {
    assert.deepEqual(run('define uppercase with x:\n    give back "mine"\nsay uppercase(1)\n'), [
      "mine",
    ]);
  });
});

describe("interpreter: runtime errors", () => {
  it("refuses to divide by zero", () => {
    assert.match(fails("say 1 divided by 0\n").message, /divided by zero/);
  });

  it("refuses arithmetic on text", () => {
    const error = fails('say "abc" times 2\n');
    assert.match(error.message, /'times' works on numbers/);
    assert.match(error.hint ?? "", /number\("abc"\)/);
  });

  it("refuses to compare a number with text", () => {
    assert.match(fails('say 1 is less than "a"\n').message, /cannot compare/);
  });

  it("checks the number of inputs to a definition", () => {
    const error = fails("define f with a, b:\n    say 1\nsay f(1)\n");
    assert.match(error.message, /needs 2 inputs, but it was given 1/);
    assert.match(error.hint ?? "", /a, b/);
  });

  it("refuses to call something that is not a definition", () => {
    assert.match(fails("set x to 1\nsay x()\n").message, /cannot be called/);
  });

  it("stops runaway recursion with a readable message", () => {
    const error = fails("define f with n:\n    give back f(n)\nsay f(1)\n");
    assert.match(error.message, /called itself/);
    assert.ok(error.stack_.length > 1);
  });

  it("stops an endless loop once the step budget runs out", () => {
    const error = fails("set n to 1\nrepeat while n is more than 0:\n    change n to n + 1\n");
    assert.match(error.message, /taking too long/);
  });

  it("blames the right line", () => {
    const error = fails(["say 1", "say 2", "say missing", ""].join("\n"));
    assert.equal(error.line, 3);
    assert.equal(error.column, 5);
  });
});
