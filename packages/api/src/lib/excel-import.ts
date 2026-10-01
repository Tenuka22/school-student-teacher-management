import ExcelJS from "exceljs";

import { zipProblem } from "./zip-guard";

/**
 * Reads an uploaded workbook into plain rows, for the import side of the
 * Excel story that `lib/export.ts` writes.
 *
 * ## Why this is here and not in the browser
 *
 * `exceljs` is a dependency of `packages/api` and only that, which is the whole
 * reason: the importers used to parse CSV in the browser with a hand-written
 * splitter, and moving them to `.xlsx` needs a real reader for a real
 * Open Packaging zip. Parsing on the server also means the browser never has to
 * understand a cell type — booleans arrive as `"true"`/`"false"`, dates as a
 * plain day, and the client is left comparing strings.
 *
 * ## The rules, because an import file is written by a person
 *
 * - **The first row is headings.** Everything under it is data.
 * - **A row where every cell is blank is not a row.** Spreadsheets are full of
 *   trailing rows that have formatting but no content, and counting them would
 *   mean reporting "60 imported" for fifty-eight people. A row with *any*
 *   non-blank cell is kept, so a mistake is visible rather than silently
 *   dropped.
 * - **Booleans are written as the words** `true`/`false`, not `1`/`0`, so the
 *   file reads as an answer to a question rather than as a number.
 * - **Headings are matched two ways.** The key is the heading as written — that
 *   is what a round-trip through this file's own template produces — and a
 *   lowercase alias is added for it, so a heading retyped as `Name` still
 *   resolves to `name`.
 */
const MAX_IMPORT_ROWS = 5000;

/** One cell, as the words a person would have typed. */
const cellToText = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (value instanceof Date) {
    // A date typed as 09/09/2026 should not come back as a timestamp with a
    // time the school day never had.
    return value.toISOString().slice(0, 10);
  }
  if ("text" in value && typeof value.text === "string") {
    // CellRichText and CellHyperlink both carry their visible text here.
    return value.text;
  }
  if ("result" in value) {
    // A formula cell: its displayed answer, not the formula behind it.
    return cellToText(value.result);
  }
  return "";
};

export interface ExcelImportResult {
  /** The first worksheet's data rows, keyed by heading. */
  rows: Record<string, string>[];
  /** The headings as written, in order — what the caller validates against. */
  headers: string[];
}

/** Loads a base64 `.xlsx` and returns its first sheet as text rows. */
export const readExcelRows = async (
  base64: string
): Promise<ExcelImportResult> => {
  const workbook = new ExcelJS.Workbook();
  // Decoded into its own `Uint8Array` rather than handed over as a Node
  // `Buffer`: `exceljs`'s own typings describe the pre-typed generic
  // `Buffer`, which does not overlap with the `Buffer<ArrayBuffer>` that
  // `Buffer.from` returns today, and the two will not unify. An `ArrayBuffer`
  // is accepted by both sides and carries no version of its own to argue with.
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  // Before inflating anything: the row cap below only applies once every
  // part is already in memory (F-26).
  const problem = zipProblem(bytes);
  if (problem) {
    throw new Error(problem);
  }
  await workbook.xlsx.load(bytes.buffer);

  const [worksheet] = workbook.worksheets;
  if (!worksheet) {
    throw new Error("That workbook has no sheet in it");
  }

  const headers: string[] = [];
  const columns: { key: string; index: number }[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, index) => {
    const heading = cellToText(cell.value).trim();
    if (heading === "") {
      return;
    }
    headers.push(heading);
    columns.push({ key: heading, index });
    const lowered = heading.toLowerCase();
    if (lowered !== heading) {
      columns.push({ key: lowered, index });
    }
  });

  if (columns.length === 0) {
    throw new Error("The first row of the sheet has no column headings");
  }

  const rows: Record<string, string>[] = [];
  for (let index = 2; index <= worksheet.rowCount; index += 1) {
    if (rows.length >= MAX_IMPORT_ROWS) {
      throw new Error(
        `That sheet has more than ${MAX_IMPORT_ROWS} rows, which is more than this import accepts`
      );
    }

    const sourceRow = worksheet.getRow(index);
    const record: Record<string, string> = {};
    let hasValue = false;
    for (const column of columns) {
      const text = cellToText(sourceRow.getCell(column.index).value).trim();
      if (text !== "") {
        hasValue = true;
      }
      // Prefer a filled cell: when the same heading appears twice, or a heading
      // and its lowercase alias point at different columns, the one with
      // something in it is the one a reader meant.
      if (text !== "" || record[column.key] === undefined) {
        record[column.key] = text;
      }
    }

    if (hasValue) {
      rows.push(record);
    }
  }

  return { headers, rows };
};
