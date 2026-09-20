import { ORPCError } from "@orpc/server";
import {
  classPeriodAssignment,
  classPeriodAssignmentIdSchema,
} from "@school-student-teacher-management/db/schema/periods";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";

/**
 * Delete a class period assignment (unassign a teacher from a period slot).
 */
export const deleteClassPeriodAssignment = requireAssignmentPermission("delete")
  .input(
    v.object({
      id: classPeriodAssignmentIdSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(classPeriodAssignment)
      .where(eq(classPeriodAssignment.id, input.id));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", {
        message: "Period assignment not found",
      });
    }

    await context.db
      .delete(classPeriodAssignment)
      .where(eq(classPeriodAssignment.id, input.id));

    return { success: true };
  });
