"use client";

import { Badge } from "@school-student-teacher-management/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@school-student-teacher-management/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@school-student-teacher-management/ui/components/tabs";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useCallback } from "react";
import type { ReactNode } from "react";

import { useListSearchWriter } from "@/components/ui-patterns/data-table/use-list-search-writer";
import { orpc } from "@/utils/orpc";

import {
  buildAttendanceColumns,
  buildHomeroomColumns,
  buildLeaveColumns,
  buildStaffColumns,
  buildSubjectColumns,
  buildTimetableColumns,
} from "./historical-data-columns";
import type { HistoryColumnOptions } from "./historical-data-columns";
import {
  formatDate,
  historySearchText,
  historyStatusOf,
} from "./historical-data-rows";
import type { HistoricalData, HistoryRow } from "./historical-data-rows";
import {
  DEFAULT_HISTORY_TAB,
  HISTORY_SORT_DEFAULTS,
  HISTORY_TABS,
  historyTabLabel,
  toHistorySearchParams,
  validateHistorySearch,
} from "./historical-data-search";
import type { HistorySearch, HistoryTab } from "./historical-data-search";
import { HistoryDataTable } from "./historical-data-table";

/**
 * A year that has not arrived yet, as the six branches read it.
 *
 * Not `data?.staff ?? []` six times over: each `??` is a decision, and six of
 * them inside the component is what pushed it past the complexity budget before
 * a single tab was accounted for. One default here, and every branch reads
 * `history.staff` — while the table, told `isLoading`, is already saying that
 * the rows on screen are not the answer.
 */
const EMPTY_HISTORY: HistoricalData = {
  attendanceExceptions: [],
  homeroomHistory: [],
  leaveDecisions: [],
  staff: [],
  subjects: [],
  timetables: [],
};

/** How much the year holds in total, or `null` while it is still loading. */
const countHistoryRecords = (
  data: HistoricalData | undefined
): number | null =>
  data === undefined
    ? null
    : [
        data.staff.length,
        data.subjects.length,
        data.timetables.length,
        data.homeroomHistory.length,
        data.leaveDecisions.length,
        data.attendanceExceptions.length,
      ].reduce((total, count) => total + count, 0);

/** The year's date range as a sentence, for the card's description. */
const yearRangeText = (year: {
  startDate?: string | null;
  endDate?: string | null;
}): string =>
  year.startDate && year.endDate
    ? `${formatDate(year.startDate)} to ${formatDate(year.endDate)}`
    : "No date range has been recorded for this academic year.";

/**
 * A tab's value off the URL, as one of the six — or the default.
 *
 * `onValueChange` hands back `unknown`, and a value this page has never heard
 * of is a hand-edited URL rather than a bug: it opens the first tab rather than
 * throwing, which is the same trade every other reader on this page makes.
 */
const toHistoryTab = (next: unknown): HistoryTab => {
  if (typeof next !== "string") {
    return DEFAULT_HISTORY_TAB;
  }

  return (
    HISTORY_TABS.find((candidate) => candidate === next) ?? DEFAULT_HISTORY_TAB
  );
};

/**
 * The six tabs, as a row of buttons over one table.
 *
 * ## What the URL owns
 *
 * Which tab, what is being searched for, and how the tab is ordered are the
 * route's validated query string — `?tab=&q=&sort=&dir=&status=` — written
 * through `useListSearchWriter`. It used to be a `Tabs defaultValue="staff"`
 * holding everything in component state, which meant which *part* of the year
 * you were reading was not in the address at all: a link to the leave decisions
 * of 2025 opened the staff roster of 2025, Back out of a tab did nothing, and a
 * search typed into one tab was gone the moment the tab changed. The page reads
 * `search` as a prop from its own route rather than importing the route file,
 * because the route imports this one.
 *
 * ## One table, six column sets
 *
 * Each tab builds its own columns and hands them to the same generic
 * `HistoryDataTable`, which is why the branches below are one line each: the
 * six row shapes have nothing in common but `id`, so a table typed against the
 * union would need a cast to read any field of it. Narrowing one branch at a
 * time is what lets `row.original.subjectKey` be a `subjectKey`.
 *
 * The column sets are rebuilt on every render rather than memoised. That is six
 * plain object literals per rebuild — no query, no allocation worth a `useMemo`,
 * and no dependency to get wrong — against a sort over a year of records that
 * happens once per frame anyway.
 */
const HistoricalDataPage = ({ search }: { search: HistorySearch }) => {
  const { year } = useParams({
    from: "/_auth/admin/$year/staff/historical-data",
  });
  const yearNumber = Number(year);
  const { tab } = search;

  const write = useListSearchWriter<HistorySearch>(
    validateHistorySearch,
    toHistorySearchParams
  );

  const yearsQuery = useQuery(orpc.staff.listAcademicYears.queryOptions());
  const academicYear = yearsQuery.data?.find(
    (candidate) => candidate.year === yearNumber
  );

  const historyQuery = useQuery({
    ...orpc.staff.getHistoricalData.queryOptions({
      input: { academicYearId: academicYear?.id ?? "" },
    }),
    enabled: Boolean(academicYear?.id),
  });

  /**
   * A header's three choices, straight back to the URL.
   *
   * `direction: null` is the header's "Back to the default order", and the
   * default it restores is the **tab's** — `HISTORY_SORT_DEFAULTS[tab]`, not
   * some table-wide notion. That is the third state a two-state toggle has
   * nowhere to put, and it is why the sort does not go through
   * `column.toggleSorting`.
   */
  const onSort = useCallback<HistoryColumnOptions["onSort"]>(
    (columnId, direction) => {
      if (direction === null) {
        const fallback = HISTORY_SORT_DEFAULTS[tab];
        write({ dir: fallback.dir, sort: fallback.key });
        return;
      }

      write({ dir: direction, sort: columnId });
    },
    [tab, write]
  );

  /**
   * Is this row in what the reader asked to see?
   *
   * Against what the row **renders**, not its stored keys — a search for
   * "Environmental-Related Activities" must find the row whose subject key is
   * `environmentRelatedActivities`, and an id must not match at all. The tab is
   * captured rather than passed, because the branch this table is rendering and
   * the tab the predicate closes over are the same fact.
   */
  const matches = useCallback(
    (row: HistoryRow, term: string, status: string) => {
      if (
        term !== "" &&
        !historySearchText(tab, row).toLowerCase().includes(term)
      ) {
        return false;
      }

      if (status !== "") {
        const value = historyStatusOf(tab, row);
        if (value === "" || value !== status) {
          return false;
        }
      }

      return true;
    },
    [tab]
  );

  const onRetry = () => {
    void historyQuery.refetch();
  };

  if (yearsQuery.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[40rem] w-full" />
      </div>
    );
  }

  if (!academicYear) {
    return (
      <Empty className="min-h-[50vh] border border-dashed">
        <EmptyTitle>Academic year not found</EmptyTitle>
        <EmptyDescription>
          Choose an academic year from the sidebar to view its history.
        </EmptyDescription>
      </Empty>
    );
  }

  const history = historyQuery.data ?? EMPTY_HISTORY;
  const sectionCount = countHistoryRecords(historyQuery.data);

  const common = {
    isFetching: historyQuery.isFetching,
    isError: historyQuery.isError,
    isLoading: historyQuery.isPending,
    matches,
    onRetry,
    onSearchChange: write,
    search,
    year: yearNumber,
  };

  let body: ReactNode;

  if (tab === "staff") {
    body = (
      <HistoryDataTable
        {...common}
        columns={buildStaffColumns({ onSort })}
        rows={history.staff}
        tab={tab}
      />
    );
  } else if (tab === "subjects") {
    body = (
      <HistoryDataTable
        {...common}
        columns={buildSubjectColumns({ onSort })}
        rows={history.subjects}
        tab={tab}
      />
    );
  } else if (tab === "timetables") {
    body = (
      <HistoryDataTable
        {...common}
        columns={buildTimetableColumns({ onSort })}
        rows={history.timetables}
        tab={tab}
      />
    );
  } else if (tab === "homerooms") {
    body = (
      <HistoryDataTable
        {...common}
        columns={buildHomeroomColumns({ onSort })}
        rows={history.homeroomHistory}
        tab={tab}
      />
    );
  } else if (tab === "leaves") {
    body = (
      <HistoryDataTable
        {...common}
        columns={buildLeaveColumns({ onSort })}
        rows={history.leaveDecisions}
        tab={tab}
      />
    );
  } else {
    body = (
      <HistoryDataTable
        {...common}
        columns={buildAttendanceColumns({ onSort })}
        rows={history.attendanceExceptions}
        tab={tab}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-3xl font-bold">Historical Data</h1>
        <p className="text-muted-foreground mt-2">
          Read-only staffing, timetable, leave and attendance records for the
          selected academic year.
        </p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>Year {academicYear.year}</CardTitle>
            {sectionCount === null ? null : (
              <Badge variant="secondary">{sectionCount} records</Badge>
            )}
            <Badge variant="outline">Read only</Badge>
          </div>
          <CardDescription>{yearRangeText(academicYear)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            onValueChange={(next: unknown) => {
              write({ tab: toHistoryTab(next) });
            }}
            value={tab}
          >
            <TabsList
              variant="line"
              className="border-primary/18 h-auto w-full flex-wrap justify-start gap-0.5 rounded-none border-b p-0"
            >
              {HISTORY_TABS.map((candidate) => (
                <TabsTrigger key={candidate} value={candidate}>
                  {historyTabLabel(candidate)}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent className="pt-4" value={tab}>
              {body}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default HistoricalDataPage;
