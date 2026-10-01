import { createFileRoute } from "@tanstack/react-router";

import { LeaveEntitlementsCard } from "@/components/staff/leave-management/leave-entitlements-card";
import { LeaveRequestsContent } from "@/components/staff/leave-management/leave-requests-content";
import {
  toLeaveLedgerInput,
  validateLeaveRequestsRouteSearch,
  validateLeaveRequestsSearch,
} from "@/components/staff/leave-management/leave-requests-search";
import { pageHead } from "@/lib/page-title";
import { orpc } from "@/utils/orpc";

/**
 * The administrator's copy of the leave ledger: every request in the year,
 * read-only. Approving is not offered here because the server will not take
 * it — `recommendLeave` and `finalizeLeave` both go through `resolveAuthority`,
 * which hands the decision to the Deputy Principal and the Principal.
 *
 * ## The five search params
 *
 * `?q=&status=&queue=&sort=&dir=` are validated by
 * `validateLeaveRequestsRouteSearch`, which is `validateLeaveRequestsSearch` —
 * the same function the page writes through — followed by a strip of every
 * value that is already at its default. **Clamp first, omit second, and the
 * order is the fix:** a route's `validateSearch` return value is what the
 * router serialises into the address bar, so a validator that returned the
 * filled object would put `?status=all&sort=createdAt&dir=desc` on every
 * unfiltered queue. See `leave-requests-search.ts` for the whole contract and
 * `admin/$year/users.tsx` for why the two steps cannot be swapped.
 *
 * The page re-runs the full parser over what it is handed, so a hand-typed URL
 * and a link written by this page arrive as one type.
 *
 * `loaderDeps` is deliberately absent: the loader's input is the year, which is
 * a **param** rather than a search value, so there is no query-string change it
 * needs to watch. What it buys is the reason the first paint is the ledger
 * rather than a spinner — `ensureQueryData` runs the query on the server,
 * before the HTML is sent, into the same cache the page's `useQuery` reads, and
 * it is the same `{year, queue: "all"}` key the sidebar uses, so an
 * administrator who has already seen the sidebar badge arrives with the data.
 */
// The quota editor sits under the ledger: both seats that may read this page
// (`admin`, `leaveAdmin`) are the two `leaveManagerProcedure` admits.
const LeaveRequestsRoute = () => (
  <div className="flex flex-col gap-6">
    <LeaveRequestsContent
      search={validateLeaveRequestsSearch(Route.useSearch())}
    />
    <LeaveEntitlementsCard year={Number(Route.useParams().year)} />
  </div>
);

export const Route = createFileRoute("/_auth/admin/$year/staff/leaves")({
  component: LeaveRequestsRoute,
  validateSearch: validateLeaveRequestsRouteSearch,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      orpc.staff.leaves.listLeaveRequests.queryOptions({
        input: toLeaveLedgerInput(Number(params.year)),
      })
    ),
  head: () => pageHead("Leave requests"),
});
