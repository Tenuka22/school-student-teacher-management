import type { SessionUser } from "@school-student-teacher-management/api/context";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getCurrentAcademicYear } from "@/functions/get-academic-year";
import { redirectToHome } from "@/lib/home-redirect";
import { isWorkspaceRoot } from "@/lib/year-guard";

/**
 * Deputy Principal workspace shell. There is no seeded deputy-principal
 * login \u2014 both deputy seats (Vice and Assistant Principal) are real staff
 * members whose `user.role` is promoted to `vicePrincipal` the moment they
 * are assigned either `staffPosition` (via `assignPosition`, by the
 * Administrator, the Principal, or the Academic Administrator), and demoted
 * back when the position is removed \u2014 see `reconcilePositionDerivedRoles`.
 * So the guard below is a plain role check, and leave-review authority is
 * still resolved separately, straight from the current-year `staff_position`
 * row (`resolveAuthority`), which is what lets any number of staff hold the
 * seat at once.
 */
export const Route = createFileRoute("/_auth/deputy-principal")({
  component: Outlet,
  beforeLoad: async ({ context, location }) => {
    const role = (context.session?.user as SessionUser | undefined)?.role;

    if (role !== "vicePrincipal") {
      await redirectToHome(location.pathname);
    }

    if (!isWorkspaceRoot(location.pathname, "/deputy-principal")) {
      return;
    }

    const current = await getCurrentAcademicYear();

    if (current) {
      throw redirect({ href: `/deputy-principal/${current.year}` as never });
    }
  },
});
