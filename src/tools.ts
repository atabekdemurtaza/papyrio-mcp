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
      "Add an invisible text layer to a scanned PDF so its text can be searched, selected and extracted. Use this before extract_pdf_text or pdf_to_word on a scan or photographed document, and set lang when the text is not English. The page images are kept, so the output is about the same size as the input, and pages that already have text are left untouched. Takes roughly 2-10 seconds per page. Scans at 300 DPI or higher read well; below 150 DPI accuracy degrades badly.",
    fields: [
      { kind: "input_file", name: "file", description: "Absolute path to the scanned PDF." },
      {
        kind: "text",
        name: "lang",
        description:
          "Language of the document's text as a Tesseract code: eng (English), rus (Russian), spa (Spanish), ita (Italian), uzb (Uzbek, Latin script), uzb_cyrl (Uzbek, Cyrillic) or kaz (Kazakh). For mixed documents join two with '+', for example rus+eng. Any other value is rejected. Defaults to eng.",
        required: false,
        default: "eng",
      },
    ],
    outputExtension: ".pdf",
  },
  {
    name: "pdf_to_word",
    path: "/pdf-to-word",
    description:
      "Convert a PDF into an editable Word document. PDFs exported from Word, Google Docs or InDesign come through well. A scanned PDF is a picture of a page, so run ocr_pdf on it first.",
    fields: [{ kind: "input_file", name: "file", description: "Absolute path to the PDF." }],
    outputExtension: ".docx",
  },
  {
    name: "split_pdf",
    path: "/split-pdf",
    description:
      "Separate every page of a PDF into its own file, returned as a ZIP archive. Use this to pull single pages out of a long document.",
    fields: [{ kind: "input_file", name: "file", description: "Absolute path to the PDF to split." }],
    outputExtension: ".zip",
  },
  {
    name: "pdf_to_jpg",
    path: "/pdf-to-jpg",
    description:
      "Render every page of a PDF as a JPG image, returned as a ZIP archive. Use this when the pages are needed as pictures, for a thumbnail, a slide or an image pipeline.",
    fields: [{ kind: "input_file", name: "file", description: "Absolute path to the PDF." }],
    outputExtension: ".zip",
  },
  {
    name: "office_to_pdf",
    path: "/convert",
    description:
      "Convert a Word (.doc, .docx, .odt), PowerPoint (.ppt, .pptx) or Excel (.xls, .xlsx) document to PDF with LibreOffice, keeping fonts, tables, images and page layout; each slide or sheet becomes one or more pages. Use this to turn an Office file into a fixed, shareable PDF, not for files that are already PDFs. Large presentations can take 30 seconds or more. Password-protected Office files are not supported.",
    fields: [
      {
        kind: "input_file",
        name: "file",
        description: "Absolute path to the Office document. The extension decides how it is read, so it must be one of .doc, .docx, .odt, .ppt, .pptx, .xls or .xlsx.",
      },
    ],
    outputExtension: ".pdf",
  },
  {
    name: "image_to_pdf",
    path: "/image-to-pdf",
    description:
      "Wrap a JPG, PNG or WebP image in a PDF page. Use this when an image needs to be submitted or printed as a PDF.",
    fields: [{ kind: "input_file", name: "file", description: "Absolute path to the image." }],
    outputExtension: ".pdf",
  },
  {
    name: "webpage_to_pdf",
    path: "/html-to-pdf",
    description:
      "Fetch a public URL and render the page to PDF in a headless browser. Use this to archive or print a web page. This tool takes a URL rather than a file, so output_path is required.",
    fields: [
      {
        kind: "text",
        name: "url",
        description: "Publicly reachable page URL, including https://.",
        required: true,
      },
    ],
    outputExtension: ".pdf",
  },
  {
    name: "protect_pdf",
    path: "/protect-pdf",
    description:
      "Encrypt a PDF with AES-256 so it cannot be opened without the password. Use this before sending a document that contains anything private.",
    fields: [
      { kind: "input_file", name: "file", description: "Absolute path to the PDF to encrypt." },
      {
        kind: "text",
        name: "password",
        description: "Password that will be required to open the resulting PDF.",
        required: true,
      },
    ],
    outputExtension: ".pdf",
  },
  {
    name: "unlock_pdf",
    path: "/unlock-pdf",
    description:
      "Remove the password from a PDF you already know the password for. This decrypts with the supplied password; it does not break or guess encryption.",
    fields: [
      { kind: "input_file", name: "file", description: "Absolute path to the password-protected PDF." },
      {
        kind: "text",
        name: "password",
        description: "The PDF's current password.",
        required: true,
      },
    ],
    outputExtension: ".pdf",
  },
];
