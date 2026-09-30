import { createFileRoute } from "@tanstack/react-router";

import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { pageHead } from "@/lib/page-title";

/**
 * The Academic Administrator's overview: the same figures the administrator's
 * dashboard shows, built from the same queries, with every link it emits
 * pointing into this workspace (`base="/academic-admin"`). The page itself
 * lives in `components/admin/admin-dashboard.tsx`.
 */
const RouteComponent = () => {
  const { year } = Route.useParams();
  const { session, academicYear } = Route.useRouteContext();

  return (
    <AdminDashboard
      year={year}
      academicYear={academicYear}
      session={session}
      base="/academic-admin"
    />
  );
};

export const Route = createFileRoute("/_auth/academic-admin/$year/")({
  component: RouteComponent,
  head: () => pageHead("Academic dashboard"),
});
