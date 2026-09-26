import { ORPCError } from "@orpc/server";
import { getPeriodNumbers } from "@school-student-teacher-management/db/periods";
import {
  attendancePolicy,
  shortLeaveUsage,
  teacherAttendance,
  teacherPeriodAbsence,
  timeOfDaySchema,
} from "@school-student-teacher-management/db/schema/attendance";
import { leaveRequest } from "@school-student-teacher-management/db/schema/leaves";
import { isoDateSchema } from "@school-student-teacher-management/db/schema/primitives";
import {
  academicYearIdSchema,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq, gte, lte } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../../index";
import {
  assertDateWithinAcademicYear,
  requireAttendanceAcademicYear,
} from "./academic-year";

export const recordArrival = adminProcedure
  .input(
    v.object({
      staffId: staffIdSchema,
      academicYearId: academicYearIdSchema,
      date: isoDateSchema,
      arrivalTime: timeOfDaySchema,
    })
  )
  .handler(async ({ input, context }) => {
    const year = await requireAttendanceAcademicYear(
      context.db,
      input.academicYearId
    );
    assertDateWithinAcademicYear(input.date, year);

    const [approvedLeave] = await context.db
      .select({ id: leaveRequest.id })
      .from(leaveRequest)
      .where(
        and(
          eq(leaveRequest.staffId, input.staffId),
          eq(leaveRequest.academicYearId, input.academicYearId),
          eq(leaveRequest.status, "approved"),
          lte(leaveRequest.startDate, input.date),
          gte(leaveRequest.endDate, input.date)
        )
      )
      .limit(1);

    if (approvedLeave) {
      throw new ORPCError("CONFLICT", {
        message: "Arrival cannot be recorded during approved leave",
      });
    }

    const [policy] = await context.db
      .select()
      .from(attendancePolicy)
      .where(eq(attendancePolicy.academicYearId, input.academicYearId))
      .limit(1);

    if (!policy) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: "No attendance policy is configured for this academic year",
      });
    }

    const isLate = input.arrivalTime > policy.arrivalCutoffTime;
    const yearMonth = input.date.slice(0, 7);

    return await context.db.transaction(async (tx) => {
      let status: "present" | "lateShortLeave" | "halfDay" = "present";
      let note: string | null = null;
      const missedPeriods: number[] = [];

      if (isLate) {
        await tx
          .insert(shortLeaveUsage)
          .values({
            id: crypto.randomUUID(),
            staffId: input.staffId,
            academicYearId: input.academicYearId,
            yearMonth,
            shortLeavesUsed: 0,
          })
          .onConflictDoNothing();

        const [usage] = await tx
          .select()
          .from(shortLeaveUsage)
          .where(
            and(
              eq(shortLeaveUsage.staffId, input.staffId),
              eq(shortLeaveUsage.academicYearId, input.academicYearId),
              eq(shortLeaveUsage.yearMonth, yearMonth)
            )
          )
          .for("update")
          .limit(1);

        if (!usage) {
          throw new ORPCError("INTERNAL_SERVER_ERROR");
        }

        if (usage.shortLeavesUsed < policy.shortLeavesPerMonth) {
          status = "lateShortLeave";
          note = `Arrived ${input.arrivalTime} (after ${policy.arrivalCutoffTime}) — short leave ${usage.shortLeavesUsed + 1}/${policy.shortLeavesPerMonth} this month`;
          await tx
            .update(shortLeaveUsage)
            .set({ shortLeavesUsed: usage.shortLeavesUsed + 1 })
            .where(
              and(
                eq(shortLeaveUsage.id, usage.id),
                eq(shortLeaveUsage.academicYearId, input.academicYearId)
              )
            );
        } else {
          status = "halfDay";
          missedPeriods.push(
            ...getPeriodNumbers({
              startPeriodNumber: policy.primaryStartPeriodNumber,
              endPeriodNumber: policy.primaryEndPeriodNumber,
            })
          );
          note = `Arrived ${input.arrivalTime} (after ${policy.arrivalCutoffTime}) — Primary half day recorded`;
        }
      }

      if (status === "halfDay") {
        const [existing] = await tx
          .select({ id: teacherAttendance.id })
          .from(teacherAttendance)
          .where(
            and(
              eq(teacherAttendance.staffId, input.staffId),
              eq(teacherAttendance.academicYearId, input.academicYearId),
              eq(teacherAttendance.date, input.date)
            )
          )
          .limit(1);
        const id = existing?.id ?? crypto.randomUUID();

        if (existing) {
          await tx
            .update(teacherAttendance)
            .set({ status: "partial", reason: note, markedAt: new Date() })
            .where(eq(teacherAttendance.id, id));
          await tx
            .delete(teacherPeriodAbsence)
            .where(eq(teacherPeriodAbsence.teacherAttendanceId, id));
        } else {
          await tx.insert(teacherAttendance).values({
            id,
            staffId: input.staffId,
            academicYearId: input.academicYearId,
            date: input.date,
            status: "partial",
            reason: note,
          });
        }

        await tx.insert(teacherPeriodAbsence).values(
          missedPeriods.map((periodNumber) => ({
            id: crypto.randomUUID(),
            teacherAttendanceId: id,
            periodNumber,
            reason: note ?? "Late arrival",
          }))
        );
      }

      return {
        status,
        note,
        policy: {
          arrivalCutoffTime: policy.arrivalCutoffTime,
          shortLeavesPerMonth: policy.shortLeavesPerMonth,
          primaryStartPeriodNumber: policy.primaryStartPeriodNumber,
          primaryEndPeriodNumber: policy.primaryEndPeriodNumber,
          secondaryStartPeriodNumber: policy.secondaryStartPeriodNumber,
          secondaryEndPeriodNumber: policy.secondaryEndPeriodNumber,
        },
      };
    });
  });
