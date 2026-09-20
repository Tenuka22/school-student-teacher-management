import ExcelJS from "exceljs";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
// pdfmake's top-level entry is a browser-oriented singleton; the server-side
// PDF generator class lives at this subpath.
import PdfPrinter from "pdfmake/js/Printer";

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
export const buildPdfExport = (
  filename: string,
  docDefinition: TDocumentDefinitions
): Promise<ExportFile> => {
  const { promise, resolve, reject } = Promise.withResolvers<ExportFile>();
  const printer = new PdfPrinter(STANDARD_FONTS);
  const doc = printer.createPdfKitDocument(docDefinition);
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
