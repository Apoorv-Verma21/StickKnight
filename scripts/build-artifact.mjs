/**
 * scripts/build-artifact.mjs — fold the playground into one HTML file.
 *
 * playground/index.html loads four separate files, which is right for local
 * development but no use for sharing a link. This inlines the stylesheet, the
 * compiler bundle, the samples and the page script into a single document
 * that runs anywhere with no server.
 *
 *     npm run artifact   ->  playground/stickynight-playground.html
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const dir = path.join(root, "playground");

function read(name) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) {
    console.error(`missing ${name} — run \`npm run bundle\` first.`);
    process.exit(1);
  }
  return fs.readFileSync(file, "utf8");
}

const html = read("index.html");
const css = read("playground.css");
const bundle = read("bundle.js");
const samples = read("samples.js");
const script = read("playground.js");

/** The markup between <body> and </body>, minus the <script> tags. */
function bodyOf(document) {
  const match = document.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!match) throw new Error("index.html has no <body>");
  return match[1].replace(/[ \t]*<script\b[\s\S]*?<\/script>[ \t]*\r?\n?/gi, "").trim();
}

function titleOf(document) {
  const match = document.match(/<title>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : "Stickynight Playground";
}

/**
 * The stylesheet and preconnect links from <head>, minus the local one that
 * is about to be inlined. The artifact host supplies the document skeleton,
 * so these have to travel with the content or the type falls back silently.
 */
function headLinksOf(document) {
  const head = document.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!head) return [];
  return (head[1].match(/<link\b[^>]*>/gi) ?? [])
    .filter((tag) => !/href=["'][^"']*playground\.css/i.test(tag))
    .map((tag) => tag.trim());
}

/**
 * A literal "</script>" anywhere inside inlined JavaScript would close the
 * tag early. Nothing in this project contains one, but escaping it costs a
 * line and removes the whole class of problem.
 */
function safeScript(code) {
  return code.replace(/<\/script>/gi, "<\\/script>");
}

/**
 * The artifact host supplies the document skeleton, so the output is
 * <title>, <style>, the markup, and the scripts — no doctype, html, head or
 * body tags of its own.
 */
const out = [
  `<title>${titleOf(html)}</title>`,
  ...headLinksOf(html),
  "",
  "<style>",
  css.trim(),
  "</style>",
  "",
  bodyOf(html),
  "",
  "<!-- the whole Stickynight compiler, packed by scripts/bundle.mjs -->",
  "<script>",
  safeScript(bundle.trim()),
  "</script>",
  "",
  "<!-- the example programs, generated from examples/ -->",
  "<script>",
  safeScript(samples.trim()),
  "</script>",
  "",
  "<script>",
  safeScript(script.trim()),
  "</script>",
  "",
].join("\n");

const target = path.join(dir, "stickynight-playground.html");
fs.writeFileSync(target, out);

console.log(
  `playground/stickynight-playground.html — ${(out.length / 1024).toFixed(1)} kB, self-contained`
);
