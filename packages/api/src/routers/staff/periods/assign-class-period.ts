import { ORPCError } from "@orpc/server";
import {
  classPeriodAssignment,
  classPeriodAssignmentInsertSchema,
} from "@school-student-teacher-management/db/schema/periods";
import { pick } from "valibot";

import { requireAssignmentPermission } from "../../../index";

/**
 * Assign a teacher + subject to a class period slot.
 * Enforces double-booking prevention via DB UNIQUE constraints:
 * - (academicYearId, classId, dayOfWeek, periodNumber) must be unique
 * - (academicYearId, staffId, dayOfWeek, periodNumber) must be unique
 */
export const assignClassPeriod = requireAssignmentPermission("create")
  .input(
    pick(classPeriodAssignmentInsertSchema, [
      "academicYearId",
      "classId",
      "dayOfWeek",
      "periodNumber",
      "subjectKey",
      "staffId",
    ])
  )
  .handler(async ({ input, context }) => {
    const id = crypto.randomUUID();

    try {
      const [record] = await context.db
        .insert(classPeriodAssignment)
        .values({
          id,
          academicYearId: input.academicYearId,
          classId: input.classId,
          dayOfWeek: input.dayOfWeek,
          periodNumber: input.periodNumber,
          subjectKey: input.subjectKey,
          staffId: input.staffId,
        })
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
      };
    } catch (error) {
      // Handle unique constraint violations
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
