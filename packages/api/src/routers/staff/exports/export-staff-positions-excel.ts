import {
  staffPosition,
  academicYearIdSchema,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";
import { buildExcelExport } from "../../../lib/export";

/** Exports every staff position assignment for an academic year as a single-sheet .xlsx workbook. */
export const exportStaffPositionsExcel = requireAssignmentPermission("read")
  .input(v.object({ academicYearId: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select({
        staffName: staff.name,
        position: staffPosition.position,
        sectionalScope: staffPosition.sectionalScope,
      })
      .from(staffPosition)
      .innerJoin(staff, eq(staffPosition.staffId, staff.id))
      .where(eq(staffPosition.academicYearId, input.academicYearId));

    return buildExcelExport("staff-positions.xlsx", [
      {
        name: "Staff Positions",
        columns: [
          { header: "Staff Name", key: "staffName", width: 28 },
          { header: "Position", key: "position", width: 24 },
          { header: "Sectional Scope", key: "sectionalScope", width: 20 },
        ],
        rows: rows.map((row) => ({
          staffName: row.staffName,
          position: row.position,
          sectionalScope: row.sectionalScope ?? "",
        })),
      },
    ]);
  });
