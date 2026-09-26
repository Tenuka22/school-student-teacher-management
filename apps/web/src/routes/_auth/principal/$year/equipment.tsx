import { createFileRoute } from "@tanstack/react-router";

import { MyEquipmentContent } from "@/components/staff/teacher-portal/my-equipment";

/**
 * The Principal's own equipment, in the Principal's own workspace.
 *
 * **The same self-service surface a teacher has, in a leadership workspace,
 * because leadership are staff too.** A Principal is issued school property the
 * way anybody else is — a laptop out of the store, a projector for the morning
 * briefing — and the three questions this page answers are the same three
 * whatever the reader's title: what am I in charge of, what am I holding, and
 * what is out with somebody else.
 *
 * **What does not come with it is the register.** The school-wide stock list, its
 * write-offs and its custody transfers stay under `/admin/$year/staff/inventory`,
 * deliberately, and that is a product decision rather than an omission — see
 * `admin/$year/staff/inventory.tsx`, which argues it at length. This page is a
 * person's own property, not the store's ledger.
 *
 * It lives under `/principal` rather than being reached across into `/teacher`
 * for the same reason: `teacher/route.tsx` admits `teacher` and `admin` and
 * refuses everyone else, and this workspace's rule is that nobody is let into
 * another seat's area. `principal/route.tsx` already requires
 * `role === "principal"`, so nothing was widened to make this file work — the
 * route exists the moment the file does.
 *
 * `MyEquipmentContent` rather than `MyEquipment`: the alias is the name the
 * teacher route uses, and both resolve to the same component.
 *
 * ## Prerequisite, and it is a real one
 *
 * **Items are reached by `staffId`, so the account has to be linked to a `staff`
 * row before this page can show anything.** `custody.myItems` resolves the
 * caller's staff identity first and returns an empty, *successful* answer when
 * there is none — and the seeded `principal` account deliberately has no `staff`
 * row and no `staff_position` (`packages/auth/src/admin.ts`,
 * `ensureBootstrapAccount`: "these are pure admin accounts, not members of the
 * teaching staff"). So out of the box this page renders its existing
 * "Your account has no staff record" state, which is **correct** and is left
 * visible rather than papered over with a fake list or a hidden nav entry. The
 * fix is an administrator linking the account to a staff record, which is
 * account administration and is done under `/admin/$year/users` — not here.
 *
 * ## The one search param
 *
 * `search` is declared because `useMyEquipment` persists it through
 * `useSearch({ strict: false })` and TanStack Router keeps only the keys
 * `validateSearch` returns. It is the *only* param that hook owns: its own
 * comment records that `status` was deliberately removed, so the teacher route's
 * claim that this page persists two params is stale. See the note in this file's
 * sibling for what that leaves unfixed.
 */
const validateSearch = (search: Record<string, unknown>) => ({
  search: typeof search.search === "string" ? search.search : undefined,
});

export const Route = createFileRoute("/_auth/principal/$year/equipment")({
  component: MyEquipmentContent,
  validateSearch,
});
