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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { IconX } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import type {
  ColumnDef,
  ColumnVisibilityState,
  RowData,
  SortingState,
} from "@tanstack/react-table";
import { useId, useMemo, useState } from "react";

import { DataTableFrame } from "@/components/ui-patterns/data-table/data-table-frame";
import { DataTableSearchField } from "@/components/ui-patterns/data-table/data-table-search-field";
import { DataTableViewOptions } from "@/components/ui-patterns/data-table/data-table-view-options";
import { searchToSorting } from "@/components/ui-patterns/data-table/list-search";
import { listTableFeatures } from "@/components/ui-patterns/data-table/list-table-features";

import { historyStatusLabel } from "./historical-data-rows";
import {
  HISTORY_STATUS_LABELS,
  HISTORY_STATUS_VALUES,
  hasHistoryFilters,
  historyTabLabel,
} from "./historical-data-search";
import type { HistorySearch, HistoryTab } from "./historical-data-search";

/**
 * What each tab says when it has nothing in it, and what its search box is for.
 *
 * Kept beside the table rather than beside the columns because the table is the
 * only thing that renders them: a tab's empty words and its search hint are two
 * statements about the same set of rows, and split across two files they would
 * drift — a placeholder naming a column that was hidden from the menu is the
 * small version of the defect.
 */
const TAB_WORDS: Record<
  HistoryTab,
  { emptyTitle: string; emptyDescription: string; placeholder: string }
> = {
  staff: {
    emptyTitle: "No staff records",
    emptyDescription: "No staff activity was recorded for this academic year.",
    placeholder: "Name, service number or position",
  },
  subjects: {
    emptyTitle: "No teacher subjects",
    emptyDescription:
      "No teacher subject assignments were recorded for this academic year.",
    placeholder: "Teacher or subject",
  },
  timetables: {
    emptyTitle: "No timetable assignments",
    emptyDescription:
      "No class or teacher timetable assignments were recorded for this academic year.",
    placeholder: "Class, grade, day, period, subject or teacher",
  },
  homerooms: {
    emptyTitle: "No homeroom changes",
    emptyDescription:
      "No homeroom assignment changes were recorded for this academic year.",
    placeholder: "Class, teacher, change or reason",
  },
  leaves: {
    emptyTitle: "No leave records",
    emptyDescription: "No leave requests were recorded for this academic year.",
    placeholder: "Teacher, leave type, dates, reason or decision",
  },
  attendance: {
    emptyTitle: "No attendance exceptions",
    emptyDescription:
      "No absence, partial-day or late-arrival exceptions were recorded for this academic year.",
    placeholder: "Teacher, date, status or reason",
  },
};

const readSortValue = (row: unknown, key: string): unknown =>
  (row as Record<string, unknown>)[key];

const compareValues = (a: unknown, b: unknown): number => {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  // ISO dates are all the same shape, so they compare correctly as text and an
  // unparseable value sorts rather than throwing.
  return String(a ?? "").localeCompare(String(b ?? ""));
};

/**
 * The order the tab is handed to the table in.
 *
 * TanStack v9's `manualSorting: true` means *the caller sorts*: `getRowModel`
 * returns the rows it was given whenever `manualSorting` is set or no
 * `sortedRowModel` is registered, and this app registers neither — the same
 * invariant `list-table-features.ts` states for every list. Without this the
 * header would flip its glyph and `aria-sort` while the rows stayed put, which
 * is exactly the defect the attendance register's own ordering function exists
 * to prevent.
 *
 * The order comes off the column's `accessorKey`, so a sorting state naming a
 * column this tab does not offer — reachable only by hand-editing the URL, since
 * `validateHistorySearch` has already checked it against the tab — leaves the
 * rows alone rather than ordering them by a field they have no value for.
 */
const orderHistoryRows = <TRow extends RowData>(
  rows: TRow[],
  columns: ColumnDef<typeof listTableFeatures, TRow>[],
  sorting: SortingState
): TRow[] => {
  const [active] = sorting;

  if (!active) {
    return rows;
  }

  const definition = columns.find((column) => column.id === active.id);

  if (
    !definition ||
    definition.enableSorting === false ||
    !("accessorKey" in definition)
  ) {
    return rows;
  }

  const key = definition.accessorKey;

  if (typeof key !== "string") {
    return rows;
  }

  const direction = active.desc ? -1 : 1;

  return rows.toSorted((left, right) => {
    const a = readSortValue(left, key);
    const b = readSortValue(right, key);
    return compareValues(a, b) * direction;
  });
};

/**
 * The table's accessible name: which tab, which year, and how much of it is on
 * screen.
 *
 * Four truths, in the order a reader meets them. Loading comes first because a
 * caption announcing "No attendance exceptions" while the first row is still in
 * flight is a statement about the year that arrived before the year did; then
 * failure, then nothing matched, then the ordinary count. The caption is
 * visually hidden but is what a screen reader gets cell by cell, so the visible
 * count beside the toolbar is the same number written for the eye.
 */
const buildCaption = ({
  hasFilters,
  isError,
  isLoading,
  shown,
  tab,
  total,
  year,
}: {
  hasFilters: boolean;
  isError: boolean;
  isLoading: boolean;
  shown: number;
  tab: HistoryTab;
  total: number;
  year: number;
}): string => {
  const label = historyTabLabel(tab);

  if (isLoading) {
    return `${label} for ${year}. Loading — the number of records is not known yet.`;
  }

  if (isError) {
    return `${label} for ${year}. The records could not be loaded.`;
  }

  if (shown === 0) {
    return hasFilters
      ? `${label} for ${year}. Nothing matches the search and filters on screen.`
      : `${label} for ${year}. Nothing has been recorded.`;
  }

  if (hasFilters && shown !== total) {
    return `${label} for ${year}. ${shown} of ${total} records match the search and filters on screen.`;
  }

  if (hasFilters) {
    return `${label} for ${year}. All ${total} records match the search and filters on screen.`;
  }

  return `${label} for ${year}. ${total === 1 ? "1 record" : `${total} records`}.`;
};

/** Nothing on this tab matches, which is not the same fact as an empty tab. */
const NoHistoryRows = ({
  hasFilters,
  onClear,
  tab,
}: {
  hasFilters: boolean;
  onClear: () => void;
  tab: HistoryTab;
}) => {
  const words = TAB_WORDS[tab];

  if (hasFilters) {
    return (
      <div className="p-6">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing on this tab matches</EmptyTitle>
            <EmptyDescription>
              Nothing in {historyTabLabel(tab).toLowerCase()} matches the search
              and filters above. Clearing them brings the whole tab back.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={onClear} type="button">
              Clear filters
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{words.emptyTitle}</EmptyTitle>
          <EmptyDescription>{words.emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
};

/** A fetch that failed, which is not an empty year. */
const HistoryErrorPanel = ({ onRetry }: { onRetry: () => void }) => (
  <div className="border-destructive/30 bg-card border px-[22px] py-4">
    <p className="text-destructive text-sm font-bold">
      The history for this year could not be loaded
    </p>
    <p className="text-primary/65 mt-1 text-[13px]">
      The server did not return the records. Nothing has been changed — try
      again.
    </p>
    <Button
      className="mt-3"
      size="sm"
      type="button"
      variant="outline"
      onClick={onRetry}
    >
      Try again
    </Button>
  </div>
);

export interface HistoryDataTableProps<TRow extends { id: string }> {
  /** Which of the six tabs this table is, and where its words come from. */
  tab: HistoryTab;
  /** The year in the caption — a shared link should name the year it reads. */
  year: number;
  /** Every row this tab has, before the search and the filter narrow it. */
  rows: TRow[];
  columns: ColumnDef<typeof listTableFeatures, TRow>[];
  /**
   * Whether this row survives the search and the status filter.
   *
   * A callback rather than a `tab` the table dispatches on, because the table
   * is generic over the row and `historySearchText` takes the *union* of the
   * six — handing it a `StaffRow` would need a cast at every call site. The
   * page already knows which tab it is rendering, so it closes over it once.
   *
   * Only called when at least one of the two arguments is non-empty.
   */
  matches: (row: TRow, term: string, status: string) => boolean;
  search: HistorySearch;
  onSearchChange: (patch: Partial<HistorySearch>) => void;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  onRetry: () => void;
}

/**
 * One of the six history tabs, as a list.
 *
 * The arrangement every other list in the app uses — search and filter over
 * rows the client already holds, an order the caller applies, a frame that
 * knows the difference between loading, failed, filtered-empty and empty — with
 * one difference worth stating: **there is no paging.** `getHistoricalData`
 * returns a whole year in one response, so unlike the accounts and teachers
 * registers there is no page two to fetch, and a paging bar over a set the
 * browser is already holding would be furniture. Client-side filtering is the
 * correct tier for a set the client holds in full.
 *
 * Which tab is shown, what it is searching for and how it is ordered are the
 * **URL's**, written through `useListSearchWriter` in the page — so a link to a
 * filtered year opens that filtered year, Back undoes a tab change, and a
 * search typed into "Leave decisions" is still there after a refresh. The table
 * owns one thing: which columns are on screen, which is a property of the
 * reader's screen rather than of the College.
 */
export const HistoryDataTable = <TRow extends { id: string }>({
  tab,
  year,
  rows,
  columns,
  matches,
  search,
  onSearchChange,
  isLoading,
  isFetching,
  isError,
  onRetry,
}: HistoryDataTableProps<TRow>) => {
  const ids = useId();
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>({});

  /**
   * The status picker, present on the three tabs that have a status and absent
   * on the three that do not — a roster has no state to pick from, so the
   * control is not rendered rather than rendered and inert.
   */
  const statusValues = HISTORY_STATUS_VALUES[tab] as readonly string[];
  const statusOptions = statusValues.map((value) => ({
    value,
    label: historyStatusLabel(value),
  }));

  const term = search.q.trim().toLowerCase();
  const { dir, sort, status } = search;

  const visibleRows = useMemo(() => {
    if (term === "" && status === "") {
      return rows;
    }
    return rows.filter((row) => matches(row, term, status));
  }, [matches, rows, status, term]);

  const sorting = useMemo(() => searchToSorting({ dir, sort }), [dir, sort]);

  const orderedRows = useMemo(
    () => orderHistoryRows(visibleRows, columns, sorting),
    [columns, sorting, visibleRows]
  );

  /**
   * No `onSortingChange`, because nothing here sorts through the table.
   *
   * The header's three choices are a callback straight to the page's writer, so
   * "Back to the default order" writes `HISTORY_SORT_DEFAULTS[tab]` instead of
   * whatever `column.toggleSorting(null)` would make of a `null` direction —
   * which direction a list considers its own default is a fact about the list,
   * not about TanStack, and routing it through the table is how a two-state
   * toggle ends up with nowhere to put the third state. The table still *reads*
   * `sorting`, for `getIsSorted` and for `aria-sort` on the `<th>`; it simply
   * never writes it.
   */
  const table = useTable({
    features: listTableFeatures,
    columns,
    data: orderedRows,
    getRowId: (row) => row.id,
    rowCount: rows.length,
    // The rows arrive in `orderHistoryRows`' order and the table records the
    // state without reordering anything — see the note above that function.
    manualSorting: true,
    state: { columnVisibility, sorting },
    onColumnVisibilityChange: setColumnVisibility,
  });

  const hasFilters = hasHistoryFilters(search);

  const clearFilters = () => {
    onSearchChange({ q: "", status: "" });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <DataTableSearchField
          id={`${ids}-search`}
          label="Search"
          onCommit={(q) => {
            onSearchChange({ q });
          }}
          placeholder={TAB_WORDS[tab].placeholder}
          value={search.q}
        />

        {statusOptions.length > 0 ? (
          <Field className="w-64">
            <FieldLabel htmlFor={`${ids}-status`}>
              {HISTORY_STATUS_LABELS[tab]}
            </FieldLabel>
            <Select
              onValueChange={(value) => {
                onSearchChange({
                  status: value === "all" || value === null ? "" : value,
                });
              }}
              value={status === "" ? "all" : status}
            >
              <SelectTrigger id={`${ids}-status`}>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        {hasFilters ? (
          <Button variant="ghost" onClick={clearFilters} type="button">
            <IconX aria-hidden="true" />
            Clear filters
          </Button>
        ) : null}

        <DataTableViewOptions table={table} />

        {isLoading || isError ? null : (
          <p className="text-muted-foreground ml-auto text-sm tabular-nums">
            {hasFilters && visibleRows.length !== rows.length
              ? `${visibleRows.length} of ${rows.length} shown`
              : `${rows.length} ${rows.length === 1 ? "record" : "records"}`}
          </p>
        )}
      </div>

      <DataTableFrame
        caption={buildCaption({
          hasFilters,
          isError,
          isLoading,
          shown: visibleRows.length,
          tab,
          total: rows.length,
          year,
        })}
        emptyContent={
          <NoHistoryRows
            hasFilters={hasFilters}
            onClear={clearFilters}
            tab={tab}
          />
        }
        errorContent={<HistoryErrorPanel onRetry={onRetry} />}
        isError={isError}
        isFetching={isFetching}
        isLoading={isLoading}
        table={table}
      />
    </div>
  );
};
