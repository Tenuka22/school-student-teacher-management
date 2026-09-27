import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/ui-patterns/page-header";
import { pageHead } from "@/lib/page-title";
import { orpc } from "@/utils/orpc";

/**
 * Every figure on this page comes from a query the admin workspace already
 * makes (the sidebar shares the same cache entries). Anything the API cannot
 * answer — timetable slot totals, service health — is deliberately absent
 * rather than estimated.
 */

type AdminPath =
  | "/admin/$year/staff/teachers"
  | "/admin/$year/staff/classes"
  | "/admin/$year/staff/periods"
  | "/admin/$year/staff/teacher-timetable"
  | "/admin/$year/staff/attendance"
  | "/admin/$year/staff/leaves"
  | "/admin/$year/users"
  | "/admin/$year/academic-years";

const QUICK_ACTIONS: { label: string; to: AdminPath }[] = [
  { label: "Teachers", to: "/admin/$year/staff/teachers" },
  { label: "Class assignment", to: "/admin/$year/staff/classes" },
  { label: "Period assignment", to: "/admin/$year/staff/periods" },
  { label: "Teacher timetable", to: "/admin/$year/staff/teacher-timetable" },
  { label: "Attendance", to: "/admin/$year/staff/attendance" },
  { label: "Leave requests", to: "/admin/$year/staff/leaves" },
  { label: "Users", to: "/admin/$year/users" },
  { label: "Academic years", to: "/admin/$year/academic-years" },
];

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const LISTED_CLASS_NAMES = 4;

const FOCUS_RING =
  "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";
const OUTLINE_LINK = `border-input text-foreground hover:border-primary hover:bg-muted border font-semibold transition-colors ${FOCUS_RING}`;

const plural = (count: number, one: string, many: string) =>
  count === 1 ? one : many;

interface Figure {
  value: number | undefined;
  isError: boolean;
}

/** A count, or an honest placeholder while loading or after a failure. */
const showFigure = ({ value, isError }: Figure): string => {
  if (isError) {
    return "n/a";
  }
  return value === undefined ? "—" : value.toLocaleString("en-US");
};

interface ClassRow {
  name: string;
  homeroomTeacherId: string | null;
}

const useDashboardData = (academicYearId: string | undefined) => {
  const { year } = Route.useParams();
  const yearNumber = Number(year);
  const staffQuery = useQuery(orpc.staff.listStaff.queryOptions());
  const classesQuery = useQuery({
    ...orpc.staff.listClasses.queryOptions({
      input: { academicYearId: academicYearId ?? "" },
    }),
    enabled: Boolean(academicYearId),
  });
  const deputyQueue = useQuery(
    orpc.staff.leaves.listLeaveRequests.queryOptions({
      input: { year: yearNumber, queue: "deputy" },
    })
  );
  const principalQueue = useQuery(
    orpc.staff.leaves.listLeaveRequests.queryOptions({
      input: { year: yearNumber, queue: "principal" },
    })
  );

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
const buildAttention = (data: DashboardData, year: string) => {
  const entries: AttentionEntry[] = [];
  const unassigned = data.withoutHomeroom.length;
  const pendingRecommendation = data.deputyQueue.value ?? 0;

  if (data.teachers.value === 0) {
    entries.push({
      title: "No teacher records yet",
      detail: "Add teachers before assigning classes or periods.",
      action: "Add teachers",
      to: "/admin/$year/staff/teachers",
    });
  }
  if (data.classes.value === 0) {
    entries.push({
      title: `No classes created for ${year}`,
      detail: "Seed the default classes or create them one by one.",
      action: "Create classes",
      to: "/admin/$year/staff/classes",
    });
  }
  if (unassigned > 0) {
    entries.push({
      title: `${unassigned} ${plural(unassigned, "class has", "classes have")} no homeroom teacher`,
      detail: describeUnassigned(data.withoutHomeroom),
      action: "Assign",
      to: "/admin/$year/staff/classes",
    });
  }
  if (pendingRecommendation > 0) {
    entries.push({
      title: `${pendingRecommendation} leave ${plural(pendingRecommendation, "request awaits", "requests await")} a recommendation`,
      detail: "Waiting for the Deputy Principal to review.",
      action: "View requests",
      to: "/admin/$year/staff/leaves",
    });
  }

  return entries;
};

const StatTile = ({
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
}: {
  data: DashboardData;
  year: string;
}) => {
  const entries = buildAttention(data, year);

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

const AdminDashboard = () => {
  const { year } = Route.useParams();
  const { session, academicYear } = Route.useRouteContext();
  const data = useDashboardData(academicYear?.id);
  const classDetail =
    data.classes.value === undefined
      ? `Created for ${year}`
      : `${data.withoutHomeroom.length} without a homeroom teacher`;

  return (
    <div className="flex flex-col gap-4.5">
      <PageHeader
        eyebrow={<>Admin dashboard &middot; {year}</>}
        title={`Welcome back, ${session?.user.name ?? "there"}`}
        description={`A summary of the ${year} academic year, read from the College records each time this page loads.`}
        actions={
          <>
            <Link
              to="/admin/$year/academic-years"
              params={{ year }}
              className={`${OUTLINE_LINK} px-4.5 py-2.5 text-sm`}
            >
              Academic years
            </Link>
            <Link
              to="/admin/$year/staff/periods"
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
            </div>
          </section>

          <AttentionList data={data} year={year} />

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
              {QUICK_ACTIONS.map((action) => (
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

export const Route = createFileRoute("/_auth/admin/$year/")({
  component: AdminDashboard,
  head: () => pageHead("Admin dashboard"),
});
