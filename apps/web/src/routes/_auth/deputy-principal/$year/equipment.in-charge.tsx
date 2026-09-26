import { createFileRoute } from "@tanstack/react-router";

import { MyEquipmentSection } from "@/components/staff/teacher-portal/my-equipment";

/**
 * The "Owned" link in the sidebar's "Inventory Management" group. Renders
 * only the "In my charge" section of the equipment page — the header (with
 * the "Take an item" borrow action), the account-missing/error states and
 * the search bar are still present, but "In my hands" and "Lent out by me"
 * are not rendered at all on this route. See `equipment.index.tsx` for the
 * unfiltered view with all three sections together.
 */
const validateSearch = (search: Record<string, unknown>) => ({
  search: typeof search.search === "string" ? search.search : undefined,
});

export const Route = createFileRoute(
  "/_auth/deputy-principal/$year/equipment/in-charge"
)({
  component: () => <MyEquipmentSection section="in-charge" />,
  validateSearch,
});
