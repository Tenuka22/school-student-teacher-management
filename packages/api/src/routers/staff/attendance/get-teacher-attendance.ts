import {
  teacherAttendance,
  teacherPeriodAbsence,
} from "@school-student-teacher-management/db/schema/attendance";
import { isoDateSchema } from "@school-student-teacher-management/db/schema/primitives";
import { staffIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";

/**
 * A single teacher's attendance for one calendar date. Returns `null` when
 * nothing has been marked yet - a school day with no row is "unmarked",
 * distinct from an explicitly recorded "present".
 */
export const getTeacherAttendance = requireAssignmentPermission("read")
  .input(
    v.object({
      staffId: staffIdSchema,
      date: isoDateSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const [record] = await context.db
      .select()
      .from(teacherAttendance)
      .where(
        and(
          eq(teacherAttendance.staffId, input.staffId),
          eq(teacherAttendance.date, input.date)
        )
      );

    if (!record) {
      return null;
    }

    const absences = await context.db
      .select({
        periodNumber: teacherPeriodAbsence.periodNumber,
        reason: teacherPeriodAbsence.reason,
        substituteStaffId: teacherPeriodAbsence.substituteStaffId,
      })
      .from(teacherPeriodAbsence)
      .where(eq(teacherPeriodAbsence.teacherAttendanceId, record.id))
      .orderBy(teacherPeriodAbsence.periodNumber);

    return {
      id: record.id,
      staffId: record.staffId,
      academicYearId: record.academicYearId,
      date: record.date,
      status: record.status,
      reason: record.reason,
      markedAt: record.markedAt.toISOString(),
      absentPeriods: absences,
    };
  });
