import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { PageHeader } from "@/components/ui-patterns/page-header";
import type { CurrentAcademicYear } from "@/functions/get-academic-year";
import type { ManagementWorkspaceBase } from "@/lib/paths";
import { orpc } from "@/utils/orpc";

import {
  FOCUS_RING,
  OUTLINE_LINK,
  plural,
  showFigure,
} from "./dashboard-figure";
import type { Figure } from "./dashboard-figure";

/**
 * The administrator's overview, and now the Academic Administrator's too.
 *
 * This component used to live inside `routes/_auth/admin/$year/index.tsx`,
 * where every link it built was a literal `/admin/$year/...` address and the
 * route's own `Route.useParams()`/`Route.useRouteContext()` read were inlined.
 * `/academic-admin/$year` renders the same page, so the page moved here and
 * the two things a second workspace disagrees about became props: `base`
 * (which workspace's addresses to build) and the year/session facts the
 * routes already hold.
 *
 * Every figure on this page comes from a query the admin workspace already
 * makes (the sidebar shares the same cache entries). Anything the API cannot
 * answer — timetable slot totals, service health — is deliberately absent
 * rather than estimated.
 *
 * `StatTile` is exported for the Inventory Administrator's overview
 * (`staff/inventory/inventory-dashboard.tsx`). The two dashboards are the same
 * page dressed for different work, and a second copy of the tile that says
 * "n/a" when its read fails would be a second place to keep honest when that
 * behaviour changes. The plain values that tile and both dashboards need —
 * `FOCUS_RING`, `OUTLINE_LINK`, `plural`, `showFigure` — live in
 * `./dashboard-figure.ts` instead, because a module exporting components *and*
 * values cannot preserve Fast Refresh state and a disable comment is a worse
 * answer than a file.
 */

/** The workspaces this dashboard can address — the shared management pair. */
export type AdminDashboardBase = ManagementWorkspaceBase;

type AdminPath =
  | `${AdminDashboardBase}/$year/staff/teachers`
  | `${AdminDashboardBase}/$year/staff/classes`
  | `${AdminDashboardBase}/$year/staff/periods`
  | `${AdminDashboardBase}/$year/staff/teacher-timetable`
  | `${AdminDashboardBase}/$year/staff/attendance`
  | `${AdminDashboardBase}/$year/users`
  | `${AdminDashboardBase}/$year/academic-years`
  // Leave review moved off the academic desk onto the seeded `leaveAdmin`
  // seat, so this is deliberately the top admin's literal address rather
  // than a generic `${AdminDashboardBase}` member: `/academic-admin/.../
  // staff/leaves` is no longer a route at all.
  | "/admin/$year/staff/leaves";

const quickActions = (
  base: AdminDashboardBase
): { label: string; to: AdminPath }[] => [
  { label: "Teachers", to: `${base}/$year/staff/teachers` },
  { label: "Class assignment", to: `${base}/$year/staff/classes` },
  { label: "Period assignment", to: `${base}/$year/staff/periods` },
  { label: "Teacher timetable", to: `${base}/$year/staff/teacher-timetable` },
  { label: "Attendance", to: `${base}/$year/staff/attendance` },
  { label: "Users", to: `${base}/$year/users` },
  { label: "Academic years", to: `${base}/$year/academic-years` },
  // Only the top admin's own workspace still carries the leave queue.
  ...(base === "/admin"
    ? [{ label: "Leave requests", to: "/admin/$year/staff/leaves" as const }]
    : []),
];

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const LISTED_CLASS_NAMES = 4;

interface ClassRow {
  name: string;
  homeroomTeacherId: string | null;
}

const useDashboardData = (
  academicYearId: string | undefined,
  year: string,
  base: AdminDashboardBase
) => {
  const yearNumber = Number(year);
  const staffQuery = useQuery(orpc.staff.listStaff.queryOptions());
  const classesQuery = useQuery({
    ...orpc.staff.listClasses.queryOptions({
      input: { academicYearId: academicYearId ?? "" },
    }),
    enabled: Boolean(academicYearId),
  });
  // `listLeaveRequests` no longer admits `academicAdmin` - leave review
  // moved to the seeded `leaveAdmin` seat - so this workspace's copy of
  // the dashboard must not issue the read at all, not merely hide the tile:
  // the call would 403 rather than return zero.
  const canReadLeaves = base === "/admin";
  const deputyQueue = useQuery({
    ...orpc.staff.leaves.listLeaveRequests.queryOptions({
      input: { year: yearNumber, queue: "deputy" },
    }),
    enabled: canReadLeaves,
  });
  const principalQueue = useQuery({
    ...orpc.staff.leaves.listLeaveRequests.queryOptions({
      input: { year: yearNumber, queue: "principal" },
    }),
    enabled: canReadLeaves,
  });

  const classes = classesQuery.data as ClassRow[] | undefined;
  const withoutHomeroom = classes?.filter((c) => !c.homeroomTeacherId) ?? [];

  return {
    teachers: { value: staffQuery.data?.length, isError: staffQuery.isError },
    classes: { value: classes?.length, isError: classesQuery.isError },
    withoutHomeroom,
    deputyQueue: {
      value: deputyQueue.data?.requests.length,
      isError: deputyQueue.isError,
    },
    principalQueue: {
      value: principalQueue.data?.requests.length,
      isError: principalQueue.isError,
    },
    allLoaded:
      staffQuery.isSuccess &&
      classesQuery.isSuccess &&
      deputyQueue.isSuccess &&
      principalQueue.isSuccess,
  };
};

type DashboardData = ReturnType<typeof useDashboardData>;

interface AttentionEntry {
  title: string;
  detail: string;
  action: string;
  to: AdminPath;
}

const describeUnassigned = (classes: ClassRow[]): string => {
  const names = classes.map((c) => c.name);
  const listed = names.slice(0, LISTED_CLASS_NAMES).join(", ");
  const rest = names.length - LISTED_CLASS_NAMES;
  return rest > 0 ? `${listed} and ${rest} more` : listed;
};

/** Only states the records actually show; nothing here is estimated. */
const buildAttention = (
  data: DashboardData,
  year: string,
  base: AdminDashboardBase
): AttentionEntry[] => {
  const entries: AttentionEntry[] = [];
  const unassigned = data.withoutHomeroom.length;
  const pendingRecommendation = data.deputyQueue.value ?? 0;

  if (data.teachers.value === 0) {
    entries.push({
      title: "No teacher records yet",
      detail: "Add teachers before assigning classes or periods.",
      action: "Add teachers",
      to: `${base}/$year/staff/teachers`,
    });
  }
  if (data.classes.value === 0) {
    entries.push({
      title: `No classes created for ${year}`,
      detail: "Seed the default classes or create them one by one.",
      action: "Create classes",
      to: `${base}/$year/staff/classes`,
    });
  }
  if (unassigned > 0) {
    entries.push({
      title: `${unassigned} ${plural(unassigned, "class has", "classes have")} no homeroom teacher`,
      detail: describeUnassigned(data.withoutHomeroom),
      action: "Assign",
      to: `${base}/$year/staff/classes`,
    });
  }
  if (pendingRecommendation > 0) {
    // Same admin-only literal as `quickActions`: `academicAdmin` no longer
    // reads this queue, so `pendingRecommendation` is always 0 for it and
    // this branch never fires there - but the type still has to admit
    // only the real route.
    entries.push({
      title: `${pendingRecommendation} leave ${plural(pendingRecommendation, "request awaits", "requests await")} a recommendation`,
      detail: "Waiting for the Deputy Principal to review.",
      action: "View requests",
      to: "/admin/$year/staff/leaves",
    });
  }

  return entries;
};

export const StatTile = ({
  label,
  figure,
  detail,
}: {
  label: string;
  figure: Figure;
  detail: string;
}) => (
  <div className="bg-card border-border border-t-primary border border-t-2 px-4.5 py-4">
    <div className="text-muted-foreground type-eyebrow">{label}</div>
    <div className="text-foreground type-stat mt-2.5">{showFigure(figure)}</div>
    <div className="text-muted-foreground mt-1.5 text-sm">
      {figure.isError ? "Could not be loaded. Refresh to try again." : detail}
    </div>
  </div>
);

const ChecklistRow = ({
  label,
  value,
  done,
}: {
  label: string;
  value: string;
  done: boolean;
}) => (
  <li className="border-border flex items-center gap-2.75 border-t py-2.5">
    <span
      aria-hidden="true"
      className={
        done
          ? "border-primary bg-primary text-primary-foreground flex size-4.5 flex-none items-center justify-center border text-xs font-bold"
          : "border-input flex size-4.5 flex-none border"
      }
    >
      {done ? "✓" : null}
    </span>
    <span className="text-foreground min-w-0 flex-1 text-sm">
      {label}
      <span className="sr-only">{done ? " (done)" : " (not done)"}</span>
    </span>
    <span className="text-muted-foreground text-sm font-medium tabular-nums">
      {value}
    </span>
  </li>
);

const CoverageCard = ({
  data,
  academicYear,
}: {
  data: DashboardData;
  academicYear: number | undefined;
}) => {
  const classCount = data.classes.value;
  const unassigned = data.withoutHomeroom.length;
  const covered =
    classCount === undefined ? undefined : classCount - unassigned;
  const coverage = classCount ? (covered ?? 0) / classCount : 0;
  const hasClasses = classCount !== undefined && classCount > 0;

  return (
    <section
      aria-labelledby="coverage-heading"
      className="bg-card border-border border p-6"
    >
      <h2 id="coverage-heading" className="text-gold-text type-eyebrow m-0">
        Homeroom coverage
      </h2>
      <div className="mt-4.5 flex items-center gap-5">
        {/* Decorative: the figure beside it carries the same information. */}
        <svg
          viewBox="0 0 120 120"
          aria-hidden="true"
          className="size-29.5 flex-none -rotate-90"
        >
          <circle
            cx="60"
            cy="60"
            r={RING_RADIUS}
            fill="none"
            className="stroke-primary/12"
            strokeWidth="11"
          />
          <circle
            cx="60"
            cy="60"
            r={RING_RADIUS}
            fill="none"
            className="stroke-primary"
            strokeWidth="11"
            strokeDasharray={`${RING_CIRCUMFERENCE * coverage} ${RING_CIRCUMFERENCE}`}
          />
        </svg>
        <div>
          <div className="text-foreground text-[2.75rem] leading-none font-bold tracking-[-0.03em] tabular-nums">
            {hasClasses ? Math.round(coverage * 100) : "—"}
            {hasClasses ? (
              <span className="text-muted-foreground text-xl font-semibold">
                %
              </span>
            ) : null}
          </div>
          <div className="text-muted-foreground mt-2 text-sm">
            {hasClasses
              ? `${covered} of ${classCount} classes have`
              : "No classes yet to"}
            <br />
            {hasClasses ? "a homeroom teacher" : "measure coverage"}
          </div>
        </div>
      </div>
      <ul className="mt-5 flex list-none flex-col p-0">
        <ChecklistRow
          label="Academic year opened"
          value={academicYear ? String(academicYear) : "—"}
          done={Boolean(academicYear)}
        />
        <ChecklistRow
          label="Teachers on record"
          value={showFigure(data.teachers)}
          done={(data.teachers.value ?? 0) > 0}
        />
        <ChecklistRow
          label="Classes created"
          value={showFigure(data.classes)}
          done={hasClasses}
        />
        <ChecklistRow
          label="Homeroom teachers assigned"
          value={hasClasses ? `${covered} / ${classCount}` : "—"}
          done={hasClasses && unassigned === 0}
        />
      </ul>
    </section>
  );
};

const AttentionList = ({
  data,
  year,
  base,
}: {
  data: DashboardData;
  year: string;
  base: AdminDashboardBase;
}) => {
  const entries = buildAttention(data, year, base);

  return (
    <section
      aria-labelledby="attention-heading"
      className="bg-card border-border border px-5.5 py-5"
    >
      <h2
        id="attention-heading"
        className="text-foreground type-section-title m-0 mb-1.5"
      >
        Needs attention
      </h2>
      {entries.length === 0 ? (
        <p className="text-muted-foreground m-0 py-3.5 text-sm">
          {data.allLoaded
            ? "Nothing needs attention right now."
            : "Checking the College records…"}
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {entries.map((entry) => (
            <li
              key={entry.title}
              className="border-border flex flex-wrap items-center gap-3.5 border-b py-3.5 last:border-b-0"
            >
              <span
                aria-hidden="true"
                className="bg-destructive size-2 flex-none rotate-45"
              />
              <span className="min-w-0 flex-1">
                <span className="text-foreground type-body block font-semibold">
                  {entry.title}
                </span>
                <span className="text-muted-foreground mt-0.5 block text-sm">
                  {entry.detail}
                </span>
              </span>
              <Link
                to={entry.to}
                params={{ year }}
                className={`${OUTLINE_LINK} px-3.75 py-2 text-sm whitespace-nowrap`}
              >
                {entry.action}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

interface AdminDashboardProps {
  /** The `$year` path segment, as the route received it. */
  year: string;
  /** The year row the route guard resolved, or null before one exists. */
  academicYear: CurrentAcademicYear | null;
  /** The session the authed shell already resolved. */
  session: { user?: { name?: string | null } } | null;
  /** Which workspace's addresses this copy of the dashboard builds. */
  base: AdminDashboardBase;
}

export const AdminDashboard = ({
  year,
  academicYear,
  session,
  base,
}: AdminDashboardProps) => {
  const data = useDashboardData(academicYear?.id, year, base);
  const classDetail =
    data.classes.value === undefined
      ? `Created for ${year}`
      : `${data.withoutHomeroom.length} without a homeroom teacher`;

  return (
    <div className="flex flex-col gap-4.5">
      <PageHeader
        eyebrow={
          base === "/admin" ? (
            <>Admin dashboard &middot; {year}</>
          ) : (
            <>Academic dashboard &middot; {year}</>
          )
        }
        title={`Welcome back, ${session?.user?.name ?? "there"}`}
        description={`A summary of the ${year} academic year, read from the College records each time this page loads.`}
        actions={
          <>
            <Link
              to={`${base}/$year/academic-years`}
              params={{ year }}
              className={`${OUTLINE_LINK} px-4.5 py-2.5 text-sm`}
            >
              Academic years
            </Link>
            <Link
              to={`${base}/$year/staff/periods`}
              params={{ year }}
              className={`bg-primary text-primary-foreground hover:bg-primary-hover px-5 py-2.5 text-sm font-semibold transition-colors ${FOCUS_RING}`}
            >
              Open period assignment
            </Link>
          </>
        }
      />

      <div className="grid items-start gap-4.5 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <CoverageCard data={data} academicYear={academicYear?.year} />

        <div className="flex min-w-0 flex-col gap-4.5">
          <section aria-label="Key figures">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5">
              <StatTile
                label="Teachers"
                figure={data.teachers}
                detail="Staff records on file"
              />
              <StatTile
                label="Classes"
                figure={data.classes}
                detail={classDetail}
              />
              {/* `academicAdmin` no longer reads `listLeaveRequests`, so
                  these two tiles are the top admin's alone - rendering
                  them for the academic desk would show a permanently
                  "loading" figure for a read that will never run. */}
              {base === "/admin" ? (
                <>
                  <StatTile
                    label="Awaiting recommendation"
                    figure={data.deputyQueue}
                    detail="Leave requests with the Deputy Principal"
                  />
                  <StatTile
                    label="Awaiting decision"
                    figure={data.principalQueue}
                    detail="Leave requests with the Principal"
                  />
                </>
              ) : null}
            </div>
          </section>

          <AttentionList data={data} year={year} base={base} />

          <nav
            aria-labelledby="quick-actions-heading"
            className="bg-card border-border border px-5.5 py-5"
          >
            <h2
              id="quick-actions-heading"
              className="text-foreground type-section-title m-0 mb-3.5"
            >
              Quick actions
            </h2>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5 p-0">
              {quickActions(base).map((action) => (
                <li key={action.to}>
                  <Link
                    to={action.to}
                    params={{ year }}
                    className={`${OUTLINE_LINK} block h-full px-3.5 py-3 text-left text-sm`}
                  >
                    {action.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
};
