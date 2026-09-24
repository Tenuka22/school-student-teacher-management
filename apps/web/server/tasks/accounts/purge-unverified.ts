import { purgeUnverifiedAccounts } from "@school-student-teacher-management/auth";
import { createDb } from "@school-student-teacher-management/db";
import { defineTask } from "nitro/task";

import { ENV } from "../../../src/env.server";

/**
 * Removes accounts that registered but never confirmed their email address.
 *
 * Runs from three places, deliberately: on server start (so a fresh deploy
 * catches up), on this schedule (so a long-running server does not accumulate
 * throwaways), and from the users page (so an administrator can do it now).
 * All three call the same function, so the rule is stated once.
 *
 * Only `emailVerified: false` rows older than the retention window qualify,
 * which makes it impossible for this to touch a real member or one of the
 * seeded institutional accounts.
 */
export default defineTask({
  meta: {
    name: "accounts:purge-unverified",
    description:
      "Delete unverified accounts older than the retention window (default: daily)",
  },
  async run({ payload }) {
    const olderThanDays =
      typeof payload.days === "number" ? payload.days : undefined;
    const olderThanMs = olderThanDays
      ? olderThanDays * 24 * 60 * 60 * 1000
      : undefined;

    const database = createDb(ENV);
    const { removed } = await purgeUnverifiedAccounts(
      database,
      olderThanMs ? { olderThanMs } : {}
    );

    if (removed > 0) {
      console.log(`[accounts] Purged ${removed} unverified account(s)`);
    }

    return { result: { removed } };
  },
});
