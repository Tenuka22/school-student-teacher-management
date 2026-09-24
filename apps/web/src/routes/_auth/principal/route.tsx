import type { SessionUser } from "@school-student-teacher-management/api/context";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getCurrentAcademicYear } from "@/functions/get-academic-year";
import { redirectToHome } from "@/lib/home-redirect";
import { isWorkspaceRoot } from "@/lib/year-guard";

/**
 * Principal workspace shell. The seat has its own seeded auth role
 * (`principal`), so the guard is a local check — leave-review authority is
 * still resolved separately from the current-year `staff_position` row.
 */
export const Route = createFileRoute("/_auth/principal")({
  component: Outlet,
  beforeLoad: async ({ context, location }) => {
    const role = (context.session?.user as SessionUser | undefined)?.role;

    if (role !== "principal") {
      await redirectToHome(location.pathname);
    }

    if (!isWorkspaceRoot(location.pathname, "/principal")) {
      return;
    }

    const current = await getCurrentAcademicYear();

    if (current) {
      throw redirect({ href: `/principal/${current.year}` as never });
    }
  },
});
