import { ORPCError } from "@orpc/server";
import {
  session,
  user,
} from "@school-student-teacher-management/db/schema/auth";
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

/** Roles an account may hold while waiting to be approved as staff. */
const REQUESTER_ROLES = new Set(["teacher-requester", "user"]);

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
      .orderBy(user.createdAt);

    const requesterIds: string[] = [];

    for (const row of rows) {
      if (row.role && REQUESTER_ROLES.has(row.role)) {
        requesterIds.push(row.id);
      }
    }

    const sessions = requesterIds.length
      ? await context.db
          .select({
            userId: session.userId,
            createdAt: session.createdAt,
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
          })
          .from(session)
          .where(inArray(session.userId, requesterIds))
      : [];

    /** Newest first, so "last seen" is the first row for an account. */
    const sessionsByUser = new Map<string, typeof sessions>();
    for (const entry of sessions) {
      const existing = sessionsByUser.get(entry.userId) ?? [];
      existing.push(entry);
      sessionsByUser.set(entry.userId, existing);
    }

    const requesters = [];

    for (const row of rows) {
      if (!row.role || !REQUESTER_ROLES.has(row.role)) {
        continue;
      }

      const userSessions = sessionsByUser.get(row.id) ?? [];
      const [latest] = userSessions;

      requesters.push({
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
        sessionCount: userSessions.length,
        lastSeenAt: latest?.createdAt.toISOString() ?? null,
        lastSeenIp: latest?.ipAddress ?? null,
        lastSeenAgent: latest?.userAgent ?? null,
      });
    }

    return requesters;
  }
);

/**
 * Approves a requester as a teacher.
 *
 * Two gates, in this order:
 * 1. The caller must be an administrator or the Principal.
 * 2. The requester must have **verified their email**. A teacher is always
 *    verified, so promoting an unverified account would manufacture that
 *    state rather than record it.
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

    if (!target.role || !REQUESTER_ROLES.has(target.role)) {
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
