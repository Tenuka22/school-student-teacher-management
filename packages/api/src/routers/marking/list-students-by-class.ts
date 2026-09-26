/**
 * One class's roster, for one academic year.
 *
 * **Scoping rule: a teacher may read the roster of a class they teach, and the
 * year is part of the scope, not decoration.**
 *
 * Two independent defects were fixed here, and they are worth keeping apart
 * because they fail in different ways:
 *
 * 1. **No class scoping at all.** The procedure is on
 *    `requireAssignmentPermission("read")`, which the `teacher` role holds, and
 *    the query was `where(eq(studentClassAssignment.classId, input.classId))`
 *    and nothing else — so any teacher could read any class's roster, in any
 *    year, by passing that class's id. The guard is `assertCallerTeachesClass`,
 *    the same one `listMarksForClass` uses, so "may I read this class" is
 *    answered identically wherever it is asked.
 * 2. **The declared `academicYearId` input was never used.** It was validated,
 *    carried through the signature, and then ignored by the query, which
 *    filtered on `classId` alone. Since `student_class_assignment` is unique on
 *    `(studentId, academicYearId)` and a pupil gets a fresh row every year, that
 *    is not a cosmetic omission: asking for 9-B in 2026 returned 9-B *and* 9-B
 *    last year, 9-B the year before, and every year the class has ever existed,
 *    as one undifferentiated list. The predicate is now in the query, and the
 *    guard independently refuses a `classId` that does not belong to the year
 *    that was named — so the input is enforced in two places rather than one.
 */
import {
  student,
  studentClassAssignment,
} from "@school-student-teacher-management/db/schema/marking";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../index";
import {
  assertCallerTeachesClassOrLeadershipSeat,
  resolveMarkingActor,
} from "./assert-caller-teaches-class";

const listStudentsByClassSchema = v.object({
  academicYearId: v.string(),
  classId: v.string(),
});

export const listStudentsByClass = requireAssignmentPermission("read")
  .input(listStudentsByClassSchema)
  .handler(async ({ input, context }) => {
    /**
     * The guard runs before the roster read rather than after it, and it takes
     * the year with it: the year is half of what is being asked for, so a
     * `classId` from a different year is a `NOT_FOUND` about a class that does
     * not exist in the year named, not a `FORBIDDEN` about one that does.
     *
     * A leadership seat passes here without a class claim — see the module doc
     * of `./assert-caller-teaches-class` for why a leader is not a teacher and
     * why the bypass is keyed on the role rather than on a staff row.
     */
    const actor = await resolveMarkingActor(context);
    await assertCallerTeachesClassOrLeadershipSeat(
      context.db,
      { classId: input.classId, academicYearId: input.academicYearId },
      actor
    );

    const assignments = await context.db
      .select({
        id: studentClassAssignment.id,
        studentId: studentClassAssignment.studentId,
        classId: studentClassAssignment.classId,
        academicYearId: studentClassAssignment.academicYearId,
        createdAt: studentClassAssignment.createdAt,
        firstName: student.firstName,
        lastName: student.lastName,
        admissionNumber: student.admissionNumber,
      })
      .from(studentClassAssignment)
      .innerJoin(student, eq(studentClassAssignment.studentId, student.id))
      // Defect 2 above, made visible: the year the caller asked about is now
      // the year the rows are filtered by. `classId` alone was every year the
      // class has existed.
      .where(
        and(
          eq(studentClassAssignment.classId, input.classId),
          eq(studentClassAssignment.academicYearId, input.academicYearId)
        )
      )
      // Register order rather than insertion order, with the assignment id as a
      // tiebreak: a roll is read down a column, and `created_at` is a
      // `defaultNow()` that two admissions in one transaction share.
      .orderBy(
        asc(student.lastName),
        asc(student.firstName),
        asc(studentClassAssignment.id)
      );

    return assignments.map((row) => ({
      assignmentId: row.id,
      studentId: row.studentId,
      firstName: row.firstName,
      lastName: row.lastName,
      admissionNumber: row.admissionNumber,
      classId: row.classId,
      academicYearId: row.academicYearId,
      createdAt: row.createdAt.toISOString(),
    }));
  });
