import { createFileRoute } from "@tanstack/react-router";

import { InventoryPage } from "@/components/staff/inventory/inventory-page";

/**
 * The "Write-offs" link in the sidebar's "Inventory" group — the Records
 * pane, opened on its Write-offs sub-tab. Same shared `InventoryPage` as
 * every other inventory route; this file names the one section it opens on.
 */
export const Route = createFileRoute(
  "/_auth/admin/$year/staff/inventory/write-offs"
)({
  component: () => <InventoryPage section="write-offs" />,
});
