import { academicYear } from "@school-student-teacher-management/db/schema/staff";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { authMiddleware } from "@/middleware/auth";
import { db } from "@/services.server";

export interface CurrentAcademicYear {
  id: string;
  year: number;
  startDate: string | null;
  endDate: string | null;
}

/**
 * The school's active academic year.
 *
 * The year is a URL path segment (`/admin/2026/...`) so a view can be
 * bookmarked and survives a refresh. Selecting a year from the sidebar
 * switcher also promotes it to the current year, so the URL segment and
 * the database's `isCurrent` flag stay in agreement; this function is the
 * single place that resolves the value the URL must agree with.
 *
 * Returns `null` before the first year exists, which is what the
 * academic-year gate uses to show its bootstrap prompt.
 *
 * The query lives inside the handler on purpose: route modules are pulled
 * into the client bundle, and a module-scope `db` import there would trip
 * the server-only import guard. Inside the handler it is stripped.
 */
export const getCurrentAcademicYear = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<CurrentAcademicYear | null> => {
    const [row] = await db
      .select({
        id: academicYear.id,
        year: academicYear.year,
        startDate: academicYear.startDate,
        endDate: academicYear.endDate,
      })
      .from(academicYear)
      .where(eq(academicYear.isCurrent, true))
      .limit(1);

    return row ?? null;
  });

/**
 * A specific academic year by its number, current or not.
 *
 * Historical views need to read a year that is *not* the active one. The route
 * guard used to refuse those URLs outright, which made a "Historical Data" page
 * that could only ever show the current year — the one thing it exists not to
 * do.
 */
export const getAcademicYearByNumber = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(v.object({ year: v.number() }))
  .handler(async ({ data }): Promise<CurrentAcademicYear | null> => {
    const [row] = await db
      .select({
        id: academicYear.id,
        year: academicYear.year,
        startDate: academicYear.startDate,
        endDate: academicYear.endDate,
      })
      .from(academicYear)
      .where(eq(academicYear.year, data.year))
      .limit(1);

    return row ?? null;
  });
