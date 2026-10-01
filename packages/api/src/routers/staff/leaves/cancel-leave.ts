import { ORPCError } from "@orpc/server";
import { leaveRequest } from "@school-student-teacher-management/db/schema/leaves";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { and, eq, isNull } from "drizzle-orm";
import * as v from "valibot";

import { teacherProcedure } from "../../../index";

/**
 * A teacher cancels their own still-pending leave request. Reviewed
 * (approved/rejected) requests can no longer be cancelled by the
 * teacher — an admin would reverse them manually if ever needed.
 */
export const cancelLeave = teacherProcedure
  .input(v.object({ id: v.string() }))
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

    const [record] = await context.db
      .select()
      .from(leaveRequest)
      .where(eq(leaveRequest.id, input.id))
      .limit(1);

    if (!record) {
      throw new ORPCError("NOT_FOUND", { message: "Leave request not found" });
    }

    if (record.staffId !== staffRecord.id) {
      // Not yours — indistinguishable from a missing row for safety.
      throw new ORPCError("NOT_FOUND", { message: "Leave request not found" });
    }

    if (record.status !== "pending") {
      throw new ORPCError("CONFLICT", {
        message: "Only pending requests can be cancelled",
      });
    }

    // Conditional on still being pending: a Deputy recommendation or a
    // Principal decision landing between the read above and this write wins,
    // instead of being silently overwritten by "cancelled" (F-17).
    const [updated] = await context.db
      .update(leaveRequest)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(leaveRequest.id, input.id),
          eq(leaveRequest.staffId, staffRecord.id),
          eq(leaveRequest.status, "pending"),
          isNull(leaveRequest.finalizedAt)
        )
      )
      .returning();

    if (!updated) {
      throw new ORPCError("CONFLICT", {
        message:
          "This request was reviewed a moment ago and can no longer be cancelled",
      });
    }

    return {
      id: updated.id,
      status: updated.status,
    };
  });
