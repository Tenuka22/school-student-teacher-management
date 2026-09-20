import { teacherAttendance } from "@school-student-teacher-management/db/schema/attendance";
import { isoDateSchema } from "@school-student-teacher-management/db/schema/primitives";
import { staffIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { and, between, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";

/**
 * Every marked attendance day for a teacher within an inclusive date range.
 * Dates in the range with no row are unmarked, not fetched here - the
 * caller fills in the gaps as "unmarked" for its own calendar/strip UI.
 */
export const listTeacherAttendanceRange = requireAssignmentPermission("read")
  .input(
    v.object({
      staffId: staffIdSchema,
      startDate: isoDateSchema,
      endDate: isoDateSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const records = await context.db
      .select({
        date: teacherAttendance.date,
        status: teacherAttendance.status,
        reason: teacherAttendance.reason,
      })
      .from(teacherAttendance)
      .where(
        and(
          eq(teacherAttendance.staffId, input.staffId),
          between(teacherAttendance.date, input.startDate, input.endDate)
        )
      )
      .orderBy(teacherAttendance.date);

    return records;
  });
