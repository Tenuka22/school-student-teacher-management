import {
  leaveRequest,
  leaveStatusSchema,
} from "@school-student-teacher-management/db/schema/leaves";
import type {
  DeputyStatus,
  FinalStatus,
  LeaveDayPart,
  LeavePaymentStatus,
  LeaveStatus,
  LeaveType,
} from "@school-student-teacher-management/db/schema/leaves";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../../index";
import { leaveYearSchema, requireLeaveAcademicYear } from "./leadership-review";

export const leaveStatusFilterSchema = v.optional(leaveStatusSchema);

/**
 * Review-chain queue presets. Each selects the slice of the ledger a given
 * reviewer is actually acting on:
 * - `all` — the full ledger (admins, and any reviewer keeping an overview)
 * - `deputy` — untouched requests waiting for a Deputy recommendation
 * - `principal` — requests the Deputy recommended, awaiting a final decision
 *
 * `finalizedAt` is the authoritative "chain is closed" marker, so a
 * preset never resurrects a decided request.
 */
export const LEAVE_QUEUE_FILTERS = ["all", "deputy", "principal"] as const;

export type LeaveQueue = (typeof LEAVE_QUEUE_FILTERS)[number];

/**
 * All leave requests across the school, newest first — the admin
 * review queue. Filterable by status or by review-chain queue; includes the
 * requesting teacher's name and badge number for one-shot rendering.
 */
export const listLeaveRequests = adminProcedure
  .input(
    v.object({
      year: leaveYearSchema,
      status: leaveStatusFilterSchema,
      queue: v.optional(v.picklist(LEAVE_QUEUE_FILTERS)),
    })
  )
  .handler(async ({ input, context }) => {
    const selectedYear = await requireLeaveAcademicYear(context.db, input.year);
    const conditions: SQL[] = [
      eq(leaveRequest.academicYearId, selectedYear.id),
    ];

    if (input.status) {
      conditions.push(eq(leaveRequest.status, input.status));
    }

    if (input.queue === "deputy") {
      conditions.push(
        eq(leaveRequest.status, "pending"),
        isNull(leaveRequest.finalizedAt)
      );
    } else if (input.queue === "principal") {
      conditions.push(
        inArray(leaveRequest.status, ["recommended", "rejected"]),
        isNull(leaveRequest.finalizedAt)
      );
    }

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
        deputyStatus: leaveRequest.deputyStatus,
        deputyComment: leaveRequest.deputyComment,
        finalStatus: leaveRequest.finalStatus,
        principalComment: leaveRequest.principalComment,
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
      .where(conditions.length > 0 ? and(...conditions) : undefined)
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
        dayPart: row.dayPart as LeaveDayPart,
        paymentStatus: row.paymentStatus as LeavePaymentStatus,
        reason: row.reason,
        status: row.status as LeaveStatus,
        deputyStatus: row.deputyStatus as DeputyStatus,
        deputyComment: row.deputyComment,
        finalStatus: row.finalStatus as FinalStatus,
        principalComment: row.principalComment,
        finalizedAt: row.finalizedAt?.toISOString() ?? null,
        reviewComment: row.reviewComment,
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });
