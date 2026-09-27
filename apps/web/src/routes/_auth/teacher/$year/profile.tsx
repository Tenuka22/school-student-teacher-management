import { createFileRoute } from "@tanstack/react-router";

import { MyProfileContent } from "@/components/staff/teacher-portal/my-profile-content";
import { pageHead } from "@/lib/page-title";

export const Route = createFileRoute("/_auth/teacher/$year/profile")({
  component: MyProfileContent,
  head: () => pageHead("My profile"),
});
