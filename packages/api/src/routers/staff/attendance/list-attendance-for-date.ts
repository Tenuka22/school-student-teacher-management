import { ORPCError } from "@orpc/server";
import { getDayPartPeriodNumbers } from "@school-student-teacher-management/db/periods";
import {
  attendancePolicy,
  teacherAttendance,
  teacherPeriodAbsence,
} from "@school-student-teacher-management/db/schema/attendance";
import { leaveRequest } from "@school-student-teacher-management/db/schema/leaves";
import { isoDateSchema } from "@school-student-teacher-management/db/schema/primitives";
import { academicYearIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../../index";
import {
  assertDateWithinAcademicYear,
  requireAttendanceAcademicYear,
} from "./academic-year";

export const listAttendanceForDate = adminProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      date: isoDateSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const year = await requireAttendanceAcademicYear(
      context.db,
      input.academicYearId
    );
    assertDateWithinAcademicYear(input.date, year);

    const dayRecords = await context.db
      .select()
      .from(teacherAttendance)
      .where(
        and(
          eq(teacherAttendance.academicYearId, input.academicYearId),
          eq(teacherAttendance.date, input.date)
        )
      );

    const attendanceIds = dayRecords.map((record) => record.id);
    const absences = attendanceIds.length
      ? await context.db
          .select({
            teacherAttendanceId: teacherPeriodAbsence.teacherAttendanceId,
            periodNumber: teacherPeriodAbsence.periodNumber,
            reason: teacherPeriodAbsence.reason,
          })
          .from(teacherPeriodAbsence)
          .where(
            inArray(teacherPeriodAbsence.teacherAttendanceId, attendanceIds)
          )
      : [];
    const absencesByAttendance = new Map<
      string,
      { periodNumber: number; reason: string }[]
    >();
    for (const absence of absences) {
      const current =
        absencesByAttendance.get(absence.teacherAttendanceId) ?? [];
      current.push({
        periodNumber: absence.periodNumber,
        reason: absence.reason,
      });
      absencesByAttendance.set(absence.teacherAttendanceId, current);
    }

    const [[policy], approvedLeaves] = await Promise.all([
      context.db
        .select()
        .from(attendancePolicy)
        .where(eq(attendancePolicy.academicYearId, input.academicYearId))
        .limit(1),
      context.db
        .select({
          staffId: leaveRequest.staffId,
          id: leaveRequest.id,
          type: leaveRequest.type,
          dayPart: leaveRequest.dayPart,
          paymentStatus: leaveRequest.paymentStatus,
        })
        .from(leaveRequest)
        .where(
          and(
            eq(leaveRequest.academicYearId, input.academicYearId),
            eq(leaveRequest.status, "approved"),
            lte(leaveRequest.startDate, input.date),
            gte(leaveRequest.endDate, input.date)
          )
        ),
    ]);

    if (!policy) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: "Attendance policy is not configured for this academic year",
      });
    }

    const getLeavePeriods = (dayPart: string) =>
      getDayPartPeriodNumbers(
        dayPart,
        {
          startPeriodNumber: policy.primaryStartPeriodNumber,
          endPeriodNumber: policy.primaryEndPeriodNumber,
        },
        {
          startPeriodNumber: policy.secondaryStartPeriodNumber,
          endPeriodNumber: policy.secondaryEndPeriodNumber,
        }
      );

    const recordsByStaff = new Map(
      dayRecords.map((record) => [record.staffId, record])
    );
    const lockedByStaff = new Map(
      approvedLeaves.map((leave) => [leave.staffId, leave])
    );

    for (const leave of approvedLeaves) {
      if (recordsByStaff.has(leave.staffId)) {
        continue;
      }
      const periods = getLeavePeriods(leave.dayPart);
      recordsByStaff.set(leave.staffId, {
        id: `leave:${leave.id}`,
        staffId: leave.staffId,
        academicYearId: input.academicYearId,
        date: input.date,
        status: periods.length > 0 ? "partial" : "absent",
        reason: `Approved ${leave.type} leave`,
        leaveRequestId: leave.id,
        markedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return [...recordsByStaff.values()].map((record) => {
      const leave = lockedByStaff.get(record.staffId);
      if (leave) {
        const periods = getLeavePeriods(leave.dayPart);
        return {
          staffId: record.staffId,
          status: periods.length > 0 ? "partial" : "absent",
          reason: record.reason ?? `Approved ${leave.type} leave`,
          absentPeriods: periods.map((periodNumber) => ({
            periodNumber,
            reason: record.reason ?? "Approved leave",
          })),
          lockedLeave: leave,
        };
      }

      return {
        staffId: record.staffId,
        status: record.status,
        reason: record.reason,
        absentPeriods: absencesByAttendance.get(record.id) ?? [],
        lockedLeave: null,
      };
    });
  });
