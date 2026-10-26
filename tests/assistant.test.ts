/**
 * tests/assistant.test.ts — the assistant.
 *
 * The first group is the important one. A teaching assistant that hands out
 * code which does not run is worse than no assistant at all, so every example
 * in the knowledge base is executed by the real interpreter here. If anyone
 * edits a lesson and breaks its program, this fails rather than a student
 * finding out.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { ask, systemPrompt } from "../src/assistant";
import { explainProgram, summarise } from "../src/assistant/explain";
import { ENTRIES, SYNONYMS } from "../src/assistant/knowledge";
import { best, rank, stem, terms, expand } from "../src/assistant/retrieve";
import { status } from "../src/assistant/llm";
import { parseSource, runSource } from "../src/stickynight";

describe("assistant: every example in the knowledge base actually runs", () => {
  for (const entry of ENTRIES) {
    if (!entry.code) continue;

    it(`'${entry.title}' gives working code`, () => {
      const result = runSource(entry.code as string, { maxSteps: 200_000 });
      if (result.error) {
        assert.fail(
          `the example for '${entry.id}' does not run:\n` +
            result.error.format(entry.code as string, `${entry.id} example`)
        );
      }
      assert.ok(
        result.output.length > 0,
        `the example for '${entry.id}' should print something`
      );
    });
  }

  it("most lessons carry an example", () => {
    const withCode = ENTRIES.filter((e) => e.code).length;
    assert.ok(withCode >= ENTRIES.length - 3, `only ${withCode} of ${ENTRIES.length} have code`);
  });

  it("every cross-reference points at an entry that exists", () => {
    const ids = new Set(ENTRIES.map((e) => e.id));
    for (const entry of ENTRIES) {
      for (const reference of entry.see ?? []) {
        assert.ok(ids.has(reference), `'${entry.id}' points at missing '${reference}'`);
      }
    }
  });

  it("has no duplicate ids", () => {
    const ids = ENTRIES.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("assistant: finding the right lesson", () => {
  const expected: [string, string][] = [
    ["how do I write a loop?", "loops"],
    ["how do I repeat something", "loops"],
    ["how do I make a function", "definitions"],
    ["how do I return a value from a function", "definitions"],
    ["how do I print something", "printing"],
    ["how do I use an array", "lists"],
    ["how do I add an item to a list", "lists"],
    ["how do I compare two numbers", "comparing"],
    ["what is the equivalent of >=", "comparing"],
    ["how do I write an if else", "conditions"],
    ["how do I declare a variable", "variables"],
    ["how does indentation work", "indentation"],
    ["how do I write a comment", "comments"],
    ["what is recursion", "recursion"],
    ["what types are there", "types"],
    ["what built in functions are available", "builtins"],
    ["how do I break out of a loop", "loop-control"],
    ["what is a closure", "closures"],
    ["how do I uppercase some text", "text"],
  ];

  for (const [question, id] of expected) {
    it(`"${question}" -> ${id}`, () => {
      const match = best(question);
      assert.ok(match, `nothing matched "${question}"`);
      assert.equal(
        match!.entry.id,
        id,
        `got '${match!.entry.id}' (ranked: ${rank(question).slice(0, 3).map((m) => m.entry.id).join(", ")})`
      );
    });
  }

  it("says nothing rather than guessing when the question is off-topic", () => {
    assert.equal(best("how do I connect to a postgres database"), null);
    assert.equal(best("what is the weather today"), null);
  });

  it("drops stopwords but keeps meaningful terms", () => {
    const found = terms("how do I write a loop");
    assert.ok(found.includes("loop"));
    assert.ok(!found.includes("how"));
    assert.ok(!found.includes("do"));
  });

  it("keeps symbols that carry meaning", () => {
    assert.ok(terms("what about >= and ==").includes(">="));
  });

  it("expands a learner's vocabulary into the language's", () => {
    assert.ok(expand(["function"]).includes("define"));
    assert.ok(expand(["array"]).includes("list"));
    assert.ok(expand(["loop"]).includes("repeat"));
  });

  it("every synonym points at a word some entry actually uses", () => {
    const vocabulary = new Set<string>();
    for (const entry of ENTRIES) {
      for (const term of terms(`${entry.title} ${entry.triggers.join(" ")} ${entry.body}`)) {
        vocabulary.add(term);
      }
    }
    for (const [from, to] of Object.entries(SYNONYMS)) {
      for (const word of to) {
        // Compared after stemming, since that is how both sides are indexed.
        assert.ok(
          vocabulary.has(stem(word)),
          `synonym ${from} -> ${word} matches no entry`
        );
      }
    }
  });
});

describe("assistant: questions about the program in the editor", () => {
  const BROKEN = "set age to 20\nif age >= 18:\n    say 1\n";
  const RUNTIME = "set total to 10\nsay totl\n";
  const FINE = 'set name to "Ada"\nsay "Hi, " + name\n';

  it("reads the real error rather than guessing", async () => {
    const answer = await ask({ question: "what is wrong with this?", program: BROKEN });
    assert.equal(answer.source, "diagnosis");
    assert.match(answer.text, /line 2/);
    assert.match(answer.text, /'>=' is not part of Stickynight/);
    assert.match(answer.text, /is at least/);
  });

  it("catches a fault that only appears when the program runs", async () => {
    const answer = await ask({ question: "why is this not working?", program: RUNTIME });
    assert.equal(answer.source, "diagnosis");
    assert.match(answer.text, /do not know anything called 'totl'/);
    assert.match(answer.text, /Did you mean 'total'/);
  });

  it("says so when there is genuinely nothing wrong", async () => {
    const answer = await ask({ question: "what is wrong with this?", program: FINE });
    assert.match(answer.text, /cannot find anything wrong/);
  });

  it("explains a program by walking its tree", async () => {
    const answer = await ask({ question: "what does this do?", program: FINE });
    assert.equal(answer.source, "explanation");
    assert.match(answer.text, /Give 'name' the value/);
    assert.match(answer.text, /Print/);
  });

  it("runs the program when asked what it prints", async () => {
    const answer = await ask({ question: "what does it print?", program: FINE });
    assert.equal(answer.source, "output");
    assert.match(answer.text, /Hi, Ada/);
  });

  it("reports the error when asked to run something broken", async () => {
    const answer = await ask({ question: "what does it print?", program: BROKEN });
    assert.equal(answer.source, "diagnosis");
  });

  it("assumes a question it cannot place is about the error on screen", async () => {
    const answer = await ask({ question: "hmm?", program: BROKEN });
    assert.equal(answer.source, "diagnosis");
  });

  it("still answers a language question while the program is broken", async () => {
    const answer = await ask({ question: "how do I write a loop?", program: BROKEN });
    assert.equal(answer.source, "knowledge");
    assert.equal(answer.topic, "loops");
  });

  it("asks for a program when there is not one", async () => {
    const answer = await ask({ question: "what does this do?" });
    assert.equal(answer.source, "unsure");
    assert.match(answer.text, /nothing in the editor/);
  });

  it("ignores a program that is only comments and blank lines", async () => {
    const answer = await ask({ question: "what does this do?", program: "# nothing\n\n" });
    assert.match(answer.text, /nothing in the editor/);
  });
});

describe("assistant: conversation", () => {
  it("greets", async () => {
    const answer = await ask({ question: "hello" });
    assert.match(answer.text, /Stickynight/);
  });

  it("lists what it covers", async () => {
    const answer = await ask({ question: "what can you help with?" });
    assert.match(answer.text, /Repeating something/);
  });

  it("admits when it does not know", async () => {
    const answer = await ask({ question: "how do I deploy this to kubernetes" });
    assert.equal(answer.source, "unsure");
    assert.match(answer.text, /not sure/);
  });

  it("handles an empty question", async () => {
    const answer = await ask({ question: "   " });
    assert.equal(answer.source, "unsure");
  });

  it("returns a runnable example with a knowledge answer", async () => {
    const answer = await ask({ question: "how do I write a loop?" });
    assert.ok(answer.code);
    const result = runSource(answer.code as string, { maxSteps: 100_000 });
    assert.equal(result.error, null);
  });
});

describe("assistant: the model backend is optional", () => {
  it("reports its own status without throwing", () => {
    const current = status();
    assert.ok(typeof current.available === "boolean");
    if (!current.available) assert.ok(current.message.length > 0);
  });

  it("answers fully with no backend at all", async () => {
    const answer = await ask({ question: "how do lists work?", backend: null });
    assert.equal(answer.source, "knowledge");
  });

  it("falls back to a model only for what it cannot answer itself", async () => {
    const asked: string[] = [];
    const backend = {
      name: "test",
      async complete(input: { question: string }) {
        asked.push(input.question);
        return "an answer from the model";
      },
    };

    // Covered by the knowledge base — the model must not be consulted.
    const known = await ask({ question: "how do I write a loop?", backend });
    assert.equal(known.source, "knowledge");
    assert.equal(asked.length, 0);

    // Not covered — now it should be.
    const unknown = await ask({ question: "how do I deploy to kubernetes", backend });
    assert.equal(unknown.source, "model");
    assert.equal(unknown.text, "an answer from the model");
    assert.equal(asked.length, 1);
  });

  it("stays useful when the model fails", async () => {
    const backend = {
      name: "broken",
      async complete() {
        throw new Error("the service could not be reached");
      },
    };
    const answer = await ask({ question: "how do I deploy to kubernetes", backend });
    assert.equal(answer.source, "unsure");
    assert.match(answer.text, /could not be reached/);
  });

  it("grounds the model in the real language", () => {
    const prompt = systemPrompt();
    assert.match(prompt, /give back/);
    assert.match(prompt, /repeat with i from 1 to 10/);
    assert.match(prompt, /Never use braces, semicolons, or >= and ==/);
    // Every lesson reaches the model, so it cannot invent a different language.
    for (const entry of ENTRIES) {
      assert.ok(prompt.includes(entry.title), `missing '${entry.title}'`);
    }
  });
});

describe("assistant: explaining a tree", () => {
  const explain = (source: string) => explainProgram(parseSource(source));

  it("describes each statement kind", () => {
    assert.match(explain("set x to 1\n"), /Give 'x' the value 1/);
    assert.match(explain("set x to 1\nchange x to 2\n"), /Change 'x' to 2/);
    assert.match(explain("say 1\n"), /Print 1/);
    assert.match(explain("repeat 3 times:\n    say 1\n"), /Repeat 3 times:/);
    assert.match(explain("repeat with i from 1 to 3:\n    say i\n"), /Count 'i' from 1 to 3/);
    assert.match(explain("repeat while yes:\n    stop\n"), /Keep going while yes/);
    assert.match(explain("for each x in list of 1:\n    say x\n"), /For every 'x' in a list of 1/);
    assert.match(explain("define f with a:\n    give back a\n"), /Define 'f', taking 'a'/);
    assert.match(explain("define f:\n    give back 1\n"), /taking no input/);
    assert.match(explain("set xs to empty list\nadd 1 to xs\n"), /Add 1 to the end of/);
    assert.match(explain("repeat 1 times:\n    skip\n"), /next turn of the loop/);
  });

  it("flattens an otherwise-if chain instead of nesting it", () => {
    const source = [
      "set n to 1",
      "if n is 1:",
      "    say 1",
      "otherwise if n is 2:",
      "    say 2",
      "otherwise if n is 3:",
      "    say 3",
      "otherwise:",
      "    say 0",
      "",
    ].join("\n");

    const text = explain(source);
    const lines = text.split("\n").filter((l) => l.trim().startsWith("Otherwise"));
    assert.equal(lines.length, 3);
    // All four arms sit at the same depth, as they do in the source.
    const indents = new Set(lines.map((l) => l.length - l.trimStart().length));
    assert.equal(indents.size, 1);
  });

  it("describes a comparison in words", () => {
    assert.match(explain("say 1 is at least 2\n"), /1 is at least 2/);
    assert.match(explain("say 1 is not 2\n"), /1 is not 2/);
  });

  it("counts the shape of a program", () => {
    const source = [
      "define f with n:",
      "    if n is 1:",
      "        give back 1",
      "    give back 2",
      "repeat 2 times:",
      "    say f(1)",
      "",
    ].join("\n");

    const text = summarise(parseSource(source));
    assert.match(text, /1 definition/);
    assert.match(text, /1 loop/);
    assert.match(text, /1 decision/);
  });

  it("handles an empty program", () => {
    assert.match(explain("# nothing here\n"), /empty/);
  });
});
