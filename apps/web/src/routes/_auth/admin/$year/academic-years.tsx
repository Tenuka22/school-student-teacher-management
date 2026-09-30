import { createFileRoute } from "@tanstack/react-router";

import { AcademicYearsPage } from "@/components/admin/academic-years-page";
import { pageHead } from "@/lib/page-title";

/**
 * The academic-years page. The body lives in
 * `components/admin/academic-years-page.tsx` so
 * `/academic-admin/$year/academic-years` renders the identical page; this
 * route only supplies the head.
 */
export const Route = createFileRoute("/_auth/admin/$year/academic-years")({
  component: AcademicYearsPage,
  head: () => pageHead("Academic years"),
});
