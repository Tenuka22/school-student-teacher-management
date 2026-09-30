import type { SessionUser } from "@school-student-teacher-management/api/context";
// `roles` subpath, not the package barrel: this file is bundled for the
// client too, and the barrel re-exports the env-driven bootstrap code.
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getCurrentAcademicYear } from "@/functions/get-academic-year";
import { redirectToHome } from "@/lib/home-redirect";
import { isWorkspaceRoot } from "@/lib/year-guard";

/**
 * Inventory Administrator workspace — the seeded `inventoryAdmin` seat, and
 * its whole job is one group of routes: the school-wide register under
 * `$year/staff/inventory`.
 *
 * This seat used to be admitted to `/admin` instead, on the argument that the
 * register already lived there and a whole second workspace for one page was
 * more shell than the seat needed. It now has its own tree because the admin
 * workspace carries far more than the register did — teachers, classes,
 * periods, attendance, the accounts list — and every one of those is a page
 * this seat is refused at the API layer (`inventoryOverseerProcedure` and
 * `inventoryManagerProcedure` are the only tiers it holds). Admitting it to
 * `/admin` meant arriving at a workspace whose every other link failed.
 *
 * `admin` is admitted as well: the register is one of the top admin's own
 * surfaces, and a shared link to it should land on the register rather than
 * bounce to `/admin` for no reason.
 *
 * Note that `academicAdmin` is deliberately **not** on this list: the
 * academic desk has no inventory grant (see `permissions.ts`), so the
 * register stays out of `/academic-admin` and this workspace stays out of
 * its reach.
 */
export const Route = createFileRoute("/_auth/inventory-admin")({
  component: Outlet,
  beforeLoad: async ({ context, location }) => {
    const role = (context.session?.user as SessionUser | undefined)?.role;

    if (role !== "inventoryAdmin" && role !== "admin") {
      await redirectToHome(location.pathname);
    }

    // The academic year is a required path segment, so the bare workspace
    // root forwards to this workspace for the active year. Guarded by
    // `isWorkspaceRoot` because this layout's beforeLoad also runs for
    // `/inventory-admin/2026/...`, and redirecting there would loop.
    if (!isWorkspaceRoot(location.pathname, "/inventory-admin")) {
      return;
    }

    const current = await getCurrentAcademicYear();

    if (current) {
      throw redirect({ href: `/inventory-admin/${current.year}` as never });
    }
  },
});
