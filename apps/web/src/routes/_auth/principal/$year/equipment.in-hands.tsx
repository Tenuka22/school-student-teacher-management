import { createFileRoute } from "@tanstack/react-router";

import { MyEquipmentSection } from "@/components/staff/teacher-portal/my-equipment";

/**
 * The "Borrowed" link in the sidebar's "Inventory Management" group. Renders
 * only the "In my hands" section of the equipment page — what is physically
 * held right now — plus the header (including the "Take an item" borrow
 * action, still reachable here) and the search bar. "In my charge" and
 * "Lent out by me" are not rendered at all on this route.
 */
const validateSearch = (search: Record<string, unknown>) => ({
  search: typeof search.search === "string" ? search.search : undefined,
});

export const Route = createFileRoute(
  "/_auth/principal/$year/equipment/in-hands"
)({
  component: () => <MyEquipmentSection section="in-hands" />,
  validateSearch,
});
