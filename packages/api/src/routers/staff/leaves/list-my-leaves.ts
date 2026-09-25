import {
  leaveRequest,
  leaveStatusSchema,
} from "@school-student-teacher-management/db/schema/leaves";
import type {
  LeaveDayPart,
  LeavePaymentStatus,
  LeaveStatus,
  LeaveType,
} from "@school-student-teacher-management/db/schema/leaves";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { and, desc, eq } from "drizzle-orm";
import * as v from "valibot";

import { teacherProcedure } from "../../../index";

/**
 * The signed-in teacher's own leave requests, newest first. Teachers
 * only ever see their own rows — filtering is done server-side on the
 * staff record resolved from the session user id.
 */
export const listMyLeaves = teacherProcedure
  .input(
    v.object({
      status: v.optional(leaveStatusSchema),
    })
  )
  .handler(async ({ input, context }) => {
    const [staffRecord] = await context.db
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.userId, context.session.user.id))
      .limit(1);

    if (!staffRecord) {
      // No linked profile yet — an empty history is correct rather than
      // an error, the portal shows the "not linked" notice separately.
      return { requests: [] };
    }

    const whereClause = input.status
      ? and(
          eq(leaveRequest.staffId, staffRecord.id),
          eq(leaveRequest.status, input.status)
        )
      : eq(leaveRequest.staffId, staffRecord.id);

    const rows = await context.db
      .select({
        id: leaveRequest.id,
        type: leaveRequest.type,
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate,
        dayPart: leaveRequest.dayPart,
        paymentStatus: leaveRequest.paymentStatus,
        reason: leaveRequest.reason,
        status: leaveRequest.status,
        reviewComment: leaveRequest.reviewComment,
        principalComment: leaveRequest.principalComment,
        reviewedAt: leaveRequest.reviewedAt,
        createdAt: leaveRequest.createdAt,
      })
      .from(leaveRequest)
      .where(whereClause)
      .orderBy(desc(leaveRequest.createdAt));

    return {
      requests: rows.map((row) => ({
        id: row.id,
        type: row.type as LeaveType,
        startDate: row.startDate,
        endDate: row.endDate,
        dayPart: row.dayPart as LeaveDayPart,
        paymentStatus: row.paymentStatus as LeavePaymentStatus,
        reason: row.reason,
        status: row.status as LeaveStatus,
        reviewComment: row.reviewComment,
        principalComment: row.principalComment,
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });
