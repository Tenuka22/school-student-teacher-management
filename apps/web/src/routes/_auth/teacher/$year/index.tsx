import { createFileRoute } from "@tanstack/react-router";

import { TeacherDashboard } from "@/components/staff/teacher-portal/teacher-dashboard";

export const Route = createFileRoute("/_auth/teacher/$year/")({
  component: TeacherDashboard,
});
