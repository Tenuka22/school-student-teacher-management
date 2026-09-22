import { ORPCError } from "@orpc/server";
import { leaveRequest } from "@school-student-teacher-management/db/schema/leaves";
import type {
  DeputyStatus,
  FinalStatus,
} from "@school-student-teacher-management/db/schema/leaves";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { protectedProcedure } from "../../../index";

/** Position keys (see constants/positions.ts) that may recommend leave. */
const DEPUTY_POSITIONS = new Set(["vicePrincipal", "assistantPrincipal"]);
/** Position keys that may finalise a leave request. */
const PRINCIPAL_POSITIONS = new Set(["principal"]);

/**
 * Resolves the signed-in user's staff row + current-year position keys.
 * Authority comes from `staff_position` rows, not from auth roles.
 */
const resolveAuthority = async (
  db: Parameters<
    Parameters<typeof protectedProcedure.handler>[0]
  >[0]["context"]["db"],
  userId: string
) => {
  const { staffPosition, academicYear } =
    await import("@school-student-teacher-management/db/schema/staff");

  // Independent lookups — run in parallel.
  const [[staffRecord], [currentYear]] = await Promise.all([
    db
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.userId, userId))
      .limit(1),
    db
      .select({ id: academicYear.id })
      .from(academicYear)
      .where(eq(academicYear.isCurrent, true))
      .limit(1),
  ]);

  if (!staffRecord || !currentYear) {
    return null;
  }

  const positions = await db
    .select({ position: staffPosition.position })
    .from(staffPosition)
    .where(
      and(
        eq(staffPosition.staffId, staffRecord.id),
        eq(staffPosition.academicYearId, currentYear.id)
      )
    );

  const positionKeys = positions.map((row) => row.position);

  return {
    staffId: staffRecord.id,
    isDeputy: positionKeys.some((key) => DEPUTY_POSITIONS.has(key)),
    isPrincipal: positionKeys.some((key) => PRINCIPAL_POSITIONS.has(key)),
  };
};

/**
 * Deputy Principal acts on a leave request: **recommends** (or rejects).
 * This is a recommendation only — it does not finalise the request.
 */
export const recommendLeave = protectedProcedure
  .input(
    v.object({
      id: v.string(),
      decision: v.picklist(["recommended", "rejected"]),
      comment: v.optional(v.nullable(v.string())),
    })
  )
  .handler(async ({ input, context }) => {
    const authority = await resolveAuthority(
      context.db,
      context.session.user.id
    );

    if (!authority?.isDeputy) {
      throw new ORPCError("FORBIDDEN", {
        message: "Only the Deputy Principal can recommend leave requests",
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

    if (record.finalizedAt) {
      throw new ORPCError("CONFLICT", {
        message: "This request is already finalised by the Principal",
      });
    }

    const [updated] = await context.db
      .update(leaveRequest)
      .set({
        deputyStatus: input.decision satisfies DeputyStatus,
        deputyStaffId: authority.staffId,
        deputyActedAt: new Date(),
        deputyComment: input.comment ?? null,
        // Overall status mirrors the recommendation step until the
        // Principal finalises.
        status: input.decision === "recommended" ? "recommended" : "rejected",
      })
      .where(eq(leaveRequest.id, input.id))
      .returning();

    if (!updated) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      id: updated.id,
      status: updated.status,
      deputyStatus: updated.deputyStatus,
    };
  });

/**
 * Principal acts on a leave request: approve or reject. **Final** — sets
 * `finalizedAt`, after which no further action is possible (the deputy
 * recommendation is preserved for the audit trail).
 */
export const finalizeLeave = protectedProcedure
  .input(
    v.object({
      id: v.string(),
      decision: v.picklist(["approved", "rejected"]),
      comment: v.optional(v.nullable(v.string())),
    })
  )
  .handler(async ({ input, context }) => {
    const authority = await resolveAuthority(
      context.db,
      context.session.user.id
    );

    if (!authority?.isPrincipal) {
      throw new ORPCError("FORBIDDEN", {
        message: "Only the Principal can approve or reject leave requests",
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

    if (record.finalizedAt) {
      throw new ORPCError("CONFLICT", {
        message: "This request was already finalised",
      });
    }

    const now = new Date();

    const [updated] = await context.db
      .update(leaveRequest)
      .set({
        finalStatus: input.decision satisfies FinalStatus,
        principalStaffId: authority.staffId,
        principalActedAt: now,
        principalComment: input.comment ?? null,
        finalizedAt: now,
        status: input.decision,
      })
      .where(eq(leaveRequest.id, input.id))
      .returning();

    if (!updated) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      id: updated.id,
      status: updated.status,
      finalStatus: updated.finalStatus,
      finalizedAt: updated.finalizedAt?.toISOString() ?? null,
    };
  });
