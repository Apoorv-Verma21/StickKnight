/**
 * scripts/serve.mjs — a static server for the playground.
 *
 * The playground is plain files, but browsers refuse to load scripts over
 * file:// from a page that also wants to instantiate WebAssembly, so a
 * two-minute server is easier than explaining the workaround.
 *
 *     npm run playground     ->  http://localhost:5173
 */

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "playground");
const port = Number(process.env.PORT ?? 5173);

/**
 * The assistant's model backend, if this machine has credentials for one.
 *
 * It lives HERE rather than in the page because a browser must never hold an
 * API key. The page asks whether this route exists; if it does, the questions
 * the compiler cannot answer are forwarded through it and the key never
 * leaves the machine. With no credentials the route reports itself
 * unavailable and the page runs its offline assistant, which is most of the
 * feature anyway.
 */
let backend = null;
let backendStatus = { available: false, message: "The playground was started without the compiled assistant." };

try {
  const dist = path.join(here, "..", "dist", "src");
  const llm = require(path.join(dist, "assistant", "llm.js"));
  const assistant = require(path.join(dist, "assistant", "index.js"));

  backendStatus = llm.status();
  if (backendStatus.available) {
    backend = { model: backendStatus.model, create: llm.createAnthropicBackend, systemPrompt: assistant.systemPrompt };
  }
} catch (error) {
  backendStatus = {
    available: false,
    message: "Run `npm run build` first to enable the model backend.",
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      // A question and a program; anything larger is not a real request.
      if (size > 256 * 1024) {
        reject(new Error("request too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function sendJson(response, code, body) {
  const text = JSON.stringify(body);
  response.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(text);
}

async function handleAsk(request, response) {
  if (request.method === "GET") {
    sendJson(response, 200, {
      available: Boolean(backend),
      model: backend?.model,
      message: backend ? undefined : backendStatus.message,
    });
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "use GET to check, POST to ask" });
    return;
  }

  if (!backend) {
    sendJson(response, 503, { error: backendStatus.message });
    return;
  }

  try {
    const payload = JSON.parse(await readBody(request));
    const question = String(payload.question ?? "").slice(0, 4000);
    const program = String(payload.program ?? "").slice(0, 40000);

    if (!question.trim()) {
      sendJson(response, 400, { error: "no question was sent" });
      return;
    }

    const model = backend.create();
    if (!model) {
      sendJson(response, 503, { error: "the model backend is no longer available" });
      return;
    }

    const text = await model.complete({
      system: backend.systemPrompt(),
      question,
      program,
    });

    sendJson(response, 200, { text });
  } catch (error) {
    sendJson(response, 502, { error: error instanceof Error ? error.message : String(error) });
  }
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (url.pathname === "/api/ask") {
    void handleAsk(request, response);
    return;
  }

  const requested = url.pathname === "/" ? "/index.html" : url.pathname;

  // Resolve inside the playground directory and refuse anything that escapes.
  const file = path.join(root, path.normalize(requested).replace(/^([/\\])+/, ""));
  if (!file.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(file, (error, body) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end(`Not found: ${requested}`);
      return;
    }
    response.writeHead(200, {
      "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  });
});

server.listen(port, () => {
  console.log(`Stickynight playground: http://localhost:${port}`);
  console.log(
    backend
      ? `Assistant: offline answers from the compiler, plus ${backend.model} for the rest.`
      : "Assistant: offline only (no model credentials found) — still reads errors, explains programs and runs them."
  );
  console.log("Press Ctrl+C to stop.");
});
