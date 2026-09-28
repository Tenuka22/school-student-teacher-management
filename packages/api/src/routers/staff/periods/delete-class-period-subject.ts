import { ORPCError } from "@orpc/server";
import {
  classPeriodSubject,
  classPeriodSubjectIdSchema,
} from "@school-student-teacher-management/db/schema/periods";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";

/**
 * Take a subject off a class's timetable slot. Cascades to every teacher
 * assigned to it (`class_period_teacher.class_period_subject_id` is
 * `ON DELETE CASCADE`) — removing the subject removes the seats teaching it,
 * which is the correct outcome: there is nothing left for those rows to
 * describe once the subject itself is gone.
 */
export const deleteClassPeriodSubject = requireAssignmentPermission("delete")
  .input(v.object({ id: classPeriodSubjectIdSchema }))
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select({ id: classPeriodSubject.id })
      .from(classPeriodSubject)
      .where(eq(classPeriodSubject.id, input.id));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", {
        message: "Period subject not found",
      });
    }

    await context.db
      .delete(classPeriodSubject)
      .where(eq(classPeriodSubject.id, input.id));

    return { success: true };
  });
