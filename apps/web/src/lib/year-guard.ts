import { redirect } from "@tanstack/react-router";

import type { CurrentAcademicYear } from "@/functions/get-academic-year";
import { getCurrentAcademicYear } from "@/functions/get-academic-year";
import { getMyHomePath } from "@/functions/get-home-path";

export interface AcademicYearRouteContext {
  academicYear: CurrentAcademicYear | null;
}

const YEAR_SEGMENT = /^\d{4}$/u;

/**
 * True when the URL is the bare workspace root (`/admin`) rather than a
 * year-scoped page inside it (`/admin/2026/staff/teachers`).
 *
 * A parent layout's `beforeLoad` also runs for its children, so the
 * "forward the bare root to the active year" redirect has to recognise
 * this case — otherwise `/admin/2026` redirects to itself forever.
 */
export const isWorkspaceRoot = (pathname: string, base: string): boolean => {
  const [first, second] = pathname.split("/").filter(Boolean);

  if (first !== base.replace(/^\//u, "")) {
    return false;
  }

  // No second segment at all is the bare root; a non-year second segment
  // is a real subpage that owns the URL.
  return second === undefined || !YEAR_SEGMENT.test(second);
};

/**
 * Resolves the `:year` path segment against the school's active year.
 *
 * The sidebar switcher both navigates and promotes a year to current, so a
 * URL whose year disagrees with the database is a stale bookmark or a
 * hand-edited link. Forward those to the correct path rather than rendering
 * a year nothing else agrees on.
 *
 * Before the first year exists the segment is skipped (`null`) and the
 * academic-year gate renders its bootstrap prompt.
 */
export const loadAcademicYearRoute = async (params: {
  year: string;
  pathname?: string;
}): Promise<AcademicYearRouteContext> => {
  const current = await getCurrentAcademicYear();

  if (!current) {
    return { academicYear: null };
  }

  if (params.year !== String(current.year)) {
    const home = await getMyHomePath();

    // Never redirect to the address already being viewed — that is a loop.
    if (params.pathname && home === params.pathname) {
      return { academicYear: current };
    }

    throw redirect({ href: home as never });
  }

  return { academicYear: current };
};
