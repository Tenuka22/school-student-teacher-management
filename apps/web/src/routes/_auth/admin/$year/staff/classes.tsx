import { createFileRoute } from "@tanstack/react-router";

import { ClassesPage } from "@/components/staff/class-assignment/classes-page";
import { pageHead } from "@/lib/page-title";
import { orpc } from "@/utils/orpc";

/**
 * The class-assignment page. The body lives in
 * `components/staff/class-assignment/classes-page.tsx` so
 * `/academic-admin/$year/staff/classes` renders the identical page; this
 * route supplies the loader and head.
 */
export const Route = createFileRoute("/_auth/admin/$year/staff/classes")({
  component: ClassesPage,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        orpc.staff.listAcademicYears.queryOptions()
      ),
      context.queryClient.ensureQueryData(orpc.staff.listStaff.queryOptions()),
    ]);
  },
  head: () => pageHead("Class assignment"),
});
