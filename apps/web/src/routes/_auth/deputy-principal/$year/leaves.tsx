import { createFileRoute } from "@tanstack/react-router";

import { LeaveRequestsContent } from "@/components/staff/leave-management/leave-requests-content";
import {
  toLeaveLedgerInput,
  validateLeaveRequestsRouteSearch,
  validateLeaveRequestsSearch,
} from "@/components/staff/leave-management/leave-requests-search";
import { pageHead } from "@/lib/page-title";
import { orpc } from "@/utils/orpc";

/**
 * The Deputy Principal's copy of the leave queue, and where the review chain
 * starts.
 *
 * Same content component, same parser, same loader as the other two workspaces —
 * three routes and one contract, because a search param one of them accepted and
 * the others did not would be a link that means different things depending on
 * who sent it. The only difference is what an empty URL resolves to:
 * `resolveLeaveQueue` opens this workspace on `deputy`, the requests nobody has
 * recommended yet, which is the work this role is here to do.
 */
const LeaveRequestsRoute = () => (
  <LeaveRequestsContent
    search={validateLeaveRequestsSearch(Route.useSearch())}
  />
);

export const Route = createFileRoute("/_auth/deputy-principal/$year/leaves")({
  component: LeaveRequestsRoute,
  validateSearch: validateLeaveRequestsRouteSearch,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      orpc.staff.leaves.listLeaveRequests.queryOptions({
        input: toLeaveLedgerInput(Number(params.year)),
      })
    ),
  head: () => pageHead("Recommend leave"),
});
