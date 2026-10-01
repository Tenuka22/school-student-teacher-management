import { ORPCError } from "@orpc/server";
import type { Database } from "@school-student-teacher-management/db";
import { calculateLeaveDays } from "@school-student-teacher-management/db/constants/leave";
import {
  leaveEntitlement,
  leaveRequest,
} from "@school-student-teacher-management/db/schema/leaves";
import type {
  LeaveDayPart,
  LeaveStatus,
} from "@school-student-teacher-management/db/schema/leaves";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { and, eq, inArray, ne } from "drizzle-orm";

/**
 * The leave quota, stated once (forensic audit F-07).
 *
 * It used to be checked only at `applyLeave` and only against **approved**
 * days, so a teacher with one day left could file any number of one-day
 * requests (each saw the same untouched balance), and the Principal's approval
 * never looked at the quota at all. Two rules now:
 *
 * - **Applying reserves days.** A request counts against the quota from the
 *   moment it is filed until it is rejected or cancelled, so the second of two
 *   requests for the last day is refused at the door.
 * - **Approving re-checks** against everything already approved, inside the
 *   approval's own transaction — an entitlement lowered after the request was
 *   filed, or an override of a request that should never have been filed,
 *   cannot slip through.
 *
 * Both run with the teacher's `staff` row locked `FOR UPDATE` (see
 * `lockStaffForLeave`), so two concurrent applications or approvals for the
 * same person are serialized instead of both reading the same balance.
 */

type Executor = Pick<Database, "select">;

/** Statuses that hold days against the quota. */
export const RESERVING_STATUSES = [
  "pending",
  "recommended",
  "approved",
] as const satisfies readonly LeaveStatus[];

/** Statuses a Principal may still decide. Anything else is closed. */
export const DECIDABLE_STATUSES = [
  "pending",
  "recommended",
] as const satisfies readonly LeaveStatus[];

interface LeaveSpan {
  id?: string;
  startDate: string;
  endDate: string;
  dayPart: string;
}

/**
 * Working days in a stored request. A row with dates that are not real
 * calendar dates (possible only from before dates were validated) is an
 * integrity problem to surface, not a zero to add.
 */
export const leaveDaysOf = (row: LeaveSpan): number => {
  try {
    return calculateLeaveDays(
      row.startDate,
      row.endDate,
      row.dayPart as LeaveDayPart
    );
  } catch {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: `Leave request ${row.id ?? ""} has invalid dates (${row.startDate} to ${row.endDate}); correct it before the balance can be calculated`,
    });
  }
};

/**
 * Serializes leave writes for one teacher. Must be called inside a
 * transaction; the lock is released at commit or rollback.
 */
export const lockStaffForLeave = async (tx: Executor, staffId: string) => {
  await tx
    .select({ id: staff.id })
    .from(staff)
    .where(eq(staff.id, staffId))
    .for("update");
};

interface QuotaQuery {
  staffId: string;
  academicYearId: string;
  type: string;
  paymentStatus: string;
  /** Statuses whose days count as already spent. */
  statuses: readonly LeaveStatus[];
  /** The request being decided, so it is not counted against itself. */
  excludeRequestId?: string;
}

/** Days already counted against one entitlement. */
export const sumLeaveDays = async (
  tx: Executor,
  query: QuotaQuery
): Promise<number> => {
  const rows = await tx
    .select({
      id: leaveRequest.id,
      startDate: leaveRequest.startDate,
      endDate: leaveRequest.endDate,
      dayPart: leaveRequest.dayPart,
    })
    .from(leaveRequest)
    .where(
      and(
        eq(leaveRequest.staffId, query.staffId),
        eq(leaveRequest.academicYearId, query.academicYearId),
        eq(leaveRequest.type, query.type),
        eq(leaveRequest.paymentStatus, query.paymentStatus),
        inArray(leaveRequest.status, [...query.statuses]),
        query.excludeRequestId
          ? ne(leaveRequest.id, query.excludeRequestId)
          : undefined
      )
    );
  return rows.reduce((total, row) => total + leaveDaysOf(row), 0);
};

/** The entitlement row for a type and payment status, or a 412. */
export const requireEntitlement = async (
  tx: Executor,
  academicYearId: string,
  type: string,
  paymentStatus: string
) => {
  const [entitlement] = await tx
    .select({ maxDays: leaveEntitlement.maxDays })
    .from(leaveEntitlement)
    .where(
      and(
        eq(leaveEntitlement.academicYearId, academicYearId),
        eq(leaveEntitlement.leaveType, type),
        eq(leaveEntitlement.paymentStatus, paymentStatus)
      )
    )
    .limit(1);

  if (!entitlement) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: `No leave entitlement is configured for ${type}`,
    });
  }
  return entitlement;
};

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/** Throws a 412 naming the remaining balance when `requestedDays` exceeds it. */
export const assertWithinQuota = async (
  tx: Executor,
  query: QuotaQuery & { requestedDays: number; action: "apply" | "approve" }
) => {
  const entitlement = await requireEntitlement(
    tx,
    query.academicYearId,
    query.type,
    query.paymentStatus
  );
  const spent = await sumLeaveDays(tx, query);

  if (spent + query.requestedDays > entitlement.maxDays) {
    const remaining = Math.max(0, entitlement.maxDays - spent);
    const subject =
      query.action === "apply" ? "This request" : "Approving this request";
    const held =
      query.action === "apply"
        ? "after your other pending and approved requests"
        : "after the leave already approved";
    throw new ORPCError("PRECONDITION_FAILED", {
      message: `${subject} needs ${plural(query.requestedDays, "day")}, and ${plural(remaining, "day")} of the ${entitlement.maxDays} ${query.type} entitlement remain ${held}.`,
    });
  }
};
