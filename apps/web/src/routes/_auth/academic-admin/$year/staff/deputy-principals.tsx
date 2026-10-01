import { createFileRoute } from "@tanstack/react-router";

import { DeputyPrincipalsPage } from "@/components/staff/deputy-principals/deputy-principals-page";
import { pageHead } from "@/lib/page-title";
import { orpc } from "@/utils/orpc";

const DeputyPrincipalsRoute = () => {
  const { year } = Route.useParams();
  return <DeputyPrincipalsPage academicYear={Number(year)} />;
};

export const Route = createFileRoute(
  "/_auth/academic-admin/$year/staff/deputy-principals"
)({
  component: DeputyPrincipalsRoute,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      orpc.staff.listAcademicYears.queryOptions()
    );
  },
  head: () => pageHead("Deputy & Assistant Principals"),
});
