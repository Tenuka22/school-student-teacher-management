import {
  createAuth,
  ensureBootstrapUsers,
  purgeUnverifiedAccounts,
} from "@school-student-teacher-management/auth";
import { createDb } from "@school-student-teacher-management/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);

// Bootstrap the admin + leadership accounts from env on every server
// start — their credentials stay in sync with the environment.
await ensureBootstrapUsers(db, ENV);

// Then sweep abandoned sign-ups: an account that never confirmed its address
// is deleted once it ages past the retention window. Only `emailVerified:
// false` rows are eligible, so this cannot touch a real member or a seeded
// account. Boot-time is enough because new throwaways only appear via
// sign-up, and the next restart sweeps them.
const swept = await purgeUnverifiedAccounts(db);
if (swept.removed > 0) {
  console.log(`[auth] Purged ${swept.removed} unverified account(s)`);
}
