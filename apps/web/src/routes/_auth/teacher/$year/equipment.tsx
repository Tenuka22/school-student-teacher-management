import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Layout only. The teacher's equipment page used to be one file rendering
 * `MyEquipmentContent` directly; it is now a parent route whose children
 * carry the page — `equipment.index.tsx` (no particular section named) and
 * `equipment.in-charge.tsx` / `equipment.in-hands.tsx` / `equipment.lent-out.tsx`
 * (the same page, opened already scrolled to one of its three sections, for
 * the sidebar's "Inventory Management" group). See those files for the page
 * itself — this one exists only so the four of them share one path prefix.
 */
export const Route = createFileRoute("/_auth/teacher/$year/equipment")({
  component: Outlet,
});
