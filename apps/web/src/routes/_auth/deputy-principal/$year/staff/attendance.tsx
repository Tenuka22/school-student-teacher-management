import { createFileRoute } from "@tanstack/react-router";

import { AttendancePageContent } from "@/components/staff/attendance/attendance-page-content";
import { orpc } from "@/utils/orpc";

const AttendanceRoute = () => {
  const { year } = Route.useParams();
  return <AttendancePageContent academicYear={Number(year)} />;
};

export const Route = createFileRoute(
  "/_auth/deputy-principal/$year/staff/attendance"
)({
  component: AttendanceRoute,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      orpc.staff.listAcademicYears.queryOptions()
    );
  },
});
