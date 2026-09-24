import { createFileRoute } from "@tanstack/react-router";

import { LeaveRequestsContent } from "@/components/staff/leave-management/leave-requests-content";

export const Route = createFileRoute("/_auth/admin/$year/staff/leaves")({
  component: LeaveRequestsContent,
});
