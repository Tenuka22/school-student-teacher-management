import { createFileRoute } from "@tanstack/react-router";

import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { pageHead } from "@/lib/page-title";

/**
 * The admin workspace's overview. The page itself lives in
 * `components/admin/admin-dashboard.tsx` so `/academic-admin/$year` can render
 * the identical dashboard for the Academic Administrator — this route only
 * supplies the route-local facts (params, context) and its own `base`.
 */
const RouteComponent = () => {
  const { year } = Route.useParams();
  const { session, academicYear } = Route.useRouteContext();

  return (
    <AdminDashboard
      year={year}
      academicYear={academicYear}
      session={session}
      base="/admin"
    />
  );
};

export const Route = createFileRoute("/_auth/admin/$year/")({
  component: RouteComponent,
  head: () => pageHead("Admin dashboard"),
});
