/**
 * One student's record.
 *
 * **Scoping rule: a teacher reaches a student only through a class they teach
 * this year; a leadership seat may read any student.**
 *
 * The procedure is keyed on a `student`, not on a class, and that is the whole
 * problem with its shape: a `where(eq(student.id, input.id))` on a
 * `student: ["read"]` grant is a `where` over the entire enrolment, and the
 * row it returns carries `dateOfBirth`, `phone` and `parentPhone`. So the guard
 * resolves the student's class for the year in question and hands *that* to the
 * class check — the student is not a scope, the class is. See
 * `assertCallerReachesStudentInCurrentYear`.
 *
 * There is no year in the input, so the year is the current one. **A student
 * with no assignment in the current year is therefore not reachable by a
 * teacher** — there is no class to scope the read to, and refusing is the only
 * answer that does not leak: both "not placed this year" and "no such student"
 * come back as the same `NOT_FOUND`, so the refusal is not an existence oracle
 * either. A **leadership seat sees them anyway**, and sees the unplaced student
 * as plainly as a placed one: the bypass runs before the assignment lookup,
 * because an administrator asking about a pupil who has not been placed yet is
 * asking exactly the question they most need answered.
 */
import {
  student,
  studentSelectSchema,
} from "@school-student-teacher-management/db/schema/marking";
import { eq } from "drizzle-orm";
import { pick } from "valibot";

import { requireStudentPermission } from "../../index";
import {
  assertCallerReachesStudentInCurrentYear,
  resolveMarkingActor,
} from "./assert-caller-teaches-class";

export const getStudent = requireStudentPermission("read")
  .input(pick(studentSelectSchema, ["id"]))
  .handler(async ({ input, context }) => {
    // The guard, before the read that would return the row.
    const actor = await resolveMarkingActor(context);
    await assertCallerReachesStudentInCurrentYear(context.db, input.id, actor);

    const [row] = await context.db
      .select()
      .from(student)
      .where(eq(student.id, input.id));

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      admissionNumber: row.admissionNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      dateOfBirth: row.dateOfBirth,
      gender: row.gender,
      phone: row.phone,
      parentPhone: row.parentPhone,
      admissionYear: row.admissionYear,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
