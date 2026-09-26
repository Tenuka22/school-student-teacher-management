import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { QueryErrorPanel } from "@/components/query-error-panel";

import type { AdminOverview } from "./admin-overview";

/**
 * The panels of the administrator's home page.
 *
 * Split out of the route module so each piece can be read on its own: the route
 * fetches, these render. Every figure arrives from `staff.getAdminOverview` —
 * there are no constants on this page, and there never were once it stopped
 * showing made-up numbers. This module exports components only; the data shape
 * and the date formatter live in `admin-overview.ts`.
 */

const plural = (count: number, singular: string, pluralForm: string): string =>
  count === 1 ? singular : pluralForm;

interface Milestone {
  done: boolean;
  label: string;
  value: string;
}

const buildMilestones = (
  data: AdminOverview,
  percentFilled: number
): Milestone[] => [
  {
    done: true,
    label: "Academic year open",
    value: data.year ? String(data.year.year) : "Open",
  },
  {
    done: data.teachers.roster > 0,
    label: "Teachers on the year roster",
    value: String(data.teachers.roster),
  },
  {
    done: data.classes.total > 0,
    label: "Classes created",
    value: String(data.classes.total),
  },
  {
    done: data.classes.withoutHomeroom === 0,
    label: "Homeroom teachers assigned",
    value:
      data.classes.withoutHomeroom === 0
        ? `all ${data.classes.total}`
        : `${data.classes.total - data.classes.withoutHomeroom} of ${data.classes.total}`,
  },
  {
    done: percentFilled === 100,
    label: "Timetable filled",
    value: `${percentFilled}%`,
  },
];

/** How far the year actually is, with each milestone derived from the data. */
export const YearAtAGlance = ({ data }: { data: AdminOverview }) => {
  const { capacity, assigned } = data.timetable;
  const percentFilled =
    capacity > 0 ? Math.round((assigned / capacity) * 100) : 0;

  return (
    <div className="border-primary/14 bg-card border p-6">
      <h2 className="font-heading text-primary text-[19px] font-semibold">
        Year at a glance
      </h2>
      <div className="mt-[18px] flex items-baseline gap-3">
        <div className="font-heading text-primary text-[46px] leading-none font-semibold">
          {percentFilled}
          <span className="text-2xl">%</span>
        </div>
        <div className="text-primary/65 text-xs leading-relaxed">
          {assigned.toLocaleString()} of {capacity.toLocaleString()}
          <br />
          timetable slots filled
        </div>
      </div>
      <div
        aria-label={`${percentFilled}% of timetable slots filled`}
        className="bg-primary/10 mt-4 h-2 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${Math.min(percentFilled, 100)}%` }}
        />
      </div>
      <div className="mt-5 flex flex-col">
        {buildMilestones(data, percentFilled).map((milestone) => (
          <div
            key={milestone.label}
            className="border-primary/10 flex items-center gap-[11px] border-t py-2.5"
          >
            <span
              aria-hidden="true"
              className={`flex size-[17px] flex-none items-center justify-center border text-xs font-extrabold ${
                milestone.done
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-primary/30 text-transparent"
              }`}
            >
              &check;
            </span>
            <span className="text-primary/80 min-w-0 flex-1 text-[13px]">
              {milestone.label}
            </span>
            <span className="text-primary/55 font-mono text-xs">
              {milestone.value}
            </span>
            <span className="sr-only">
              {milestone.done ? "complete" : "still to do"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const MetricTiles = ({ data }: { data: AdminOverview }) => {
  const tiles = [
    {
      label: "TEACHERS ON ROSTER",
      value: String(data.teachers.roster),
      sub:
        data.teachers.withoutPeriods === 0
          ? "all have periods"
          : `${data.teachers.withoutPeriods} without periods`,
    },
    {
      label: "CLASSES",
      value: String(data.classes.total),
      sub:
        data.classes.withoutHomeroom === 0
          ? "all have a homeroom teacher"
          : `${data.classes.withoutHomeroom} without a homeroom`,
    },
    {
      label: "SLOTS FILLED",
      value: data.timetable.assigned.toLocaleString(),
      sub: `of ${data.timetable.capacity.toLocaleString()} this year`,
    },
    {
      label: "LEAVE AWAITING",
      value: String(data.leave.awaitingDeputy + data.leave.awaitingPrincipal),
      sub: `${data.leave.awaitingPrincipal} with the Principal`,
    },
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3.5">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="border-primary/14 bg-card border px-[18px] py-4"
        >
          <div className="text-primary/55 text-xs font-extrabold tracking-[0.16em]">
            {tile.label}
          </div>
          <div className="font-heading text-primary mt-2 text-[34px] leading-none font-semibold">
            {tile.value}
          </div>
          <div className="text-primary/58 mt-1.5 text-xs">{tile.sub}</div>
        </div>
      ))}
    </div>
  );
};

interface AttentionRow {
  action: string;
  count: number;
  detail: string;
  title: string;
  to:
    | "/admin/$year/staff/classes"
    | "/admin/$year/staff/periods"
    | "/admin/$year/staff/teacher-timetable"
    | "/admin/$year/teacher-requests"
    | "/admin/$year/staff/leaves";
}

const buildAttentionRows = (data: AdminOverview): AttentionRow[] => {
  const rows: AttentionRow[] = [
    {
      count: data.classes.withoutHomeroom,
      title: `${data.classes.withoutHomeroom} ${plural(data.classes.withoutHomeroom, "class has", "classes have")} no homeroom teacher`,
      detail: "A class without a homeroom teacher has no class teacher.",
      action: "Open classes",
      to: "/admin/$year/staff/classes",
    },
    {
      count: data.teachers.withoutPeriods,
      title: `${data.teachers.withoutPeriods} ${plural(data.teachers.withoutPeriods, "teacher has", "teachers have")} no periods assigned`,
      detail: "An empty timetable means the teacher is not yet working.",
      action: "Build timetable",
      to: "/admin/$year/staff/periods",
    },
    {
      count: data.timetable.conflicts,
      title: `${data.timetable.conflicts} ${plural(data.timetable.conflicts, "teacher is", "teachers are")} double-booked`,
      detail:
        "Counted only where the overlap was not marked as an intentional combined session.",
      action: "Review timetables",
      to: "/admin/$year/staff/teacher-timetable",
    },
    {
      count: data.requests.awaitingApproval,
      title: `${data.requests.awaitingApproval} ${plural(data.requests.awaitingApproval, "staff registration is", "staff registrations are")} waiting for approval`,
      detail: "An approved account can sign in and reach the teacher portal.",
      action: "Review requests",
      to: "/admin/$year/teacher-requests",
    },
  ];

  const openLeaves = data.leave.awaitingDeputy + data.leave.awaitingPrincipal;
  rows.push({
    count: openLeaves,
    title: `${openLeaves} ${plural(openLeaves, "leave request is", "leave requests are")} waiting on a decision`,
    detail: `${data.leave.awaitingDeputy} with the Deputy Principal, ${data.leave.awaitingPrincipal} with the Principal.`,
    action: "Open leave ledger",
    to: "/admin/$year/staff/leaves",
  });

  return rows.filter((row) => row.count > 0);
};

/** Only what is actually outstanding, each with somewhere to go and fix it. */
export const NeedsAttention = ({
  data,
  year,
}: {
  data: AdminOverview;
  year: string;
}) => {
  const rows = buildAttentionRows(data);

  return (
    <div className="border-primary/14 bg-card border px-[22px] py-5">
      <h2 className="font-heading text-primary mb-1.5 text-[23px] font-semibold">
        Needs attention
      </h2>
      {rows.length === 0 ? (
        <p className="text-primary/60 py-3.5 text-[13.5px]">
          Nothing outstanding for this year: every class has a homeroom teacher,
          every teacher on the roster has periods, and no request is waiting on
          a decision.
        </p>
      ) : (
        rows.map((row) => (
          <div
            key={row.to}
            className="border-primary/10 flex flex-wrap items-center gap-x-3.5 gap-y-2 border-b py-3.5 last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="text-primary block text-[13.5px] font-bold">
                {row.title}
              </span>
              <span className="text-primary/55 mt-0.5 block text-xs">
                {row.detail}
              </span>
            </span>
            <Link
              className="border-primary/25 text-primary hover:border-primary border px-[15px] py-2 text-xs font-bold whitespace-nowrap transition-colors"
              params={{ year }}
              to={row.to}
            >
              {row.action}
            </Link>
          </div>
        ))
      )}
    </div>
  );
};

const QUICK_LINKS = [
  { label: "Add teacher", to: "/admin/$year/staff/teachers" },
  { label: "Classes", to: "/admin/$year/staff/classes" },
  // The school-wide equipment register sits between Classes and Periods here for
  // the same reason it does in the sidebar's `staffNav`: it is the fifth thing
  // that makes a year work, after the roster, the classes, the timetable and the
  // assignments. It was the one page on this site with no entry point at all —
  // reachable only by typing `/admin/2026/staff/inventory` — which is precisely
  // the "every button on the page was inert" failure this module's banner
  // records, arrived at from the other direction.
  { label: "Equipment", to: "/admin/$year/staff/inventory" },
  { label: "Periods", to: "/admin/$year/staff/periods" },
  { label: "Teacher timetable", to: "/admin/$year/staff/teacher-timetable" },
  { label: "Attendance", to: "/admin/$year/staff/attendance" },
  { label: "Leave requests", to: "/admin/$year/staff/leaves" },
  { label: "Staff requests", to: "/admin/$year/teacher-requests" },
  { label: "Users", to: "/admin/$year/users" },
  { label: "Historical data", to: "/admin/$year/staff/historical-data" },
] as const;

/**
 * Every page, reachable in one click. Each of these navigates somewhere.
 *
 * A real `<Link>`, not a `<button>` calling `navigate`. These were buttons, and
 * a button that navigates is the one entry point on a page of entry points that
 * a keyboard user cannot open in a new tab, a screen reader cannot announce as
 * a link, and a right-click cannot reach — which is the same class of "looks
 * clickable, is not" problem the rest of this file exists to undo. The grid is a
 * list of destinations, so it is made of links.
 */
export const GoTo = ({ year }: { year: string }) => (
  <div className="border-primary/14 bg-card border px-[22px] py-5">
    <h2 className="font-heading text-primary mb-3.5 text-[23px] font-semibold">
      Go to
    </h2>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2.5">
      {QUICK_LINKS.map((action) => (
        <Link
          key={action.to}
          className="border-primary/22 text-primary hover:border-primary hover:bg-muted border px-3.5 py-3 text-left text-[12.5px] font-bold transition-colors"
          params={{ year }}
          to={action.to}
        >
          {action.label}
        </Link>
      ))}
    </div>
  </div>
);

/**
 * The shared failed-read panel, with this page's own default title.
 *
 * The panel itself is shared, because a failed read must look the same wherever
 * it happens — a second error component is how two screens start disagreeing
 * about what a failure means. The title stays overridable because a panel that
 * cannot say *which* read failed asks the reader to guess, and the admin
 * overview is not the only page that needs one.
 */
export const ErrorPanel = ({
  message,
  onRetry,
  title = "This year’s figures could not be loaded",
}: {
  message: string;
  onRetry: () => void;
  title?: string;
}) => <QueryErrorPanel message={message} onRetry={onRetry} title={title} />;

export const DashboardPanels = ({
  data,
  year,
}: {
  data: AdminOverview;
  year: string;
}): ReactNode => (
  <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(300px,340px)_minmax(360px,1fr)]">
    <YearAtAGlance data={data} />
    <div className="flex min-w-0 flex-col gap-[18px]">
      <MetricTiles data={data} />
      <NeedsAttention data={data} year={year} />
      <GoTo year={year} />
    </div>
  </div>
);
