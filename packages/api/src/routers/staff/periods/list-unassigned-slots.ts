import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import { classIdSchema } from "@school-student-teacher-management/db/schema/academics";
import { classPeriodSubject } from "@school-student-teacher-management/db/schema/periods";
import { academicYearIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { academicProcedure } from "../../../index";

/**
 * List every fully-empty period slot for a class — slots with no subject on
 * them at all. A slot with one subject already on it is not "unassigned"
 * anymore even though more subjects could still be added to it; this list is
 * for finding the slots nothing has been put on yet.
 * School week: Monday–Friday (1–5), 8 periods (1–8) = 40 slots max.
 */
export const listUnassignedSlots = academicProcedure
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
        dayOfWeek: classPeriodSubject.dayOfWeek,
        periodNumber: classPeriodSubject.periodNumber,
      })
      .from(classPeriodSubject)
      .where(
        and(
          eq(classPeriodSubject.academicYearId, input.academicYearId),
          eq(classPeriodSubject.classId, input.classId)
        )
      );

    const assignedSet = new Set(
      assigned.map((a) => `${a.dayOfWeek}-${a.periodNumber}`)
    );

    // Generate all possible slots (5 days × 8 periods)
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
