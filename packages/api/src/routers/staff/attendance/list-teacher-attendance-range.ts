import { teacherAttendance } from "@school-student-teacher-management/db/schema/attendance";
import { isoDateSchema } from "@school-student-teacher-management/db/schema/primitives";
import {
  academicYearIdSchema,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { and, between, eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../../index";
import {
  assertDateRangeWithinAcademicYear,
  requireAttendanceAcademicYear,
} from "./academic-year";

/**
 * Every marked attendance day for a teacher within an inclusive date range.
 * Dates in the range with no row are unmarked, not fetched here - the
 * caller fills in the gaps as "unmarked" for its own calendar/strip UI.
 */
export const listTeacherAttendanceRange = adminProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      staffId: staffIdSchema,
      startDate: isoDateSchema,
      endDate: isoDateSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const year = await requireAttendanceAcademicYear(
      context.db,
      input.academicYearId
    );
    assertDateRangeWithinAcademicYear(input.startDate, input.endDate, year);

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
          eq(teacherAttendance.academicYearId, input.academicYearId),
          between(teacherAttendance.date, input.startDate, input.endDate)
        )
      )
      .orderBy(teacherAttendance.date);

    return records;
  });
