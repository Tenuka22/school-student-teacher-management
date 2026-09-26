/**
 * A student's whole mark record, every year, in order.
 *
 * **Scoping rule: a teacher reaches this history only through a class they
 * teach this year; a leadership seat may read any student's.**
 *
 * The query returned any student's marks across every year they have ever been
 * marked, and `enteredByStaffId` came back with them — so `student: ["read"]`
 * was a full transcript export for the whole school, one id at a time. The
 * guard resolves the student's class for the current year and hands that to the
 * class check; the student is not a scope, the class is. See
 * `assertCallerReachesStudentInCurrentYear`.
 *
 * There is no year in the input, so the year is the current one, and **a
 * student with no assignment this year is not reachable by a teacher** — there
 * is no class to scope to, and "not placed" and "no such student" both answer
 * with the same `NOT_FOUND` so the refusal is not an existence oracle. A
 * **leadership seat sees them anyway**, unplaced or not.
 *
 * **What stays visible after the guard, stated plainly because it is a real
 * decision rather than an oversight:** the rows returned span *all* years, not
 * the current one. A teacher who teaches a pupil this year sees that pupil's
 * record from every year they were on the roll. That is the point of the
 * procedure — it is the "how has this child done across their school career"
 * view a homeroom teacher needs and cannot reconstruct from one year — and it
 * is the same record the class's own mark history already exposes. Narrowing the
 * rows to the current year instead would have turned a procedure called *history*
 * into a second `listMarksForClass` under a name that promises otherwise, and
 * would have hidden from the reader that older years exist. The claim being
 * enforced is *whose* record this is, not *which years of it*.
 */
import {
  studentClassAssignment,
  subjectMark,
} from "@school-student-teacher-management/db/schema/marking";
import { asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireStudentPermission } from "../../index";
import {
  assertCallerReachesStudentInCurrentYear,
  resolveMarkingActor,
} from "./assert-caller-teaches-class";

const getStudentHistorySchema = v.object({
  studentId: v.string(),
});

export const getStudentHistory = requireStudentPermission("read")
  .input(getStudentHistorySchema)
  .handler(async ({ input, context }) => {
    // The guard, before the read that would return the rows.
    const actor = await resolveMarkingActor(context);
    await assertCallerReachesStudentInCurrentYear(
      context.db,
      input.studentId,
      actor
    );

    const rows = await context.db
      .select({
        id: subjectMark.id,
        mark: subjectMark.mark,
        grade: subjectMark.grade,
        subjectKey: subjectMark.subjectKey,
        examTypeId: subjectMark.examTypeId,
        enteredByStaffId: subjectMark.enteredByStaffId,
        createdAt: subjectMark.createdAt,
        updatedAt: subjectMark.updatedAt,
        academicYearId: studentClassAssignment.academicYearId,
        classId: studentClassAssignment.classId,
      })
      .from(subjectMark)
      .innerJoin(
        studentClassAssignment,
        eq(subjectMark.studentClassAssignmentId, studentClassAssignment.id)
      )
      .where(eq(studentClassAssignment.studentId, input.studentId))
      // Year, then exam, then subject, with the mark id last: the question this
      // screen answers is always "in what order did this child sit these exams",
      // and an ordering that changes between two renders of the same page makes
      // a trend line wobble for no reason.
      .orderBy(
        asc(studentClassAssignment.academicYearId),
        asc(subjectMark.examTypeId),
        asc(subjectMark.subjectKey),
        asc(subjectMark.id)
      );

    return rows.map((row) => ({
      id: row.id,
      mark: row.mark,
      grade: row.grade,
      subjectKey: row.subjectKey,
      examTypeId: row.examTypeId,
      enteredByStaffId: row.enteredByStaffId,
      academicYearId: row.academicYearId,
      classId: row.classId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  });
