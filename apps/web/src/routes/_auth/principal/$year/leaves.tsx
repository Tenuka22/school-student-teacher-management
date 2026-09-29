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
 * The Principal's copy of the leave queue. It lives in the Principal's own
 * workspace rather than under `/admin`, which is reserved for the
 * non-leadership administrator.
 *
 * The URL contract and the loader are the administrator's, repeated rather than
 * shared: all three routes render the same `LeaveRequestsContent`, and a search
 * param one of them validated and the other did not would be a link that means
 * different things depending on who sent it. Three routes, one parser — the same
 * arrangement as `teacher-requests`.
 *
 * What differs is the default: with no `?queue=` in the URL, `resolveLeaveQueue`
 * opens this workspace on `principal`, because that is the slice a Principal is
 * here to act on.
 */
const LeaveRequestsRoute = () => (
  <LeaveRequestsContent
    search={validateLeaveRequestsSearch(Route.useSearch())}
  />
);

export const Route = createFileRoute("/_auth/principal/$year/leaves")({
  component: LeaveRequestsRoute,
  validateSearch: validateLeaveRequestsRouteSearch,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      orpc.staff.leaves.listLeaveRequests.queryOptions({
        input: toLeaveLedgerInput(Number(params.year)),
      })
    ),
  head: () => pageHead("Finalise leave"),
});
