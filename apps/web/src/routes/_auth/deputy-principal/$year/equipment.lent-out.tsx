import { createFileRoute } from "@tanstack/react-router";

import { MyEquipmentSection } from "@/components/staff/teacher-portal/my-equipment";

/**
 * The "Lent Out" link in the sidebar's "Inventory Management" group. Renders
 * only the "Lent out by me" section of the equipment page. That section
 * renders nothing when nothing has been lent out, so this route can land on
 * an otherwise-empty page below the header — correct, not broken. "In my
 * charge" and "In my hands" are not rendered at all on this route.
 */
const validateSearch = (search: Record<string, unknown>) => ({
  search: typeof search.search === "string" ? search.search : undefined,
});

export const Route = createFileRoute(
  "/_auth/deputy-principal/$year/equipment/lent-out"
)({
  component: () => <MyEquipmentSection section="lent-out" />,
  validateSearch,
});
