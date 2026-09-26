/**
 * The active (non-superseded) subject selection per basket category.
 *
 * **Scoping rule: a teacher reaches a student's subject choices only through a
 * class they teach in the year named; a leadership seat may read any student's.**
 *
 * The procedure is keyed on `studentId` + `academicYearId`, and the query read
 * exactly those two columns — which meant `student: ["read"]` was the subject
 * choices of every pupil in the school, for any year, one id at a time. A
 * subject selection is a child's academic record, and for the senior grades it
 * is the one that decided their basket, so it is not a formality either.
 *
 * Both inputs are load-bearing here, which is why this procedure resolves the
 * class **for the year in the input** rather than for the current one: a teacher
 * asking about a selection they recorded last term must be answered about last
 * term. The guard is `assertCallerReachesStudent`.
 */
import { studentSubjectSelection } from "@school-student-teacher-management/db/schema/marking";
import { and, asc, eq, isNull } from "drizzle-orm";
import * as v from "valibot";

import { requireStudentPermission } from "../../index";
import {
  assertCallerReachesStudent,
  resolveMarkingActor,
} from "./assert-caller-teaches-class";

const getCurrentSubjectSelectionsSchema = v.object({
  studentId: v.string(),
  academicYearId: v.string(),
});

export const getCurrentSubjectSelections = requireStudentPermission("read")
  .input(getCurrentSubjectSelectionsSchema)
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
          eq(studentSubjectSelection.academicYearId, input.academicYearId),
          isNull(studentSubjectSelection.supersededAt)
        )
      )
      // One row per basket, and the `sss_active_unique` partial index says which
      // basket is which, so the order the screen shows is the order the database
      // will let a change be applied in.
      .orderBy(asc(studentSubjectSelection.basketCategory));

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
