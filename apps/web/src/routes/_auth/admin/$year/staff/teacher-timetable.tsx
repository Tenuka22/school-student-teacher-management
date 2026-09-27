import { Outlet, createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/lib/page-title";

export const Route = createFileRoute(
  "/_auth/admin/$year/staff/teacher-timetable"
)({
  component: Outlet,
  head: () => pageHead("Teacher timetable"),
});
