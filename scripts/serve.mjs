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
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "playground");
const port = Number(process.env.PORT ?? 5173);

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
  console.log("Press Ctrl+C to stop.");
});
