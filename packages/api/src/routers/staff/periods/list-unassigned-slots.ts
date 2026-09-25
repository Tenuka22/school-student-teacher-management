import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import { classIdSchema } from "@school-student-teacher-management/db/schema/academics";
import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
import { academicYearIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../../index";

/**
 * List all unassigned period slots for a class.
 * Returns (dayOfWeek, periodNumber) pairs with no assignment yet.
 * School week: Mondayâ€“Friday (1â€“5), 8 periods (1â€“8) = 40 slots max.
 */
export const listUnassignedSlots = adminProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      classId: classIdSchema,
    })
  )
  .handler(async ({ input, context }) => {
    // Get all assigned slots for this class
    const assigned = await context.db
      .select({
        dayOfWeek: classPeriodAssignment.dayOfWeek,
        periodNumber: classPeriodAssignment.periodNumber,
      })
      .from(classPeriodAssignment)
      .where(
        and(
          eq(classPeriodAssignment.academicYearId, input.academicYearId),
          eq(classPeriodAssignment.classId, input.classId)
        )
      );

    const assignedSet = new Set(
      assigned.map((a) => `${a.dayOfWeek}-${a.periodNumber}`)
    );

    // Generate all possible slots (5 days Ã— 8 periods)
    const allSlots: { dayOfWeek: number; periodNumber: number }[] = [];
    for (let day = 1; day <= 5; day += 1) {
      for (const period of CODE_DEFINED_PERIODS) {
        allSlots.push({
          dayOfWeek: day,
          periodNumber: period.periodNumber,
        });
      }
    }

    // Filter to unassigned slots
    return allSlots.filter(
      (s) => !assignedSet.has(`${s.dayOfWeek}-${s.periodNumber}`)
    );
  });
