import { createFileRoute } from "@tanstack/react-router";

import { TeacherRequestsContent } from "@/components/admin/teacher-requests-content";
import {
  validateTeacherRequestsRouteSearch,
  validateTeacherRequestsSearch,
} from "@/components/admin/teacher-requests-search";
import { pageHead } from "@/lib/page-title";
import { orpc } from "@/utils/orpc";

/**
 * The Principal's copy of the staffing queue. It lives in the Principal's own
 * workspace rather than under `/admin`, which is reserved for the
 * non-leadership administrator.
 *
 * The URL contract and the loader are the administrator's, repeated rather than
 * shared: both routes render the same `TeacherRequestsContent`, and a search
 * param one of them validated and the other did not would be a link that means
 * different things depending on who sent it. Two routes, one parser.
 */
const TeacherRequestsRoute = () => (
  <TeacherRequestsContent
    search={validateTeacherRequestsSearch(Route.useSearch())}
  />
);

export const Route = createFileRoute("/_auth/principal/$year/teacher-requests")(
  {
    component: TeacherRequestsRoute,
    validateSearch: validateTeacherRequestsRouteSearch,
    loader: ({ context }) =>
      context.queryClient.ensureQueryData(
        orpc.staff.listTeacherRequests.queryOptions()
      ),
    head: () => pageHead("Teacher requests"),
  }
);
