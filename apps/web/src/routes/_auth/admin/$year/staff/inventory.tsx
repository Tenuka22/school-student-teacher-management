import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Layout only. The admin inventory page used to be one file rendering
 * `InventoryPage` directly with its panes switched by `?tab=`/`?subtab=`
 * query state; it is now a parent route whose children carry the page —
 * `inventory.index.tsx` (the Register pane, the default) and
 * `inventory.loans.tsx` / `inventory.issues.tsx` / `inventory.write-offs.tsx` /
 * `inventory.asset-register.tsx` / `inventory.ledger.tsx` (the Records pane's
 * five sub-views, each its own bookmarkable path) — mirroring the dot-notation
 * convention `teacher-timetable.tsx` / `.index.tsx` / `.$staffId.tsx` already
 * set in this app, and the same real-path-over-query-state change the
 * equipment pages (`equipment.in-charge.tsx` etc.) made for the identical
 * reason. See `inventory-page.tsx`'s `InventoryPage` for the shared component
 * every one of these six routes renders — this file exists only so they share
 * one path prefix.
 */
export const Route = createFileRoute("/_auth/admin/$year/staff/inventory")({
  component: Outlet,
});
