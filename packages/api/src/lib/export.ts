import * as fs from "node:fs";
import { createRequire } from "node:module";

import ExcelJS from "exceljs";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

/**
 * pdfmake's top-level entry is a browser-oriented singleton; the server-side
 * PDF generator class lives at this subpath. Loaded through `createRequire`
 * rather than a static `import`, because Vite's dev SSR module runner
 * double-wraps this particular CJS module's own `{ __esModule, default }`
 * shape — `import PdfPrinter from "pdfmake/js/Printer"` resolves to an
 * object instead of the constructor, and `new PdfPrinter(...)` fails with
 * "is not a constructor" the first time any export actually runs one. A
 * plain Node `require`, which is what this becomes, sees the module exactly
 * as Node's own module system does and needs no interop guess at all.
 */
/**
 * The installed `pdfmake@0.3` shape, typed by hand rather than imported:
 * `@types/pdfmake` still describes the pre-0.3 API (a one-argument
 * constructor, a synchronous `createPdfKitDocument`), and importing those
 * types here would type-check against an API this version does not have
 * while lying about the one it does.
 */
/** The one shape this file reads off the resolved PDFKit document. */
interface PdfKitDocumentLike {
  on: ((event: "data", listener: (chunk: Buffer) => void) => void) &
    ((event: "end", listener: () => void) => void) &
    ((event: "error", listener: (error: Error) => void) => void);
  end: () => void;
}

interface PdfPrinterInstance {
  createPdfKitDocument: (
    docDefinition: TDocumentDefinitions,
    options: Record<string, unknown>
  ) => Promise<PdfKitDocumentLike>;
}
type PdfPrinterConstructor = new (
  fontDescriptors: unknown,
  virtualfs: unknown,
  urlResolver: unknown
) => PdfPrinterInstance;
type UrlResolverConstructor = new (fileSystem: unknown) => unknown;

const require = createRequire(import.meta.url);
const PdfPrinter: PdfPrinterConstructor = require("pdfmake/js/Printer").default;
/**
 * pdfmake 0.3 made `createPdfKitDocument` call `resolveUrls` unconditionally,
 * and `resolveUrls` dereferences `this.urlResolver` with no null check — a
 * regression from 0.3.4 tracked upstream as bpampuch/pdfmake#2924. Every font
 * descriptor, including a bare PDFKit standard-font name like "Helvetica",
 * now has to go through a real resolver or the constructor call itself
 * throws before a single page is laid out. This is the workaround the issue
 * itself documents: build the same `URLResolver` pdfmake's own CLI wires up
 * internally, backed by Node's `fs` (unused here, since nothing in this
 * app's PDFs is a remote font or a remote image, but the resolver requires
 * one to construct).
 */
const URLResolver: UrlResolverConstructor =
  require("pdfmake/js/URLResolver").default;
const urlResolver = new URLResolver(fs);

export interface ExportFile {
  filename: string;
  mimeType: string;
  base64: string;
}

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

export interface ExcelSheet {
  name: string;
  columns: ExcelColumn[];
  rows: Record<string, unknown>[];
}

/** Builds a real .xlsx workbook (one worksheet per entry) and returns it base64-encoded. */
export const buildExcelExport = async (
  filename: string,
  sheets: ExcelSheet[]
): Promise<ExportFile> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "school-student-teacher-management";
  workbook.created = new Date();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name.slice(0, 31));
    worksheet.columns = sheet.columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width ?? 20,
    }));
    worksheet.getRow(1).font = { bold: true };
    for (const row of sheet.rows) {
      worksheet.addRow(row);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    filename,
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    base64: Buffer.from(buffer).toString("base64"),
  };
};

const STANDARD_FONTS = {
  Roboto: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

/** Builds a real PDF from a pdfmake document definition and returns it base64-encoded. */
export const buildPdfExport = async (
  filename: string,
  docDefinition: TDocumentDefinitions
): Promise<ExportFile> => {
  const printer = new PdfPrinter(STANDARD_FONTS, fs, urlResolver);
  const doc = await printer.createPdfKitDocument(docDefinition, {});
  const { promise, resolve, reject } = Promise.withResolvers<ExportFile>();
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  doc.on("end", () => {
    resolve({
      filename,
      mimeType: "application/pdf",
      base64: Buffer.concat(chunks).toString("base64"),
    });
  });
  doc.on("error", reject);
  doc.end();
  return promise;
};
