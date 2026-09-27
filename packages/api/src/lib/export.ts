import ExcelJS from "exceljs";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
// pdfmake's top-level entry is a browser-oriented singleton; the server-side
// PDF generator class lives at this subpath.
import PdfPrinterModule from "pdfmake/js/Printer";
import URLResolverModule from "pdfmake/js/URLResolver";
import virtualFsModule from "pdfmake/js/virtual-fs";

// These subpaths are Babel-compiled CJS (`exports.default = …` with
// `__esModule`). Node-style ESM interop (Vite SSR) hands back the whole
// `exports` object as the default import, while bundlers unwrap it — accept both.
const cjsDefault = <T>(mod: T): T => (mod as { default?: T }).default ?? mod;

const PdfPrinter = cjsDefault(PdfPrinterModule);
const URLResolver = cjsDefault(URLResolverModule);
const virtualFs = cjsDefault(virtualFsModule);

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

const STANDARD_FONT_NAMES = new Set(
  Object.values(STANDARD_FONTS.Roboto) as string[]
);

/** Builds a real PDF from a pdfmake document definition and returns it base64-encoded. */
export const buildPdfExport = async (
  filename: string,
  docDefinition: TDocumentDefinitions
): Promise<ExportFile> => {
  // Exports only use pdfkit's built-in fonts: never fetch URLs or read local files.
  const urlResolver = new URLResolver(virtualFs);
  urlResolver.setUrlAccessPolicy(() => false);
  const printer = new PdfPrinter(
    STANDARD_FONTS,
    virtualFs,
    urlResolver,
    (path) => STANDARD_FONT_NAMES.has(path)
  );
  const doc = await printer.createPdfKitDocument(docDefinition);
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
