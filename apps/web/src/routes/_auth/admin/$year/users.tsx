import { createFileRoute } from "@tanstack/react-router";

import { AdminUsersContent } from "@/components/admin/admin-users-content";

export const Route = createFileRoute("/_auth/admin/$year/users")({
  component: AdminUsersContent,
});
