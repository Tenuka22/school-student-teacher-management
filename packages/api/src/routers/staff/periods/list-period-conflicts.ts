import {
  classPeriodSubject,
  classPeriodTeacher,
} from "@school-student-teacher-management/db/schema/periods";
import { academicYearIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../../index";

/**
 * Finds real double-bookings: a teacher named on more than one subject-slot
 * row in the same (dayOfWeek, periodNumber), where the overlap was NOT
 * explicitly marked as an intentional combined session. Returns the IDs of
 * every `classPeriodTeacher` row involved in such a conflict, so callers can
 * flag them without re-deriving the grouping logic.
 *
 * Co-teaching (two teachers on the *same* subject-slot row) is never a
 * conflict — it only groups rows that share (staffId, dayOfWeek,
 * periodNumber), so two different teachers on one subject never collide with
 * each other here.
 */
export const listPeriodConflicts = adminProcedure
  .input(v.object({ academicYearId: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const records = await context.db
      .select({
        id: classPeriodTeacher.id,
        staffId: classPeriodTeacher.staffId,
        dayOfWeek: classPeriodSubject.dayOfWeek,
        periodNumber: classPeriodSubject.periodNumber,
        isCombinedSession: classPeriodTeacher.isCombinedSession,
      })
      .from(classPeriodTeacher)
      .innerJoin(
        classPeriodSubject,
        eq(classPeriodTeacher.classPeriodSubjectId, classPeriodSubject.id)
      )
      .where(eq(classPeriodSubject.academicYearId, input.academicYearId));

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
      // intentional (e.g. one teacher running several classes at once) —
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
