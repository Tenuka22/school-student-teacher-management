import type { SessionUser } from "@school-student-teacher-management/api/context";
// `roles` subpath, not the package barrel: this file is bundled for the
// client too, and the barrel re-exports the env-driven bootstrap code.
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getCurrentAcademicYear } from "@/functions/get-academic-year";
import { redirectToHome } from "@/lib/home-redirect";
import { isWorkspaceRoot } from "@/lib/year-guard";

/**
 * Admin workspace \u2014 the non-leadership `admin` account, plus the seeded
 * `inventoryAdmin` seat.
 *
 * The Principal and Deputy Principal hold `principal` / `vicePrincipal` roles
 * so an account is self-describing, but they have their own workspaces at
 * `/principal/$year` and `/deputy-principal/$year`. They share the same
 * management *permissions*; what differs is the surface they land in, so
 * neither can wander into the other one's area.
 *
 * `inventoryAdmin` is admitted here rather than getting its own workspace
 * because the register it manages already lives under `/admin/$year/staff/
 * inventory` \u2014 building a parallel `/inventory-admin/$year` shell for one
 * page would be a second workspace for a single destination. It cannot reach
 * anything else under here: every other admin sub-route calls
 * `adminProcedure`/`adminOnlyProcedure`, which check the literal role list and
 * do not include `inventoryAdmin`, so a typed-in URL to `/admin/$year/users`
 * or the bare dashboard fails at the API layer even though the route itself
 * loads.
 */
export const Route = createFileRoute("/_auth/admin")({
  component: Outlet,
  beforeLoad: async ({ context, location }) => {
    const role = (context.session?.user as SessionUser | undefined)?.role;

    if (role !== "admin" && role !== "inventoryAdmin") {
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
