import { createFileRoute } from "@tanstack/react-router";

import { AttendancePageContent } from "@/components/staff/attendance/attendance-page-content";
import { pageHead } from "@/lib/page-title";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/admin/$year/staff/attendance")({
  component: AttendancePageContent,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      orpc.staff.listAcademicYears.queryOptions()
    );
  },
  head: () => pageHead("Attendance"),
});
