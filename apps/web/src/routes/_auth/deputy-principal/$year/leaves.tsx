import { createFileRoute } from "@tanstack/react-router";

import { LeaveRequestsContent } from "@/components/staff/leave-management/leave-requests-content";
import { pageHead } from "@/lib/page-title";

/**
 * The Deputy Principal's leave queue — the first step of the review chain.
 * Confined to the Deputy's own workspace rather than sitting under `/admin`.
 */
export const Route = createFileRoute("/_auth/deputy-principal/$year/leaves")({
  component: LeaveRequestsContent,
  head: () => pageHead("Recommend leave"),
});
