import {
  subjectMark,
  subjectMarkInsertSchema,
} from "@school-student-teacher-management/db/schema/marking";
import { ORPCError } from "@orpc/server";
import { pick } from "valibot";

import { requireMarkPermission } from "../../index";

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
