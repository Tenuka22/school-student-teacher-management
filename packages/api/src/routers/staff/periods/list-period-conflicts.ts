import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
import { academicYearIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../../index";

/**
 * Finds real double-bookings: a teacher assigned to more than one class in
 * the same (dayOfWeek, periodNumber) slot, where the overlap was NOT
 * explicitly marked as an intentional combined session. Returns the IDs of
 * every assignment row involved in such a conflict, so callers can flag them
 * without re-deriving the grouping logic.
 */
export const listPeriodConflicts = adminProcedure
  .input(v.object({ academicYearId: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const records = await context.db
      .select({
        id: classPeriodAssignment.id,
        staffId: classPeriodAssignment.staffId,
        dayOfWeek: classPeriodAssignment.dayOfWeek,
        periodNumber: classPeriodAssignment.periodNumber,
        isCombinedSession: classPeriodAssignment.isCombinedSession,
      })
      .from(classPeriodAssignment)
      .where(eq(classPeriodAssignment.academicYearId, input.academicYearId));

    const bySlot = new Map<string, typeof records>();
    for (const record of records) {
      const key = `${record.staffId}-${record.dayOfWeek}-${record.periodNumber}`;
      const group = bySlot.get(key) ?? [];
      group.push(record);
      bySlot.set(key, group);
    }

    const conflictingIds: string[] = [];
    for (const group of bySlot.values()) {
      if (group.length < 2) {
        continue;
      }
      // If every overlapping row is explicitly marked combined, it's
      // intentional (e.g. one teacher running several classes at once) â€”
      // not a conflict. Any unmarked row in an overlapping group is a real
      // accidental double-booking.
      const hasUnmarkedOverlap = group.some((r) => !r.isCombinedSession);
      if (hasUnmarkedOverlap) {
        for (const record of group) {
          if (!record.isCombinedSession) {
            conflictingIds.push(record.id);
          }
        }
      }
    }

    return { conflictingAssignmentIds: conflictingIds };
  });
