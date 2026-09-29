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

import type { TeacherRequest } from "./approve-teacher-dialog";
import { describeBlocker } from "./request-blocker";
import { buildRequestColumns } from "./teacher-requests-columns";
import {
  ANY_REQUEST_STATUS,
  DEFAULT_DIRECTION,
  DEFAULT_REQUEST_SORT,
  REQUEST_SORT_KEYS,
  REQUEST_STATUS_OPTIONS,
  hasTeacherRequestFilters,
} from "./teacher-requests-search";
import type {
  RequestSortKey,
  TeacherRequestsSearch,
} from "./teacher-requests-search";

/**
 * The empty queue, at module scope.
 *
 * Not built in a render body: a new `[]` on every render is a new `data`
 * reference, and the table invalidates its data-dependent models when `data`
 * changes, so a first read would rebuild the row model on every frame.
 */
const NO_ROWS: TeacherRequest[] = [];

/** The type of the table this file builds, as one name. */
type RequestsTable = ReactTable<typeof listTableFeatures, TeacherRequest>;

/**
 * Search, then the status filter, over a set the client already holds in full.
 *
 * `listTeacherRequests` has no `page`, no `search` and no `sort` input — it
 * returns the whole queue in one go — so every filter here is a browser-side
 * one, which is the correct tier for a list of a dozen rows the client already
 * has. Nothing in this function needs to reach the server, and the day it does,
 * this is the only place that changes.
 *
 * The status test goes through `describeBlocker` rather than re-reading
 * `emailVerified`, so the filter and the column can never describe two different
 * sets: "Ready to approve" means exactly "the server would accept this one".
 */
const filterRequests = (
  rows: TeacherRequest[],
  search: TeacherRequestsSearch
): TeacherRequest[] => {
  const term = search.q.trim().toLowerCase();

  return rows.filter((row) => {
    if (term !== "") {
      const hitsName = row.name.toLowerCase().includes(term);
      const hitsEmail = row.email.toLowerCase().includes(term);
      const hitsUsername = (row.username ?? "").toLowerCase().includes(term);

      if (!hitsName && !hitsEmail && !hitsUsername) {
        return false;
      }
    }

    if (search.status !== ANY_REQUEST_STATUS) {
      const isReady = describeBlocker(row) === null;

      if (search.status === "ready" && !isReady) {
        return false;
      }

      if (search.status === "blocked" && isReady) {
        return false;
      }
    }

    return true;
  });
};

/**
 * The comparator behind every sort the queue offers.
 *
 * ISO timestamps compare correctly as strings because they are all the same
 * shape, so `createdAt` and `lastSignInAt` need no date parsing — which also
 * means an unparseable value sorts rather than throwing.
 *
 * `lastSignInAt` is the one with a `null` in it, and **never goes last in both
 * directions**. Flipping the direction flips every other pair, and leaving the
 * `null`s to be flipped too would put "Never" at the top of the order somebody
 * asks for when they want to know who has been around most recently — the one
 * question that column exists to answer. So the direction is applied to the
 * comparison and not to the `null` check.
 */
const compareRequests = (
  a: TeacherRequest,
  b: TeacherRequest,
  key: RequestSortKey,
  direction: 1 | -1
): number => {
  if (key === "name") {
    return a.name.localeCompare(b.name) * direction;
  }

  if (key === "createdAt") {
    return a.createdAt.localeCompare(b.createdAt) * direction;
  }

  if (a.lastSignInAt === null) {
    return b.lastSignInAt === null ? 0 : 1;
  }

  if (b.lastSignInAt === null) {
    return -1;
  }

  return a.lastSignInAt.localeCompare(b.lastSignInAt) * direction;
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
const sortRequests = (
  rows: TeacherRequest[],
  search: TeacherRequestsSearch
): TeacherRequest[] => {
  const direction: 1 | -1 = search.dir === "desc" ? -1 : 1;

  return rows.toSorted((a, b) => compareRequests(a, b, search.sort, direction));
};

/**
 * The table's accessible name, and the one place the count is announced.
 *
 * Three sentences for three truths: still loading, nothing at all, and the
 * ordinary case. The first matters most — a caption saying "Nobody is waiting"
 * while the first request is still in flight is a statement about the College
 * that arrived before the College did.
 */
const buildCaption = ({
  hasFilters,
  isLoading,
  shown,
  total,
}: {
  hasFilters: boolean;
  isLoading: boolean;
  shown: number;
  total: number;
}): string => {
  if (isLoading) {
    return "Teacher requests, loading. The number waiting is not known yet.";
  }

  if (total === 0) {
    return "Nobody is waiting to be approved.";
  }

  const noun = total === 1 ? "person" : "people";

  if (hasFilters) {
    return `${shown} of ${total} ${noun} waiting match the filters on screen.`;
  }

  return `${total} ${noun} waiting.`;
};

/**
 * The two ends of the queue, when there are none.
 *
 * A filtered-empty state says so in those words and offers the control that
 * clears the filter; an empty queue says that instead and offers nothing,
 * because no action on this page creates a requester — somebody signs themselves
 * up, and the queue fills from there.
 */
const NoRequestsRow = ({
  hasFilters,
  onReset,
}: {
  hasFilters: boolean;
  onReset: () => void;
}) => (
  <Empty>
    <EmptyHeader>
      <EmptyTitle>
        {hasFilters ? "No requests match" : "Nobody is waiting"}
      </EmptyTitle>
      <EmptyDescription>
        {hasFilters
          ? "Nothing in the queue matches the search and filters above. Clearing them brings the whole queue back."
          : "No account is asking for staff access. When somebody registers, their request appears here."}
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
 * A request that failed, which is not an empty queue.
 *
 * Says what is known (nothing has been changed), what is not (the queue), and
 * offers the one thing that can be done about it.
 */
const RequestsErrorPanel = ({ onRetry }: { onRetry: () => void }) => (
  <div className="border-destructive/30 bg-card border px-[22px] py-4">
    <p className="text-destructive text-sm font-bold">
      The staffing queue could not be loaded
    </p>
    <p className="text-primary/65 mt-1 text-[13px]">
      The server did not return the list of people waiting. Nothing has been
      changed — try again.
    </p>
    <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>
      Try again
    </Button>
  </div>
);

/**
 * Search, the status filter, and the column menu.
 *
 * The search box is the shared one, and the debounce lives inside it: the box
 * takes the **draft** and reports keystrokes, so a committed `search` prop
 * arriving mid-word cannot repaint the box out from under the caret.
 */
const RequestsToolbar = ({
  hasFilters,
  ids,
  onResetFilters,
  onSearchChange,
  search,
  table,
}: {
  hasFilters: boolean;
  ids: string;
  onResetFilters: () => void;
  onSearchChange: (patch: Partial<TeacherRequestsSearch>) => void;
  search: TeacherRequestsSearch;
  table: RequestsTable;
}) => (
  <div className="flex flex-wrap items-end gap-3">
    <DataTableSearchField
      id={`${ids}-search`}
      onCommit={(q) => {
        onSearchChange({ q });
      }}
      placeholder="Name, email or username"
      value={search.q}
    />

    <Field className="w-60">
      <FieldLabel htmlFor={`${ids}-status`}>Show</FieldLabel>
      <Select
        onValueChange={(value: string | null) => {
          const next =
            REQUEST_STATUS_OPTIONS.find((option) => option.value === value)
              ?.value ?? ANY_REQUEST_STATUS;

          onSearchChange({ status: next });
        }}
        value={search.status}
      >
        <SelectTrigger id={`${ids}-status`}>
          <SelectValue placeholder="Everyone waiting" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {REQUEST_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
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

export interface TeacherRequestsDataTableProps {
  /**
   * The whole queue, or nothing yet.
   *
   * Optional because the route's `loader` prefetches it, and because a client
   * navigation can render this table before the query has resolved — during
   * which `isLoading` is what puts placeholders in the body. There is no
   * `placeholderData: keepPreviousData` here, unlike the accounts list: this
   * query takes no input, so it has exactly one key and there is no previous
   * page worth holding on to.
   */
  requests: TeacherRequest[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  onRetry: () => void;
  search: TeacherRequestsSearch;
  onSearchChange: (patch: Partial<TeacherRequestsSearch>) => void;
  onReview: (request: TeacherRequest) => void;
  /** True while an approval is in flight, which is the only write here. */
  isApproving: boolean;
}

/**
 * The staffing queue as one table.
 *
 * ## What the table owns, and what the URL owns
 *
 * Search, the status filter and the sort order are the **URL's**: they live in
 * `teacher-requests-search.ts` and are written through `useListSearchWriter`, so
 * a narrowed queue survives a refresh, Back, and being sent to the Principal.
 * The table owns exactly one thing — which columns are on screen — which is the
 * one piece of list state that is a property of the reader's screen rather than
 * of the College, and therefore never belongs in a shared link.
 *
 * ## Why there is no paging bar
 *
 * `listTeacherRequests` returns the queue in one request and takes no `page`
 * input, so every row is already here. Paging a dozen people would be furniture,
 * and a "Rows per page" select that changed nothing would be worse than none —
 * it is the same defect as a sort glyph that does not sort. The count is in the
 * caption instead, where a screen reader gets it too.
 */
export const TeacherRequestsDataTable = ({
  requests,
  isLoading,
  isFetching,
  isError,
  onRetry,
  search,
  onSearchChange,
  onReview,
  isApproving,
}: TeacherRequestsDataTableProps) => {
  const ids = useId();
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>({});

  const rows = useMemo(() => {
    const all = requests ?? NO_ROWS;

    return sortRequests(filterRequests(all, search), search);
  }, [requests, search]);

  const columns = useMemo(
    () => buildRequestColumns({ isApproving, onReview }),
    [isApproving, onReview]
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
      ? REQUEST_SORT_KEYS.find((candidate) => candidate === first.id)
      : undefined;

    if (!key) {
      // Nothing sorted, which is the header's "Back to the default order" when
      // the queue is already at its default.
      onSearchChange({
        sort: DEFAULT_REQUEST_SORT,
        dir: DEFAULT_DIRECTION,
      });
      return;
    }

    onSearchChange({ sort: key, dir: first.desc ? "desc" : "asc" });
  };

  const table = useTable({
    features: listTableFeatures,
    columns,
    data: rows,
    getRowId: (request) => request.id,
    rowCount: rows.length,
    // The rows arrive in `sortRequests`' order, and the table records the state
    // without reordering anything — see the note above that function.
    manualSorting: true,
    state: { columnVisibility, sorting },
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange,
  });

  const hasFilters = hasTeacherRequestFilters(search);
  const all = requests ?? NO_ROWS;
  const readyCount = all.filter(
    (request) => describeBlocker(request) === null
  ).length;

  return (
    <div className="flex flex-col gap-3">
      <RequestsToolbar
        hasFilters={hasFilters}
        ids={ids}
        onResetFilters={() => {
          onSearchChange({ q: "", status: ANY_REQUEST_STATUS });
        }}
        onSearchChange={onSearchChange}
        search={search}
        table={table}
      />

      {requests && requests.length > 0 && (
        <p className="text-muted-foreground text-sm">
          {readyCount} of {requests.length}{" "}
          {requests.length === 1 ? "person is" : "people are"} ready to approve.
        </p>
      )}

      <DataTableFrame
        caption={buildCaption({
          hasFilters,
          isLoading,
          shown: rows.length,
          total: all.length,
        })}
        emptyContent={
          <NoRequestsRow
            hasFilters={hasFilters}
            onReset={() => {
              onSearchChange({ q: "", status: ANY_REQUEST_STATUS });
            }}
          />
        }
        errorContent={<RequestsErrorPanel onRetry={onRetry} />}
        isError={isError}
        isFetching={isFetching}
        isLoading={isLoading}
        table={table}
      />
    </div>
  );
};
