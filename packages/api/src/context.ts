import type { Session } from "@school-student-teacher-management/auth";
import type { Database } from "@school-student-teacher-management/db";

export type Context = {
  session: Session | null;
  db: Database;
};
