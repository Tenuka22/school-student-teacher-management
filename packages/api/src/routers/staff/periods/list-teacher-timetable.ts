import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
import {
  academicYearIdSchema,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";

/**
 * List all period assignments for a teacher in a given academic year.
 * Returns a timetable grid: (dayOfWeek, periodNumber) → (class, subject).
 */
export const listTeacherTimetable = requireAssignmentPermission("read")
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      staffId: staffIdSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const records = await context.db
      .select()
      .from(classPeriodAssignment)
      .where(
        and(
          eq(classPeriodAssignment.academicYearId, input.academicYearId),
          eq(classPeriodAssignment.staffId, input.staffId)
        )
      )
      .orderBy(
        classPeriodAssignment.dayOfWeek,
        classPeriodAssignment.periodNumber
      );

    return records.map((record) => ({
      id: record.id,
      classId: record.classId,
      dayOfWeek: record.dayOfWeek,
      periodNumber: record.periodNumber,
      subjectKey: record.subjectKey,
      createdAt: record.createdAt.toISOString(),
    }));
  });
