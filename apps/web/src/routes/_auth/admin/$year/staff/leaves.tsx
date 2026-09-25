import { createFileRoute } from "@tanstack/react-router";

import { LeaveRequestsContent } from "@/components/staff/leave-management/leave-requests-content";

const AdminLeavePage = () => {
  const { year } = Route.useParams();

  return <LeaveRequestsContent year={Number(year)} />;
};

export const Route = createFileRoute("/_auth/admin/$year/staff/leaves")({
  component: AdminLeavePage,
});
