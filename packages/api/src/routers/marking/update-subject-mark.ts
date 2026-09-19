import {
  subjectMark,
  subjectMarkUpdateSchema,
} from "@school-student-teacher-management/db/schema/marking";
import { eq } from "drizzle-orm";
import { pick } from "valibot";

import { requireMarkPermission } from "../../index";

export const updateSubjectMark = requireMarkPermission("update")
  .input(pick(subjectMarkUpdateSchema, ["id", "mark", "grade"]))
  .handler(async ({ input, context }) => {
    const { id, ...updates } = input;

    if (!id) {
      return null;
    }

    const [record] = await context.db
      .update(subjectMark)
      .set(updates)
      .where(eq(subjectMark.id, id))
      .returning();

    if (!record) {
      return null;
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
