import { createFileRoute } from "@tanstack/react-router";

import { TeacherTimetablePageContent } from "@/components/staff/period-management/teacher-timetable-page-content";
import {
  validateTeacherTimetableRouteSearch,
  validateTeacherTimetableSearch,
} from "@/components/staff/period-management/teacher-timetable-search";
import { orpc } from "@/utils/orpc";

const RouteComponent = () => {
  const { staffId } = Route.useParams();
  return (
    <TeacherTimetablePageContent
      search={validateTeacherTimetableSearch(Route.useSearch())}
      staffId={staffId}
    />
  );
};

/**
 * A link to one teacher's week: `/staff/teacher-timetable/<staffId>`.
 *
 * The id in the path wins over `?teacher=` and the picker is hidden, because
 * this route exists to be linked *to* — from the accounts list, from the
 * teachers register — and a link whose teacher a query param could disagree
 * with is two answers to one question. The three narrowing picks still come
 * from the query string, so a link to "Ms Perera, grade 7" is shareable.
 */
export const Route = createFileRoute(
  "/_auth/academic-admin/$year/staff/teacher-timetable/$staffId"
)({
  component: RouteComponent,
  validateSearch: validateTeacherTimetableRouteSearch,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        orpc.staff.listAcademicYears.queryOptions()
      ),
      context.queryClient.ensureQueryData(orpc.staff.listStaff.queryOptions()),
    ]);
  },
});
