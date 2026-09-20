import { ORPCError } from "@orpc/server";
import {
  classPeriodAssignment,
  classPeriodAssignmentIdSchema,
  classPeriodAssignmentUpdateSchema,
} from "@school-student-teacher-management/db/schema/periods";
import { eq } from "drizzle-orm";
import { pick } from "valibot";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";

/**
 * Update an existing class period assignment (teacher/subject for a slot).
 * Enforces double-booking prevention via DB UNIQUE constraints.
 */
export const updateClassPeriodAssignment = requireAssignmentPermission("update")
  .input(
    v.object({
      id: classPeriodAssignmentIdSchema,
      ...pick(classPeriodAssignmentUpdateSchema, ["subjectKey", "staffId"])
        .entries,
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

    try {
      const [record] = await context.db
        .update(classPeriodAssignment)
        .set({
          subjectKey: input.subjectKey,
          staffId: input.staffId,
        })
        .where(eq(classPeriodAssignment.id, input.id))
        .returning();

      if (!record) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      return {
        id: record.id,
        academicYearId: record.academicYearId,
        classId: record.classId,
        dayOfWeek: record.dayOfWeek,
        periodNumber: record.periodNumber,
        subjectKey: record.subjectKey,
        staffId: record.staffId,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("class_period_assignment_class_slot_unique")
      ) {
        throw new ORPCError("CONFLICT", {
          message: "This class already has a subject assigned to this period",
        });
      }
      if (
        error instanceof Error &&
        error.message.includes("class_period_assignment_teacher_slot_unique")
      ) {
        throw new ORPCError("CONFLICT", {
          message:
            "This teacher is already assigned to another class at this time",
        });
      }
      throw error;
    }
  });
