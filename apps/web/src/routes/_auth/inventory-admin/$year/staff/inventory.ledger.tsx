import { createFileRoute } from "@tanstack/react-router";

import { InventoryPage } from "@/components/staff/inventory/inventory-page";

/**
 * The "Ledgers" link in the sidebar's "Inventory" group — its own page, not
 * a tab or a scroll target under a different one. The two read-only
 * histories (Movements, Change log) live here and nowhere else.
 */
export const Route = createFileRoute(
  "/_auth/inventory-admin/$year/staff/inventory/ledger"
)({
  component: () => <InventoryPage section="ledger" />,
});
