import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { IconX } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import type {
  ColumnVisibilityState,
  OnChangeFn,
  ReactTable,
  SortingState,
} from "@tanstack/react-table";
import { useId, useMemo, useState } from "react";

import { DataTableFrame } from "@/components/ui-patterns/data-table/data-table-frame";
import { DataTableSearchField } from "@/components/ui-patterns/data-table/data-table-search-field";
import { DataTableViewOptions } from "@/components/ui-patterns/data-table/data-table-view-options";
import { searchToSorting } from "@/components/ui-patterns/data-table/list-search";
import { listTableFeatures } from "@/components/ui-patterns/data-table/list-table-features";

import type { LeaveAuthority, LeaveRequest } from "./leave-request";
import { leaveTypeLabel } from "./leave-request-format";
import { buildLeaveColumns } from "./leave-requests-columns";
import type {
  LeaveQueueScope,
  LeaveRequestsSearch,
  LeaveSortKey,
} from "./leave-requests-search";
import {
  ANY_LEAVE_STATUS,
  DEFAULT_LEAVE_DIRECTION,
  DEFAULT_LEAVE_SORT,
  LEAVE_QUEUE_OPTIONS,
  LEAVE_SORT_KEYS,
  LEAVE_STATUS_OPTIONS,
  hasLeaveRequestFilters,
  resolveLeaveQueue,
} from "./leave-requests-search";

/**
 * An empty ledger, at module scope.
 *
 * Not built in a render body: a new `[]` on every render is a new `data`
 * reference, and the table invalidates its data-dependent models when `data`
 * changes, so a first read would rebuild the row model on every frame.
 */
const NO_ROWS: LeaveRequest[] = [];

/** The type of the table this file builds, as one name. */
type LeaveTable = ReactTable<typeof listTableFeatures, LeaveRequest>;

/**
 * The lifecycle order the Status column sorts by.
 *
 * Waiting first, then decided — which is the order a reviewer works through.
 * A status this build does not know sorts last rather than as `NaN`, so one
 * new state cannot scatter the whole column.
 */
const STATUS_ORDER: Record<string, number> = {
  approved: 3,
  cancelled: 4,
  pending: 0,
  recommended: 1,
  rejected: 2,
};

const UNKNOWN_STATUS_ORDER = 99;

/**
 * Is this request in the queue that was asked for?
 *
 * The server's own three predicates, moved here so the queue can be switched
 * without a round trip: `deputy` is an untouched request, `principal` is one
 * the Deputy has answered and the Principal has not, and `all` is the ledger.
 * `finalizedAt` is the "chain is closed" marker in both, exactly as
 * `listLeaveRequests` uses it — the status word alone would resurrect a
 * decision that has already been made final.
 */
const matchesQueue = (
  request: LeaveRequest,
  queue: LeaveQueueScope
): boolean => {
  if (queue === "all") {
    return true;
  }

  if (request.finalizedAt !== null) {
    return false;
  }

  if (queue === "deputy") {
    return request.status === "pending";
  }

  return request.status === "recommended" || request.status === "rejected";
};

/**
 * Queue, then status, then free text, over a set the client already holds in
 * full.
 *
 * `toLeaveLedgerInput` fetches the whole ledger on purpose, so all three are
 * browser-side — the correct tier for a year of requests the client already
 * has. Nothing here needs to reach the server, and the day it does this is the
 * only function that changes.
 *
 * The text test goes through `leaveTypeLabel` rather than the raw key so a
 * search for "Official Duty" finds the `duty` rows, and it covers the reason
 * and both review notes because those are the fields a reviewer remembers
 * words from.
 */
const filterLeaveRequests = (
  rows: LeaveRequest[],
  search: LeaveRequestsSearch,
  queue: LeaveQueueScope
): LeaveRequest[] => {
  const term = search.q.trim().toLowerCase();

  return rows.filter((request) => {
    if (!matchesQueue(request, queue)) {
      return false;
    }

    if (
      search.status !== ANY_LEAVE_STATUS &&
      request.status !== search.status
    ) {
      return false;
    }

    if (term === "") {
      return true;
    }

    return [
      request.staffName,
      request.staffBadge ?? "",
      leaveTypeLabel(request.type),
      request.reason ?? "",
      request.deputyComment ?? "",
      request.principalComment ?? "",
      request.reviewComment ?? "",
    ].some((field) => field.toLowerCase().includes(term));
  });
};

/**
 * The comparator behind every sort the queue offers.
 *
 * ISO date strings compare correctly as strings because they are all the same
 * shape, so `startDate` and `createdAt` need no parsing — which also means an
 * unparseable value sorts rather than throwing.
 */
const compareLeaveRequests = (
  a: LeaveRequest,
  b: LeaveRequest,
  key: LeaveSortKey,
  direction: 1 | -1
): number => {
  if (key === "staffName") {
    return a.staffName.localeCompare(b.staffName) * direction;
  }

  if (key === "type") {
    return (
      leaveTypeLabel(a.type).localeCompare(leaveTypeLabel(b.type)) * direction
    );
  }

  if (key === "startDate") {
    return (
      (a.startDate.localeCompare(b.startDate) ||
        a.endDate.localeCompare(b.endDate)) * direction
    );
  }

  if (key === "status") {
    const rankA = STATUS_ORDER[a.status] ?? UNKNOWN_STATUS_ORDER;
    const rankB = STATUS_ORDER[b.status] ?? UNKNOWN_STATUS_ORDER;
    return (rankA - rankB) * direction;
  }

  return a.createdAt.localeCompare(b.createdAt) * direction;
};

/**
 * The order the table is handed, applied **before** it reaches the table.
 *
 * This is what `manualSorting: true` means in TanStack Table v9: the table
 * records which column is sorted, reports it to the header and to `aria-sort`,
 * and expects the caller to have already ordered the rows. A table with
 * `manualSorting` and no `sortedRowModel` registered — which is every table in
 * this app — never reorders anything itself, so the ordering has to happen here
 * or the sort control is a glyph that lies.
 *
 * `.toSorted` rather than `.sort`, because `rows` is the filtered array the rest
 * of the render still holds a reference to.
 */
const sortLeaveRequests = (
  rows: LeaveRequest[],
  search: LeaveRequestsSearch
): LeaveRequest[] => {
  const direction: 1 | -1 = search.dir === "desc" ? -1 : 1;

  return rows.toSorted((a, b) =>
    compareLeaveRequests(a, b, search.sort, direction)
  );
};

/** How many of the queue's requests are in each status, for the picker's counts. */
const countByStatus = (rows: LeaveRequest[]): Record<string, number> => {
  const counts: Record<string, number> = {};

  for (const request of rows) {
    counts[request.status] = (counts[request.status] ?? 0) + 1;
  }

  return counts;
};

/**
 * The table's accessible name, and the one place the count is announced.
 *
 * Four sentences for four truths: still loading, an empty year, an empty
 * queue, and the ordinary case. The first matters most — a caption saying "No
 * leave requests" while the first row is still in flight is a statement about
 * the year that arrived before the year did.
 *
 * `total` is the size of the **queue**, not of the ledger, because that is what
 * is on screen: a Deputy with an empty queue must not be told the year has no
 * leave in it, and an unfiltered caption counting rows nobody can see would be
 * the same defect as a sort glyph that does not sort. `ledgerTotal` is what
 * distinguishes those two.
 */
const buildCaption = ({
  hasFilters,
  isLoading,
  ledgerTotal,
  shown,
  total,
}: {
  hasFilters: boolean;
  isLoading: boolean;
  ledgerTotal: number;
  shown: number;
  total: number;
}): string => {
  if (isLoading) {
    return "Leave requests, loading. The number waiting is not known yet.";
  }

  if (ledgerTotal === 0) {
    return "No leave requests this year.";
  }

  if (total === 0) {
    return hasFilters
      ? "Nothing in this queue matches the filters on screen."
      : "Nothing is waiting on a decision.";
  }

  if (shown === 0) {
    return "Nothing in this queue matches the filters on screen.";
  }

  const noun = total === 1 ? "request" : "requests";

  if (hasFilters) {
    return `${shown} of ${total} ${noun} match the filters on screen.`;
  }

  return `${total} ${noun}.`;
};

/**
 * The two ends of the queue, when there are none.
 *
 * A filtered-empty state says so in those words and offers the control that
 * clears the filter; an empty ledger says that instead and offers nothing,
 * because no action on this page creates a request — a teacher applies from
 * their own portal, and the ledger fills from there.
 */
const NoLeaveRows = ({
  hasFilters,
  onReset,
}: {
  hasFilters: boolean;
  onReset: () => void;
}) => (
  <Empty>
    <EmptyHeader>
      <EmptyTitle>
        {hasFilters ? "No requests match" : "No leave requests"}
      </EmptyTitle>
      <EmptyDescription>
        {hasFilters
          ? "Nothing in this queue matches the search and filters above. Clearing them brings the whole ledger back."
          : "Teachers have not applied for any leave yet. Requests appear here as soon as they are submitted from the teacher portal."}
      </EmptyDescription>
    </EmptyHeader>
    {hasFilters && (
      <EmptyContent>
        <Button variant="outline" onClick={onReset}>
          Clear filters
        </Button>
      </EmptyContent>
    )}
  </Empty>
);

/**
 * A fetch that failed, which is not an empty ledger.
 *
 * Says what is known (nothing has been changed), what is not (the ledger), and
 * offers the one thing that can be done about it.
 */
const LeaveErrorPanel = ({ onRetry }: { onRetry: () => void }) => (
  <div className="border-destructive/30 bg-card border px-[22px] py-4">
    <p className="text-destructive text-sm font-bold">
      The leave ledger could not be loaded
    </p>
    <p className="text-primary/65 mt-1 text-[13px]">
      The server did not return the list of requests. Nothing has been changed —
      try again.
    </p>
    <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>
      Try again
    </Button>
  </div>
);

/**
 * Search, the queue, the status, and the column menu.
 *
 * The status picker carries the count for each of its options, because the
 * number beside a filter is the whole reason to reach for one — and it can only
 * be right because the ledger behind it is unfiltered (see `toLeaveLedgerInput`).
 *
 * The search box is the shared one, and the debounce lives inside it: the box
 * takes the **draft** and reports keystrokes, so a committed `search` prop
 * arriving mid-word cannot repaint the box out from under the caret.
 */
const LeaveToolbar = ({
  counts,
  hasFilters,
  ids,
  onResetFilters,
  onSearchChange,
  queue,
  search,
  table,
}: {
  counts: Record<string, number>;
  hasFilters: boolean;
  ids: string;
  onResetFilters: () => void;
  onSearchChange: (patch: Partial<LeaveRequestsSearch>) => void;
  queue: LeaveQueueScope;
  search: LeaveRequestsSearch;
  table: LeaveTable;
}) => (
  <div className="flex flex-wrap items-end gap-3">
    <DataTableSearchField
      id={`${ids}-search`}
      onCommit={(q) => {
        onSearchChange({ q });
      }}
      placeholder="Teacher, type or reason"
      value={search.q}
    />

    <Field className="w-56">
      <FieldLabel htmlFor={`${ids}-queue`}>Queue</FieldLabel>
      <Select
        onValueChange={(value: string | null) => {
          const next = LEAVE_QUEUE_OPTIONS.find(
            (option) => option.value === value
          )?.value;

          if (!next) {
            return;
          }

          // Status is reset with it: a queue is a slice of the ledger and a
          // status is a slice of that slice, and "Awaiting DP" plus "Approved"
          // is two slices that cannot both be non-empty.
          onSearchChange({ queue: next, status: ANY_LEAVE_STATUS });
        }}
        value={queue}
      >
        <SelectTrigger id={`${ids}-queue`}>
          <SelectValue placeholder="Full ledger" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {LEAVE_QUEUE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>

    <Field className="w-60">
      <FieldLabel htmlFor={`${ids}-status`}>Status</FieldLabel>
      <Select
        onValueChange={(value: string | null) => {
          const next = LEAVE_STATUS_OPTIONS.find(
            (option) => option.value === value
          )?.value;

          onSearchChange({ status: next ?? ANY_LEAVE_STATUS });
        }}
        value={search.status}
      >
        <SelectTrigger id={`${ids}-status`}>
          <SelectValue placeholder="Every status" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {LEAVE_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
                {option.value === "all"
                  ? ` (${counts.all ?? 0})`
                  : ` (${counts[option.value] ?? 0})`}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>

    {hasFilters && (
      <Button variant="ghost" onClick={onResetFilters}>
        <IconX aria-hidden="true" />
        Clear filters
      </Button>
    )}

    <DataTableViewOptions table={table} />
  </div>
);

export interface LeaveRequestsDataTableProps {
  /**
   * The whole ledger, or nothing yet.
   *
   * Optional because the route's `loader` prefetches it, and because a client
   * navigation can render this table before the query has resolved — during
   * which `isLoading` is what puts placeholders in the body. There is no
   * `placeholderData: keepPreviousData`: the query has one key per year, so
   * there is no previous page worth holding on to.
   */
  requests: LeaveRequest[] | undefined;
  authority: LeaveAuthority;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  isDeciding: boolean;
  onRetry: () => void;
  onReview: (request: LeaveRequest) => void;
  search: LeaveRequestsSearch;
  onSearchChange: (patch: Partial<LeaveRequestsSearch>) => void;
}

/**
 * The leave queue as one table.
 *
 * ## What the table owns, and what the URL owns
 *
 * Search, the queue, the status filter and the sort order are the **URL's**:
 * they live in `leave-requests-search.ts` and are written through
 * `useListSearchWriter`, so a narrowed queue survives a refresh, Back, and being
 * sent to the Principal. The table owns exactly one thing — which columns are on
 * screen — which is the one piece of list state that is a property of the
 * reader's screen rather than of the College, and therefore never belongs in a
 * shared link.
 *
 * ## Why there is no paging bar
 *
 * `toLeaveLedgerInput` returns the year's ledger in one request and takes no
 * `page` input, so every row is already here. Paging a queue that fits on one
 * screen would be furniture, and a "Rows per page" select that changed nothing
 * would be worse than none — it is the same defect as a sort glyph that does not
 * sort. The count is in the caption instead, where a screen reader gets it too.
 */
export const LeaveRequestsDataTable = ({
  requests,
  authority,
  isLoading,
  isFetching,
  isError,
  isDeciding,
  onRetry,
  onReview,
  search,
  onSearchChange,
}: LeaveRequestsDataTableProps) => {
  const ids = useId();
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>({});

  const queue = resolveLeaveQueue(search.queue, authority);

  const rows = useMemo(
    () =>
      sortLeaveRequests(
        filterLeaveRequests(requests ?? NO_ROWS, search, queue),
        search
      ),
    [requests, search, queue]
  );

  const columns = useMemo(
    () => buildLeaveColumns({ authority, isDeciding, onReview }),
    [authority, isDeciding, onReview]
  );

  /**
   * The sort as the header reads it, derived from the URL rather than held in
   * the table. One source of truth: a second `useState` here would be a second
   * copy of the order, and the two would disagree the moment a link was pasted.
   */
  const sorting = searchToSorting(search);

  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const [first] = next;
    const key = first
      ? LEAVE_SORT_KEYS.find((candidate) => candidate === first.id)
      : undefined;

    if (!key) {
      // Nothing sorted, which is the header's "Back to the default order" when
      // the queue is already at its default.
      onSearchChange({
        dir: DEFAULT_LEAVE_DIRECTION,
        sort: DEFAULT_LEAVE_SORT,
      });
      return;
    }

    onSearchChange({ dir: first.desc ? "desc" : "asc", sort: key });
  };

  const table = useTable({
    features: listTableFeatures,
    columns,
    data: rows,
    getRowId: (request) => request.id,
    rowCount: rows.length,
    // The rows arrive in `sortLeaveRequests`' order, and the table records the
    // state without reordering anything — see the note above that function.
    manualSorting: true,
    state: { columnVisibility, sorting },
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange,
  });

  const hasFilters = hasLeaveRequestFilters(search);
  const all = requests ?? NO_ROWS;
  const inQueue = useMemo(
    () => all.filter((request) => matchesQueue(request, queue)),
    [all, queue]
  );
  const counts = useMemo(
    () => ({ all: inQueue.length, ...countByStatus(inQueue) }),
    [inQueue]
  );

  const resetFilters = () => {
    onSearchChange({ q: "", queue: null, status: ANY_LEAVE_STATUS });
  };

  return (
    <div className="flex flex-col gap-3">
      <LeaveToolbar
        counts={counts}
        hasFilters={hasFilters}
        ids={ids}
        onResetFilters={resetFilters}
        onSearchChange={onSearchChange}
        queue={queue}
        search={search}
        table={table}
      />

      <DataTableFrame
        caption={buildCaption({
          hasFilters,
          isLoading,
          ledgerTotal: all.length,
          shown: rows.length,
          total: inQueue.length,
        })}
        emptyContent={
          <NoLeaveRows hasFilters={hasFilters} onReset={resetFilters} />
        }
        errorContent={<LeaveErrorPanel onRetry={onRetry} />}
        isError={isError}
        isFetching={isFetching}
        isLoading={isLoading}
        table={table}
      />
    </div>
  );
};
