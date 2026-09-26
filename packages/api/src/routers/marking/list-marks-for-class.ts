/**
 * Every mark recorded for one class, for one exam.
 *
 * **Scoping rule: marks are the most sensitive thing this app holds — every
 * pupil's mark in every subject, with the name of the colleague who typed it —
 * so a teacher may read only the marks of a class they teach, in the academic
 * year they name.**
 *
 * The guard is the same `assertCallerTeachesClass` the roster uses, and it is
 * the *widest* of the three class claims: a subject teacher with a timetable
 * slot may read the marks of the class they are timetabled against, which is
 * what makes a departmental mark-sheet possible at all. It is deliberately
 * wider than `assertCanEnterMarkForAssignment`, which holds mark **entry** to
 * the homeroom teacher alone — reading a class's marks and writing into them
 * are different acts and are held to different bars, and the schema agrees:
 * `subject_mark` records `enteredByStaffId` precisely so the narrower write
 * gate can be the stricter one.
 *
 * Two more inputs were declared, validated, carried through the signature and
 * then ignored by the query. Both are fixed here, and both were capable of
 * returning more than the caller asked for:
 *
 * - **`academicYearId` was never applied.** The `where` named `classId` and
 *   `examTypeId` only. In practice an `examTypeId` pins its own year (it is a
 *   row of `exam_type`, which is year-keyed), so this was a declared input that
 *   happened to be redundant — but "redundant today" is not a reason to leave a
 *   filter out of a query about marks, and the year is now stated.
 * - **`subjectKey` was never applied.** A caller who narrowed the request to
 *   one subject was handed every subject's marks for every pupil in the class
 *   and was expected to notice. It is now a predicate, so the response is the
 *   response that was asked for.
 */
import {
  studentClassAssignment,
  subjectMark,
} from "@school-student-teacher-management/db/schema/marking";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireMarkPermission } from "../../index";
import {
  assertCallerTeachesClassOrLeadershipSeat,
  resolveMarkingActor,
} from "./assert-caller-teaches-class";

const listMarksForClassSchema = v.object({
  classId: v.string(),
  academicYearId: v.string(),
  examTypeId: v.string(),
  subjectKey: v.optional(v.string()),
});

export const listMarksForClass = requireMarkPermission("read")
  .input(listMarksForClassSchema)
  .handler(async ({ input, context }) => {
    /**
     * Before the read, and with the year: a `classId` from another year is a
     * `NOT_FOUND` about a class that does not exist in the year named, not a
     * `FORBIDDEN` about one that does.
     */
    const actor = await resolveMarkingActor(context);
    await assertCallerTeachesClassOrLeadershipSeat(
      context.db,
      { classId: input.classId, academicYearId: input.academicYearId },
      actor
    );

    const conditions = [
      eq(studentClassAssignment.classId, input.classId),
      eq(studentClassAssignment.academicYearId, input.academicYearId),
      eq(subjectMark.examTypeId, input.examTypeId),
    ];

    /**
     * Only a filter the caller actually supplied becomes a predicate. An
     * unconditional `eq(subjectMark.subjectKey, undefined)` would compile to
     * `subject_key = null` and return nothing at all, which is a failure mode
     * this procedure used not to have only because the filter was missing
     * entirely.
     */
    if (input.subjectKey !== undefined) {
      conditions.push(eq(subjectMark.subjectKey, input.subjectKey));
    }

    const rows = await context.db
      .select({
        id: subjectMark.id,
        mark: subjectMark.mark,
        grade: subjectMark.grade,
        subjectKey: subjectMark.subjectKey,
        enteredByStaffId: subjectMark.enteredByStaffId,
        createdAt: subjectMark.createdAt,
        updatedAt: subjectMark.updatedAt,
        studentClassAssignmentId: subjectMark.studentClassAssignmentId,
        studentId: studentClassAssignment.studentId,
      })
      .from(subjectMark)
      .innerJoin(
        studentClassAssignment,
        eq(subjectMark.studentClassAssignmentId, studentClassAssignment.id)
      )
      .where(and(...conditions))
      /**
       * Subject, then the assignment it belongs to, so a mark sheet reads as a
       * grid — one row per subject, the pupils in a fixed order beneath it. The
       * assignment id is the tiebreak because `subject_key` is not unique within
       * a class and without it two identical subject blocks can swap places
       * between two renders of the same page.
       */
      .orderBy(asc(subjectMark.subjectKey), asc(studentClassAssignment.id));

    return rows.map((row) => ({
      id: row.id,
      mark: row.mark,
      grade: row.grade,
      subjectKey: row.subjectKey,
      enteredByStaffId: row.enteredByStaffId,
      studentClassAssignmentId: row.studentClassAssignmentId,
      studentId: row.studentId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  });
