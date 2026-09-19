import { academicYear } from "@school-student-teacher-management/db/schema/staff";
import { desc } from "drizzle-orm";

import { adminProcedure } from "../../index";

export const listAcademicYears = adminProcedure.handler(async ({ context }) => {
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
});
