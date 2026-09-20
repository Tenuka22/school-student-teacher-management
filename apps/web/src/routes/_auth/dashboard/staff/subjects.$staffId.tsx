import { createFileRoute } from "@tanstack/react-router";

import { SubjectsPageContent } from "@/components/staff/subject-assignment/subjects-page-content";
import { orpc } from "@/utils/orpc";

const RouteComponent = () => {
  const { staffId } = Route.useParams();
  return <SubjectsPageContent staffId={staffId} />;
};

export const Route = createFileRoute(
  "/_auth/dashboard/staff/subjects/$staffId"
)({
  component: RouteComponent,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        orpc.staff.listAcademicYears.queryOptions()
      ),
      context.queryClient.ensureQueryData(orpc.staff.listStaff.queryOptions()),
    ]);
  },
});
