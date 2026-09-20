import { ORPCError } from "@orpc/server";
import {
  subjectAssignment,
  subjectAssignmentIdSchema,
  subjectAssignmentUpdateSchema,
} from "@school-student-teacher-management/db/schema/academics";
import { eq } from "drizzle-orm";
import { object, pick } from "valibot";

import { adminProcedure } from "../../index";

export const updateSubjectAssignment = adminProcedure
  .input(
    object({
      ...pick(subjectAssignmentUpdateSchema, [
        "subjectKey",
        "gradeLevel",
        "classId",
      ]).entries,
      id: subjectAssignmentIdSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(subjectAssignment)
      .where(eq(subjectAssignment.id, input.id));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", {
        message: "Subject assignment not found",
      });
    }

    const [record] = await context.db
      .update(subjectAssignment)
      .set({
        subjectKey: input.subjectKey,
        gradeLevel: input.gradeLevel,
        classId: input.classId,
      })
      .where(eq(subjectAssignment.id, input.id))
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
