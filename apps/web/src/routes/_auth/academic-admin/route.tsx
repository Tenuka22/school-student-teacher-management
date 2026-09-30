import type { SessionUser } from "@school-student-teacher-management/api/context";
// `roles` subpath, not the package barrel: this file is bundled for the
// client too, and the barrel re-exports the env-driven bootstrap code.
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getCurrentAcademicYear } from "@/functions/get-academic-year";
import { redirectToHome } from "@/lib/home-redirect";
import { isWorkspaceRoot } from "@/lib/year-guard";

/**
 * Academic Administrator workspace — the seeded `academicAdmin` seat.
 *
 * This is the half of the old single `admin` role that runs the school's
 * academic year: teachers, classes, periods, attendance, the accounts list,
 * teacher-request approvals, academic years and the read-only ledgers. It is
 * a workspace of its own rather than a tab inside `/admin` because the two
 * seats are different jobs with different API guards — `academicProcedure`
 * admits this role and the top admin, and nothing here reaches the pieces
 * only the top admin holds (leave quotas, year deletion policy, inventory).
 *
 * `admin` is admitted as well: every page under this tree is guarded by
 * procedures the top admin also holds, so an administrator who follows a
 * shared link lands on a working page instead of being bounced to their own
 * desk for no reason.
 *
 * The Principal and Deputy Principal keep their own workspaces at
 * `/principal/$year` and `/deputy-principal/$year`.
 */
export const Route = createFileRoute("/_auth/academic-admin")({
  component: Outlet,
  beforeLoad: async ({ context, location }) => {
    const role = (context.session?.user as SessionUser | undefined)?.role;

    if (role !== "academicAdmin" && role !== "admin") {
      await redirectToHome(location.pathname);
    }

    // The academic year is a required path segment, so the bare workspace
    // root forwards to this workspace for the active year. Guarded by
    // `isWorkspaceRoot` because this layout's beforeLoad also runs for
    // `/academic-admin/2026/...`, and redirecting there would loop.
    if (!isWorkspaceRoot(location.pathname, "/academic-admin")) {
      return;
    }

    const current = await getCurrentAcademicYear();

    if (current) {
      throw redirect({ href: `/academic-admin/${current.year}` as never });
    }
  },
});
