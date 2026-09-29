import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { createColumnHelper } from "@tanstack/react-table";
import type { HeaderContext } from "@tanstack/react-table";

import { DataTableColumnHeader } from "@/components/ui-patterns/data-table/data-table-column-header";
import type { ListTableFeatures } from "@/components/ui-patterns/data-table/list-table-features";
import { sortColumn } from "@/components/ui-patterns/data-table/sort-column";

import type { LeaveAuthority, LeaveRequest } from "./leave-request";
import { canReviewLeave } from "./leave-request";
import {
  describeLeaveDays,
  formatDateRange,
  formatDateTime,
  getRequestedAge,
  leaveTypeLabel,
} from "./leave-request-format";
import { leaveStatusBadge } from "./leave-status";

const columnHelper = createColumnHelper<ListTableFeatures, LeaveRequest>();

export interface LeaveColumnOptions {
  authority: LeaveAuthority;
  /** True while a decision is in flight, which is the only write on this page. */
  isDeciding: boolean;
  /** Opens the review dialog for one request. */
  onReview: (request: LeaveRequest) => void;
}

/** A sortable column's header: the shared sort control, with this column's name. */
const sortableHeader = <TValue,>({
  column,
}: HeaderContext<ListTableFeatures, LeaveRequest, TValue>) => (
  <DataTableColumnHeader
    label={column.columnDef.meta?.label ?? column.id}
    onSort={(direction) => {
      sortColumn(column, direction);
    }}
    sorted={column.getIsSorted()}
  />
);

/**
 * The leave queue's columns, and the one cell that acts.
 *
 * ## What is in a row and what is in the dialog
 *
 * The row carries the five things a reviewer scans for — who, what kind, when,
 * what state, how long ago — and nothing else. The reason, the Deputy's note,
 * the Principal's note and the payment status are all read rather than scanned,
 * so they live in `LeaveReviewDialog` behind the row's button. A row that also
 * carried the reason would be two lines deep for every request in the year, and
 * the reason is the field people write a paragraph into.
 *
 * ## The status column is where the chain is
 *
 * `leaveStatusBadge` is the same map the status picker's options are built
 * from, so a filter saying "Recommended" and a row saying "Recommended (Deputy
 * Principal)" are one vocabulary rather than two. A request the Deputy turned
 * down adds a second line, because "Rejected" alone reads as final and the
 * Principal can still decide it — see `canReviewLeave`.
 */
export const buildLeaveColumns = ({
  authority,
  isDeciding,
  onReview,
}: LeaveColumnOptions) =>
  columnHelper.columns([
    columnHelper.accessor("staffName", {
      meta: { label: "Teacher" },
      header: sortableHeader,
      cell: ({ row }) => {
        const request = row.original;

        return (
          <div className="min-w-56">
            <p className="font-medium">{request.staffName}</p>
            {request.staffBadge && (
              <span className="text-muted-foreground font-mono text-sm">
                {request.staffBadge}
              </span>
            )}
          </div>
        );
      },
    }),

    columnHelper.accessor("type", {
      meta: { label: "Type" },
      header: sortableHeader,
      cell: ({ getValue }) => (
        <Badge variant="secondary">{leaveTypeLabel(getValue())}</Badge>
      ),
    }),

    columnHelper.accessor("startDate", {
      meta: { label: "Dates" },
      header: sortableHeader,
      /**
       * The range, then what it costs the College.
       *
       * Working days rather than calendar days — a Friday-to-Monday request is
       * one day of cover — because that is the figure a reviewer weighs against
       * the teacher's remaining quota. A half day says which half instead,
       * since "0.5 days" is not something anybody schedules cover from.
       */
      cell: ({ row }) => {
        const request = row.original;

        return (
          <div className="whitespace-nowrap">
            <p className="tabular-nums">
              {formatDateRange(request.startDate, request.endDate)}
            </p>
            <p className="text-muted-foreground text-sm">
              {describeLeaveDays(
                request.startDate,
                request.endDate,
                request.dayPart
              )}
            </p>
          </div>
        );
      },
    }),

    columnHelper.accessor("status", {
      meta: { label: "Status" },
      header: sortableHeader,
      cell: ({ row }) => {
        const request = row.original;
        const badge = leaveStatusBadge(request.status);
        const isAwaitingPrincipal =
          request.status === "rejected" && request.finalizedAt === null;

        return (
          <div className="space-y-1.5">
            <Badge className={badge.className} variant={badge.variant}>
              {badge.label}
            </Badge>
            {isAwaitingPrincipal && (
              <p className="text-muted-foreground text-xs">
                Not final — the Principal can still decide it.
              </p>
            )}
          </div>
        );
      },
    }),

    columnHelper.accessor("createdAt", {
      meta: { label: "Requested" },
      header: sortableHeader,
      /**
       * Age first, exact moment behind it.
       *
       * "12 days" is what tells a reviewer this has been sat on, and the exact
       * timestamp is what somebody needs when they go looking for it in the log
       * — so it is the `title` rather than a second line the eye has to skip.
       */
      cell: ({ getValue }) => {
        const createdAt = getValue();

        return (
          <span className="tabular-nums" title={formatDateTime(createdAt)}>
            {getRequestedAge(createdAt)}
          </span>
        );
      },
    }),

    columnHelper.display({
      id: "action",
      meta: { label: "Action" },
      // Not data, so ordering by it means nothing — and hiding it would remove
      // the only way to act on a row.
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const request = row.original;

        if (!canReviewLeave(request, authority)) {
          return <span className="text-muted-foreground text-sm">Decided</span>;
        }

        return (
          <Button
            disabled={isDeciding}
            size="sm"
            onClick={() => {
              onReview(request);
            }}
          >
            {authority.isPrincipal ? "Finalise" : "Review"}
          </Button>
        );
      },
    }),
  ]);
