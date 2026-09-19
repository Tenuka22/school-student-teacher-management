import { examType } from "@school-student-teacher-management/db/schema/marking";
import { and, eq, asc } from "drizzle-orm";
import * as v from "valibot";

import { requireExamPermission } from "../../index";

const listExamTypesSchema = v.object({
  academicYearId: v.string(),
  /** Optional: only exam types for this grade (plus ungraded legacy rows). */
  gradeLevel: v.optional(v.number()),
});

export const listExamTypes = requireExamPermission("read")
  .input(listExamTypesSchema)
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select()
      .from(examType)
      .where(
        input.gradeLevel === undefined
          ? eq(examType.academicYearId, input.academicYearId)
          : and(
              eq(examType.academicYearId, input.academicYearId),
              eq(examType.gradeLevel, input.gradeLevel)
            )
      )
      .orderBy(asc(examType.sortOrder));

    return rows.map((row) => ({
      id: row.id,
      academicYearId: row.academicYearId,
      name: row.name,
      category: row.category,
      gradeLevel: row.gradeLevel,
      maxMark: row.maxMark,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
    }));
  });
