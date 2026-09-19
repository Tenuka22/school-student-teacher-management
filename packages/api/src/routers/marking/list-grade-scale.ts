import { gradeScale } from "@school-student-teacher-management/db/schema/marking";
import { eq, and } from "drizzle-orm";
import * as v from "valibot";

import { requireExamPermission } from "../../index";

const listGradeScaleSchema = v.object({
  academicYearId: v.string(),
  subjectKey: v.optional(v.nullable(v.string())),
});

export const listGradeScale = requireExamPermission("read")
  .input(listGradeScaleSchema)
  .handler(async ({ input, context }) => {
    const conditions = [eq(gradeScale.academicYearId, input.academicYearId)];

    if (input.subjectKey) {
      conditions.push(eq(gradeScale.subjectKey, input.subjectKey));
    }

    const rows = await context.db
      .select()
      .from(gradeScale)
      .where(and(...conditions));

    return rows.map((row) => ({
      id: row.id,
      academicYearId: row.academicYearId,
      subjectKey: row.subjectKey,
      grade: row.grade,
      minMark: row.minMark,
      maxMark: row.maxMark,
      createdAt: row.createdAt.toISOString(),
    }));
  });
