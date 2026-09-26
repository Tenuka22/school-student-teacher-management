import { createFileRoute } from "@tanstack/react-router";

import { InventoryPage } from "@/components/staff/inventory/inventory-page";

/**
 * The "Ledger" link in the sidebar's "Inventory" group. The two ledgers
 * (Movements, Change log) sit at the foot of the Records pane regardless of
 * which of its four lifecycle tabs is active, so this route lands on Records
 * with Loans underneath (the pane's own default) and scrolls straight past
 * it to the ledger heading — see `scrollToLedger` on `InventoryLifecycleTabs`.
 */
export const Route = createFileRoute(
  "/_auth/admin/$year/staff/inventory/ledger"
)({
  component: () => <InventoryPage section="ledger" />,
});
