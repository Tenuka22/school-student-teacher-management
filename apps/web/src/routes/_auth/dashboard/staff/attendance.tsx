import { createFileRoute } from "@tanstack/react-router";

import { AttendancePageContent } from "@/components/staff/attendance/attendance-page-content";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard/staff/attendance")({
  component: AttendancePageContent,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      orpc.staff.listAcademicYears.queryOptions()
    );
  },
});
