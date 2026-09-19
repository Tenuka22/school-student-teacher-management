import { studentSubjectSelection } from "@school-student-teacher-management/db/schema/marking";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireStudentPermission } from "../../index";

const listSubjectSelectionHistorySchema = v.object({
  studentId: v.string(),
  academicYearId: v.string(),
});

/**
 * Every selection ever recorded for a student in a year, active and
 * superseded alike, oldest first — the full audit trail behind the current
 * selection returned by `getCurrentSubjectSelections`.
 */
export const listSubjectSelectionHistory = requireStudentPermission("read")
  .input(listSubjectSelectionHistorySchema)
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select()
      .from(studentSubjectSelection)
      .where(
        and(
          eq(studentSubjectSelection.studentId, input.studentId),
          eq(studentSubjectSelection.academicYearId, input.academicYearId)
        )
      )
      .orderBy(asc(studentSubjectSelection.createdAt));

    return rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      academicYearId: row.academicYearId,
      basketCategory: row.basketCategory,
      subjectKey: row.subjectKey,
      previousSelectionId: row.previousSelectionId,
      supersededAt: row.supersededAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  });
