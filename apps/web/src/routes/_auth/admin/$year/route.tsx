import { createFileRoute } from "@tanstack/react-router";

import { loadAcademicYearRoute } from "@/lib/year-guard";

export const Route = createFileRoute("/_auth/admin/$year")({
  beforeLoad: ({ location, params }) =>
    loadAcademicYearRoute({ ...params, pathname: location.pathname }),
});
