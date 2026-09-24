import type { SessionUser } from "@school-student-teacher-management/api/context";
// `roles` subpath, not the package barrel: this file is bundled for the
// client too, and the barrel re-exports the env-driven bootstrap code.
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getCurrentAcademicYear } from "@/functions/get-academic-year";
import { redirectToHome } from "@/lib/home-redirect";
import { isWorkspaceRoot } from "@/lib/year-guard";

/**
 * Admin workspace — **only** the non-leadership `admin` account.
 *
 * The Principal and Deputy Principal hold `principal` / `vicePrincipal` roles
 * so an account is self-describing, but they have their own workspaces at
 * `/principal/$year` and `/deputy-principal/$year`. They share the same
 * management *permissions*; what differs is the surface they land in, so
 * neither can wander into the other one's area.
 */
export const Route = createFileRoute("/_auth/admin")({
  component: Outlet,
  beforeLoad: async ({ context, location }) => {
    const role = (context.session?.user as SessionUser | undefined)?.role;

    if (role !== "admin") {
      await redirectToHome(location.pathname);
    }

    // The academic year is a required path segment, so the bare workspace
    // root forwards to this workspace for the active year. Leadership is
    // still allowed in here — the redirect keeps the requested workspace
    // rather than bouncing them to their own desk. Guarded by
    // `isWorkspaceRoot` because this layout's beforeLoad also runs for
    // `/admin/2026/...`, and redirecting there would loop.
    if (!isWorkspaceRoot(location.pathname, "/admin")) {
      return;
    }

    const current = await getCurrentAcademicYear();

    if (current) {
      throw redirect({ href: `/admin/${current.year}` as never });
    }
  },
});
