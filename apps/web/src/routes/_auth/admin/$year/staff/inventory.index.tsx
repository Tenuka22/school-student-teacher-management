import { createFileRoute } from "@tanstack/react-router";

import { InventoryPage } from "@/components/staff/inventory/inventory-page";

/**
 * The school-wide inventory register — the Register pane, and the default
 * landing point of the `/inventory` group. See `inventory-page.tsx`'s
 * `InventoryPage` for the whole page (both panes); this route names the
 * section it opens on and nothing else.
 *
 * **Markup only, and no `loader`.** `InventoryPage` runs its own
 * `items.list`, `borrows.list`, `categories.list` and `units.list` queries
 * through `useQuery` in `useInventoryPage`, so there is no query the page
 * blocks first paint on that a loader could warm.
 *
 * **Leadership reachability, decided: admin-only, deliberately.** Every
 * procedure the register's panes read is `adminProcedure`, which is `admin` +
 * `principal` + `vicePrincipal`
 * (`packages/api/src/routers/inventory/list-items.ts`, `list-borrows.ts`,
 * `list-transactions.ts`, `list-audit-logs.ts` all say so in their own
 * banners), so the API does admit a Principal to the register. The route tree
 * does not: `_auth/admin/route.tsx` redirects any role that is not `admin` to
 * its own workspace, and the Principal and Deputy workspaces carry only
 * `leaves`, `teacher-requests` (Principal) and `staff/attendance`. Widening
 * that is a follow-up, not a drive-by — see the sidebar's own comment above
 * `adminInventoryNav` in `app-sidebar.tsx`.
 */
export const Route = createFileRoute("/_auth/admin/$year/staff/inventory/")({
  component: () => <InventoryPage section="register" />,
});
