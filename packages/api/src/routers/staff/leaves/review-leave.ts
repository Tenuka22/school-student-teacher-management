import { ORPCError } from "@orpc/server";
import { leaveRequest } from "@school-student-teacher-management/db/schema/leaves";
import type { LeaveStatus } from "@school-student-teacher-management/db/schema/leaves";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../../index";

/**
 * Admin reviews a leave request: approve or reject, optionally with a
 * comment ("approved — arrange cover for 6-B", "insufficient notice"...).
 * Only pending requests can be reviewed; the reviewer is recorded from
 * the admin's own staff row when one exists.
 */
export const reviewLeave = adminProcedure
  .input(
    v.object({
      id: v.string(),
      decision: v.picklist(["approved", "rejected"]),
      comment: v.optional(v.nullable(v.string())),
    })
  )
  .handler(async ({ input, context }) => {
    const [record] = await context.db
      .select()
      .from(leaveRequest)
      .where(eq(leaveRequest.id, input.id))
      .limit(1);

    if (!record) {
      throw new ORPCError("NOT_FOUND", { message: "Leave request not found" });
    }

    if (record.status !== "pending") {
      throw new ORPCError("CONFLICT", {
        message: `This request was already ${record.status}`,
      });
    }

    // The reviewing admin's own staff row, when they have one.
    const [reviewer] = await context.db
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.userId, context.session.user.id))
      .limit(1);

    const [updated] = await context.db
      .update(leaveRequest)
      .set({
        status: input.decision satisfies LeaveStatus,
        reviewedByStaffId: reviewer?.id ?? null,
        reviewedAt: new Date(),
        reviewComment: input.comment ?? null,
      })
      .where(eq(leaveRequest.id, input.id))
      .returning();

    if (!updated) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      id: updated.id,
      status: updated.status,
      reviewComment: updated.reviewComment,
      reviewedAt: updated.reviewedAt?.toISOString() ?? null,
    };
  });
