import { createFileRoute } from "@tanstack/react-router";

import HistoricalDataPage from "@/components/staff/historical-data/historical-data-page";
import {
  validateHistoryRouteSearch,
  validateHistorySearch,
} from "@/components/staff/historical-data/historical-data-search";
import { loadAcademicYearRoute } from "@/lib/year-guard";
import { orpc } from "@/utils/orpc";

/**
 * The one route that reads a year which is not the active one.
 *
 * Every other year-scoped page is guarded to the current year, because the
 * sidebar switcher promotes a year as you navigate and the URL must not
 * disagree with the database. This page exists to show *past* records, so it
 * opts out of that agreement: `/academic-admin/2025/staff/historical-data` reads 2025.
 *
 * ## The five search params
 *
 * `?tab=&q=&sort=&dir=&status=` are validated by
 * `validateHistoryRouteSearch`, which is `validateHistorySearch` — the same
 * function the page writes through — followed by a strip of every value that is
 * already at its default. Clamp first, omit second: the route's `validateSearch`
 * return value is what the router serialises into the address bar, so a
 * validator that returned the filled object would put
 * `?tab=staff&sort=name&dir=asc` on every unfiltered year. See
 * `historical-data-search.ts` for the whole contract.
 *
 * `sort` is checked against the tab it is read with, so a link that names a
 * column the tab beside it does not have resolves to that tab's own default
 * rather than a header that highlights nothing.
 *
 * The page re-runs the full parser over what it is handed, so a hand-typed URL
 * and a link written by this page arrive as one type — and it reads them with
 * `Route.useSearch()` rather than importing this file, because this file
 * imports the page.
 *
 * `loaderDeps` is deliberately absent: nothing the loader fetches depends on a
 * search value, and `getHistoricalData` takes the whole year in one response —
 * which is also why there is no `page` param and no paging bar one screen up.
 */
const HistoricalDataRoute = () => (
  <HistoricalDataPage search={validateHistorySearch(Route.useSearch())} />
);

export const Route = createFileRoute(
  "/_auth/academic-admin/$year/staff/historical-data"
)({
  component: HistoricalDataRoute,
  validateSearch: validateHistoryRouteSearch,
  beforeLoad: ({ location, params }) =>
    loadAcademicYearRoute({
      ...params,
      pathname: location.pathname,
      allowAnyYear: true,
    }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      orpc.staff.listAcademicYears.queryOptions()
    );
  },
});
