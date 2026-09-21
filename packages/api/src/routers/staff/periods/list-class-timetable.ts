import { classIdSchema } from "@school-student-teacher-management/db/schema/academics";
import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
import { academicYearIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";

/**
 * List all period assignments for a class in a given academic year.
 * Returns a timetable grid: (dayOfWeek, periodNumber) → (subject, teacher).
 */
export const listClassTimetable = requireAssignmentPermission("read")
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      classId: classIdSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const records = await context.db
      .select()
      .from(classPeriodAssignment)
      .where(
        and(
          eq(classPeriodAssignment.academicYearId, input.academicYearId),
          eq(classPeriodAssignment.classId, input.classId)
        )
      )
      .orderBy(
        classPeriodAssignment.dayOfWeek,
        classPeriodAssignment.periodNumber
      );

    return records.map((record) => ({
      id: record.id,
      dayOfWeek: record.dayOfWeek,
      periodNumber: record.periodNumber,
      subjectKey: record.subjectKey,
      staffId: record.staffId,
      isCombinedSession: record.isCombinedSession,
      createdAt: record.createdAt.toISOString(),
    }));
  });
