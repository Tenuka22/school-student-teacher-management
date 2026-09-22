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

/**
 * The attendance policy for one academic year, with the signed-in staff
 * member's current month usage (when they have a staff record). Policy
 * values are the "maximum", usage the "current" — the min/max/current
 * record pattern, all read from data so it follows year edits.
 */
export const getPolicy = protectedProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
    })
  )
  .handler(async ({ input, context }) => {
    // Independent lookups — run in parallel.
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
      halfDaysUsed: number;
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
            eq(shortLeaveUsage.yearMonth, yearMonth)
          )
        )
        .limit(1);

      usage = {
        yearMonth,
        shortLeavesUsed: row?.shortLeavesUsed ?? 0,
        halfDaysUsed: row ? Number(row.halfDaysUsed) : 0,
      };
    }

    return {
      policy: policy
        ? {
            arrivalCutoffTime: policy.arrivalCutoffTime,
            shortLeavesPerMonth: policy.shortLeavesPerMonth,
            halfDaysPerMonth: policy.halfDaysPerMonth,
            halfDaysPerFullDay: Number(policy.halfDaysPerFullDay),
          }
        : null,
      usage,
    };
  });
