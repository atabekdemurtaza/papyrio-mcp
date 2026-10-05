/**
 * The tool catalogue.
 *
 * Adding an endpoint means adding one entry here — index.ts builds the MCP
 * tool, its input schema and its HTTP call from this data. Paths and field
 * names must match Server/openapi.yaml exactly.
 */

export type Field =
  /** A local file the user already has. Sent as a multipart file part. */
  | { kind: "input_file"; name: string; description: string }
  /** Several local files under one field name, e.g. /merge. */
  | { kind: "input_files"; name: string; description: string }
  /** Plain text sent as a form field. */
  | { kind: "text"; name: string; description: string; required: boolean; values?: string[]; default?: string };

export type Tool = {
  /** MCP tool name. Assistants match on this and on `description`. */
  name: string;
  path: string;
  /** Written for the assistant, not for a human. Say when to reach for it. */
  description: string;
  fields: Field[];
  /** Extension of the file we write, so the assistant can predict the result. */
  outputExtension: string;
};

export const TOOLS: Tool[] = [
  {
    name: "compress_pdf",
    path: "/compress",
    description:
      "Shrink a PDF by downsampling its images. Image-heavy files lose 30-80% of their size; text stays selectable. Use this when a PDF is too large to email or upload. Already-optimized files come back unchanged rather than larger.",
    fields: [
      { kind: "input_file", name: "file", description: "Absolute path to the PDF to compress." },
      {
        kind: "text",
        name: "level",
        description: "Compression strength. low keeps images at 300 DPI, medium at 150, high at 72.",
        required: false,
        values: ["low", "medium", "high"],
        default: "medium",
      },
    ],
    outputExtension: ".pdf",
  },
  {
    name: "merge_pdfs",
    path: "/merge",
    description:
      "Combine 2 to 10 PDFs into one document, in the order given. Use this to join separate scans, chapters or invoices into a single file. Password-protected files must be unlocked first.",
    fields: [
      { kind: "input_files", name: "files", description: "Absolute paths to the PDFs, in the order they should appear." },
    ],
    outputExtension: ".pdf",
  },
  {
    name: "extract_pdf_text",
    path: "/pdf-to-text",
    description:
      "Return the text of a PDF as UTF-8, so it can be read or summarized. Fast and exact when the PDF already has a text layer. A scanned PDF has none — run ocr_pdf on it first.",
    fields: [{ kind: "input_file", name: "file", description: "Absolute path to the PDF." }],
    outputExtension: ".txt",
  },
  {
    name: "ocr_pdf",
    path: "/ocr-pdf",
    description:
      "Add a searchable text layer to a scanned PDF, making it selectable and searchable. Use this before extracting text from a scan or a photographed document. Scans at 300 DPI or higher read well; below 150 DPI the result degrades badly.",
    fields: [{ kind: "input_file", name: "file", description: "Absolute path to the scanned PDF." }],
    outputExtension: ".pdf",
  },
  // The remaining eight endpoints from Server/openapi.yaml slot in here with
  // no other change: /split-pdf, /pdf-to-jpg, /convert, /image-to-pdf,
  // /html-to-pdf, /protect-pdf, /unlock-pdf, /pdf-to-word.
];
