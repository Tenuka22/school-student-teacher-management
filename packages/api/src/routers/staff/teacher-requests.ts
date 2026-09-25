import { ORPCError } from "@orpc/server";
import {
  session,
  user,
} from "@school-student-teacher-management/db/schema/auth";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { eq, inArray } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";

/**
 * Roles allowed to approve a teacher requester. The Deputy Principal has the
 * same management permissions as everyone else in `adminProcedure`, but
 * granting College employment is an administrator-or-Principal decision, so
 * this check is made explicitly rather than inherited.
 */
const APPROVER_ROLES = new Set(["admin", "principal"]);

const assertCanApprove = (role: string | null | undefined) => {
  if (!role || !APPROVER_ROLES.has(role)) {
    throw new ORPCError("FORBIDDEN", {
      message: "Only an administrator or the Principal can approve teachers",
    });
  }
};

/**
 * Everyone waiting on a staffing decision, oldest first. A requester who has
 * not yet verified their email is listed too, but cannot be approved — see
 * `approveTeacherRequest`.
 *
 * The rows carry everything the review dialog shows, so the Principal decides
 * from one screen: identity, how the account was created, whether the address
 * is proven, whether the person is banned, and how long they have been
 * waiting. Session counts come from the same table the multi-session list
 * reads, so "active sessions" means what it says.
 */
export const listTeacherRequests = adminProcedure.handler(
  async ({ context }) => {
    const rows = await context.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        displayUsername: user.displayUsername,
        image: user.image,
        role: user.role,
        emailVerified: user.emailVerified,
        banned: user.banned,
        banReason: user.banReason,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(eq(user.role, "teacher-requester"))
      .orderBy(user.createdAt);

    const requesterIds = rows.map((row) => row.id);

    const [sessions, linkedStaffRows] = await Promise.all([
      requesterIds.length
        ? context.db
            .select({
              userId: session.userId,
              createdAt: session.createdAt,
              ipAddress: session.ipAddress,
              userAgent: session.userAgent,
            })
            .from(session)
            .where(inArray(session.userId, requesterIds))
        : Promise.resolve([]),
      requesterIds.length
        ? context.db
            .select({
              userId: staff.userId,
              id: staff.id,
              staffCategory: staff.staffCategory,
              employmentStatus: staff.employmentStatus,
            })
            .from(staff)
            .where(inArray(staff.userId, requesterIds))
        : Promise.resolve([]),
    ]);

    /** Newest first, so the most recent sign-in is the first row. */
    const sessionsByUser = new Map<string, typeof sessions>();
    for (const entry of sessions) {
      const existing = sessionsByUser.get(entry.userId) ?? [];
      existing.push(entry);
      sessionsByUser.set(entry.userId, existing);
    }

    const staffByUserId = new Map(
      linkedStaffRows.flatMap((row) =>
        row.userId ? [[row.userId, row] as const] : []
      )
    );

    return rows.map((row) => {
      const userSessions = sessionsByUser.get(row.id) ?? [];
      const [latest] = userSessions;
      const linkedStaff = staffByUserId.get(row.id);

      return {
        id: row.id,
        name: row.name,
        email: row.email,
        username: row.username,
        displayUsername: row.displayUsername,
        hasAvatar: row.image !== null,
        role: row.role,
        emailVerified: row.emailVerified,
        banned: row.banned === true,
        banReason: row.banReason,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        signInCount: userSessions.length,
        lastSignInAt: latest?.createdAt.toISOString() ?? null,
        lastSignInIp: latest?.ipAddress ?? null,
        lastSignInAgent: latest?.userAgent ?? null,
        /**
         * The staff record this account is attached to, when there is one.
         * The review dialog reads this to say *why* an account cannot be
         * approved yet instead of offering a button that always fails.
         */
        staffRecord: linkedStaff
          ? {
              id: linkedStaff.id,
              staffCategory: linkedStaff.staffCategory,
              employmentStatus: linkedStaff.employmentStatus,
            }
          : null,
      };
    });
  }
);
/**
 * Approves a requester as a teacher.
 *
 * Four gates, in this order:
 * 1. The caller must be an administrator or the Principal.
 * 2. The requester must have **verified their email**. A teacher is always
 *    verified, so promoting an unverified account would manufacture that
 *    state rather than record it.
 * 3. The requester must be linked to a staff record with the teacher category.
 * 4. The staff record must not be standing against the College — a suspended,
 *    retired or terminated record is a deliberate state, not a missing one.
 *
 * An employment status of `null` is a gap in the record, not a refusal: this
 * approval *is* the administrator's employment decision, so it records `active`
 * at the moment of approval rather than failing a person who registered
 * honestly. That is the only status this procedure ever writes.
 *
 * The seeded institutional accounts are unreachable here: they hold roles no
 * requester ever has, so there is nothing to promote.
 */
export const approveTeacherRequest = adminProcedure
  .input(v.object({ userId: v.string() }))
  .handler(async ({ input, context }) => {
    assertCanApprove(context.session.user.role);

    const [target] = await context.db
      .select({
        id: user.id,
        role: user.role,
        emailVerified: user.emailVerified,
      })
      .from(user)
      .where(eq(user.id, input.userId))
      .limit(1);

    if (!target) {
      throw new ORPCError("NOT_FOUND", { message: "Account not found" });
    }

    if (target.role !== "teacher-requester") {
      throw new ORPCError("CONFLICT", {
        message: "That account is not waiting to be approved as a teacher",
      });
    }

    if (!target.emailVerified) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message:
          "This person has not verified their email address yet — they must enter the code sent to it first",
      });
    }

    const [linkedStaff] = await context.db
      .select({
        id: staff.id,
        staffCategory: staff.staffCategory,
        employmentStatus: staff.employmentStatus,
      })
      .from(staff)
      .where(eq(staff.userId, target.id))
      .limit(1);

    if (!linkedStaff) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message:
          "This account is not linked to a staff record — add them under Teachers first",
      });
    }

    if (linkedStaff.staffCategory !== "teacher") {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: `The linked staff record is an office staff record, and office staff accounts are issued by an administrator rather than approved here`,
      });
    }

    if (
      linkedStaff.employmentStatus !== null &&
      linkedStaff.employmentStatus !== undefined &&
      linkedStaff.employmentStatus !== "active"
    ) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: `The staff record is marked "${linkedStaff.employmentStatus}" — correct the record under Teachers before approving`,
      });
    }

    if (linkedStaff.employmentStatus !== "active") {
      await context.db
        .update(staff)
        .set({ employmentStatus: "active" })
        .where(eq(staff.id, linkedStaff.id));
    }

    const [updated] = await context.db
      .update(user)
      .set({ role: "teacher" })
      .where(eq(user.id, target.id))
      .returning({ id: user.id, role: user.role });

    if (!updated) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return { id: updated.id, role: updated.role };
  });
