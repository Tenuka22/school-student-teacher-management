import { createFileRoute } from "@tanstack/react-router";

import { AdminUsersContent } from "@/components/admin/admin-users-content";
import { pageHead } from "@/lib/page-title";

export const Route = createFileRoute("/_auth/admin/$year/users")({
  component: AdminUsersContent,
  head: () => pageHead("Users"),
});
