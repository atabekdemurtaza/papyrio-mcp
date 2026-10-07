#!/usr/bin/env node
/**
 * Papyrio MCP server.
 *
 * Exposes the Papyrio PDF API as MCP tools that read and write local files, so
 * an assistant can chain operations (OCR, then merge, then compress) without a
 * human moving files between a browser and a download folder.
 *
 * Transport is stdio: the host launches this process and talks over pipes.
 * Nothing listens on a port.
 *
 * With PAPYRIO_API_KEY set, requests go through the RapidAPI gateway and are
 * metered against that subscription. Without it they go straight to the origin
 * and are metered as ordinary free web traffic, which is three operations a day
 * per IP address — enough to try the server, not enough to work with.
 */
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS, type Field, type Tool } from "./tools.js";

const API_KEY = process.env.PAPYRIO_API_KEY ?? "";
const GATEWAY_HOST = "papyrio-pdf-tools.p.rapidapi.com";
const ORIGIN = "https://api.papyrio.net";
const BASE = API_KEY ? `https://${GATEWAY_HOST}` : ORIGIN;

/** OCR and large Office conversions are the slowest operations. */
const TIMEOUT_MS = 180_000;

function takesAFile(tool: Tool): boolean {
  return tool.fields.some((f) => f.kind === "input_file" || f.kind === "input_files");
}

function inputSchema(tool: Tool) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of tool.fields) {
    if (field.kind === "input_files") {
      properties[field.name] = {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 10,
        description: field.description,
      };
      required.push(field.name);
      continue;
    }

    if (field.kind === "input_file") {
      properties[field.name] = { type: "string", description: field.description };
      required.push(field.name);
      continue;
    }

    properties[field.name] = {
      type: "string",
      description: field.description,
      ...(field.values ? { enum: field.values } : {}),
      ...(field.default ? { default: field.default } : {}),
    };
    if (field.required) required.push(field.name);
  }

  // Tools with no file input have nothing to derive an output name from, so
  // the path has to be supplied rather than guessed.
  if (takesAFile(tool)) {
    properties.output_path = {
      type: "string",
      description: `Absolute path to write the result to. Defaults to the input file with a "-papyrio${tool.outputExtension}" suffix.`,
    };
  } else {
    properties.output_path = {
      type: "string",
      description: `Absolute path to write the ${tool.outputExtension} result to. Required for this tool.`,
    };
    required.push("output_path");
  }

  return { type: "object", properties, required };
}

/** Rejects relative paths: the assistant's working directory is not the user's. */
function requireAbsolute(path: unknown, field: string): string {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error(`${field} is required and must be a file path.`);
  }
  if (!isAbsolute(path)) {
    throw new Error(`${field} must be an absolute path. Got: ${path}`);
  }
  return path;
}

function defaultOutputPath(inputPath: string, tool: Tool): string {
  const stem = basename(inputPath, extname(inputPath));
  return join(dirname(inputPath), `${stem}-papyrio${tool.outputExtension}`);
}

async function attach(form: FormData, field: string, path: string) {
  const bytes = await readFile(path);
  form.append(field, new Blob([bytes]), basename(path));
}

async function run(tool: Tool, args: Record<string, unknown>) {
  const form = new FormData();
  let firstInput = "";

  for (const field of tool.fields as Field[]) {
    if (field.kind === "input_files") {
      const paths = args[field.name];
      if (!Array.isArray(paths) || paths.length < 2) {
        throw new Error(`${field.name} needs at least two file paths.`);
      }
      for (const path of paths) {
        const absolute = requireAbsolute(path, field.name);
        await attach(form, field.name, absolute);
      }
      firstInput ||= String(paths[0]);
      continue;
    }

    if (field.kind === "input_file") {
      const absolute = requireAbsolute(args[field.name], field.name);
      await attach(form, field.name, absolute);
      firstInput ||= absolute;
      continue;
    }

    const value = args[field.name] ?? field.default;
    if (value === undefined) {
      if (field.required) throw new Error(`${field.name} is required.`);
      continue;
    }
    form.append(field.name, String(value));
  }

  const headers: Record<string, string> = {};
  if (API_KEY) {
    headers["X-RapidAPI-Key"] = API_KEY;
    headers["X-RapidAPI-Host"] = GATEWAY_HOST;
  }

  const response = await fetch(`${BASE}${tool.path}`, {
    method: "POST",
    headers,
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(await explainFailure(response));
  }

  if (!args.output_path && !firstInput) {
    throw new Error(
      `${tool.name} takes no input file, so output_path is required: an absolute path ending in ${tool.outputExtension}.`
    );
  }

  const outputPath = args.output_path
    ? requireAbsolute(args.output_path, "output_path")
    : defaultOutputPath(firstInput, tool);

  const body = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, body);

  return { outputPath, bytes: body.length };
}

/**
 * Turns an error response into something the assistant can act on. The API
 * returns {"error":{"code","message"}}, but a gateway rejection is shaped
 * differently, so both are handled.
 */
async function explainFailure(response: Response): Promise<string> {
  const text = await response.text();

  try {
    const parsed = JSON.parse(text);
    if (parsed?.error?.code) {
      const { code, message } = parsed.error;
      if (code === "rate_limit_exceeded" && !API_KEY) {
        return `${code}: ${message} This server is running without an API key, so it is limited to three operations a day. Set PAPYRIO_API_KEY to raise that.`;
      }
      return `${code}: ${message}`;
    }
    if (parsed?.message) return `${response.status}: ${parsed.message}`;
  } catch {
    // Not JSON; fall through to the raw body.
  }

  return `${response.status} ${response.statusText}: ${text.slice(0, 200)}`;
}

const server = new Server(
  { name: "papyrio", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: inputSchema(tool),
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = TOOLS.find((t) => t.name === request.params.name);
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
    };
  }

  try {
    const { outputPath, bytes } = await run(tool, request.params.arguments ?? {});
    return {
      content: [
        { type: "text", text: `Wrote ${outputPath} (${bytes.toLocaleString()} bytes).` },
      ],
    };
  } catch (error) {
    // Returned as a tool error rather than thrown, so the assistant can read
    // the reason and retry or tell the user, instead of the call vanishing.
    return {
      isError: true,
      content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
    };
  }
});

await server.connect(new StdioServerTransport());
