import { useParams } from "@tanstack/react-router";

import type { HomeBase } from "@/functions/get-home-path";

/**
 * Builds a year-scoped workspace path.
 *
 * The academic year is a path segment (`/admin/2026/staff/teachers`) so a
 * view is bookmarkable and survives a refresh. TanStack Router's typed
 * `to` prop only accepts literal route paths, so callers pass the result
 * through `as never` — the same escape hatch `NavMain` already uses.
 */
export const yearPath = (
  base: HomeBase,
  year: string | number | undefined,
  ...rest: string[]
): string => {
  const segments = [base.replace(/^\//u, "")];

  if (year !== undefined && year !== "") {
    segments.push(String(year));
  }

  segments.push(...rest.filter(Boolean));

  return `/${segments.join("/")}`;
};

/**
 * Reads the active `:year` segment from whichever workspace route is mounted.
 * All four workspace trees mount a `$year` segment, so an unscoped read is
 * what lets shared components build links without knowing their own tree.
 */
export const useActiveYear = (): string | undefined =>
  useParams({ strict: false }).year as string | undefined;

const WORKSPACE_SEGMENTS = [
  "admin",
  "academic-admin",
  "inventory-admin",
  "principal",
  "deputy-principal",
  "teacher",
] as const;

const YEAR_SEGMENT = /^\d{4}$/u;

/**
 * The two workspaces that carry the management pages (dashboard, teachers,
 * classes, periods, attendance, users, academic years …): the top
 * administrator's own desk and the Academic Administrator's. A shared page
 * renders in both, so its addresses are built from this union rather than a
 * literal, and the route file picks the half that is its own.
 */
export type ManagementWorkspaceBase = "/admin" | "/academic-admin";

/**
 * The two workspaces that carry the school-wide inventory register: the
 * administrator's (`/admin/$year/staff/inventory`) and the Inventory
 * Administrator's own desk. Same idea as `ManagementWorkspaceBase`, different
 * pair — the academic desk has no register and the inventory desk has no
 * staff pages.
 */
export type InventoryWorkspaceBase = "/admin" | "/inventory-admin";

/**
 * Swaps the `:year` segment of a workspace URL, so switching years keeps
 * the member on the same page (`/admin/2026/staff/teachers` →
 * `/admin/2027/staff/teachers`) instead of dumping them at a landing page.
 *
 * Returns `null` when the path carries no year segment, which means the
 * caller should leave navigation alone and let the route guard resolve it.
 */
export const replaceYearInPath = (
  pathname: string,
  year: number | string
): string | null => {
  const segments = pathname.split("/").filter(Boolean);
  const baseIndex = segments.findIndex((segment) =>
    (WORKSPACE_SEGMENTS as readonly string[]).includes(segment)
  );

  if (baseIndex === -1) {
    return null;
  }

  const yearIndex = baseIndex + 1;

  if (!YEAR_SEGMENT.test(segments[yearIndex] ?? "")) {
    return null;
  }

  segments[yearIndex] = String(year);

  return `/${segments.join("/")}`;
};
