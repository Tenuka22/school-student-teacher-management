import {
  teacherAttendance,
  teacherAttendanceStatusSchema,
  teacherPeriodAbsence,
} from "@school-student-teacher-management/db/schema/attendance";
import { periodNumberSchema } from "@school-student-teacher-management/db/schema/periods";
import { isoDateSchema } from "@school-student-teacher-management/db/schema/primitives";
import {
  academicYearIdSchema,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";

const absentPeriodSchema = v.object({
  periodNumber: periodNumberSchema,
  reason: v.pipe(v.string(), v.minLength(1, "Reason is required")),
});

/**
 * Mark a teacher's attendance for a single day. Upserts the day-level
 * `teacherAttendance` row on (staffId, date), and replaces every
 * `teacherPeriodAbsence` child row with the ones provided:
 * - status "present": no periods missed, `absentPeriods` is ignored/cleared.
 * - status "partial": only the periods in `absentPeriods` are cancelled,
 *   each with its own reason (e.g. left after the interval).
 * - status "absent": the whole day is cancelled; `absentPeriods` is ignored
 *   since every scheduled period is implied cancelled, and `reason` (the
 *   top-level day reason) is used instead.
 * `date` may be in the past (recording what happened) or in the future
 * (pre-announcing a planned absence ahead of the day).
 */
export const markAttendance = requireAssignmentPermission("create")
  .input(
    v.object({
      staffId: staffIdSchema,
      academicYearId: academicYearIdSchema,
      date: isoDateSchema,
      status: teacherAttendanceStatusSchema,
      reason: v.optional(v.nullable(v.string())),
      absentPeriods: v.optional(v.array(absentPeriodSchema), []),
    })
  )
  .handler(async ({ input, context }) => {
    const dayReason = input.status === "absent" ? (input.reason ?? null) : null;
    const periods = input.status === "partial" ? input.absentPeriods : [];

    return await context.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(teacherAttendance)
        .where(
          and(
            eq(teacherAttendance.staffId, input.staffId),
            eq(teacherAttendance.date, input.date)
          )
        );

      const id = existing?.id ?? crypto.randomUUID();

      if (existing) {
        await tx
          .update(teacherAttendance)
          .set({
            status: input.status,
            reason: dayReason,
            markedAt: new Date(),
          })
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
          status: input.status,
          reason: dayReason,
        });
      }

      if (periods.length > 0) {
        await tx.insert(teacherPeriodAbsence).values(
          periods.map((period) => ({
            id: crypto.randomUUID(),
            teacherAttendanceId: id,
            periodNumber: period.periodNumber,
            reason: period.reason,
          }))
        );
      }

      return {
        id,
        staffId: input.staffId,
        academicYearId: input.academicYearId,
        date: input.date,
        status: input.status,
        reason: dayReason,
        absentPeriods: periods,
      };
    });
  });
