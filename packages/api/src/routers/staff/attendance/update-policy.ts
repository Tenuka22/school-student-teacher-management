import {
  attendancePolicy,
  timeOfDaySchema,
} from "@school-student-teacher-management/db/schema/attendance";
import { academicYearIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../../index";

/**
 * Edits the attendance policy for one academic year (cut-off time,
 * monthly allowances, half-day ratio). Values are data, not code —
 * next year can use different rules and history stays intact because
 * usage is stored in separate rows.
 */
export const updatePolicy = adminProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      arrivalCutoffTime: v.optional(timeOfDaySchema),
      shortLeavesPerMonth: v.optional(
        v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(31))
      ),
      halfDaysPerMonth: v.optional(
        v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(31))
      ),
      halfDaysPerFullDay: v.optional(
        v.pipe(v.number(), v.minValue(1), v.maxValue(8))
      ),
    })
  )
  .handler(async ({ input, context }) => {
    const { academicYearId, ...changes } = input;

    const [existing] = await context.db
      .select({ id: attendancePolicy.id })
      .from(attendancePolicy)
      .where(eq(attendancePolicy.academicYearId, academicYearId))
      .limit(1);

    if (existing) {
      await context.db
        .update(attendancePolicy)
        .set({
          ...changes,
          halfDaysPerFullDay: changes.halfDaysPerFullDay?.toString(),
        })
        .where(eq(attendancePolicy.id, existing.id));
    } else {
      // First edit creates the row with defaults for anything omitted.
      const [created] = await context.db
        .insert(attendancePolicy)
        .values({
          id: crypto.randomUUID(),
          academicYearId,
          ...changes,
          halfDaysPerFullDay: changes.halfDaysPerFullDay?.toString(),
        })
        .returning();
      if (!created) {
        throw new Error("Failed to create attendance policy");
      }
    }

    const [policy] = await context.db
      .select()
      .from(attendancePolicy)
      .where(eq(attendancePolicy.academicYearId, academicYearId))
      .limit(1);

    if (!policy) {
      throw new Error("Attendance policy missing after save");
    }

    return {
      academicYearId,
      arrivalCutoffTime: policy.arrivalCutoffTime,
      shortLeavesPerMonth: policy.shortLeavesPerMonth,
      halfDaysPerMonth: policy.halfDaysPerMonth,
      halfDaysPerFullDay: Number(policy.halfDaysPerFullDay),
    };
  });
