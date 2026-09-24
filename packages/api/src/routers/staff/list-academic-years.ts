import { academicYear } from "@school-student-teacher-management/db/schema/staff";
import { desc } from "drizzle-orm";

import { protectedProcedure } from "../../index";

/**
 * Academic years, newest first. Readable by every signed-in member because
 * the sidebar year switcher and the academic-year gate both render on
 * teacher pages too — not just the admin workspace. Mutating the current
 * year stays admin-only (`setCurrentYear`).
 */
export const listAcademicYears = protectedProcedure.handler(
  async ({ context }) => {
    const rows = await context.db
      .select()
      .from(academicYear)
      .orderBy(desc(academicYear.year));

    return rows.map((row) => ({
      id: row.id,
      year: row.year,
      startDate: row.startDate,
      endDate: row.endDate,
      structureVersionKey: row.structureVersionKey,
      structureSubversionKey: row.structureSubversionKey,
      isCurrent: row.isCurrent,
      createdAt: row.createdAt.toISOString(),
    }));
  }
);
