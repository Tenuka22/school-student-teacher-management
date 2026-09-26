import { createFileRoute } from "@tanstack/react-router";

import { MyEquipmentContent } from "@/components/staff/teacher-portal/my-equipment";

/**
 * The Deputy Principal's own equipment, in the Deputy's own workspace. The
 * default landing point of the `/equipment` group, reached with no particular
 * section named — nothing is scrolled to, all three sections render exactly
 * as they did before this route grew children.
 *
 * **The same self-service surface a teacher has, in a leadership workspace,
 * because leadership are staff too.** A Deputy is issued school property the way
 * anybody else is — a laptop out of the store, a projector for the assembly —
 * and the three questions this page answers are the same three whatever the
 * reader's title: what am I in charge of, what am I holding, and what is out
 * with somebody else.
 *
 * **What does not come with it is the register.** The school-wide stock list, its
 * write-offs and its custody transfers stay under `/admin/$year/staff/inventory`,
 * deliberately — see `admin/$year/staff/inventory.tsx`. This page is a person's
 * own property, not the store's ledger.
 *
 * Note that both deputy seats (Vice and Assistant Principal) are seeded with
 * `vicePrincipal`, so both land here, and that is intended.
 *
 * ## Prerequisite, and it is a real one
 *
 * **Items are reached by `staffId`, so the account has to be linked to a `staff`
 * row before this page can show anything.** The seeded deputy seats deliberately
 * have no `staff` row (`packages/auth/src/admin.ts`, `ensureBootstrapAccount`),
 * so out of the box this page renders its existing "Your account has no staff
 * record" state, which is correct.
 *
 * ## The one search param
 *
 * `search` is declared because `useMyEquipment` persists it through
 * `useSearch({ strict: false })` and TanStack Router keeps only the keys
 * `validateSearch` returns.
 */
const validateSearch = (search: Record<string, unknown>) => ({
  search: typeof search.search === "string" ? search.search : undefined,
});

export const Route = createFileRoute(
  "/_auth/deputy-principal/$year/equipment/"
)({
  component: MyEquipmentContent,
  validateSearch,
});
