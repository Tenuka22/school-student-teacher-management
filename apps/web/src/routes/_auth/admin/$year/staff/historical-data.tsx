import { createFileRoute } from "@tanstack/react-router";

import HistoricalDataPage from "@/components/staff/historical-data/historical-data-page";
import { loadAcademicYearRoute } from "@/lib/year-guard";
import { orpc } from "@/utils/orpc";

/**
 * The one route that reads a year which is not the active one.
 *
 * Every other year-scoped page is guarded to the current year, because the
 * sidebar switcher promotes a year as you navigate and the URL must not
 * disagree with the database. This page exists to show *past* records, so it
 * opts out of that agreement: `/admin/2025/staff/historical-data` reads 2025.
 */
export const Route = createFileRoute(
  "/_auth/admin/$year/staff/historical-data"
)({
  beforeLoad: ({ location, params }) =>
    loadAcademicYearRoute({
      ...params,
      pathname: location.pathname,
      allowAnyYear: true,
    }),
  component: HistoricalDataPage,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      orpc.staff.listAcademicYears.queryOptions()
    );
  },
});
