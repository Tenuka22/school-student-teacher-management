export interface Crumb {
  /** The URL up to this segment; unique within a trail. */
  key: string;
  label: string;
  /** Present only when the crumb is a real route the member can open. */
  href?: string;
}

const WORKSPACES: Record<string, string> = {
  admin: "Admin dashboard",
  principal: "Principal's desk",
  "deputy-principal": "Deputy Principal's desk",
  teacher: "My dashboard",
};

/** Workspace-specific names for the same segment. */
const SCOPED_LABELS: Record<string, Record<string, string>> = {
  principal: { leaves: "Finalise leave" },
  "deputy-principal": { leaves: "Recommend leave" },
};

const LABELS: Record<string, string> = {
  "academic-years": "Academic years",
  account: "Account",
  attendance: "Attendance",
  classes: "Class assignment",
  leave: "My leave",
  leaves: "Leave requests",
  periods: "Period assignment",
  profile: "My profile",
  staff: "Staff management",
  "teacher-requests": "Teacher requests",
  "teacher-timetable": "Teacher timetable",
  teachers: "Teachers",
  users: "Users",
  verify: "Verify your email",
  "pending-approval": "Awaiting approval",
};

/** Segments that group pages but are not pages themselves. */
const GROUP_SEGMENTS = new Set(["staff"]);

const YEAR_SEGMENT = /^\d{4}$/u;

/**
 * The breadcrumb trail for a signed-in URL, e.g.
 * `/admin/2026/staff/teachers` → Admin dashboard › Staff management › Teachers.
 * Derived from the path alone; the year segment is shown separately.
 */
export const getBreadcrumbs = (pathname: string): Crumb[] => {
  const segments = pathname.split("/").filter(Boolean);
  const [workspace] = segments;
  const crumbs: Crumb[] = [];
  let href = "";

  for (const [index, segment] of segments.entries()) {
    href += `/${segment}`;

    if (YEAR_SEGMENT.test(segment)) {
      // The workspace root lives under its year: /admin/2026.
      const root = crumbs.at(-1);
      if (root && index === 1) {
        root.href = href;
      }
      continue;
    }

    if (index === 0 && WORKSPACES[segment]) {
      crumbs.push({ key: href, label: WORKSPACES[segment] });
      continue;
    }

    const label =
      SCOPED_LABELS[workspace]?.[segment] ?? LABELS[segment] ?? "Details";
    crumbs.push({
      key: href,
      label,
      href: GROUP_SEGMENTS.has(segment) ? undefined : href,
    });
  }

  return crumbs;
};
