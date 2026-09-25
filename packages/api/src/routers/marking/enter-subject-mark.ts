import { ORPCError } from "@orpc/server";
import type { Database } from "@school-student-teacher-management/db";
import { class_ } from "@school-student-teacher-management/db/schema/academics";
import {
  studentClassAssignment,
  subjectMark,
  subjectMarkInsertSchema,
} from "@school-student-teacher-management/db/schema/marking";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import { pick } from "valibot";

import { requireMarkPermission } from "../../index";

/**
 * Confirms the caller may record marks for the class a student sits in.
 *
 * A teacher holds `mark: ["create", "read", "update"]`, and the procedure used
 * to take that as the whole permission story: any teacher could post a mark
 * against any `studentClassAssignmentId` — another teacher's class, another
 * year — because nothing connected the caller to the class. `subject_mark`
 * records the entering staff member precisely so the record can be attributed,
 * and this check is what makes that attribution true.
 *
 * Administration (admin and both leadership seats) may still enter any mark;
 * everyone else must be the homeroom teacher of that class.
 */
export const assertCanEnterMarkForAssignment = async (
  db: Database,
  userId: string,
  studentClassAssignmentId: string
) => {
  const [row] = await db
    .select({ homeroomTeacherId: class_.homeroomTeacherId })
    .from(studentClassAssignment)
    .innerJoin(class_, eq(studentClassAssignment.classId, class_.id))
    .where(eq(studentClassAssignment.id, studentClassAssignmentId))
    .limit(1);

  if (!row) {
    throw new ORPCError("NOT_FOUND", {
      message: "That student is not assigned to a class",
    });
  }

  const [caller] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(eq(staff.userId, userId))
    .limit(1);

  if (!caller) {
    throw new ORPCError("FORBIDDEN", {
      message:
        "Your account is not linked to a staff record, so it cannot enter marks",
    });
  }

  if (row.homeroomTeacherId !== caller.id) {
    throw new ORPCError("FORBIDDEN", {
      message:
        "Marks can only be entered by the homeroom teacher of the class this student is in",
    });
  }
};

export const enterSubjectMark = requireMarkPermission("create")
  .input(
    pick(subjectMarkInsertSchema, [
      "studentClassAssignmentId",
      "examTypeId",
      "subjectKey",
      "mark",
      "grade",
    ])
  )
  .handler(async ({ input, context }) => {
    await assertCanEnterMarkForAssignment(
      context.db,
      context.session.user.id,
      input.studentClassAssignmentId
    );

    const id = crypto.randomUUID();

    const [record] = await context.db
      .insert(subjectMark)
      .values({
        id,
        studentClassAssignmentId: input.studentClassAssignmentId,
        examTypeId: input.examTypeId,
        subjectKey: input.subjectKey,
        mark: input.mark,
        grade: input.grade,
        enteredByStaffId: context.session.user.id,
      })
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      id: record.id,
      studentClassAssignmentId: record.studentClassAssignmentId,
      examTypeId: record.examTypeId,
      subjectKey: record.subjectKey,
      mark: record.mark,
      grade: record.grade,
      enteredByStaffId: record.enteredByStaffId,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  });
