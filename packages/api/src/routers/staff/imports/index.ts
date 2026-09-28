import {
  applyAttendanceImport,
  previewAttendanceImport,
} from "./attendance-import";
import { parseExcel } from "./parse-excel";

/**
 * Spreadsheet import: reading a file the browser picked, and — for attendance —
 * turning what it says into marks on the register.
 *
 * `parseExcel` is the shared half. Every importer sends the workbook here and
 * gets headings and strings back; only attendance has procedures of its own
 * after that, because it is the only import that writes to a table the rest of
 * the app is reading at the same time. The teachers and classes importers
 * resolve their own rows in the browser, where the records they compare against
 * are already loaded.
 */
export const importsRouter = {
  parseExcel,
  previewAttendanceImport,
  applyAttendanceImport,
};
