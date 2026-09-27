import { createFileRoute } from "@tanstack/react-router";

import { LeaveRequestsContent } from "@/components/staff/leave-management/leave-requests-content";
import { pageHead } from "@/lib/page-title";

export const Route = createFileRoute("/_auth/admin/$year/staff/leaves")({
  component: LeaveRequestsContent,
  head: () => pageHead("Leave requests"),
});
