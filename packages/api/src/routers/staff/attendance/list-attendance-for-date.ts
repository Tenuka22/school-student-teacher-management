import {
  teacherAttendance,
  teacherPeriodAbsence,
} from "@school-student-teacher-management/db/schema/attendance";
import { isoDateSchema } from "@school-student-teacher-management/db/schema/primitives";
import { eq, inArray } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";

/**
 * Every teacher's attendance for one calendar date, in two queries total -
 * the grid view needs every row at once, not one `getTeacherAttendance`
 * call per teacher. Teachers with no row for this date are simply absent
 * from the result; the caller treats that as "present" (unmarked default).
 */
export const listAttendanceForDate = requireAssignmentPermission("read")
  .input(v.object({ date: isoDateSchema }))
  .handler(async ({ input, context }) => {
    const dayRecords = await context.db
      .select()
      .from(teacherAttendance)
      .where(eq(teacherAttendance.date, input.date));

    if (dayRecords.length === 0) {
      return [];
    }

    const attendanceIds = dayRecords.map((r) => r.id);
    const absences = await context.db
      .select({
        teacherAttendanceId: teacherPeriodAbsence.teacherAttendanceId,
        periodNumber: teacherPeriodAbsence.periodNumber,
        reason: teacherPeriodAbsence.reason,
      })
      .from(teacherPeriodAbsence)
      .where(inArray(teacherPeriodAbsence.teacherAttendanceId, attendanceIds));

    const absencesByAttendance = new Map<
      string,
      { periodNumber: number; reason: string }[]
    >();
    for (const absence of absences) {
      const list = absencesByAttendance.get(absence.teacherAttendanceId) ?? [];
      list.push({ periodNumber: absence.periodNumber, reason: absence.reason });
      absencesByAttendance.set(absence.teacherAttendanceId, list);
    }

    return dayRecords.map((record) => ({
      staffId: record.staffId,
      status: record.status,
      reason: record.reason,
      absentPeriods: absencesByAttendance.get(record.id) ?? [],
    }));
  });
