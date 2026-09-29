import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
import { leaveTypeLabel } from "@school-student-teacher-management/db/constants/leave-labels";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { createColumnHelper } from "@tanstack/react-table";
import type { CellData, HeaderContext, RowData } from "@tanstack/react-table";

import { DataTableColumnHeader } from "@/components/ui-patterns/data-table/data-table-column-header";
import type { ListTableFeatures } from "@/components/ui-patterns/data-table/list-table-features";

import {
  formatDate,
  formatDateTime,
  formatLeaveDescription,
  historyStatusLabel,
  weekdayName,
} from "./historical-data-rows";
import type { HistoricalData } from "./historical-data-rows";

type StaffRow = HistoricalData["staff"][number];
type SubjectRow = HistoricalData["subjects"][number];
type TimetableRow = HistoricalData["timetables"][number];
type HomeroomRow = HistoricalData["homeroomHistory"][number];
type LeaveRow = HistoricalData["leaveDecisions"][number];
type AttendanceRow = HistoricalData["attendanceExceptions"][number];

export interface HistoryColumnOptions {
  /**
   * `direction: null` puts the column back to this tab's own default order.
   *
   * Passed in rather than read from a module constant because the default
   * belongs to the *tab*, and this file builds all six tabs' columns.
   */
  onSort: (columnId: string, direction: "asc" | "desc" | null) => void;
}

/** The subset of `Badge` variants this page draws. */
type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  assigned: "success",
  replaced: "secondary",
  cleared: "warning",
  pending: "secondary",
  recommended: "secondary",
  approved: "success",
  rejected: "destructive",
  cancelled: "outline",
  partial: "secondary",
  absent: "destructive",
  lateShortLeave: "warning",
  halfDay: "warning",
};

/**
 * A status as a badge, with the word always present.
 *
 * Colour alone would say nothing to a reader who cannot separate the gold from
 * the red, and this page is read by people comparing one year's decisions
 * against another's — so the label carries the meaning and the fill only ranks
 * it. A value with no variant and no label still renders as itself rather than
 * disappearing.
 */
const StatusBadge = ({ status }: { status: string }) => (
  <Badge variant={STATUS_VARIANTS[status] ?? "outline"}>
    {historyStatusLabel(status)}
  </Badge>
);

/**
 * A header that is also the sort control, for the columns a tab orders by.
 *
 * Two arguments rather than one and a returned component, because the second
 * would make this a factory *of* components: the inner arrow would then have no
 * name of its own, and a component definition with no name cannot be given a
 * display name. One arrow that takes the column and this list's writer and
 * returns the control is a component with a name beside it, which is what the
 * display-name rule is asking for.
 *
 * The label comes from `meta.label` rather than from `column.id`, because
 * `changedAt` as a menu item is an implementation detail wearing a control's
 * clothes. A column this is returned for is a column in its tab's sort list;
 * the other columns get a plain string header, so no header offers a sort that
 * would do nothing.
 */
const sortableHeader = <TRow extends RowData, TValue extends CellData>(
  onSort: HistoryColumnOptions["onSort"],
  { column }: HeaderContext<ListTableFeatures, TRow, TValue>
) => (
  <DataTableColumnHeader
    label={column.columnDef.meta?.label ?? column.id}
    onSort={(direction) => onSort(column.id, direction)}
    sorted={column.getIsSorted()}
  />
);

const plainHeader = <TRow extends RowData>({
  column,
}: HeaderContext<ListTableFeatures, TRow>) =>
  column.columnDef.meta?.label ?? column.id;

export const buildStaffColumns = ({ onSort }: HistoryColumnOptions) => {
  const helper = createColumnHelper<ListTableFeatures, StaffRow>();

  return helper.columns([
    helper.accessor("name", {
      meta: { label: "Staff member" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    }),

    helper.accessor("teacherServiceNo", {
      meta: { label: "Service number" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => (
        <span className="font-mono">{getValue() ?? "—"}</span>
      ),
    }),

    helper.display({
      id: "positions",
      meta: { label: "Positions" },
      enableSorting: false,
      header: plainHeader,
      cell: ({ row }) =>
        row.original.positions.length > 0
          ? row.original.positions
              .map((position) => position.position)
              .join(", ")
          : "No recorded position",
    }),
  ]);
};

export const buildSubjectColumns = ({ onSort }: HistoryColumnOptions) => {
  const helper = createColumnHelper<ListTableFeatures, SubjectRow>();

  return helper.columns([
    helper.accessor("staffName", {
      meta: { label: "Teacher" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    }),

    helper.accessor("subjectKey", {
      meta: { label: "Subject" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => subjectLabel(getValue()),
    }),
  ]);
};

export const buildTimetableColumns = ({ onSort }: HistoryColumnOptions) => {
  const helper = createColumnHelper<ListTableFeatures, TimetableRow>();

  return helper.columns([
    helper.accessor("className", {
      meta: { label: "Class" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    }),

    helper.accessor("gradeLevel", {
      meta: { label: "Grade" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => `Grade ${getValue()}`,
    }),

    helper.accessor("dayOfWeek", {
      meta: { label: "Day" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => weekdayName(getValue()),
    }),

    helper.accessor("periodNumber", {
      meta: { label: "Period" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => `Period ${getValue()}`,
    }),

    helper.accessor("subjectKey", {
      meta: { label: "Subject" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => subjectLabel(getValue()),
    }),

    helper.accessor("staffName", {
      meta: { label: "Teacher" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => getValue(),
    }),
  ]);
};

export const buildHomeroomColumns = ({ onSort }: HistoryColumnOptions) => {
  const helper = createColumnHelper<ListTableFeatures, HomeroomRow>();

  return helper.columns([
    helper.accessor("className", {
      meta: { label: "Class" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.className} · Grade {row.original.gradeLevel}
        </span>
      ),
    }),

    helper.accessor("changeType", {
      meta: { label: "Change" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => <StatusBadge status={getValue()} />,
    }),

    helper.accessor("previousTeacherName", {
      meta: { label: "Previous teacher" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => getValue() ?? "—",
    }),

    helper.accessor("newTeacherName", {
      meta: { label: "New teacher" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => getValue() ?? "—",
    }),

    helper.accessor("changedAt", {
      meta: { label: "Changed" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => formatDateTime(getValue()),
    }),
  ]);
};

export const buildLeaveColumns = ({ onSort }: HistoryColumnOptions) => {
  const helper = createColumnHelper<ListTableFeatures, LeaveRow>();

  return helper.columns([
    helper.accessor("staffName", {
      meta: { label: "Staff member" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    }),

    helper.accessor("type", {
      meta: { label: "Leave" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ row }) => {
        const leave = row.original;

        return (
          <div className="flex flex-col gap-1">
            <span>{leaveTypeLabel(leave.type)}</span>
            <span className="text-muted-foreground text-xs">
              {formatLeaveDescription(
                leave.type,
                leave.dayPart,
                leave.paymentStatus
              )}
            </span>
          </div>
        );
      },
    }),

    helper.accessor("startDate", {
      meta: { label: "Dates" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ row }) =>
        `${formatDate(row.original.startDate)} – ${formatDate(row.original.endDate)}`,
    }),

    helper.accessor("deputyStatus", {
      meta: { label: "Deputy" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => <StatusBadge status={getValue()} />,
    }),

    helper.accessor("finalStatus", {
      meta: { label: "Principal" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ row }) => {
        const leave = row.original;

        return (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={leave.finalStatus} />
            {leave.finalStatus === "approved" && leave.finalizedAt ? (
              <span className="text-muted-foreground text-xs">
                {formatDateTime(leave.finalizedAt)}
              </span>
            ) : null}
          </div>
        );
      },
    }),
  ]);
};

export const buildAttendanceColumns = ({ onSort }: HistoryColumnOptions) => {
  const helper = createColumnHelper<ListTableFeatures, AttendanceRow>();

  return helper.columns([
    helper.accessor("staffName", {
      meta: { label: "Staff member" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    }),

    helper.accessor("date", {
      meta: { label: "Date" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ getValue }) => formatDate(getValue()),
    }),

    helper.accessor("status", {
      meta: { label: "Status" },
      header: (context) => sortableHeader(onSort, context),
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={row.original.status} />
          {row.original.leaveRequestId ? (
            <Badge variant="outline">Approved leave</Badge>
          ) : null}
        </div>
      ),
    }),

    helper.display({
      id: "absentPeriods",
      meta: { label: "Periods" },
      enableSorting: false,
      header: plainHeader,
      cell: ({ row }) =>
        row.original.absentPeriods.length > 0
          ? row.original.absentPeriods
              .map((period) => `P${period.periodNumber}`)
              .join(", ")
          : "All periods",
    }),

    helper.display({
      id: "reason",
      meta: { label: "Reason" },
      enableSorting: false,
      header: plainHeader,
      cell: ({ row }) => (
        <span className="max-w-80 whitespace-normal">
          {row.original.reason ?? "—"}
        </span>
      ),
    }),
  ]);
};
