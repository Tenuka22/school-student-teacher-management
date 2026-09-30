import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import { academicProcedure } from "../../../index";
import { readExcelRows } from "../../../lib/excel-import";

/**
 * Turns an uploaded `.xlsx` into rows the browser can diff against what the
 * server already holds.
 *
 * The file is parsed here rather than in the page for the same reason the
 * exports are built here: `exceljs` lives in this package, and a spreadsheet is
 * a zip that cannot be read with `file.text()`. What comes back is deliberately
 * dumb — headings and strings — because the meaning of a column belongs to the
 * importer that chose the heading, and three importers disagree about it.
 *
 * Six megabytes of base64 is a little over four of workbook, which is hundreds
 * of rows of roster with room to spare; a file larger than that is almost
 * certainly not a register.
 */
const MAX_BASE64_LENGTH = 6_000_000;

export const parseExcel = academicProcedure
  .input(
    v.object({
      base64: v.pipe(
        v.string(),
        v.maxLength(MAX_BASE64_LENGTH, "That file is too large to import")
      ),
    })
  )
  .handler(async ({ input }) => {
    try {
      return await readExcelRows(input.base64);
    } catch (error) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          error instanceof Error
            ? error.message
            : "That file could not be read as a spreadsheet",
      });
    }
  });
