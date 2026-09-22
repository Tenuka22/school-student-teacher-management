import { ORPCError } from "@orpc/server";
import {
  attendancePolicy,
  shortLeaveUsage,
  teacherAttendance,
  timeOfDaySchema,
} from "@school-student-teacher-management/db/schema/attendance";
import {
  academicYearIdSchema,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";

/**
 * Automatic late-arrival policy, evaluated server-side (see
 * LEAVE_SYSTEM_DESIGN.md §5). Given the teacher's arrival time and the
 * academic year's `attendance_policy` row:
 *
 * 1. arrival ≤ cutoff            → present (full day)
 * 2. late, pool has room         → "lateShortLeave"; monthly usage +1
 * 3. late, pool exhausted        → "halfDay"; monthly half-day usage +0.5
 *
 * Usage counters live in `short_leave_usage` (one row per staff ×
 * "YYYY-MM"), created on demand and only ever incremented, so policy
 * changes never rewrite history.
 */
export const recordArrival = requireAssignmentPermission("create")
  .input(
    v.object({
      staffId: staffIdSchema,
      academicYearId: academicYearIdSchema,
      /** Calendar date of arrival, "YYYY-MM-DD". */
      date: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/u)),
      /** Arrival time, "HH:MM" 24-hour (school-local). */
      arrivalTime: timeOfDaySchema,
    })
  )
  .handler(async ({ input, context }) => {
    const [policy] = await context.db
      .select()
      .from(attendancePolicy)
      .where(eq(attendancePolicy.academicYearId, input.academicYearId))
      .limit(1);

    if (!policy) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message:
          "No attendance policy is configured for this academic year yet",
      });
    }

    const isLate = input.arrivalTime > policy.arrivalCutoffTime;

    // "YYYY-MM" of the arrival date drives the monthly counter.
    const yearMonth = input.date.slice(0, 7);

    return await context.db.transaction(async (tx) => {
      let status: "present" | "lateShortLeave" | "halfDay" = "present";
      let note: string | null = null;

      if (isLate) {
        // Lock the usage row for this month (insert if first use).
        let [usage] = await tx
          .select()
          .from(shortLeaveUsage)
          .where(
            and(
              eq(shortLeaveUsage.staffId, input.staffId),
              eq(shortLeaveUsage.yearMonth, yearMonth)
            )
          )
          .limit(1);

        if (!usage) {
          [usage] = await tx
            .insert(shortLeaveUsage)
            .values({
              id: crypto.randomUUID(),
              staffId: input.staffId,
              academicYearId: input.academicYearId,
              yearMonth,
              shortLeavesUsed: 0,
              halfDaysUsed: "0",
            })
            .returning();
        }

        if (!usage) {
          throw new ORPCError("INTERNAL_SERVER_ERROR");
        }

        const { shortLeavesUsed } = usage;
        const shortLeavesRemaining =
          policy.shortLeavesPerMonth - shortLeavesUsed;

        if (shortLeavesRemaining > 0) {
          // Step 2: within the monthly short-leave allowance.
          status = "lateShortLeave";
          note = `Arrived ${input.arrivalTime} (after ${policy.arrivalCutoffTime}) — short leave ${shortLeavesUsed + 1}/${policy.shortLeavesPerMonth} this month`;
          await tx
            .update(shortLeaveUsage)
            .set({ shortLeavesUsed: shortLeavesUsed + 1 })
            .where(eq(shortLeaveUsage.id, usage.id));
        } else {
          // Step 3: pool exhausted — record a half day (increments by 0.5).
          status = "halfDay";
          const halfDaysUsed = Number(usage.halfDaysUsed);
          note = `Arrived ${input.arrivalTime} (after ${policy.arrivalCutoffTime}) — short-leave allowance used, recorded as half day`;
          await tx
            .update(shortLeaveUsage)
            .set({ halfDaysUsed: (halfDaysUsed + 0.5).toString() })
            .where(eq(shortLeaveUsage.id, usage.id));
        }
      }

      // Upsert the day-level attendance row.
      const [existing] = await tx
        .select({ id: teacherAttendance.id })
        .from(teacherAttendance)
        .where(
          and(
            eq(teacherAttendance.staffId, input.staffId),
            eq(teacherAttendance.date, input.date)
          )
        )
        .limit(1);

      const id = existing?.id ?? crypto.randomUUID();

      const dayRow = {
        id,
        staffId: input.staffId,
        academicYearId: input.academicYearId,
        date: input.date,
        status,
        reason: note,
      };

      // oxlint-disable-next-line unicorn/prefer-ternary -- upsert reads clearer as branches
      if (existing) {
        await tx
          .update(teacherAttendance)
          .set({ status, reason: note, markedAt: new Date() })
          .where(eq(teacherAttendance.id, id));
      } else {
        await tx.insert(teacherAttendance).values(dayRow);
      }

      return {
        id,
        status,
        note,
        policy: {
          arrivalCutoffTime: policy.arrivalCutoffTime,
          shortLeavesPerMonth: policy.shortLeavesPerMonth,
          halfDaysPerMonth: policy.halfDaysPerMonth,
          halfDaysPerFullDay: policy.halfDaysPerFullDay,
        },
      };
    });
  });
