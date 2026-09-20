import { ORPCError } from "@orpc/server";
import {
  subjectAssignment,
  subjectAssignmentIdSchema,
} from "@school-student-teacher-management/db/schema/academics";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";

export const deleteSubjectAssignment = adminProcedure
  .input(v.object({ id: subjectAssignmentIdSchema }))
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

    await context.db
      .delete(subjectAssignment)
      .where(eq(subjectAssignment.id, input.id));

    return { success: true };
  });
