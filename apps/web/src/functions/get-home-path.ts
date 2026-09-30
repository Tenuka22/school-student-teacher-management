import type { SessionUser } from "@school-student-teacher-management/api/context";
import { resolveAuthority } from "@school-student-teacher-management/api/routers/staff/leaves/leadership-review";
import { academicYear } from "@school-student-teacher-management/db/schema/staff";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";

import { authMiddleware } from "@/middleware/auth";
import { db } from "@/services.server";

export type HomeBase =
  | "/admin"
  | "/academic-admin"
  | "/inventory-admin"
  | "/leave-admin"
  | "/principal"
  | "/deputy-principal"
  | "/teacher";

/**
 * The workspace root for a member, before the academic year is appended.
 *
 * The seeded role decides first — `principal` and `vicePrincipal` are their
 * own roles, so an account is self-describing. Position authority is the
 * fallback so a member promoted through position management still lands in
 * the right workspace, and `role: "admin"` is the plain admin desk. The two
 * specialist seats have workspaces of their own now: the Academic
 * Administrator runs the year's staff, classes and timetable under
 * `/academic-admin`, the Inventory Administrator's whole desk is the
 * register under `/inventory-admin`, and the Leave Administrator's whole desk
 * is the leave queue under `/leave-admin`.
 *
 * Returns null for a role that owns no workspace (`user`,
 * `teacher-requester`): those are not a misplaced teacher, they are simply not
 * staff yet. Sending them to a workspace whose guard bounces them straight
 * back is exactly how a redirect loop starts.
 */
export const getHomeBase = (input: {
  role?: string | null;
  isDeputy: boolean;
  isPrincipal: boolean;
}): HomeBase | null => {
  if (input.role === "principal" || input.isPrincipal) {
    return "/principal";
  }
  if (input.role === "vicePrincipal" || input.isDeputy) {
    return "/deputy-principal";
  }
  if (input.role === "admin") {
    return "/admin";
  }
  if (input.role === "academicAdmin") {
    return "/academic-admin";
  }
  // Its full path skips the bare dashboard below and goes straight to the
  // register — see `getHomePath`.
  if (input.role === "inventoryAdmin") {
    return "/inventory-admin";
  }
  if (input.role === "leaveAdmin") {
    return "/leave-admin";
  }
  if (input.role === "teacher") {
    return "/teacher";
  }
  return null;
};

/**
 * The member's landing path, scoped to the current academic year
 * (`/admin/2026`).
 *
 * Two pages come before the workspace, because both describe an account that
 * cannot use the system yet: `/verify` when the address is unconfirmed, and
 * `/pending-approval` when it is confirmed but a staff role is still being
 * decided. A plain `user` account owns no workspace at all and goes to its
 * profile, which is the one page every signed-in account can open.
 */
export type HomePath =
  | `${HomeBase}/${string}`
  | HomeBase
  | "/login"
  | "/verify"
  | "/pending-approval"
  | "/account";

export const getHomePath = (input: {
  role?: string | null;
  isDeputy: boolean;
  isPrincipal: boolean;
  year: number | null;
  emailVerified?: boolean | null;
}): HomePath => {
  if (input.emailVerified === false) {
    return "/verify";
  }

  // Verified, but still awaiting a decision on staff access. There is no
  // workspace to scope to a year yet, so the waiting page is year-less.
  if (input.role === "teacher-requester") {
    return "/pending-approval";
  }

  const base = getHomeBase(input);

  // No workspace for this role, and no year to scope it to either.
  if (base === null) {
    return "/account";
  }

  const path: HomePath = input.year === null ? base : `${base}/${input.year}`;

  // Every role lands on its workspace root and nothing else, which is what the
  // three administrator seats want: `/admin/$year` is the academic overview,
  // `/academic-admin/$year` is the same page in the other workspace, and
  // `/inventory-admin/$year` is the store's.
  //
  // The Inventory Administrator used to be sent past its own workspace root
  // straight to `/staff/inventory`, on the reasoning that the register was this
  // seat's whole job and `$year` merely forwarded there. That was true while the
  // store's figures had to be assembled from six panes by hand, and it is not
  // true now that `/inventory-admin/$year` exists to show them: the special case
  // made the one seat with a dashboard the only seat that never saw it, and the
  // register — which is what the special case existed to reach — is one click
  // from the dashboard's own primary action.
  return path;
};

/**
 * The signed-in user's home path, resolved server-side.
 *
 * Requires a session; returns `/login` when there is none so callers can
 * redirect unconditionally. Authority comes from `staff_position` rows for
 * the current academic year (same source as the leave review chain), not
 * from the username — a leadership seat assigned later via position
 * management must still redirect correctly.
 */
export const getMyHomePath = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<HomePath> => {
    const { session } = context;

    if (!session) {
      return "/login";
    }

    const [currentYear] = await db
      .select({ id: academicYear.id, year: academicYear.year })
      .from(academicYear)
      .where(eq(academicYear.isCurrent, true))
      .limit(1);
    const authority = currentYear
      ? await resolveAuthority(db, session.user.id, currentYear.id)
      : null;

    return getHomePath({
      role: (session.user as SessionUser).role,
      isDeputy: authority?.isDeputy ?? false,
      isPrincipal: authority?.isPrincipal ?? false,
      year: currentYear?.year ?? null,
      emailVerified: session.user.emailVerified,
    });
  });
