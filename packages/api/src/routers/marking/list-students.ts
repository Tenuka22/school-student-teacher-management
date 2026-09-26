/**
 * The student roll, narrowed to the classes the caller teaches.
 *
 * **Scoping rule: a teacher sees the students of the classes they teach in the
 * current academic year and nobody else; a leadership seat sees the whole
 * school, which is an administrative view rather than a teaching one.**
 *
 * This procedure used to be `db.select().from(student)` with no `where` and no
 * `limit`, so `student: ["read"]` was the entire enrolment: every pupil's
 * `dateOfBirth`, `phone`, `parentPhone` and `admissionNumber`, to any teacher in
 * the building. It was the widest read in the app, and it is the reason this
 * folder has a guard module (`./assert-caller-teaches-class`).
 *
 * **The two views are deliberately different in size, and the difference is not
 * a mystery to be explained away in the UI.** "Everyone in the school" is the
 * administrative view — it is what the office, the admission desk and the
 * reporting exports need — while "my own classes" is the teaching view, and a
 * teacher's list legitimately shows forty rows where an administrator's shows
 * nine hundred. Both are correct answers to two different questions. A future
 * editor who reads the school-wide branch and concludes the teacher branch is a
 * missing filter has it exactly backwards.
 *
 * There is no input, so there is no year in the input either: the year is the
 * current one, resolved from `academic_year.isCurrent`. Every year-explicit read
 * in this folder takes the year from the caller — `listStudentsByClass` is that
 * procedure — because "the year you are working in" and "the year you asked
 * about" are different questions, and guessing the wrong one returns a real
 * class's real roster.
 */
import { class_ } from "@school-student-teacher-management/db/schema/academics";
import {
  student,
  studentClassAssignment,
} from "@school-student-teacher-management/db/schema/marking";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { requireStudentPermission } from "../../index";
import {
  getCurrentAcademicYearId,
  listCallerTaughtClassIds,
  resolveMarkingActor,
} from "./assert-caller-teaches-class";

/**
 * The same columns for both branches, so the wire shape does not depend on who
 * is asking and one `map` can serve either.
 *
 * `classId` / `className` are joined in rather than left off: "which class is
 * this child in" is the first thing a register screen shows, and it is also what
 * makes a narrowed list legible — a teacher looking at forty rows can see that
 * they are forty rows of *their* two classes. Both are nullable in both
 * branches, which is why both branches below use the same join shape.
 */
const studentSelection = {
  id: student.id,
  admissionNumber: student.admissionNumber,
  firstName: student.firstName,
  lastName: student.lastName,
  dateOfBirth: student.dateOfBirth,
  gender: student.gender,
  phone: student.phone,
  parentPhone: student.parentPhone,
  admissionYear: student.admissionYear,
  createdAt: student.createdAt,
  updatedAt: student.updatedAt,
  classId: studentClassAssignment.classId,
  className: class_.name,
};

export const listStudents = requireStudentPermission("read").handler(
  async ({ context }) => {
    // Who the caller is and which year the school is running are independent
    // reads on two tables, so they are batched rather than costing two round
    // trips in sequence on the school's widest read.
    const [actor, academicYearId] = await Promise.all([
      resolveMarkingActor(context),
      getCurrentAcademicYearId(context.db),
    ]);

    /**
     * `null` is a leadership seat — see `listCallerTaughtClassIds`, which is
     * where the meaning of that `null` is written down. This procedure is the
     * one consumer, and the two arms below are the decision it exists to make.
     */
    const taughtClassIds = await listCallerTaughtClassIds(
      context.db,
      academicYearId,
      actor
    );

    /**
     * A teacher who teaches no class this year gets an empty roll, not the
     * school. The `inArray(col, [])` that would also produce that is
     * short-circuited here instead of being left to drizzle, because "a teacher
     * with no classes sees nothing" is a decision and deserves a line that says
     * so — and because it spares a round trip on the one request that cannot
     * return anything.
     */
    if (taughtClassIds !== null && taughtClassIds.length === 0) {
      return [];
    }

    /**
     * Both branches are `left` joins, deliberately, and the difference is
     * entirely in the `where`.
     *
     * The administrative branch puts the year **inside** the join to
     * `student_class_assignment`: a `where` on those null-joined columns would
     * turn it into an inner join and drop every pupil who has not been placed in
     * a class this term. An unplaced pupil is a real pupil and the office needs
     * to see them — that is most of the reason the school-wide view exists — so
     * their `classId` and `className` come back null, which is a fact about the
     * pupil rather than a missing value.
     *
     * The teaching branch puts the year in a `where` alongside
     * `inArray(classId, taughtClassIds)`, and a `where` on a null-joined column
     * *does* behave like an inner join — which is the intent. A row can only
     * satisfy `classId IN (…)` if it matched a real assignment row, so no pupil
     * outside the caller's classes can survive, and the two branches end up with
     * the same row type for the same reason rather than by coincidence.
     *
     * This is `resolveBorrowerStudentBatch`'s join, for the same reason.
     */
    const rows =
      taughtClassIds === null
        ? await context.db
            .select(studentSelection)
            .from(student)
            .leftJoin(
              studentClassAssignment,
              and(
                eq(studentClassAssignment.studentId, student.id),
                eq(studentClassAssignment.academicYearId, academicYearId)
              )
            )
            .leftJoin(class_, eq(class_.id, studentClassAssignment.classId))
            /**
             * Newest admission first, with the id as a tiebreak: `created_at` is
             * a `defaultNow()` and two admissions inside one transaction share
             * it, and an unstable order hands out a different list on every
             * retry.
             */
            .orderBy(desc(student.createdAt), desc(student.id))
        : await context.db
            .select(studentSelection)
            .from(student)
            .leftJoin(
              studentClassAssignment,
              eq(studentClassAssignment.studentId, student.id)
            )
            .leftJoin(class_, eq(class_.id, studentClassAssignment.classId))
            .where(
              and(
                eq(studentClassAssignment.academicYearId, academicYearId),
                inArray(studentClassAssignment.classId, taughtClassIds)
              )
            )
            /**
             * Roster order, not enrolment order: class, then surname, then first
             * name, with the id as a final tiebreak so two siblings sharing both
             * names cannot swap places between two renders of the same page.
             */
            .orderBy(
              asc(class_.name),
              asc(student.lastName),
              asc(student.firstName),
              asc(student.id)
            );

    return rows.map((row) => ({
      id: row.id,
      admissionNumber: row.admissionNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      dateOfBirth: row.dateOfBirth,
      gender: row.gender,
      phone: row.phone,
      parentPhone: row.parentPhone,
      admissionYear: row.admissionYear,
      classId: row.classId,
      className: row.className,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
);
