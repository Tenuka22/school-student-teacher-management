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
 * Principal / Vice Principal get their own seeded roles so an account is
 * self-describing (visible on `/admin/users`) and the workspace a member
 * lands on follows from the account rather than a second lookup.
 *
 * Both carry the full admin statement set — leadership still needs the
 * whole staff-management surface. The role never grants leave review
 * authority: that comes only from a current-year `staff_position` row, and
 * `assignPosition` is what promotes and demotes the role alongside it.
 */
export const principal = ac.newRole({
  ...adminAc.statements,
  file: ["create", "list", "delete"],
  staff: ["create", "read", "update", "delete"],
  assignment: ["create", "read", "update", "delete"],
  qualification: ["create", "read", "approve"],
});

export const vicePrincipal = ac.newRole({
  ...adminAc.statements,
  file: ["create", "list", "delete"],
  staff: ["create", "read", "update", "delete"],
  assignment: ["create", "read", "update", "delete"],
  qualification: ["create", "read", "approve"],
});

// Role names and guards live in `./roles` so isomorphic code (routes,
// components) can import them without pulling this package's server-only
// bootstrap code into the client bundle. Re-exported here for server callers.
export {
  ADMIN_ROLES,
  LEADERSHIP_ROLES,
  STAFF_ROLES,
  isAdminRole,
  isLeadershipRole,
  isSeededAccount,
  isStaffRole,
  needsVerification,
} from "./roles";
export type { AdminRole, LeadershipRole, StaffRole } from "./roles";

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

/**
 * Teacher-requester — someone who signed up wanting staff access and is
 * waiting on an administrator to approve them. Deliberately no staff
 * permissions: until promotion they can sign in and verify their email, but
 * nothing else. Promotion to `teacher` is the admin's decision.
 */
export const teacherRequester = ac.newRole({
  qualification: ["create", "read"],
});
