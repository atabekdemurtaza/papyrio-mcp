#!/usr/bin/env node
/**
 * Drives every tool over the real MCP protocol against the live API, then
 * checks the file that came back is what the tool promised — not just that the
 * call returned without error.
 *
 *   PAPYRIO_API_KEY=... node smoke.mjs
 *
 * Without a key it runs on the guest tier, which allows three operations a day
 * per IP, so most cases will fail with rate_limit_exceeded.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const PDF = join(process.env.HOME, "Downloads", "receipt_21254669900.pdf");
const out = await mkdtemp(join(tmpdir(), "papyrio-smoke-"));

// A 1x1 PNG and a minimal .docx, so the image and Office endpoints have input.
const PNG = join(out, "pixel.png");
await writeFile(PNG, Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
));

const server = spawn("node", ["dist/index.js"], {
  stdio: ["pipe", "pipe", "inherit"],
  env: process.env,
});

const pending = new Map();
createInterface({ input: server.stdout }).on("line", (line) => {
  if (!line.trim()) return;
  const message = JSON.parse(line);
  const resolve = pending.get(message.id);
  if (resolve) {
    pending.delete(message.id);
    resolve(message);
  }
});

let nextId = 1;
function send(method, params) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

await send("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke", version: "0" },
});
server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

/** Magic bytes beat file extensions: the API could return JSON named .pdf. */
async function kindOf(path) {
  const head = (await readFile(path)).subarray(0, 4);
  if (head.toString("latin1").startsWith("%PDF")) return "pdf";
  if (head[0] === 0x50 && head[1] === 0x4b) return "zip-or-docx";
  return "other";
}

const cases = [
  ["compress_pdf",     { file: PDF, level: "high" },                          "pdf"],
  ["merge_pdfs",       { files: [PDF, PDF] },                                 "pdf"],
  ["extract_pdf_text", { file: PDF },                                         "other"],
  ["ocr_pdf",          { file: PDF },                                         "pdf"],
  ["pdf_to_word",      { file: PDF },                                         "zip-or-docx"],
  ["split_pdf",        { file: PDF },                                         "zip-or-docx"],
  ["pdf_to_jpg",       { file: PDF },                                         "zip-or-docx"],
  ["image_to_pdf",     { file: PNG },                                         "pdf"],
  ["webpage_to_pdf",   { url: "https://example.com" },                        "pdf"],
  ["protect_pdf",      { file: PDF, password: "smoke-test-123" },             "pdf"],
  ["unlock_pdf",       { file: null, password: "smoke-test-123" },            "pdf"],
];

let passed = 0;
let failed = 0;
let lockedPath = "";

for (const [name, args, expected] of cases) {
  const outputPath = join(out, `${name}${name === "extract_pdf_text" ? ".txt" : ".bin"}`);

  // unlock_pdf consumes whatever protect_pdf produced.
  if (name === "unlock_pdf") {
    if (!lockedPath) {
      console.log(`  SKIP  ${name.padEnd(18)} protect_pdf produced nothing to unlock`);
      failed++;
      continue;
    }
    args.file = lockedPath;
  }

  const reply = await send("tools/call", { name, arguments: { ...args, output_path: outputPath } });
  const text = reply.result?.content?.[0]?.text ?? "no content";

  if (reply.result?.isError) {
    console.log(`  FAIL  ${name.padEnd(18)} ${text}`);
    failed++;
    continue;
  }

  const kind = await kindOf(outputPath);
  if (expected !== "other" && kind !== expected) {
    console.log(`  FAIL  ${name.padEnd(18)} expected ${expected}, got ${kind}`);
    failed++;
    continue;
  }

  if (name === "protect_pdf") lockedPath = outputPath;
  console.log(`  PASS  ${name.padEnd(18)} ${text}`);
  passed++;
}

console.log(`\n${passed} passed, ${failed} failed`);
console.log(process.env.PAPYRIO_API_KEY ? "Ran through the RapidAPI gateway." : "Ran keyless on the guest tier (3/day).");

server.kill();
await rm(out, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
