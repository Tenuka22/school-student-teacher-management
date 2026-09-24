import type { SessionUser } from "@school-student-teacher-management/api/context";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getCurrentAcademicYear } from "@/functions/get-academic-year";
import { redirectToHome } from "@/lib/home-redirect";
import { isWorkspaceRoot } from "@/lib/year-guard";

/**
 * Teacher self-service shell — the signed-in member's *own* profile, leave and
 * timetable. Staff self-signup and admin-created teachers both land on
 * `role: "teacher"`. Leadership and the non-leadership admin are excluded:
 * they have no staff record of their own, so this page would only ever show
 * them the "no profile linked" notice.
 */
export const Route = createFileRoute("/_auth/teacher")({
  component: Outlet,
  beforeLoad: async ({ context, location }) => {
    const role = (context.session?.user as SessionUser | undefined)?.role;

    if (role !== "teacher" && role !== "admin") {
      await redirectToHome(location.pathname);
    }

    if (!isWorkspaceRoot(location.pathname, "/teacher")) {
      return;
    }

    const current = await getCurrentAcademicYear();

    if (current) {
      throw redirect({ href: `/teacher/${current.year}` as never });
    }
  },
});
