import * as v from "valibot";

import { adminProcedure } from "../../../index";
import { buildExcelExport } from "../../../lib/export";

/**
 * Builds any workbook the browser describes, and returns it base64-encoded.
 *
 * ## Why this is generic
 *
 * The import templates for teachers, classes and attendance are three lists of
 * headings with three sets of rows, and the headings are defined **in the
 * component that reads the file back** — that is what makes a template
 * round-trip: the same constant writes the header row and looks up the value
 * under it. Putting the headings on the server instead would mean two
 * definitions that have to be kept in step by hand, which is precisely the
 * failure a template exists to prevent.
 *
 * So the server keeps the only thing it must own — how to write an `.xlsx` —
 * and the browser sends headings and rows. This is not a file-write path: the
 * workbook is built in memory and handed back, the same way every other export
 * works.
 */
const sheetSchema = v.object({
  // Excel refuses a sheet name longer than 31 characters.
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(31)),
  columns: v.array(
    v.object({
      header: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
      key: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
      width: v.optional(
        v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(255))
      ),
    })
  ),
  rows: v.array(v.record(v.string(), v.unknown())),
});

/** A filename that cannot carry a path, and that opens in a spreadsheet. */
const toWorkbookFilename = (filename: string): string => {
  const safe = filename
    .trim()
    .replaceAll(/[^\w.-]+/gu, "-")
    .slice(0, 120);
  const cleaned = safe === "" ? "workbook" : safe;
  return cleaned.toLowerCase().endsWith(".xlsx") ? cleaned : `${cleaned}.xlsx`;
};

export const exportWorkbook = adminProcedure
  .input(
    v.object({
      filename: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
      sheets: v.pipe(v.array(sheetSchema), v.maxLength(20, "Too many sheets")),
    })
  )
  .handler(({ input }) =>
    buildExcelExport(toWorkbookFilename(input.filename), input.sheets)
  );
