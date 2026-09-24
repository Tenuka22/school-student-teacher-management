import { createFileRoute } from "@tanstack/react-router";

import { TeacherTimetablePageContent } from "@/components/staff/period-management/teacher-timetable-page-content";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute(
  "/_auth/admin/$year/staff/teacher-timetable/"
)({
  component: () => <TeacherTimetablePageContent />,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        orpc.staff.listAcademicYears.queryOptions()
      ),
      context.queryClient.ensureQueryData(orpc.staff.listStaff.queryOptions()),
    ]);
  },
});
