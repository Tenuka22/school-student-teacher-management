import type { SessionUser } from "@school-student-teacher-management/api/context";
// `roles` subpath, not the package barrel: this file is bundled for the
// client too, and the barrel re-exports the env-driven bootstrap code.
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getCurrentAcademicYear } from "@/functions/get-academic-year";
import { redirectToHome } from "@/lib/home-redirect";
import { isWorkspaceRoot } from "@/lib/year-guard";

/**
 * Admin workspace \u2014 the non-leadership `admin` account.
 *
 * The Principal and Deputy Principal hold `principal` / `vicePrincipal` roles
 * so an account is self-describing, but they have their own workspaces at
 * `/principal/$year` and `/deputy-principal/$year`. They share the same
 * management *permissions*; what differs is the surface they land in, so
 * neither can wander into the other one's area.
 *
 * The two specialist seats have trees of their own and are deliberately **not**
 * admitted here: `academicAdmin` at `/academic-admin/$year` (the year's staff,
 * classes, timetable, attendance and accounts) and `inventoryAdmin` at
 * `/inventory-admin/$year` (the register). This tree used to carry both as
 * guests, and each of them arrived at a workspace whose every link outside its
 * one job failed at the API layer \u2014 their procedures are
 * `academicProcedure` and `inventoryOverseerProcedure`/`inventoryManagerProcedure`
 * respectively, and neither holds `adminProcedure` outright. Each seat now
 * starts at the pages it can actually use, and this workspace is the top
 * administrator's alone.
 *
 * administrator's alone. Leadership was never admitted here either \u2014 the
 * old doc said it was and the code disagreed \u2014 and it stays out: the
 * Principal and Deputy build every link from their own workspace helpers, and
 * the pages they are meant to review live at `/principal/$year/leaves`,
 * `/deputy-principal/$year/leaves` and the two `staff/attendance` routes.
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
