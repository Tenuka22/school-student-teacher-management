import {
  leaveRequest,
  leaveStatusSchema,
} from "@school-student-teacher-management/db/schema/leaves";
import type {
  DeputyStatus,
  FinalStatus,
  LeaveStatus,
  LeaveType,
} from "@school-student-teacher-management/db/schema/leaves";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { desc, eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../../index";

export const leaveStatusFilterSchema = v.optional(leaveStatusSchema);

/**
 * All leave requests across the school, newest first — the admin
 * review queue. Filterable by status; includes the requesting
 * teacher's name and badge number for one-shot rendering.
 */
export const listLeaveRequests = adminProcedure
  .input(
    v.object({
      status: leaveStatusFilterSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const whereClause = input.status
      ? eq(leaveRequest.status, input.status)
      : undefined;

    const rows = await context.db
      .select({
        id: leaveRequest.id,
        type: leaveRequest.type,
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate,
        reason: leaveRequest.reason,
        status: leaveRequest.status,
        deputyStatus: leaveRequest.deputyStatus,
        deputyComment: leaveRequest.deputyComment,
        finalStatus: leaveRequest.finalStatus,
        finalizedAt: leaveRequest.finalizedAt,
        reviewComment: leaveRequest.reviewComment,
        reviewedAt: leaveRequest.reviewedAt,
        createdAt: leaveRequest.createdAt,
        staffId: leaveRequest.staffId,
        staffName: staff.name,
        staffBadge: staff.teacherServiceNo,
      })
      .from(leaveRequest)
      .innerJoin(staff, eq(leaveRequest.staffId, staff.id))
      .where(whereClause)
      .orderBy(desc(leaveRequest.createdAt));

    return {
      requests: rows.map((row) => ({
        id: row.id,
        staffId: row.staffId,
        staffName: row.staffName,
        staffBadge: row.staffBadge,
        type: row.type as LeaveType,
        startDate: row.startDate,
        endDate: row.endDate,
        reason: row.reason,
        status: row.status as LeaveStatus,
        deputyStatus: row.deputyStatus as DeputyStatus,
        deputyComment: row.deputyComment,
        finalStatus: row.finalStatus as FinalStatus,
        finalizedAt: row.finalizedAt?.toISOString() ?? null,
        reviewComment: row.reviewComment,
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });
