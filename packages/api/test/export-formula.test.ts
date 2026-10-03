/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
/**
 * I1 regression: user-typed text that looks like a formula leaves an Excel
 * export as text — never a formula, and formatted so an edit keeps it text.
 */
import { describe, expect, test } from "bun:test";

import ExcelJS from "exceljs";

import { buildExcelExport } from "../src/lib/export";

const PAYLOADS = [
  "=CMD|' /C calc'!A0",
  "+1+1",
  "-2+3",
  "@SUM(1)",
  "\t=1+1",
] as const;

const readBack = async (values: readonly string[]) => {
  const file = await buildExcelExport("t", [
    {
      name: "Sheet",
      columns: [{ header: "Value", key: "value" }],
      rows: values.map((value) => ({ value })),
    },
  ]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    Buffer.from(file.base64, "base64") as unknown as ArrayBuffer
  );
  const sheet = workbook.getWorksheet("Sheet");
  if (!sheet) {
    throw new Error("sheet missing");
  }
  return values.map((_, index) => sheet.getCell(index + 2, 1));
};

describe("Excel export formula injection (I1)", () => {
  test("formula-like text stays text, unchanged, in Text format", async () => {
    const cells = await readBack(PAYLOADS);
    for (const [index, cell] of cells.entries()) {
      expect(cell.type).toBe(ExcelJS.ValueType.String);
      expect(cell.formula).toBeUndefined();
      expect(cell.value).toBe(PAYLOADS[index]);
      expect(cell.numFmt).toBe("@");
    }
  });

  test("ordinary text is left in the default format", async () => {
    const [cell] = await readBack(["Grade 6 A"]);
    expect(cell?.value).toBe("Grade 6 A");
    expect(cell?.numFmt).not.toBe("@");
  });
});
