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

// Smallest .docx LibreOffice will open: three parts in a zip.
const DOCX = join(out, "sample.docx");
{
  const parts = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ["word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Papyrio smoke test.</w:t></w:r></w:p></w:body></w:document>`],
  ];
  await writeFile(DOCX, buildZip(parts));
}

/** Stored-mode zip, so no compression dependency is needed. */
function buildZip(parts) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const [name, text] of parts) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(text, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);
    locals.push(local, data);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centrals.push(central);

    offset += local.length + data.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, end]);
}

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

// The extension matters: the API validates the uploaded filename, so writing
// everything as .bin makes a chained call (unlock after protect) fail with
// "only PDF files are accepted" even though both endpoints work.
const cases = [
  ["compress_pdf",     { file: PDF, level: "high" },               ".pdf",  "pdf"],
  ["merge_pdfs",       { files: [PDF, PDF] },                      ".pdf",  "pdf"],
  ["extract_pdf_text", { file: PDF },                              ".txt",  "other"],
  ["ocr_pdf",          { file: PDF },                              ".pdf",  "pdf"],
  ["pdf_to_word",      { file: PDF },                              ".docx", "zip-or-docx"],
  ["split_pdf",        { file: PDF },                              ".zip",  "zip-or-docx"],
  ["pdf_to_jpg",       { file: PDF },                              ".zip",  "zip-or-docx"],
  ["office_to_pdf",    { file: DOCX },                             ".pdf",  "pdf"],
  ["image_to_pdf",     { file: PNG },                              ".pdf",  "pdf"],
  ["webpage_to_pdf",   { url: "https://example.com" },             ".pdf",  "pdf"],
  ["protect_pdf",      { file: PDF, password: "smoke-test-123" },  ".pdf",  "pdf"],
  ["unlock_pdf",       { file: null, password: "smoke-test-123" }, ".pdf",  "pdf"],
];

let passed = 0;
let failed = 0;
let lockedPath = "";

for (const [name, args, extension, expected] of cases) {
  const outputPath = join(out, `${name}${extension}`);

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
