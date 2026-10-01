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
 * The Leave Administrator's copy of the leave ledger: every request in the
 * year. Approving is not offered by this seat's role either — `recommendLeave`
 * and `finalizeLeave` both go through `resolveAuthority`, which hands the
 * decision to the Deputy Principal and the Principal alone, regardless of
 * role. This page is the queue-visibility half of the split: reviewing the
 * whole school's leave picture and (via `leaveManagerProcedure`) setting the
 * leave-type entitlements the queue is measured against.
 *
 * Search-param contract, loader shape and query key are identical to
 * `admin/$year/staff/leaves.tsx` — see that file's doc comment for the full
 * reasoning; duplicated here only because feature folders in this codebase
 * are deliberately self-contained (see `AGENTS.md`).
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

export const Route = createFileRoute("/_auth/leave-admin/$year/staff/leaves")({
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
