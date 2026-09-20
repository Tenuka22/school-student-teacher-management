import { classIdSchema } from "@school-student-teacher-management/db/schema/academics";
import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
import {
  academicYearIdSchema,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";

/**
 * Check for conflicts before assigning a teacher to a period slot.
 * Returns list of conflicts found (if any).
 * Two types of conflicts:
 * 1. Class already has a different subject/teacher at this slot
 * 2. Teacher already assigned to another class at this time
 */
export const checkConflict = requireAssignmentPermission("read")
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      classId: classIdSchema,
      staffId: staffIdSchema,
      dayOfWeek: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5)),
      periodNumber: v.pipe(
        v.number(),
        v.integer(),
        v.minValue(1),
        v.maxValue(8)
      ),
    })
  )
  .handler(async ({ input, context }) => {
    const conflicts: {
      type: "class_slot" | "teacher_slot";
      existingStaffId?: string;
      message: string;
    }[] = [];

    // Check if class already has assignment at this slot
    const classConflict =
      await context.db.query.classPeriodAssignment.findFirst({
        where: and(
          eq(classPeriodAssignment.academicYearId, input.academicYearId),
          eq(classPeriodAssignment.classId, input.classId),
          eq(classPeriodAssignment.dayOfWeek, input.dayOfWeek),
          eq(classPeriodAssignment.periodNumber, input.periodNumber)
        ),
      });

    if (classConflict) {
      conflicts.push({
        type: "class_slot",
        message: `Class already has ${classConflict.subjectKey} at this slot`,
        existingStaffId: classConflict.staffId,
      });
    }

    // Check if teacher already assigned to another class at this time
    const teacherConflict =
      await context.db.query.classPeriodAssignment.findFirst({
        where: and(
          eq(classPeriodAssignment.academicYearId, input.academicYearId),
          eq(classPeriodAssignment.staffId, input.staffId),
          eq(classPeriodAssignment.dayOfWeek, input.dayOfWeek),
          eq(classPeriodAssignment.periodNumber, input.periodNumber)
        ),
      });

    if (teacherConflict) {
      conflicts.push({
        type: "teacher_slot",
        message: `Teacher already assigned to another class at this time`,
      });
    }

    return { conflicts, hasConflict: conflicts.length > 0 };
  });
