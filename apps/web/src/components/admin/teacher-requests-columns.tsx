import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { createColumnHelper } from "@tanstack/react-table";
import type { HeaderContext } from "@tanstack/react-table";

import { DataTableColumnHeader } from "@/components/ui-patterns/data-table/data-table-column-header";
import type { ListTableFeatures } from "@/components/ui-patterns/data-table/list-table-features";
import { sortColumn } from "@/components/ui-patterns/data-table/sort-column";

import type { TeacherRequest } from "./approve-teacher-dialog";
import { describeBlocker } from "./request-blocker";
import { formatDateTime, getWaitingFor } from "./teacher-request-format";

const columnHelper = createColumnHelper<ListTableFeatures, TeacherRequest>();

/**
 * The staffing queue's columns, and the one cell that acts.
 *
 * ## The status column is where the refusal used to be hidden
 *
 * This queue used to be two lists — "Ready to review" and "Awaiting email
 * verification" — split above and below the fold, each row carrying its own
 * button. The split was wrong twice over: it only had a name for *one* of the
 * four reasons the server refuses (an unverified address), so an account with no
 * staff record, an office-staff record or a suspended record sat under "Ready to
 * review" with a button that always failed; and two lists cannot be searched,
 * sorted or filtered as one.
 *
 * `describeBlocker` holds the server's four rules in one place, and this column
 * says which of them is in force for its own row. The button is then disabled
 * for exactly those rows, so the reader meets the reason before the click rather
 * than after it. The reason is visible text in the row, not a `title`, because
 * a disabled control is not focusable and a tooltip nothing can reach is a
 * tooltip that does not exist.
 *
 * ## The sortable columns are the three a reader actually orders by
 *
 * Name, how long they have been waiting, and when they last signed in. The rest
 * are labels: `DataTableColumnHeader`'s own rule is that a column the sort does
 * not apply to gets a plain string rather than a control that does nothing.
 */
export interface RequestColumnOptions {
  /** Opens the review dialog for one account. */
  onReview: (request: TeacherRequest) => void;
  /** True while an approval is in flight, which is the only write here. */
  isApproving: boolean;
}

/** A sortable column's header: the shared sort control, with this column's name. */
const sortableHeader = <TValue,>({
  column,
}: HeaderContext<ListTableFeatures, TeacherRequest, TValue>) => (
  <DataTableColumnHeader
    label={column.columnDef.meta?.label ?? column.id}
    onSort={(direction) => {
      sortColumn(column, direction);
    }}
    sorted={column.getIsSorted()}
  />
);

export const buildRequestColumns = ({
  isApproving,
  onReview,
}: RequestColumnOptions) =>
  columnHelper.columns([
    columnHelper.accessor("name", {
      meta: { label: "Person" },
      header: sortableHeader,
      /**
       * Name, then the address, then the username.
       *
       * All three are shown rather than two of them behind a tooltip, because
       * the approval decision is "is this person on the establishment" and that
       * is answered by comparing the name against the payroll and the address
       * against the one they used to sign up. The username is mono because it
       * is typed, not read.
       */
      cell: ({ row }) => {
        const request = row.original;
        const { username } = request;

        return (
          <div className="min-w-56">
            <p className="font-medium">{request.name}</p>
            <span className="text-muted-foreground block text-sm">
              {request.email}
              {username ? (
                <>
                  {" · "}
                  <span className="font-mono">{username}</span>
                </>
              ) : null}
            </span>
          </div>
        );
      },
    }),

    columnHelper.display({
      id: "status",
      meta: { label: "Status" },
      enableSorting: false,
      cell: ({ row }) => {
        const request = row.original;
        const blocker = describeBlocker(request);

        if (blocker === null) {
          return <Badge variant="success">Ready to approve</Badge>;
        }

        return (
          <div className="max-w-[46ch] space-y-1.5">
            <Badge variant="warning">Cannot approve yet</Badge>
            <p className="text-muted-foreground text-xs">{blocker}</p>
          </div>
        );
      },
    }),

    columnHelper.accessor("createdAt", {
      meta: { label: "Waiting" },
      header: sortableHeader,
      /**
       * Relative, with the exact moment behind it.
       *
       * "3 days" is the figure an approver acts on — a queue item that has sat
       * for a week is a different problem from one that arrived this morning —
       * but the exact timestamp is still what somebody needs when they go
       * looking for the request in the log, so it is the `title` rather than a
       * second line the eye has to skip.
       */
      cell: ({ getValue }) => {
        const createdAt = getValue();

        return (
          <span className="tabular-nums" title={formatDateTime(createdAt)}>
            {getWaitingFor(createdAt)}
          </span>
        );
      },
    }),

    columnHelper.accessor("lastSignInAt", {
      meta: { label: "Last active" },
      header: sortableHeader,
      /**
       * Never is a real answer, not a gap.
       *
       * An account that has never signed in has been sitting unopened since it
       * was created, which is usually the whole explanation for a slow approval:
       * the person has not come back to the site. A blank would read as "unknown",
       * and "unknown" would invite somebody to go and find out.
       */
      cell: ({ getValue }) => {
        const lastSignInAt = getValue();

        if (lastSignInAt === null) {
          return <span className="text-muted-foreground">Never</span>;
        }

        return (
          <span className="tabular-nums">{formatDateTime(lastSignInAt)}</span>
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
        const blocker = describeBlocker(request);

        return (
          <Button
            disabled={blocker !== null || isApproving}
            size="sm"
            variant={blocker === null ? "default" : "outline"}
            onClick={() => {
              onReview(request);
            }}
          >
            {blocker === null ? "Review & approve" : "Blocked"}
          </Button>
        );
      },
    }),
  ]);
