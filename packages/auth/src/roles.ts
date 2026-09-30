/**
 * Role names and the guards that read them.
 *
 * This module is deliberately dependency-free. Route files and components are
 * isomorphic — they are bundled for the client as well as rendered on the
 * server — so importing these helpers from the package barrel
 * (`@school-student-teacher-management/auth`) would drag `index.ts` and
 * `admin.ts` into the client module graph, where Vite would serve the
 * transformed source of the bootstrap code that reads `PRINCIPAL_PASSWORD`
 * and friends.
 *
 * Import from `@school-student-teacher-management/auth/roles` in anything
 * reachable from a route or component. Server-only code (API procedures,
 * server functions) may use the barrel.
 */

/** Roles that may reach the admin workspace. */
export const ADMIN_ROLES = ["admin", "principal", "vicePrincipal"] as const;

/** Roles that hold a seat in the leadership review chain. */
export const LEADERSHIP_ROLES = ["principal", "vicePrincipal"] as const;

/** Roles that hold no management authority. */
export const STAFF_ROLES = ["teacher", "teacher-requester", "user"] as const;

/** Every role the server can store on a user. */
export const ALL_ROLES = [
  "admin",
  "principal",
  "vicePrincipal",
  "inventoryAdmin",
  "academicAdmin",
  "teacher",
  "teacher-requester",
  "user",
] as const;

export type AnyRole = (typeof ALL_ROLES)[number];

/**
 * The one place a role becomes a word.
 *
 * These used to be three separate maps in the web app that disagreed with each
 * other — and one of them could only ever produce two of the six roles, so a
 * Principal was displayed to the administrator as "User".
 */
export const ROLE_LABELS: Record<AnyRole, string> = {
  admin: "Administrator",
  principal: "Principal",
  vicePrincipal: "Deputy Principal",
  inventoryAdmin: "Inventory Administrator",
  academicAdmin: "Academic Administrator",
  teacher: "Teacher",
  "teacher-requester": "Awaiting staff approval",
  user: "General account",
};

/** A display name for any stored role, including ones this build does not know. */
export const roleLabel = (value: string | null | undefined): string => {
  if (!value) {
    return ROLE_LABELS.user;
  }

  return ROLE_LABELS[value as AnyRole] ?? value;
};

/**
 * Login usernames of the env-seeded institutional accounts. Their password is
 * re-synced from server env on every boot, so an in-app password change would
 * silently revert on the next restart. See `PasswordDialog`.
 */
export const SEEDED_USERNAMES = [
  "admin",
  "principal",
  "deputy-principal",
  "inventory-admin",
  "academic-admin",
] as const;

/** True for the accounts the server reseeds from env on every start. */
export const isSeededAccount = (username: string | null | undefined): boolean =>
  SEEDED_USERNAMES.includes(
    (username ?? "").toLowerCase() as (typeof SEEDED_USERNAMES)[number]
  );

export type AdminRole = (typeof ADMIN_ROLES)[number];
export type LeadershipRole = (typeof LEADERSHIP_ROLES)[number];
export type StaffRole = (typeof STAFF_ROLES)[number];

export const isAdminRole = (
  role: string | null | undefined
): role is AdminRole => ADMIN_ROLES.includes(role as AdminRole);

export const isLeadershipRole = (
  role: string | null | undefined
): role is LeadershipRole => LEADERSHIP_ROLES.includes(role as LeadershipRole);

export const isStaffRole = (
  role: string | null | undefined
): role is StaffRole => STAFF_ROLES.includes(role as StaffRole);

/**
 * True for the roles whose `inventory` grant includes **`take`** — the
 * self-service claim and hand-back (`takeItem` and `releaseCustody`, both on
 * `requireInventoryPermission("take")`).
 *
 * ## Why this list is here and not read from `permissions.ts`
 *
 * `permissions.ts` is built by better-auth's `createAccessControl`, so importing
 * it into a browser component drags the access-control plugin into the client
 * bundle for the sake of one `Array.includes`. This module is deliberately
 * plain-data and plain-functions, which is why the web app imports *this* file
 * (`attendance-page-content.tsx` gates the attendance policy card on
 * `isAdminRole` for the same reason).
 *
 * **So the list below is a copy, and the copy is the hazard.** The authority is
 * the `inventory:` line in each role in `permissions.ts`; these three seats are
 * the ones carrying `"take"` there — `admin`, `principal`, `vicePrincipal` — and
 * the two that are not are `inventoryAdmin` (which is handed the register and
 * moves items with `transferCustody` instead) and `teacher` (read-only, plus
 * `acknowledge`). If a grant is widened or narrowed in `permissions.ts`, this
 * function has to be widened or narrowed with it, and the two sit 150 lines
 * apart in different packages, which is exactly the kind of duplication that
 * goes stale quietly. A role whose grant changes custody should be visible in
 * both files in the same commit.
 *
 * ## What it is for, and what it is not
 *
 * **It is for not offering a control the server will refuse** — nothing more.
 * Every procedure behind `take` is still gated server-side, and both narrow
 * further in their own handlers: `takeItem` refuses an account with no staff row,
 * and `releaseCustody` refuses a caller who is not the current holder and not in
 * its own list of seats. The register's row menu asked the server none of this,
 * so the Inventory Administrator was shown "Take this item" and "Hand it back"
 * on every row and got `Forbidden` from both — the failure mode
 * `get-item-for-scan.ts` already avoids by returning `canTake` and `canHandBack`
 * on the item it hands the scanner.
 */
export const INVENTORY_SELF_SERVICE_ROLES = [
  "admin",
  "principal",
  "vicePrincipal",
] as const;

export const canSelfServeInventory = (
  role: string | null | undefined
): boolean =>
  INVENTORY_SELF_SERVICE_ROLES.includes(
    role as (typeof INVENTORY_SELF_SERVICE_ROLES)[number]
  );

/**
 * True while the account still owes an email check. Verified is a separate
 * axis from role: a `user` or `teacher-requester` may be verified or not, and
 * `teacher` is only ever reachable once verified.
 */
export const needsVerification = (
  user: { emailVerified?: boolean | null } | null | undefined
): boolean => user?.emailVerified !== true;
