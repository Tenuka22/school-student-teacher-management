import type {
  Session,
  createAuth,
} from "@school-student-teacher-management/auth";
import type { Database } from "@school-student-teacher-management/db";

export interface Context {
  session: Session | null;
  db: Database;
  auth: ReturnType<typeof createAuth> | null;
}
