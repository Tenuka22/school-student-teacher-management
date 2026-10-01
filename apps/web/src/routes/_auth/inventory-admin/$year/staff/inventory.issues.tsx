import { createFileRoute } from "@tanstack/react-router";

import { InventoryPage } from "@/components/staff/inventory/inventory-page";

/**
 * The "Transfers" link in the sidebar's "Inventory" group — its own page,
 * not a tab. Same shared `InventoryPage` as every other inventory route;
 * this file names the one section it opens on.
 */
export const Route = createFileRoute(
  "/_auth/inventory-admin/$year/staff/inventory/issues"
)({
  component: () => <InventoryPage section="issues" />,
});
