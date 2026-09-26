import { createFileRoute } from "@tanstack/react-router";

import { InventoryPage } from "@/components/staff/inventory/inventory-page";

/**
 * The "Asset Register" link in the sidebar's "Inventory" group — the Records
 * pane, opened on its Asset register sub-tab (the tagged/unique-ID units,
 * not the catalog — that is the plain "Inventory Management" link, this
 * route's own `inventory.index.tsx` sibling). Spelled out in full rather than
 * reusing `InventoryLifecycleTabs`' own short tab value ("register") because
 * that word already names a different pane one level up.
 */
export const Route = createFileRoute(
  "/_auth/admin/$year/staff/inventory/asset-register"
)({
  component: () => <InventoryPage section="asset-register" />,
});
