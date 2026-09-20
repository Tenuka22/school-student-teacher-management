import { createFileRoute } from "@tanstack/react-router";

import { SubjectsPageContent } from "@/components/staff/subject-assignment/subjects-page-content";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard/staff/subjects/")({
  component: () => <SubjectsPageContent />,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        orpc.staff.listAcademicYears.queryOptions()
      ),
      context.queryClient.ensureQueryData(orpc.staff.listStaff.queryOptions()),
    ]);
  },
});
