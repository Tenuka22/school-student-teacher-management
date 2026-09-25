import { createFileRoute } from "@tanstack/react-router";

import { YearScopedOutlet } from "@/components/staff/academic-year-switcher/academic-year-gate";
import { loadAcademicYearRoute } from "@/lib/year-guard";

export const Route = createFileRoute("/_auth/admin/$year")({
  beforeLoad: ({ location, params }) =>
    loadAcademicYearRoute({ ...params, pathname: location.pathname }),
  component: YearScopedOutlet,
});
