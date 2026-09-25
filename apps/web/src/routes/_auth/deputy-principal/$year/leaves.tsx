import { createFileRoute } from "@tanstack/react-router";

import { LeaveRequestsContent } from "@/components/staff/leave-management/leave-requests-content";

/**
 * The Deputy Principal's leave queue — the first step of the review chain.
 * Confined to the Deputy's own workspace rather than sitting under `/admin`.
 */
const DeputyPrincipalLeavePage = () => {
  const { year } = Route.useParams();

  return <LeaveRequestsContent year={Number(year)} />;
};

export const Route = createFileRoute("/_auth/deputy-principal/$year/leaves")({
  component: DeputyPrincipalLeavePage,
});
