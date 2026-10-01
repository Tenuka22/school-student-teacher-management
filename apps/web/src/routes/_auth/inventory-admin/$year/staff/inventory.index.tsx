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
 * **Who reaches this workspace, decided: `inventoryAdmin` and `admin` only.**
 * The register's reads run on `inventoryOverseerProcedure` (`admin`,
 * `principal`, `vicePrincipal` plus `inventoryAdmin`) and its writes on
 * `inventoryManagerProcedure` (`admin` plus `inventoryAdmin`) — see
 * `packages/api/src/index.ts` for both. The API therefore admits leadership
 * to the register's data, but `_auth/inventory-admin/route.tsx` does not:
 * leadership has its own workspaces, and this tree is the register alone.
 * Widening that is a follow-up, not a drive-by — see the sidebar's own
 * comment above `adminInventoryNav` in `app-sidebar.tsx`.
 */
export const Route = createFileRoute(
  "/_auth/inventory-admin/$year/staff/inventory/"
)({
  component: () => <InventoryPage section="register" />,
});
