import { createFileRoute } from "@tanstack/react-router";

import { MyEquipmentContent } from "@/components/staff/teacher-portal/my-equipment";

/**
 * The teacher's own equipment: what they are in charge of and what they are
 * holding.
 *
 * `MyEquipmentContent` rather than `MyEquipment` — both are exported by
 * `my-equipment.tsx` (the second is an alias of the first, added so a route
 * written either way resolves), and `MyLeavesContent` / `MyProfileContent` set
 * the convention that a teacher route names the component after the route.
 *
 * ## The one search param
 *
 * `search` is declared because `useMyEquipment` persists it through
 * `useSearch({ strict: false })` and TanStack Router keeps only the keys
 * `validateSearch` returns. **Without it the page's filter did not survive a
 * refresh or a shared link**, which made this the only one of the three equipment
 * routes with no declaration — `principal/$year/equipment.tsx` and
 * `deputy-principal/$year/equipment.tsx` both carry the identical function, and
 * all three render the same component, so the omission was a divergence between
 * three copies of one surface and nothing else.
 *
 * It is `search` alone, and the reason is the hook's own decision rather than a
 * preference: `use-my-equipment.ts` records that `status` was **deliberately
 * removed** (an item's status is a fact about a register line, not about the
 * laptop in a teacher's hands, and the two sections of the page already *are* the
 * state it would have filtered by). The comment this replaces claimed the page
 * persisted "a `search` and a `status` filter" and that
 * `{ search?: string; status?: string }` was the shape that would close the gap.
 * That was stale on both counts: `status` does not exist, so declaring it would
 * have handed the URL a param the page never reads and never writes.
 */
const validateSearch = (search: Record<string, unknown>) => ({
  search: typeof search.search === "string" ? search.search : undefined,
});

export const Route = createFileRoute("/_auth/teacher/$year/equipment")({
  component: MyEquipmentContent,
  validateSearch,
});
