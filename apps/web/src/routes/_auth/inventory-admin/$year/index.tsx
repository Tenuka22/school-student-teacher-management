import { createFileRoute } from "@tanstack/react-router";

import { InventoryDashboard } from "@/components/staff/inventory/inventory-dashboard";
import { pageHead } from "@/lib/page-title";

/**
 * The Inventory Administrator's overview.
 *
 * **This used to redirect to the register**, on the reasoning that the register
 * is the workspace's whole reason to exist. That was true of the pages this seat
 * inherited and stopped being true when the store grew its own figures: a store
 * with a dashboard answers "what is out, what is late, what is waiting" in one
 * screen, and a redirect made the person who most needs those three numbers
 * assemble them from six panes by hand.
 *
 * The dashboard is the admin workspace's page *dressed for different work*, not a
 * second copy: it reuses that component's `StatTile`, its focus-ring and
 * outline-link class names, `showFigure`'s honest placeholder and `plural`, so a
 * change to how a failed read is presented lands in both. The figures and the
 * links are this seat's own — the register's six panes, and the counts the store's
 * procedures can answer as totals rather than as sums over a loaded page.
 */
const RouteComponent = () => {
  const { year } = Route.useParams();
  const { session } = Route.useRouteContext();

  return <InventoryDashboard year={year} session={session} />;
};

export const Route = createFileRoute("/_auth/inventory-admin/$year/")({
  component: RouteComponent,
  head: () => pageHead("Store dashboard"),
});
