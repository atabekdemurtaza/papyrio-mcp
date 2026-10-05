# papyrio-mcp

An MCP server for the [Papyrio](https://papyrio.net) PDF API. It lets an
assistant compress, merge, OCR and convert PDFs on your own machine, reading
and writing local files, so multi-step work does not mean uploading and
downloading between every step.

```
OCR every scan in ~/invoices, merge them into one PDF, compress it under 5 MB
```

is four tool calls the assistant makes by itself.

## Install

Add this to your Claude Desktop config:

**macOS** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "papyrio": {
      "command": "npx",
      "args": ["-y", "papyrio-mcp"]
    }
  }
}
```

Restart Claude Desktop. The tools appear under the connector icon.

## API key

The server works without one, metered as ordinary free web traffic: three
operations a day per IP address. Enough to see whether it is useful.

For real use, subscribe on
[RapidAPI](https://rapidapi.com/atabekdemurtaza/api/papyrio-pdf-tools) and pass
the key:

```json
{
  "mcpServers": {
    "papyrio": {
      "command": "npx",
      "args": ["-y", "papyrio-mcp"],
      "env": { "PAPYRIO_API_KEY": "your-rapidapi-key" }
    }
  }
}
```

The free RapidAPI tier is 50 requests a month and needs no card.

## Tools

| Tool | Does | Writes |
| --- | --- | --- |
| `compress_pdf` | Shrinks a PDF, 30–80% on image-heavy files | `.pdf` |
| `merge_pdfs` | Joins 2–10 PDFs in order | `.pdf` |
| `extract_pdf_text` | Returns the text layer as UTF-8 | `.txt` |
| `ocr_pdf` | Adds a searchable text layer to a scan | `.pdf` |

Every tool takes absolute paths. `output_path` is optional and defaults to the
input name with a `-papyrio` suffix.

## Adding a tool

Add an entry to `src/tools.ts`. The MCP tool, its input schema and the HTTP
call are all generated from it. The eight endpoints not yet wrapped are listed
in a comment at the bottom of that file; each is one entry.

## Develop

```bash
npm install
npm run build
```

Point your config at the local build while working on it:

```json
{
  "mcpServers": {
    "papyrio": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/dist/index.js"]
    }
  }
}
```

Privacy: files are sent to the Papyrio API, processed in memory, and discarded
when the response is sent. Nothing is stored.

## Licence

MIT
