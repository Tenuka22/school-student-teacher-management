import { createFileRoute } from "@tanstack/react-router";

import { LeaveRequestsContent } from "@/components/staff/leave-management/leave-requests-content";
import { pageHead } from "@/lib/page-title";

/**
 * The Principal's leave queue. Lives inside the Principal's own workspace
 * rather than under `/admin` so leadership is confined to its own surface;
 * the component gates its own buttons off `getMyAuthority` as before.
 */
export const Route = createFileRoute("/_auth/principal/$year/leaves")({
  component: LeaveRequestsContent,
  head: () => pageHead("Finalise leave"),
});
