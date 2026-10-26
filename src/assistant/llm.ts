/**
 * assistant/llm.ts — the optional language-model backend.
 *
 * The assistant answers everything it can from the compiler and the knowledge
 * base. This file is what it falls back to for a question neither of those
 * covers, and it is deliberately the only file in the project that knows an
 * external service exists.
 *
 * THREE THINGS KEEP IT OPTIONAL
 *
 *  - The SDK is loaded with a guarded require. If `@anthropic-ai/sdk` is not
 *    installed, this module reports itself unavailable and the assistant runs
 *    exactly as before. The compiler keeps its no-runtime-dependencies
 *    property.
 *  - Nothing imports this file except the command line. The browser bundle
 *    never sees it, so an API key can never end up in a web page.
 *  - It is off unless credentials are present. A missing key is not an error,
 *    it is just the offline assistant.
 *
 * GROUNDING. The system prompt is built from assistant/knowledge.ts, so the
 * model answers about the Stickynight that actually exists rather than about
 * whatever a language with that name might plausibly look like.
 */

import { ModelBackend } from "./index";

/**
 * The SDK is required at run time rather than imported, so that the project
 * compiles and runs whether or not the package is installed. The `any` is
 * deliberate and confined to this file.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnthropicModule = any;

function loadSdk(): AnthropicModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require("@anthropic-ai/sdk");
    return loaded.default ?? loaded;
  } catch {
    return null;
  }
}

/** Why the model backend is not running, when it is not. */
export type Unavailable =
  | { available: false; reason: "disabled" | "no-sdk" | "no-credentials"; message: string };

export type BackendStatus = { available: true; model: string } | Unavailable;

const MODEL = process.env.STICKYNIGHT_AI_MODEL ?? "claude-opus-5-5";

/**
 * Whether credentials are available.
 *
 * The SDK also reads an `ant auth login` profile from disk, which cannot be
 * detected from an environment variable — so STICKYNIGHT_AI=on forces the
 * backend on for anyone using a profile.
 */
function hasCredentials(): boolean {
  if (process.env.STICKYNIGHT_AI === "on") return true;
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function status(): BackendStatus {
  if (process.env.STICKYNIGHT_AI === "off") {
    return {
      available: false,
      reason: "disabled",
      message: "The model backend is switched off (STICKYNIGHT_AI=off).",
    };
  }

  if (!loadSdk()) {
    return {
      available: false,
      reason: "no-sdk",
      message:
        "The model backend needs the Anthropic SDK. Install it with: npm install @anthropic-ai/sdk",
    };
  }

  if (!hasCredentials()) {
    return {
      available: false,
      reason: "no-credentials",
      message:
        "The model backend needs credentials. Set ANTHROPIC_API_KEY, or run `ant auth login` and set STICKYNIGHT_AI=on.",
    };
  }

  return { available: true, model: MODEL };
}

/**
 * Build the backend, or null when it cannot run. Returning null rather than
 * throwing is the point: a missing key means the offline assistant, not a
 * broken program.
 */
export function createAnthropicBackend(): ModelBackend | null {
  const current = status();
  if (!current.available) return null;

  const Anthropic = loadSdk();
  if (!Anthropic) return null;

  const client = new Anthropic();

  return {
    name: `Anthropic ${MODEL}`,

    async complete({ system, question, program }) {
      const parts: string[] = [];
      if (program && program.trim()) {
        parts.push(
          "This is the program currently in my editor:",
          "",
          program.trimEnd(),
          ""
        );
      }
      parts.push(question);

      try {
        const response = await client.beta.messages.create({
          model: MODEL,
          max_tokens: 2000,

          // A tutoring reply is short and factual, and the reference is right
          // there in the prompt, so the cheapest effort level is the right
          // one. Thinking is always on for this model and is left adaptive.
          output_config: { effort: "low" },

          // The reference is identical on every question, so caching it turns
          // a large prompt into a cheap one from the second question onward.
          system: [
            {
              type: "text",
              text: system,
              cache_control: { type: "ephemeral" },
            },
          ],

          // If a request is declined, the API retries it on another model
          // inside the same call rather than returning nothing.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",

          messages: [{ role: "user", content: parts.join("\n") }],
        });

        if (response.stop_reason === "refusal") {
          return "I cannot answer that one. Ask me about Stickynight itself and I will do better.";
        }

        return response.content
          .filter((block: { type: string }) => block.type === "text")
          .map((block: { text: string }) => block.text)
          .join("\n")
          .trim();
      } catch (error) {
        throw new Error(describeApiError(Anthropic, error));
      }
    },
  };
}

/**
 * Turn an SDK error into one short sentence. Checked most specific first, so
 * a bad key is never reported as a generic network problem.
 */
function describeApiError(Anthropic: AnthropicModule, error: unknown): string {
  if (Anthropic.AuthenticationError && error instanceof Anthropic.AuthenticationError) {
    return "the credentials were rejected";
  }
  if (Anthropic.RateLimitError && error instanceof Anthropic.RateLimitError) {
    return "the rate limit was reached — try again shortly";
  }
  if (Anthropic.BadRequestError && error instanceof Anthropic.BadRequestError) {
    return `the request was rejected: ${(error as Error).message}`;
  }
  if (Anthropic.APIConnectionError && error instanceof Anthropic.APIConnectionError) {
    return "the service could not be reached";
  }
  if (Anthropic.APIError && error instanceof Anthropic.APIError) {
    const status = (error as { status?: number }).status;
    return `the service returned an error${status ? ` (${status})` : ""}`;
  }
  return error instanceof Error ? error.message : String(error);
}
