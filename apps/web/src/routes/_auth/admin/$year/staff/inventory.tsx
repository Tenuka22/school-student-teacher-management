import { createFileRoute } from "@tanstack/react-router";

import { InventoryPage } from "@/components/staff/inventory/inventory-page";

/**
 * The three panes `InventoryPage` mounts, and the reason they are declared here
 * rather than inside the component.
 *
 * TanStack Router keeps only the keys `validateSearch` returns, so a `tab` the
 * route does not declare is dropped on navigation and the pane cannot survive a
 * refresh or a bookmark. Declaring the set is also what makes a hand-typed
 * `?tab=typo` resolve to the register instead of to a pane that does not exist.
 */
const INVENTORY_TABS = ["register", "records", "ledger"] as const;

const validateSearch = (search: Record<string, unknown>) =>
  INVENTORY_TABS.some((tab) => tab === search.tab)
    ? { tab: search.tab as (typeof INVENTORY_TABS)[number] }
    : {};

/**
 * The school-wide inventory register, over the three panes `InventoryPage`
 * composes.
 *
 * **Markup only, and no `loader`.** `InventoryPage` runs its own
 * `items.list`, `borrows.list`, `categories.list` and `units.list` queries
 * through `useQuery` in `useInventoryPage`, so there is no query the page blocks
 * first paint on that a loader could warm — and an `ensureQueryData` for a key
 * the page never reads with the same input would be a request paid for nothing.
 * This is the `leave.tsx` shape rather than the `teachers.tsx` one precisely
 * because the page owns its data; the loader in `teachers.tsx` exists to warm the
 * academic-year list that the teachers page *does* await.
 *
 * **Leadership reachability, decided: admin-only, deliberately.** Every
 * procedure these three panes read is `adminProcedure`, which is `admin` +
 * `principal` + `vicePrincipal` (`packages/api/src/routers/inventory/list-items.ts`,
 * `list-borrows.ts`, `list-transactions.ts`, `list-audit-logs.ts` all say so in
 * their own banners), so the API does admit a Principal to the register. The
 * route tree does not: `_auth/admin/route.tsx` redirects any role that is not
 * `admin` to its own workspace, and the Principal and Deputy workspaces carry
 * only `leaves`, `teacher-requests` (Principal) and `staff/attendance`.
 *
 * Option (b) — mounting this page under `/principal/$year` and
 * `/deputy-principal/$year` too — was rejected as the smaller-wrong change. It
 * is not a route file: `app-sidebar.tsx` gates `staffNav` on `isAdmin`, so the
 * two new pages would be unreachable from the UI and reachable only by typing a
 * URL, and the sidebar's own comment above the "Equipment" entry already states
 * the intent ("The school-wide equipment register is an administrator's tool: it
 * is the store's stock list, its write-offs and its custody transfers, none of
 * which a teacher may read"). A permission tier that is deliberately wider than
 * one surface is the documented design of this codebase
 * (`adminProcedure` vs `adminOnlyProcedure` in `AGENTS.md`), not an oversight —
 * so widening the route tree to match would change a product decision this
 * change was not asked to change. Exposing it to leadership means adding the two
 * route files *and* the `leadershipNav` entry that reaches them; that is one
 * follow-up, not a drive-by.
 */
export const Route = createFileRoute("/_auth/admin/$year/staff/inventory")({
  component: InventoryPage,
  validateSearch,
});
