import { createFileRoute } from "@tanstack/react-router";

import { MyLeavesContent } from "@/components/staff/teacher-portal/my-leaves-content";

export const Route = createFileRoute("/_auth/dashboard/my/leave")({
  component: MyLeavesContent,
});
