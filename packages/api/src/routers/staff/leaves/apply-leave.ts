import { ORPCError } from "@orpc/server";
import { calculateLeaveDays } from "@school-student-teacher-management/db/constants/leave";
import {
  leaveEntitlement,
  leaveRequest,
  leaveRequestInsertSchema,
} from "@school-student-teacher-management/db/schema/leaves";
import type { LeaveDayPart } from "@school-student-teacher-management/db/schema/leaves";
import {
  academicYear,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { pick } from "valibot";
import * as v from "valibot";

import { teacherProcedure } from "../../../index";

/**
 * Only maternity leave carries a payment status, and it is chosen by the
 * teacher: the College grants 84 days on full pay and a further 84 at half pay.
 */
const resolvePaymentStatus = (
  leaveType: string,
  paymentStatus: "notApplicable" | "paid" | "halfPay" | "unpaid" | undefined
) => {
  if (leaveType !== "maternity") {
    return "notApplicable" as const;
  }

  if (paymentStatus === "halfPay") {
    return "halfPay" as const;
  }

  if (paymentStatus === "unpaid") {
    return "unpaid" as const;
  }

  return "paid" as const;
};

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
        "dayPart",
        "paymentStatus",
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

    const dayPart = (input.dayPart ?? "full") as LeaveDayPart;
    if (dayPart !== "full" && input.startDate !== input.endDate) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Half-day leave must start and end on the same date",
      });
    }

    const paymentStatus = resolvePaymentStatus(input.type, input.paymentStatus);

    const [currentYear] = await context.db
      .select({
        id: academicYear.id,
        startDate: academicYear.startDate,
        endDate: academicYear.endDate,
      })
      .from(academicYear)
      .where(eq(academicYear.isCurrent, true))
      .limit(1);

    if (!currentYear) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: "No current academic year is set — ask an admin to open one",
      });
    }

    if (
      (currentYear.startDate && input.startDate < currentYear.startDate) ||
      (currentYear.endDate && input.endDate > currentYear.endDate)
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Leave dates must be inside the current academic year",
      });
    }

    const [entitlement] = await context.db
      .select({ id: leaveEntitlement.id, maxDays: leaveEntitlement.maxDays })
      .from(leaveEntitlement)
      .where(
        and(
          eq(leaveEntitlement.academicYearId, currentYear.id),
          eq(leaveEntitlement.leaveType, input.type),
          eq(leaveEntitlement.paymentStatus, paymentStatus)
        )
      )
      .limit(1);

    if (!entitlement) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: `No leave entitlement is configured for ${input.type}`,
      });
    }

    /**
     * The quota is checked, not merely displayed.
     *
     * `leave_entitlement.maxDays` used to be decorative: the procedure only
     * checked that a row *existed*, so a teacher could file 200 days of annual
     * leave against a 20-day entitlement and watch the balance on their own
     * dashboard go negative. Approved days are what consume the quota, matching
     * the balance a teacher is shown.
     */
    const requestedDays = calculateLeaveDays(
      input.startDate,
      input.endDate,
      dayPart
    );

    const consumed = await context.db
      .select({
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate,
        dayPart: leaveRequest.dayPart,
      })
      .from(leaveRequest)
      .where(
        and(
          eq(leaveRequest.staffId, staffRecord.id),
          eq(leaveRequest.academicYearId, currentYear.id),
          eq(leaveRequest.type, input.type),
          eq(leaveRequest.paymentStatus, paymentStatus),
          eq(leaveRequest.status, "approved")
        )
      );

    const usedDays = consumed.reduce(
      (total, request) =>
        total +
        calculateLeaveDays(
          request.startDate,
          request.endDate,
          request.dayPart as LeaveDayPart
        ),
      0
    );

    if (usedDays + requestedDays > entitlement.maxDays) {
      const remaining = Math.max(0, entitlement.maxDays - usedDays);

      throw new ORPCError("PRECONDITION_FAILED", {
        message: `This request is ${requestedDays} day${requestedDays === 1 ? "" : "s"} and you have ${remaining} of ${entitlement.maxDays} ${input.type} day${entitlement.maxDays === 1 ? "" : "s"} left this year. Reduce the request, or ask the Principal to review an exception.`,
      });
    }

    const overlappingRequests = await context.db
      .select({
        dayPart: leaveRequest.dayPart,
      })
      .from(leaveRequest)
      .where(
        and(
          eq(leaveRequest.staffId, staffRecord.id),
          eq(leaveRequest.academicYearId, currentYear.id),
          inArray(leaveRequest.status, ["pending", "recommended", "approved"]),
          lte(leaveRequest.startDate, input.endDate),
          gte(leaveRequest.endDate, input.startDate)
        )
      );

    const hasConflictingLeave = overlappingRequests.some((request) => {
      if (dayPart === "full" || request.dayPart === "full") {
        return true;
      }
      return request.dayPart === dayPart;
    });

    if (hasConflictingLeave) {
      throw new ORPCError("CONFLICT", {
        message:
          "You already have an active leave request covering this day part",
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
        dayPart,
        paymentStatus,
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
      dayPart: record.dayPart,
      paymentStatus: record.paymentStatus,
      reason: record.reason,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
    };
  });
