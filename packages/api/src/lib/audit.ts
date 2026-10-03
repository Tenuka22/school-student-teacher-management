import { ORPCError, os } from "@orpc/server";
import { accountAuditLog } from "@school-student-teacher-management/db/schema/auth";

import type { Context } from "../context";
import { logServerError } from "./log";

/**
 * Audit trail for privileged oRPC procedures (LOG1).
 *
 * `account_audit_log` already records every better-auth admin-plugin call
 * (`adminEndpointGuard`); the procedures below change who someone is, what
 * they may do, or a decision about them, and went unrecorded. One row per
 * call, written whether the call succeeded or was refused — including a
 * refusal by the role or permission middleware, because this middleware sits
 * beneath every procedure (`publicProcedure` in `../index.ts`) and so wraps
 * them.
 *
 * What a row holds: the actor's user id and role, `rpc:<procedure path>`,
 * the target record's id (the input's `staffId` or `id`), the outcome, and
 * in `detail` the request id (matching the `x-request-id` the client got and
 * the structured error log) and, on failure, the oRPC error code. Never the
 * input's values: no NIC, name, phone, password or comment reaches this table.
 */
export const AUDITED_PROCEDURES: ReadonlySet<string> = new Set([
  "staff.createStaff",
  "staff.updateStaff",
  "staff.deleteStaff",
  "staff.assignPosition",
  "staff.removePosition",
  // A year switch re-derives every leadership role (`reconcilePositionDerivedRoles`).
  "staff.setCurrentYear",
  "staff.approveTeacherRequest",
  "staff.purgeUnverified",
  "staff.leaves.recommendLeave",
  "staff.leaves.finalizeLeave",
  "staff.leaves.upsertLeaveEntitlement",
]);

const MAX_TARGET_LENGTH = 64;

const targetOf = (input: unknown): string | null => {
  if (!input || typeof input !== "object") {
    return null;
  }
  const { staffId, id } = input as { staffId?: unknown; id?: unknown };
  const target = typeof staffId === "string" ? staffId : id;
  return typeof target === "string" ? target.slice(0, MAX_TARGET_LENGTH) : null;
};

const outcomeOf = (error: unknown): { outcome: string; code: string } => {
  const code =
    error instanceof ORPCError ? error.code : "INTERNAL_SERVER_ERROR";
  const refused = code === "FORBIDDEN" || code === "UNAUTHORIZED";
  return { outcome: refused ? "denied" : "failed", code };
};

export const auditPrivilegedProcedures = os
  .$context<Context>()
  .middleware(async ({ context, next, path }, input) => {
    const action = path.join(".");
    if (!AUDITED_PROCEDURES.has(action)) {
      return next();
    }

    const write = async (outcome: string, code: string | null) => {
      const detail = [
        context.requestId ? `requestId=${context.requestId}` : null,
        code ? `error=${code}` : null,
      ]
        .filter(Boolean)
        .join("; ");
      try {
        await context.db.insert(accountAuditLog).values({
          id: crypto.randomUUID(),
          actorUserId: context.session?.user.id ?? null,
          actorRole: context.session?.user.role ?? null,
          action: `rpc:${action}`,
          targetUserId: null,
          outcome,
          detail: [`target=${targetOf(input) ?? "-"}`, detail]
            .filter(Boolean)
            .join("; "),
        });
      } catch (error) {
        // The call's own result stands; a lost audit row is logged, not
        // turned into a failure of work that has already committed.
        logServerError(error, {
          requestId: context.requestId,
          userId: context.session?.user.id ?? null,
          path,
        });
      }
    };

    try {
      // oxlint-disable-next-line node/callback-return -- `next` is oRPC's middleware continuation; its result is returned once the audit row is written
      const result = await next();
      await write("allowed", null);
      return result;
    } catch (error) {
      const { outcome, code } = outcomeOf(error);
      await write(outcome, code);
      throw error;
    }
  });
