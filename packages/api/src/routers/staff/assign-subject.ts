import {
  subjectAssignment,
  subjectAssignmentInsertSchema,
} from "@school-student-teacher-management/db/schema/academics";
import { ORPCError } from "@orpc/server";
import { pick } from "valibot";

import { adminProcedure } from "../../index";

export const assignSubject = adminProcedure
  .input(
    pick(subjectAssignmentInsertSchema, [
      "staffId",
      "academicYearId",
      "subjectKey",
      "gradeLevel",
      "classId",
    ])
  )
  .handler(async ({ input, context }) => {
    const id = crypto.randomUUID();

    const [record] = await context.db
      .insert(subjectAssignment)
      .values({
        id,
        staffId: input.staffId,
        academicYearId: input.academicYearId,
        subjectKey: input.subjectKey,
        gradeLevel: input.gradeLevel,
        classId: input.classId,
      })
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      id: record.id,
      staffId: record.staffId,
      academicYearId: record.academicYearId,
      subjectKey: record.subjectKey,
      gradeLevel: record.gradeLevel,
      classId: record.classId,
      createdAt: record.createdAt.toISOString(),
    };
  });
