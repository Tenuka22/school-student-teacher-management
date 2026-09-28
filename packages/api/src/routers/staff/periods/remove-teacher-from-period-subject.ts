import { ORPCError } from "@orpc/server";
import {
  classPeriodTeacher,
  classPeriodTeacherIdSchema,
} from "@school-student-teacher-management/db/schema/periods";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";

/**
 * Unname a teacher from a subject-slot entry. The subject itself, and any
 * other teacher co-teaching it, are untouched — only this one seat is
 * cleared.
 */
export const removeTeacherFromPeriodSubject = requireAssignmentPermission(
  "delete"
)
  .input(v.object({ id: classPeriodTeacherIdSchema }))
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select({ id: classPeriodTeacher.id })
      .from(classPeriodTeacher)
      .where(eq(classPeriodTeacher.id, input.id));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", {
        message: "Period teacher assignment not found",
      });
    }

    await context.db
      .delete(classPeriodTeacher)
      .where(eq(classPeriodTeacher.id, input.id));

    return { success: true };
  });
