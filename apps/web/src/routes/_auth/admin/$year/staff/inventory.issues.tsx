import { createFileRoute } from "@tanstack/react-router";

import { InventoryPage } from "@/components/staff/inventory/inventory-page";

/**
 * The "Issues" link in the sidebar's "Inventory" group — the Records pane,
 * opened on its Issues sub-tab. Same shared `InventoryPage` as every other
 * inventory route; this file names the one section it opens on.
 */
export const Route = createFileRoute(
  "/_auth/admin/$year/staff/inventory/issues"
)({
  component: () => <InventoryPage section="issues" />,
});
