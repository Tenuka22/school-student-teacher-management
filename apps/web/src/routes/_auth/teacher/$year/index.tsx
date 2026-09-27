import { createFileRoute } from "@tanstack/react-router";

import { TeacherDashboard } from "@/components/staff/teacher-portal/teacher-dashboard";
import { pageHead } from "@/lib/page-title";

export const Route = createFileRoute("/_auth/teacher/$year/")({
  component: TeacherDashboard,
  head: () => pageHead("My dashboard"),
});
