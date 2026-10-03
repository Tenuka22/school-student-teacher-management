import * as fs from "node:fs";
import { createRequire } from "node:module";

import ExcelJS from "exceljs";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";

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

/** Excel hard-caps a worksheet name here, and counts the suffix in the cap. */
const MAX_SHEET_NAME_LENGTH = 31;

/** `* ? : \ / [ ]` are rejected outright by Excel, and by exceljs before it. */
const SHEET_NAME_FORBIDDEN_CHARS = /[*?:/\\[\]]/gu;

/**
 * Turns any string into a worksheet name exceljs will accept.
 *
 * A sheet name comes from two places: a fixed label, and a record a school
 * typed — "Export every timetable" names a sheet per class, so a class called
 * `6/A` or `O'Brien` reaches exceljs untouched. exceljs throws on the illegal
 * characters, on a leading or trailing apostrophe, on the reserved name
 * `History`, and — case-insensitively — on a name another sheet already holds,
 * which truncating to 31 characters can create out of two distinct names.
 * Any of those aborts the whole export, so the name is repaired here, once,
 * rather than in each caller that happens to build one.
 */
const toSheetName = (rawName: string, taken: Set<string>): string => {
  const trimmed = rawName.trim().replace(/^'+/u, "").replace(/'+$/u, "");
  const legal = trimmed
    .replaceAll(SHEET_NAME_FORBIDDEN_CHARS, "-")
    .slice(0, MAX_SHEET_NAME_LENGTH);
  const base =
    legal === "" || legal.toLowerCase() === "history" ? "Sheet" : legal;

  let candidate = base;
  let copy = 1;
  while (taken.has(candidate.toLowerCase())) {
    copy += 1;
    const suffix = ` ${copy}`;
    candidate = `${base.slice(0, MAX_SHEET_NAME_LENGTH - suffix.length)}${suffix}`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
};

/** What a workbook says when there is nothing to put in it. Excel opens this; a workbook with no sheets it does not. */
const EMPTY_SHEET: ExcelSheet = {
  name: "Empty",
  columns: [{ header: "Notice", key: "notice", width: 44 }],
  rows: [{ notice: "There are no records to export." }],
};

/**
 * A download name with no path in it, and no character a filesystem rejects.
 *
 * Every export is named after something a school typed — a teacher's name, a
 * class called `11/A` — and the browser writes it verbatim, so a slash would
 * be read as a directory separator and a quote turned away by the OS. The
 * extension is owned here so a caller can hand over `record.name` and still
 * get a file the OS recognises.
 */
const toExportFilename = (
  rawName: string,
  extension: ".xlsx" | ".pdf"
): string => {
  const safe = rawName
    .trim()
    .replaceAll(/[^\w.-]+/gu, "-")
    .slice(0, 120);
  const base = safe === "" ? "export" : safe;
  return base.toLowerCase().endsWith(extension) ? base : `${base}${extension}`;
};

/**
 * Text a spreadsheet may read as a formula: `=`, `+`, `-`, `@`, or a leading
 * tab or carriage return (I1).
 *
 * exceljs writes every JS string as a shared-string cell, never a formula, so
 * opening an export executes nothing. What it does not stop is Excel turning
 * the text into a live formula when someone edits the cell, or when the sheet
 * is re-saved as CSV and opened again. Such cells get the Text number format,
 * which keeps the value exactly as typed and keeps it text on edit. The usual
 * alternative — prefixing an apostrophe — would change the data itself, and
 * every phone number here starts with `+94`.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/u;
const TEXT_NUMBER_FORMAT = "@";

/** Builds a real .xlsx workbook (one worksheet per entry) and returns it base64-encoded. */
export const buildExcelExport = async (
  filename: string,
  sheets: ExcelSheet[]
): Promise<ExportFile> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "school-student-teacher-management";
  workbook.created = new Date();

  const takenNames = new Set<string>();
  for (const sheet of sheets.length > 0 ? sheets : [EMPTY_SHEET]) {
    const worksheet = workbook.addWorksheet(
      toSheetName(sheet.name, takenNames)
    );
    worksheet.columns = sheet.columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width ?? 20,
    }));
    worksheet.getRow(1).font = { bold: true };
    for (const row of sheet.rows) {
      const added = worksheet.addRow(row);
      // oxlint-disable-next-line unicorn/no-array-for-each -- exceljs exposes no iterator over a row's cells
      added.eachCell((cell) => {
        if (
          typeof cell.value === "string" &&
          FORMULA_TRIGGER.test(cell.value)
        ) {
          cell.numFmt = TEXT_NUMBER_FORMAT;
        }
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    filename: toExportFilename(filename, ".xlsx"),
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    base64: Buffer.from(buffer).toString("base64"),
  };
};

/** The words to show for the moment a file was produced. */
export const formatGeneratedAt = (date: Date): string =>
  date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Muted enough to read as a printer's mark rather than as content. */
const PDF_FOOTER_COLOR = "#6b7280";

/**
 * The footer both print exports share.
 *
 * Repeated on every page a document spills onto: the sheet is handed round and
 * stapled somewhere, and a page with no date on it is a page nobody can date
 * later.
 */
export const pdfFooter =
  (generatedAt: string) =>
  (currentPage: number, pageCount: number): Content => ({
    columns: [
      {
        text: `Generated ${generatedAt}`,
        fontSize: 8,
        color: PDF_FOOTER_COLOR,
      },
      {
        text: `Page ${currentPage} of ${pageCount}`,
        fontSize: 8,
        color: PDF_FOOTER_COLOR,
        alignment: "right",
      },
    ],
    margin: [40, 0, 40, 0],
  });

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
      filename: toExportFilename(filename, ".pdf"),
      mimeType: "application/pdf",
      base64: Buffer.concat(chunks).toString("base64"),
    });
  });
  doc.on("error", reject);
  doc.end();
  return promise;
};
