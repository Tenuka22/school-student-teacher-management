import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useMemo } from "react";

import { formatAcademicYearRange } from "@/components/admin/admin-overview";
import type { AdminOverview } from "@/components/admin/admin-overview";
import {
  DashboardPanels,
  ErrorPanel,
} from "@/components/admin/admin-overview-panels";
import { orpc } from "@/utils/orpc";

/**
 * The administrator's home page.
 *
 * Every figure here is a query against the selected year
 * (`staff.getAdminOverview`). It used to be a set of module-level constants — a
 * fixed 62% ring, "1,736 of 2,800" slots, "All systems operational" with no
 * health check behind it — and every button on the page was inert, which taught
 * administrators to distrust the whole surface. The panels themselves live in
 * `components/admin/admin-overview-panels.tsx`; this module fetches and routes.
 */
const RouteComponent = () => {
  const { year } = Route.useParams();
  const { session } = useRouteContext({ from: "/_auth" });

  const academicYearsQuery = useQuery(
    orpc.staff.listAcademicYears.queryOptions()
  );
  const selectedYear = useMemo(
    () => academicYearsQuery.data?.find((item) => item.year === Number(year)),
    [academicYearsQuery.data, year]
  );

  const overview = useQuery({
    ...orpc.staff.getAdminOverview.queryOptions({
      input: { academicYearId: selectedYear?.id ?? "" },
    }),
    enabled: Boolean(selectedYear?.id),
  });

  const data = overview.data as AdminOverview | undefined;
  const isLoading = academicYearsQuery.isPending || overview.isPending;
  const error =
    (overview.isError ? overview.error : academicYearsQuery.error) ?? null;

  return (
    <div className="flex flex-col gap-[18px]">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-heading text-primary m-0 text-[38px] leading-[1.05] font-semibold">
            Welcome back, {session?.user.name ?? "there"}
          </h1>
          <p className="text-primary/65 mt-1.5 text-[13.5px]">
            {data?.year
              ? `Academic year ${data.year.year}, ${formatAcademicYearRange(data.year.startDate, data.year.endDate)}.`
              : "Loading the selected academic year."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link
            className="border-primary/25 text-primary hover:border-primary border px-[18px] py-2.5 text-xs font-bold transition-colors"
            params={{ year }}
            to="/admin/$year/academic-years"
          >
            Academic years
          </Link>
          <Link
            className="bg-primary text-primary-foreground hover:bg-primary-hover px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] transition-colors"
            params={{ year }}
            to="/admin/$year/staff/teachers"
          >
            GO TO TEACHERS
          </Link>
        </div>
      </header>

      {isLoading && (
        <p className="text-primary/60 text-sm">Loading this year…</p>
      )}

      {!isLoading && error && (
        <ErrorPanel
          message={error.message}
          onRetry={() => {
            overview.refetch();
          }}
        />
      )}

      {data && <DashboardPanels data={data} year={year} />}
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/$year/")({
  component: RouteComponent,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      orpc.staff.listAcademicYears.queryOptions()
    );
  },
});
