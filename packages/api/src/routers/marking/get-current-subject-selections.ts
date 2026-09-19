import { studentSubjectSelection } from "@school-student-teacher-management/db/schema/marking";
import { and, eq, isNull } from "drizzle-orm";
import * as v from "valibot";

import { requireStudentPermission } from "../../index";

const getCurrentSubjectSelectionsSchema = v.object({
  studentId: v.string(),
  academicYearId: v.string(),
});

/** The active (non-superseded) subject selection per basket category. */
export const getCurrentSubjectSelections = requireStudentPermission("read")
  .input(getCurrentSubjectSelectionsSchema)
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select()
      .from(studentSubjectSelection)
      .where(
        and(
          eq(studentSubjectSelection.studentId, input.studentId),
          eq(studentSubjectSelection.academicYearId, input.academicYearId),
          isNull(studentSubjectSelection.supersededAt)
        )
      );

    return rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      academicYearId: row.academicYearId,
      basketCategory: row.basketCategory,
      subjectKey: row.subjectKey,
      previousSelectionId: row.previousSelectionId,
      createdAt: row.createdAt.toISOString(),
    }));
  });
