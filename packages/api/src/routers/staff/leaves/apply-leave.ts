import { ORPCError } from "@orpc/server";
import { calculateLeaveDays } from "@school-student-teacher-management/db/constants/leave";
import {
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
import {
  RESERVING_STATUSES,
  assertWithinQuota,
  lockStaffForLeave,
} from "./quota";

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
      .select({ id: staff.id, gender: staff.gender })
      .from(staff)
      .where(eq(staff.userId, context.session.user.id))
      .limit(1);

    if (!staffRecord) {
      throw new ORPCError("NOT_FOUND", {
        message: "No staff profile is linked to your account yet",
      });
    }

    // The College grants maternity leave per person (see the AGENTS.md leave
    // section); it is not a request a male teacher's record can carry —
    // the UI already hides the option, and this is the write-side backstop
    // for a request built by hand.
    if (input.type === "maternity" && staffRecord.gender === "male") {
      throw new ORPCError("BAD_REQUEST", {
        message: "Maternity leave is not available for this staff record",
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

    const requestedDays = calculateLeaveDays(
      input.startDate,
      input.endDate,
      dayPart
    );

    if (requestedDays === 0) {
      throw new ORPCError("BAD_REQUEST", {
        message: "These dates contain no working day — weekends are not leave",
      });
    }

    /**
     * Check-then-insert used to run with no transaction and no lock, so a
     * double-click filed two requests and two requests for the last day of
     * a quota both passed (F-07, F-17). The teacher's staff row is locked
     * for the duration, which serializes every leave write for that person.
     */
    const record = await context.db.transaction(async (tx) => {
      await lockStaffForLeave(tx, staffRecord.id);

      await assertWithinQuota(tx, {
        staffId: staffRecord.id,
        academicYearId: currentYear.id,
        type: input.type,
        paymentStatus,
        statuses: RESERVING_STATUSES,
        requestedDays,
        action: "apply",
      });

      const overlappingRequests = await tx
        .select({
          dayPart: leaveRequest.dayPart,
        })
        .from(leaveRequest)
        .where(
          and(
            eq(leaveRequest.staffId, staffRecord.id),
            eq(leaveRequest.academicYearId, currentYear.id),
            inArray(leaveRequest.status, [...RESERVING_STATUSES]),
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

      const [inserted] = await tx
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
      return inserted;
    });

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
