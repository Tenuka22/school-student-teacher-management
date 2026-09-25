import {
  attendancePolicy,
  shortLeaveUsage,
} from "@school-student-teacher-management/db/schema/attendance";
import {
  academicYearIdSchema,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { protectedProcedure } from "../../../index";
import { requireAttendanceAcademicYear } from "./academic-year";

export const getPolicy = protectedProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
    })
  )
  .handler(async ({ input, context }) => {
    await requireAttendanceAcademicYear(context.db, input.academicYearId);

    const [[policy], [staffRecord]] = await Promise.all([
      context.db
        .select()
        .from(attendancePolicy)
        .where(eq(attendancePolicy.academicYearId, input.academicYearId))
        .limit(1),
      context.db
        .select({ id: staff.id })
        .from(staff)
        .where(eq(staff.userId, context.session.user.id))
        .limit(1),
    ]);

    let usage: {
      yearMonth: string;
      shortLeavesUsed: number;
    } | null = null;

    if (staffRecord) {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [row] = await context.db
        .select()
        .from(shortLeaveUsage)
        .where(
          and(
            eq(shortLeaveUsage.staffId, staffRecord.id),
            eq(shortLeaveUsage.academicYearId, input.academicYearId),
            eq(shortLeaveUsage.yearMonth, yearMonth)
          )
        )
        .limit(1);

      usage = {
        yearMonth,
        shortLeavesUsed: row?.shortLeavesUsed ?? 0,
      };
    }

    return {
      policy: policy
        ? {
            arrivalCutoffTime: policy.arrivalCutoffTime,
            shortLeavesPerMonth: policy.shortLeavesPerMonth,
            primaryStartPeriodNumber: policy.primaryStartPeriodNumber,
            primaryEndPeriodNumber: policy.primaryEndPeriodNumber,
            secondaryStartPeriodNumber: policy.secondaryStartPeriodNumber,
            secondaryEndPeriodNumber: policy.secondaryEndPeriodNumber,
          }
        : null,
      usage,
    };
  });
