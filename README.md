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
| `split_pdf` | Separates every page into its own file | `.zip` |
| `extract_pdf_text` | Returns the text layer as UTF-8 | `.txt` |
| `pdf_to_word` | Rebuilds the document as an editable .docx | `.docx` |
| `pdf_to_jpg` | Renders every page as a JPG | `.zip` |
| `ocr_pdf` | Adds a searchable text layer to a scan | `.pdf` |
| `office_to_pdf` | Word, PowerPoint or Excel to PDF | `.pdf` |
| `image_to_pdf` | Wraps a JPG, PNG or WebP in a PDF page | `.pdf` |
| `webpage_to_pdf` | Renders a public URL in a headless browser | `.pdf` |
| `protect_pdf` | Encrypts with AES-256 | `.pdf` |
| `unlock_pdf` | Removes a password you already know | `.pdf` |

Every tool takes absolute paths. `output_path` is optional and defaults to the
input name with a `-papyrio` suffix — except `webpage_to_pdf`, which has no
input file to derive a name from and so requires it.

## Adding a tool

Add an entry to `src/tools.ts`. The MCP tool, its input schema and the HTTP
call are all generated from it.

it.

## Testing

```bash
npm run build
PAPYRIO_API_KEY=your-key node smoke.mjs
```

Drives all twelve tools over the real MCP protocol against the live API and
checks the returned file's magic bytes, so a JSON error body named `.pdf` fails
rather than passes. Without a key it runs on the guest tier, where three
operations a day means most cases will hit `rate_limit_exceeded`.

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
