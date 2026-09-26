/**
 * Every selection ever recorded for a student in a year, active and superseded
 * alike, oldest first — the full audit trail behind the current selection
 * returned by `getCurrentSubjectSelections`.
 *
 * **Scoping rule: a teacher reaches a student's selection trail only through a
 * class they teach in the year named; a leadership seat may read any student's.**
 *
 * This is the wider of the two selection reads and the one that needed the guard
 * more: it returns *superseded* rows, so it discloses not only what a child
 * chose but what they were talked out of — the basket a guidance conversation
 * moved them off, with the timestamp it happened. That is a record about a
 * specific child and a specific family, which is why "the teacher can read
 * students in their class" had to mean a class and not a grade.
 *
 * The year in the input is part of the scope, so the guard resolves the class
 * for *that* year rather than the current one; a teacher looking at last year's
 * choices is a legitimate question about a class they taught.
 */
import { studentSubjectSelection } from "@school-student-teacher-management/db/schema/marking";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireStudentPermission } from "../../index";
import {
  assertCallerReachesStudent,
  resolveMarkingActor,
} from "./assert-caller-teaches-class";

const listSubjectSelectionHistorySchema = v.object({
  studentId: v.string(),
  academicYearId: v.string(),
});

export const listSubjectSelectionHistory = requireStudentPermission("read")
  .input(listSubjectSelectionHistorySchema)
  .handler(async ({ input, context }) => {
    // The guard, before the read that would return the rows.
    const actor = await resolveMarkingActor(context);
    await assertCallerReachesStudent(
      context.db,
      { studentId: input.studentId, academicYearId: input.academicYearId },
      actor
    );

    const rows = await context.db
      .select()
      .from(studentSubjectSelection)
      .where(
        and(
          eq(studentSubjectSelection.studentId, input.studentId),
          eq(studentSubjectSelection.academicYearId, input.academicYearId)
        )
      )
      /**
       * Oldest first, because this is a history and the question is what
       * changed. `created_at` is a `defaultNow()` and two selections made in one
       * transaction share it, so the id breaks the tie — a trail whose order
       * changes between two renders of the same page is not a trail.
       */
      .orderBy(
        asc(studentSubjectSelection.createdAt),
        asc(studentSubjectSelection.basketCategory),
        asc(studentSubjectSelection.id)
      );

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
