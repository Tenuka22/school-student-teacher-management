import { createFileRoute } from "@tanstack/react-router";

import { TeacherTimetablePageContent } from "@/components/staff/period-management/teacher-timetable-page-content";
import { orpc } from "@/utils/orpc";

const RouteComponent = () => {
  const { staffId } = Route.useParams();
  return <TeacherTimetablePageContent staffId={staffId} />;
};

export const Route = createFileRoute(
  "/_auth/dashboard/staff/teacher-timetable/$staffId"
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
