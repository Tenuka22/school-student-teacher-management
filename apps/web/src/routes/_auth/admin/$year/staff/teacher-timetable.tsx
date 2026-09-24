import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_auth/admin/$year/staff/teacher-timetable"
)({
  component: Outlet,
});
