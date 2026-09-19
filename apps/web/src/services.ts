import {
  createAuth,
  ensureAdminUser,
} from "@school-student-teacher-management/auth";
import { createDb } from "@school-student-teacher-management/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);

await ensureAdminUser(db, ENV);
