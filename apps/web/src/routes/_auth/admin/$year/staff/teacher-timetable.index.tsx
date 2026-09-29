import { createFileRoute } from "@tanstack/react-router";

import { TeacherTimetablePageContent } from "@/components/staff/period-management/teacher-timetable-page-content";
import {
  validateTeacherTimetableRouteSearch,
  validateTeacherTimetableSearch,
} from "@/components/staff/period-management/teacher-timetable-search";
import { orpc } from "@/utils/orpc";

/**
 * The picks, re-read for the page.
 *
 * The route declares its search with **every field optional** — see
 * `RouteSearch` — because a route whose validated type has no optional member
 * makes its search params *required*, and then every `<Link>` to this page has
 * to restate all four defaults. The page therefore runs the same parser over
 * what it is handed; the parser clamps and fills, and is idempotent, so this is
 * a second pass over an already-valid object rather than a second opinion.
 */
const RouteComponent = () => (
  <TeacherTimetablePageContent
    search={validateTeacherTimetableSearch(Route.useSearch())}
  />
);

/**
 * The teacher-timetable page, and the four query parameters it carries:
 * `?teacher=&section=&grade=&class=`.
 *
 * `teacher` says which week is on screen and the other three narrow it — see
 * `teacher-timetable-search` for why a pick that used to live in `useState` had
 * to move here (a refresh, a shared link and the Back button all lost it).
 *
 * `validateSearch` uses the variant with the defaults **omitted**, so a URL that
 * says nothing does not grow `?teacher=&section=&grade=&class=`.
 */
export const Route = createFileRoute(
  "/_auth/admin/$year/staff/teacher-timetable/"
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
