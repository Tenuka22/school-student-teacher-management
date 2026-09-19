import { createAccessControl } from "better-auth/plugins/access";
import type { AccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

/**
 * Application-wide permission statements. Each key is a resource and the
 * array enumerates every action that can be granted on that resource.
 *
 * `defaultStatements` re-exports better-auth's built-in `user` and `session`
 * resources so we keep a single source of truth here.
 */
export const statement = {
  ...defaultStatements,
  /** File assets: upload (create), enumerate (list), remove (delete). */
  file: ["create", "list", "delete"],
  /** Staff records: full CRUD. */
  staff: ["create", "read", "update", "delete"],
  /** Teaching/position assignments: full CRUD. */
  assignment: ["create", "read", "update", "delete"],
  /** Qualifications: upload (create), view (read), approve/reject (approve). */
  qualification: ["create", "read", "approve"],
  /** Student records: full CRUD. */
  student: ["create", "read", "update", "delete"],
  /** Marks: enter, view, update marks for assigned classes. */
  mark: ["create", "read", "update"],
  /** Exam types and grade scales: manage exam definitions. */
  exam: ["create", "read", "update", "delete"],
} as const;

export type AppAccessControl = AccessControl<typeof statement>;

export const ac: AppAccessControl = createAccessControl(statement);

/**
 * Admin – full control over every resource.
 * Spreads the default admin statements so all built-in user/session
 * permissions are preserved.
 */
export const admin = ac.newRole({
  ...adminAc.statements,
  file: ["create", "list", "delete"],
  staff: ["create", "read", "update", "delete"],
  assignment: ["create", "read", "update", "delete"],
  qualification: ["create", "read", "approve"],
});

/**
 * Regular user – can upload and view own qualifications, but cannot approve.
 * Staff/assignment management is admin-only.
 */
export const user = ac.newRole({
  qualification: ["create", "read"],
});

/**
 * Teacher – manages marks for assigned classes. Can read students in their
 * class and create/update marks. Can view exam types and grade scales.
 */
export const teacher = ac.newRole({
  student: ["read"],
  mark: ["create", "read", "update"],
  exam: ["read"],
  assignment: ["read"],
});
