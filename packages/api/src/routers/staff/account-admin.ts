import { ORPCError } from "@orpc/server";
import { purgeUnverifiedAccounts } from "@school-student-teacher-management/auth";
import { user } from "@school-student-teacher-management/db/schema/auth";
import { and, eq, lt } from "drizzle-orm";

import { adminProcedure } from "../../index";

/** Accounts are swept once they are this old without confirming an address. */
const UNVERIFIED_RETENTION_DAYS = 7;
const UNVERIFIED_RETENTION_MS = UNVERIFIED_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Counts the accounts a cleanup would remove, without removing anything.
 *
 * Separate from the sweep so the users page can say "3 accounts" *before*
 * anyone commits to deleting them, which is the difference between an
 * informed decision and a surprise.
 */
export const previewUnverifiedPurge = adminProcedure.handler(
  async ({ context }) => {
    const cutoff = new Date(Date.now() - UNVERIFIED_RETENTION_MS);
    const rows = await context.db
      .select({ id: user.id, name: user.name, createdAt: user.createdAt })
      .from(user)
      .where(and(eq(user.emailVerified, false), lt(user.createdAt, cutoff)));

    return {
      retentionDays: UNVERIFIED_RETENTION_DAYS,
      count: rows.length,
      accounts: rows.map((row) => ({
        name: row.name,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
);

/**
 * Deletes unverified accounts that never confirmed their address and are
 * older than the retention window.
 *
 * Only `emailVerified: false` rows qualify, so no real member and none of the
 * seeded institutional accounts can be caught by it. The same sweep runs on
 * server start and on a schedule; this endpoint is the manual version for an
 * administrator who wants it done now.
 */
export const purgeUnverified = adminProcedure.handler(async ({ context }) => {
  const result = await purgeUnverifiedAccounts(context.db, {
    olderThanMs: UNVERIFIED_RETENTION_MS,
  });

  if (result.removed === 0) {
    throw new ORPCError("NOT_FOUND", {
      message: `No unverified accounts older than ${UNVERIFIED_RETENTION_DAYS} days`,
    });
  }

  return { removed: result.removed };
});
