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

export const adminProcedure = publicProcedure.use(requireRole("admin"));

export const teacherProcedure = publicProcedure.use(
  requireRole("admin", "teacher")
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

    // Admin bypasses all permission checks
    if (role === "admin") {
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
