import type { SessionUser } from "@school-student-teacher-management/api/context";
// `roles` subpath, not the package barrel: this file is bundled for the
// client too, and the barrel re-exports the env-driven bootstrap code.
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getCurrentAcademicYear } from "@/functions/get-academic-year";
import { redirectToHome } from "@/lib/home-redirect";
import { isWorkspaceRoot } from "@/lib/year-guard";

/**
 * Leave Administrator workspace — the seeded `leaveAdmin` seat, and its
 * whole job is one group of routes: the school-wide leave queue under
 * `$year/staff/leaves`.
 *
 * Mirrors `/inventory-admin`'s reasoning exactly: this seat holds only
 * `leaveOverseerProcedure` and `leaveManagerProcedure` (see
 * `packages/api/src/index.ts`), so every other page in `/admin` is a link
 * this seat is refused at the API layer. It gets its own tree instead of a
 * seat inside `/admin`.
 *
 * `admin` is admitted as well: leave review is one of the top admin's own
 * surfaces, and a shared link to it should land on the queue rather than
 * bounce to `/admin` for no reason.
 *
 * `academicAdmin` is deliberately **not** on this list: `listLeaveRequests`
 * moved off `academicProcedure` onto `leaveOverseerProcedure` when this seat
 * was carved out, so the academic desk no longer reaches the leave queue and
 * this workspace stays out of its reach.
 */
export const Route = createFileRoute("/_auth/leave-admin")({
  component: Outlet,
  beforeLoad: async ({ context, location }) => {
    const role = (context.session?.user as SessionUser | undefined)?.role;

    if (role !== "leaveAdmin" && role !== "admin") {
      await redirectToHome(location.pathname);
    }

    // The academic year is a required path segment, so the bare workspace
    // root forwards to this workspace for the active year. Guarded by
    // `isWorkspaceRoot` because this layout's beforeLoad also runs for
    // `/leave-admin/2026/...`, and redirecting there would loop.
    if (!isWorkspaceRoot(location.pathname, "/leave-admin")) {
      return;
    }

    const current = await getCurrentAcademicYear();

    if (current) {
      throw redirect({ href: `/leave-admin/${current.year}` as never });
    }
  },
});
