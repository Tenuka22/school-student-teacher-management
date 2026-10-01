import { createFileRoute } from "@tanstack/react-router";

import { InventoryPage } from "@/components/staff/inventory/inventory-page";

/**
 * The "Disposals" link in the sidebar's "Inventory" group — its own page,
 * not a tab. Same shared `InventoryPage` as every other inventory route;
 * this file names the one section it opens on.
 */
export const Route = createFileRoute(
  "/_auth/inventory-admin/$year/staff/inventory/write-offs"
)({
  component: () => <InventoryPage section="write-offs" />,
});
