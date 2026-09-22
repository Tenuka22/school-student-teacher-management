import { ORPCError } from "@orpc/server";
import {
  leaveRequest,
  leaveRequestInsertSchema,
} from "@school-student-teacher-management/db/schema/leaves";
import {
  academicYear,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import { pick } from "valibot";
import * as v from "valibot";

import { teacherProcedure } from "../../../index";

/**
 * A teacher applies for leave. The staff record is resolved from the
 * signed-in user (staff.userId), so a teacher can never file a request
 * on someone else's behalf.
 */
export const applyLeave = teacherProcedure
  .input(
    v.object({
      ...pick(leaveRequestInsertSchema, [
        "type",
        "startDate",
        "endDate",
        "reason",
      ]).entries,
    })
  )
  .handler(async ({ input, context }) => {
    const [staffRecord] = await context.db
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.userId, context.session.user.id))
      .limit(1);

    if (!staffRecord) {
      throw new ORPCError("NOT_FOUND", {
        message: "No staff profile is linked to your account yet",
      });
    }

    if (input.endDate < input.startDate) {
      throw new ORPCError("BAD_REQUEST", {
        message: "End date cannot be before the start date",
      });
    }

    // Attach the current academic year — leave records are year-scoped
    // like every other assignment table.
    const [currentYear] = await context.db
      .select({ id: academicYear.id })
      .from(academicYear)
      .where(eq(academicYear.isCurrent, true))
      .limit(1);

    if (!currentYear) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: "No current academic year is set — ask an admin to open one",
      });
    }

    const [record] = await context.db
      .insert(leaveRequest)
      .values({
        id: crypto.randomUUID(),
        staffId: staffRecord.id,
        academicYearId: currentYear.id,
        type: input.type,
        startDate: input.startDate,
        endDate: input.endDate,
        reason: input.reason ?? null,
        status: "pending",
      })
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      id: record.id,
      type: record.type,
      startDate: record.startDate,
      endDate: record.endDate,
      reason: record.reason,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
    };
  });
