import { createFileRoute } from "@tanstack/react-router";

import { MyLeavesContent } from "@/components/staff/teacher-portal/my-leaves-content";
import { pageHead } from "@/lib/page-title";

export const Route = createFileRoute("/_auth/teacher/$year/leave")({
  component: MyLeavesContent,
  head: () => pageHead("My leave"),
});
