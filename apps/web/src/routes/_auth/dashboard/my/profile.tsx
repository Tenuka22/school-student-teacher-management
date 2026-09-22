import { createFileRoute } from "@tanstack/react-router";

import { MyProfileContent } from "@/components/staff/teacher-portal/my-profile-content";

export const Route = createFileRoute("/_auth/dashboard/my/profile")({
  component: MyProfileContent,
});
