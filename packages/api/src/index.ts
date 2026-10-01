import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";

/** Shape of better-auth's permission check, stated structurally — the
 * inferred auth type loses plugin API inference through the config helper.
 */
interface PermissionCheckResult {
  success: boolean;
}

const hasPermission = (
  auth: NonNullable<Context["auth"]>,
  role: string,
  resource: string,
  action: string
) =>
  // The auth factory's inferred API type collapses plugin endpoints, so we
  // call through a structural cast — the endpoint exists at runtime.
  (
    auth.api as unknown as {
      userHasPermission: (args: {
        body: {
          role: string;
          permissions: Record<string, string[]>;
        };
      }) => Promise<PermissionCheckResult>;
    }
  ).userHasPermission({
    body: {
      role,
      permissions: { [resource]: [action] },
    },
  });

export const o = os.$context<Context>();

export const publicProcedure = o;

// ─── Auth middleware ─────────────────────────────────────────────────────────

const requireAuth = o.middleware(({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session: context.session,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);

// ─── Role-based middleware ───────────────────────────────────────────────────

const requireRole = (...allowedRoles: string[]) =>
  o.middleware(({ context, next }) => {
    if (!context.session?.user) {
      throw new ORPCError("UNAUTHORIZED");
    }
    if (!allowedRoles.includes(context.session.user.role ?? "")) {
      throw new ORPCError("FORBIDDEN");
    }
    return next({
      context: {
        session: context.session,
      },
    });
  });

/**
 * Roles that may reach the admin surface. Principal and Vice Principal are
 * seeded with their own roles (see `packages/auth/permissions.ts`) but hold the
 * same management authority as `admin`, so all three are accepted here.
 */
const ADMIN_ROLES = ["admin", "principal", "vicePrincipal"];

export const adminProcedure = publicProcedure.use(requireRole(...ADMIN_ROLES));

/**
 * The academic desk's procedures: `ADMIN_ROLES` **plus** the seeded
 * `academicAdmin` seat.
 *
 * Leadership keeps every read it had before this tier existed \u2014 `ADMIN_ROLES`
 * is a subset \u2014 so widening a staff-router procedure from `adminProcedure` to
 * `academicProcedure` grants exactly one new audience and nothing else. What
 * the seat does **not** get is listed by omission: the `adminOnlyProcedure`
 * family stays above it. `assignPosition`/`removePosition` sit on their own
 * `positionManagerProcedure` (below) rather than on this tier, because that
 * one is also open to `principal` \u2014 a seat `academicProcedure` does not name
 * directly (it inherits it only via `ADMIN_ROLES`).
 */
export const academicProcedure = publicProcedure.use(
  requireRole(...ADMIN_ROLES, "academicAdmin")
);

/**
 * School-wide switches the academic desk shares with the top administrator:
 * opening, closing, restoring and switching academic years, and editing the
 * attendance policy.
 *
 * Narrower than `academicProcedure` the same way `adminOnlyProcedure` is
 * narrower than `adminProcedure`: these change what the whole school believes
 * is true, so the leadership seats — who can read every ledger but do not move
 * the goalposts — are deliberately not on this list, and neither is
 * `inventoryAdmin`.
 */
export const adminOrAcademicProcedure = publicProcedure.use(
  requireRole("admin", "academicAdmin")
);

/**
 * School-wide writes that only the top administrator makes.
 *
 * Opening, switching and removing academic years, and editing the attendance
 * policy,
 * moved down to `adminOrAcademicProcedure` when the academic desk got its own
 * workspace. The leadership seats can read the ledger and act on their own
 * queues (see `leaves.leadershipReview`), but they do not get to move the
 * goalposts for everyone else, so these still sit above `adminProcedure`.
 *
 * Leave quotas moved off this tier onto `leaveManagerProcedure` (`admin` +
 * the seeded `leaveAdmin` seat) when the Leave Administrator seat was carved
 * out.
 */
export const adminOnlyProcedure = publicProcedure.use(requireRole("admin"));

/**
 * Assigning or removing a staff member's position for a year \u2014 Deputy or
 * Assistant Principal, Sectional Head, Head of Department, or plain teacher.
 * `admin`, `principal`, and the seeded `academicAdmin` seat: a Deputy
 * Principal is this year's appointment of a real member of staff, not a
 * login of their own, so handing the position to someone is the academic
 * desk's or the Principal's call to make, not only the top administrator's.
 *
 * `vicePrincipal` is deliberately absent \u2014 a sitting Deputy Principal does
 * not get to appoint (or remove) another one, or themselves. Assigning the
 * `principal` position itself is narrower still: `assign-position.ts` and
 * `remove-position.ts` refuse it from `academicAdmin` in the handler, since
 * handing someone the Principal's own seat is not the academic desk's
 * decision to make about the person it reports to.
 */
export const positionManagerProcedure = publicProcedure.use(
  requireRole("admin", "principal", "academicAdmin")
);

export const teacherProcedure = publicProcedure.use(
  requireRole(...ADMIN_ROLES, "teacher")
);

/**
 * The inventory register's admin-tier reads: the school-wide item list, the
 * assignable-staff picker, borrow/issue/disposal ledgers. Same audience as
 * `adminProcedure` (admin, principal, vicePrincipal) **plus** the seeded
 * `inventoryAdmin` seat, which has no reason to reach any other admin
 * surface but is exactly who this register is for.
 */
export const inventoryOverseerProcedure = publicProcedure.use(
  requireRole(...ADMIN_ROLES, "inventoryAdmin")
);

/**
 * The inventory register's admin-tier writes: registering/editing items and
 * units, moving custody between named people, appointing a manager, stock
 * in/out, closing a dated loan, signing off a write-off. Narrower than
 * `inventoryOverseerProcedure` the same way `adminOnlyProcedure` is narrower
 * than `adminProcedure` — literally "admin" or the seeded `inventoryAdmin`
 * seat — not the leadership roles — because these are the writes that decide
 * who is holding school property, and that is this seat's whole job, not a
 * leadership one.
 */
export const inventoryManagerProcedure = publicProcedure.use(
  requireRole("admin", "inventoryAdmin")
);

/**
 * The leave desk's admin-tier reads: the school-wide leave ledger/queue.
 * Same audience as `adminProcedure` (admin, principal, vicePrincipal)
 * **plus** the seeded `leaveAdmin` seat, which has no reason to reach any
 * other admin surface but is exactly who this queue is for.
 *
 * `academicAdmin` is deliberately not on this list: leave review moved off
 * the academic desk onto its own seat, mirroring `inventoryOverseerProcedure`.
 */
export const leaveOverseerProcedure = publicProcedure.use(
  requireRole(...ADMIN_ROLES, "leaveAdmin")
);

/**
 * The leave desk's admin-tier writes: setting leave-type entitlements and
 * quotas. Narrower than `leaveOverseerProcedure` the same way
 * `inventoryManagerProcedure` is narrower than `inventoryOverseerProcedure`
 * - "admin" or the seeded `leaveAdmin` seat, not the leadership roles -
 * because setting quotas for the whole school is this seat's whole job.
 */
export const leaveManagerProcedure = publicProcedure.use(
  requireRole("admin", "leaveAdmin")
);

// ─── Permission-based middleware ─────────────────────────────────────────────

type PermissionResource = string;
type PermissionAction = string;

/**
 * Check if the current user's role has a specific permission via better-auth's
 * access control system. Admin bypasses all permission checks.
 */
const requirePermission = (
  resource: PermissionResource,
  action: PermissionAction
) =>
  o.middleware(async ({ context, next }) => {
    if (!context.session?.user) {
      throw new ORPCError("UNAUTHORIZED");
    }

    const { role } = context.session.user;
    if (!role) {
      throw new ORPCError("FORBIDDEN");
    }

    // Leadership roles hold the same statement set as admin, so they bypass
    // the per-permission round trip exactly like `admin` does.
    if (ADMIN_ROLES.includes(role)) {
      return next({
        context: {
          session: context.session,
        },
      });
    }

    // If auth is unavailable, deny access (tests may pass null)
    if (!context.auth) {
      throw new ORPCError("FORBIDDEN");
    }

    try {
      const result = await hasPermission(context.auth, role, resource, action);

      if (!result.success) {
        throw new ORPCError("FORBIDDEN");
      }
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error;
      }
      // If permission check fails (e.g., role doesn't exist), deny access
      throw new ORPCError("FORBIDDEN");
    }

    return next({
      context: {
        session: context.session,
      },
    });
  });

// ─── Permission-checked procedures ──────────────────────────────────────────

/** Student management: requires student:create or student:read etc. */
export const requireStudentPermission = (action: PermissionAction) =>
  publicProcedure.use(requirePermission("student", action));

/** Mark management: requires mark:create or mark:read etc. */
export const requireMarkPermission = (action: PermissionAction) =>
  publicProcedure.use(requirePermission("mark", action));

/** Exam management: requires exam:create or exam:read etc. */
export const requireExamPermission = (action: PermissionAction) =>
  publicProcedure.use(requirePermission("exam", action));

/** Staff management: requires staff:create or staff:read etc. */
export const requireStaffPermission = (action: PermissionAction) =>
  publicProcedure.use(requirePermission("staff", action));

/** Assignment management: requires assignment:create etc. */
export const requireAssignmentPermission = (action: PermissionAction) =>
  publicProcedure.use(requirePermission("assignment", action));

/** Qualification management: requires qualification:create etc. */
export const requireQualificationPermission = (action: PermissionAction) =>
  publicProcedure.use(requirePermission("qualification", action));

/**
 * `requireInventoryPermission("read")` is reachable by the `teacher` role, so
 * any inventory read procedure built on it MUST scope its own result set to
 * the caller — the permission alone does not. School-wide ledger reads belong
 * on `adminProcedure`.
 */
/** Inventory management: requires inventory:create or inventory:read etc. */
export const requireInventoryPermission = (action: PermissionAction) =>
  publicProcedure.use(requirePermission("inventory", action));
