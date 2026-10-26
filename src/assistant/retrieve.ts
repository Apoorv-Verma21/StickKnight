/**
 * assistant/retrieve.ts — finding the right lesson for a question.
 *
 * This is ordinary information retrieval, done small enough to read: the
 * question is normalised into terms, each term is expanded through a synonym
 * table, and every knowledge entry is scored by how well its own terms match,
 * weighted by inverse document frequency so that a word appearing in half the
 * entries counts for almost nothing.
 *
 * Two details do most of the work:
 *
 *  - MULTI-WORD PHRASES ARE MATCHED FIRST. "for each", "give back" and
 *    "at least" are single ideas in this language, and matching them as whole
 *    phrases beats any amount of per-word scoring.
 *
 *  - SYNONYMS ARE ONE-WAY, FROM THE LEARNER'S WORDS TO THE LANGUAGE'S.
 *    Someone arriving from Python asks about a "for loop" and a "function";
 *    Stickynight calls those `repeat` and `define`. Expanding the question
 *    rather than the corpus keeps the knowledge entries written in the
 *    language's own vocabulary.
 */

import { Entry, ENTRIES, STOPWORDS, SYNONYMS } from "./knowledge";

export interface Match {
  entry: Entry;
  score: number;
  /** Which question terms actually contributed, for explaining a weak match. */
  matched: string[];
}

/** Symbols a learner might type that carry meaning here. */
const SYMBOL_PATTERN = /(>=|<=|==|!=|&&|\|\||[<>+\-*/%#!])/g;

const WORD_PATTERN = /[a-z_][a-z0-9_]*/g;

/**
 * Fold a plural onto its singular, so "items" and "item" are one term.
 *
 * Deliberately the lightest stemmer that helps: a trailing "s" is dropped
 * from words of more than three letters that do not already end in "ss".
 * That catches lists/loops/arrays/items without mangling "is", "yes" or
 * "less" — and a heavier stemmer would start merging words a learner means
 * to keep apart.
 */
export function stem(word: string): string {
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

/** Split a question into scoreable terms. */
export function terms(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];

  const symbols = lower.match(SYMBOL_PATTERN);
  if (symbols) found.push(...symbols);

  const words = lower.match(WORD_PATTERN);
  if (words) {
    for (const word of words) {
      // A stopword is dropped, but only when it is purely a stopword —
      // inverse document frequency deals with the rest.
      if (STOPWORDS.has(word)) continue;
      found.push(stem(word));
    }
  }

  return found;
}

/** Add the Stickynight words a learner's vocabulary maps onto. */
export function expand(input: string[]): string[] {
  const out = new Set<string>(input);
  for (const term of input) {
    const synonyms = SYNONYMS[term];
    if (synonyms) for (const word of synonyms) out.add(stem(word));
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// The index, built once from the entries
// ---------------------------------------------------------------------------

interface Indexed {
  entry: Entry;
  /** term -> weight contributed by this entry */
  weights: Map<string, number>;
  /** multi-word triggers, kept whole */
  phrases: string[];
}

const TRIGGER_WEIGHT = 3;
const TITLE_WEIGHT = 2;
const BODY_WEIGHT = 1;
const PHRASE_BONUS = 9;

/**
 * Add one field's terms to an entry's weights.
 *
 * A term counts ONCE per field however often it appears. Without that, a long
 * body that happens to repeat a word outscores a short entry whose trigger
 * list names it exactly — which is how "how do I make a function" used to
 * find the lesson on closures instead of the one on definitions.
 */
function addAll(weights: Map<string, number>, text: string, weight: number): void {
  for (const term of new Set(terms(text))) {
    weights.set(term, (weights.get(term) ?? 0) + weight);
  }
}

const INDEX: Indexed[] = ENTRIES.map((entry) => {
  const weights = new Map<string, number>();
  const phrases: string[] = [];

  // All triggers are weighed as ONE field. Adding them one at a time would
  // count "loop" twice for an entry listing both "exit loop" and "leave
  // loop", which is an accident of how the list was written rather than a
  // sign that the entry is more about loops.
  for (const trigger of entry.triggers) {
    if (trigger.includes(" ")) phrases.push(trigger.toLowerCase());
  }
  addAll(weights, entry.triggers.join(" "), TRIGGER_WEIGHT);
  addAll(weights, entry.title, TITLE_WEIGHT);
  addAll(weights, entry.body, BODY_WEIGHT);

  return { entry, weights, phrases };
});

/** Inverse document frequency over the entry corpus. */
const IDF: Map<string, number> = (() => {
  const documentFrequency = new Map<string, number>();
  for (const indexed of INDEX) {
    for (const term of indexed.weights.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const total = INDEX.length;
  const idf = new Map<string, number>();
  for (const [term, count] of documentFrequency) {
    // Smoothed, and floored at zero so a term in every entry contributes
    // nothing rather than going negative.
    idf.set(term, Math.max(0, Math.log((total + 1) / (count + 0.5))));
  }
  return idf;
})();

/**
 * Rank the knowledge entries against a question, best first.
 * Entries that score nothing at all are left out.
 */
export function rank(question: string): Match[] {
  const asked = question.toLowerCase();
  const queryTerms = expand(terms(question));

  const matches: Match[] = [];

  for (const indexed of INDEX) {
    let score = 0;
    const matched: string[] = [];

    // Whole phrases first — they are the strongest signal available.
    for (const phrase of indexed.phrases) {
      if (asked.includes(phrase)) {
        score += PHRASE_BONUS;
        matched.push(phrase);
      }
    }

    for (const term of queryTerms) {
      const weight = indexed.weights.get(term);
      if (weight === undefined) continue;
      const idf = IDF.get(term) ?? 1;
      score += weight * idf;
      matched.push(term);
    }

    if (score > 0) matches.push({ entry: indexed.entry, score, matched });
  }

  // Ties broken by id so the order is stable and testable.
  matches.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
  return matches;
}

/**
 * The best entry, if the match is good enough to be worth showing.
 *
 * The threshold matters: a bad answer delivered confidently is worse than
 * saying "I am not sure, here is what I do know about".
 */
export function best(question: string, threshold = 4): Match | null {
  const ranked = rank(question);
  if (ranked.length === 0) return null;
  return ranked[0].score >= threshold ? ranked[0] : null;
}

/** Topic titles, for the "here is what I can help with" fallback. */
export function topics(): string[] {
  return ENTRIES.map((entry) => entry.title);
}
