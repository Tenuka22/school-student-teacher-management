import {
  createAuth,
  ensureLeadershipUsers,
} from "@school-student-teacher-management/auth";
import { createDb } from "@school-student-teacher-management/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);

// Bootstrap the Principal + Deputy Principal accounts from env on every
// server start — their credentials stay in sync with the environment.
await ensureLeadershipUsers(db, ENV);
