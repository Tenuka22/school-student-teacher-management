import { createFileRoute } from "@tanstack/react-router";

import TeacherTimetable from "@/components/staff/period-management/teacher-timetable-readonly";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/teacher/$year/timetable")({
  component: TeacherTimetable,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        orpc.staff.listAcademicYears.queryOptions()
      ),
      context.queryClient.ensureQueryData(orpc.staff.getMyStaff.queryOptions()),
    ]);
  },
});
