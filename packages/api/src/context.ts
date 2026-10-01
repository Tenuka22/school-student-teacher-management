import type { createAuth } from "@school-student-teacher-management/auth";
import type { Database } from "@school-student-teacher-management/db";

/**
 * Better-auth session, stated structurally. The auth factory's return type
 * loses plugin generic inference (options are built through a typed helper),
 * so `$Infer` doesn't surface the `role`/`username` additional fields —
 * they're declared here instead. Extra fields on the real object are fine.
 */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role?: string | null;
  username?: string | null;
  displayUsername?: string | null;
}

export interface Session {
  user: SessionUser;
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    [key: string]: unknown;
  };
}

export interface Context {
  session: Session | null;
  db: Database;
  auth: ReturnType<typeof createAuth> | null;
  /**
   * Request headers, for the few procedures that need the caller's address
   * (rate limiting the public sign-up). Absent for in-process calls such as
   * SSR loaders and tests.
   */
  headers?: Headers;
  /** Correlates log lines with the `x-request-id` response header. */
  requestId?: string;
}
