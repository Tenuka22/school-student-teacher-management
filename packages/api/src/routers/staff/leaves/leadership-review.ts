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
 * Resolves the signed-in user's leave-review authority.
 *
 * Two sources, in order:
 * 1. The **seeded auth role** (`principal` / `vicePrincipal`). The Principal
 *    and Deputy accounts are bootstrapped as pure admin accounts with no
 *    `staff` row and no NIC, so their role is the only thing that exists.
 * 2. A current-year `staff_position` row, which is how a member promoted
 *    through position management (rather than seeded from env) gains
 *    authority.
 *
 * `staffId` is null for role-based leadership, since there is no staff record
 * to point at; the `*_staff_id` columns on a leave request are nullable for
 * exactly that reason.
 *
 * Exported so `getMyAuthority` can expose the same truth to the UI.
 */
export const resolveAuthority = async (
  db: Parameters<
    Parameters<typeof protectedProcedure.handler>[0]
  >[0]["context"]["db"],
  userId: string
) => {
  const { user } =
    await import("@school-student-teacher-management/db/schema/auth");

  const [account] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (account?.role === "principal" || account?.role === "vicePrincipal") {
    return {
      staffId: null,
      isDeputy: account.role === "vicePrincipal",
      isPrincipal: account.role === "principal",
    };
  }

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

/**
 * The signed-in user's review-chain authority for the current academic
 * year. Lets the UI show only the buttons that member can actually use:
 * the Deputy Principal gets recommend controls, the Principal gets the
 * finalise controls, everyone else gets neither.
 */
export const getMyAuthority = protectedProcedure.handler(
  async ({ context }) => {
    const authority = await resolveAuthority(
      context.db,
      context.session.user.id
    );

    return {
      isDeputy: authority?.isDeputy ?? false,
      isPrincipal: authority?.isPrincipal ?? false,
    };
  }
);
