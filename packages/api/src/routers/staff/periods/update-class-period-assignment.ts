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
import {
  assertTeacherEligibleForYear,
  getClassForAcademicYear,
} from "../teacher-eligibility";

/**
 * Update an existing class period assignment (teacher/subject for a slot).
 * Enforces double-booking prevention via DB UNIQUE constraints.
 */
export const updateClassPeriodAssignment = requireAssignmentPermission("update")
  .input(
    v.object({
      id: classPeriodAssignmentIdSchema,
      ...pick(classPeriodAssignmentUpdateSchema, [
        "subjectKey",
        "staffId",
        "isCombinedSession",
      ]).entries,
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

    const targetStaffId = input.staffId ?? existing.staffId;
    const targetSubjectKey = input.subjectKey ?? existing.subjectKey;
    const classRecord = await getClassForAcademicYear(
      context.db,
      existing.academicYearId,
      existing.classId
    );

    await assertTeacherEligibleForYear({
      db: context.db,
      academicYearId: existing.academicYearId,
      staffId: targetStaffId,
      subjectKey: targetSubjectKey,
      gradeLevel: classRecord.gradeLevel,
    });

    try {
      const [record] = await context.db
        .update(classPeriodAssignment)
        .set({
          subjectKey: targetSubjectKey,
          staffId: targetStaffId,
          isCombinedSession:
            input.isCombinedSession ?? existing.isCombinedSession,
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
        isCombinedSession: record.isCombinedSession,
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
      throw error;
    }
  });
