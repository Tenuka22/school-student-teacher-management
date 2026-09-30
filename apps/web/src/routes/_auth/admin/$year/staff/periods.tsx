import { createFileRoute } from "@tanstack/react-router";

import { PeriodsPage } from "@/components/staff/period-management/periods-page";
import {
  validatePeriodsRouteSearch,
  validatePeriodsSearch,
} from "@/components/staff/period-management/periods-search";
import { pageHead } from "@/lib/page-title";
import { orpc } from "@/utils/orpc";

/**
 * The picks, re-read for the page.
 *
 * The route declares its search with **every field optional** — see
 * `RouteSearch` — because a route whose validated type has no optional member
 * makes its search params *required*, and then every `<Link>` to this page has to
 * restate all three defaults. The page therefore runs the same parser over what
 * it is handed; the parser clamps and fills, and is idempotent, so this is a
 * second pass over an already-valid object rather than a second opinion.
 */
const PeriodsRoute = () => (
  <PeriodsPage search={validatePeriodsSearch(Route.useSearch())} />
);

/**
 * The period-assignment page, and the three query parameters that say **which
 * timetable is on screen**.
 *
 * The page body lives in `components/staff/period-management/periods-page.tsx`
 * so `/academic-admin/$year/staff/periods` renders the identical grid; this
 * route supplies the route-local facts.
 *
 * `?section=&grade=&class=` are validated by `validatePeriodsRouteSearch`, which
 * is the same parser with the defaults *omitted* — the omission is what keeps a
 * default off the URL, and it has to happen after validation, because a validator
 * that returns the filled object is what the router serialises back into the
 * address bar.
 *
 * The page then reconciles the three against the class list it has loaded, so a
 * link whose picks do not line up shows "not chosen" rather than a timetable for a
 * class the section has nothing to do with.
 *
 * `loaderDeps` is deliberately absent: the loader fetches the class list for the
 * whole year and the staff list, neither of which depends on the picks, so making
 * it re-run when a dropdown changes would be a second request for data already in
 * the cache.
 */
export const Route = createFileRoute("/_auth/admin/$year/staff/periods")({
  component: PeriodsRoute,
  validateSearch: validatePeriodsRouteSearch,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        orpc.staff.listAcademicYears.queryOptions()
      ),
      context.queryClient.ensureQueryData(orpc.staff.listStaff.queryOptions()),
    ]);
  },
  head: () => pageHead("Period assignment"),
});
