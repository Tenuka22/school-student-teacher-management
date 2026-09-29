import { createFileRoute } from "@tanstack/react-router";

import { TeacherRequestsContent } from "@/components/admin/teacher-requests-content";
import {
  validateTeacherRequestsRouteSearch,
  validateTeacherRequestsSearch,
} from "@/components/admin/teacher-requests-search";
import { orpc } from "@/utils/orpc";

/**
 * The administrator's copy of the staffing queue.
 *
 * The page copy says the Principal and the administrator both approve, so the
 * administrator needs a way to reach it — the Principal's route sits behind a
 * `principal`-only guard, and the admin was bounced out of `/principal` with
 * no alternative.
 *
 * The queue's four search params are validated here and read by the page below,
 * which re-runs the same parser over what it is handed — see
 * `teacher-requests-search.ts` for why clamping happens before the defaults are
 * stripped. The `loader` is what makes the first paint the queue rather than a
 * spinner: `ensureQueryData` runs the query on the server, before the HTML is
 * sent, and puts the result in the same cache the page's `useQuery` reads. It
 * takes no `loaderDeps`, because the server input does not depend on the search
 * — filtering, sorting and the status filter are all the browser's.
 */
const TeacherRequestsRoute = () => (
  <TeacherRequestsContent
    search={validateTeacherRequestsSearch(Route.useSearch())}
  />
);

export const Route = createFileRoute("/_auth/admin/$year/teacher-requests")({
  component: TeacherRequestsRoute,
  validateSearch: validateTeacherRequestsRouteSearch,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      orpc.staff.listTeacherRequests.queryOptions()
    ),
});
