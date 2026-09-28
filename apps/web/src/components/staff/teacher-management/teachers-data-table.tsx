import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import { IconPlus, IconX } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import type {
  ColumnVisibilityState,
  OnChangeFn,
  PaginationState,
  ReactTable,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import { useId, useMemo, useState } from "react";

import { DataTableFrame } from "@/components/ui-patterns/data-table/data-table-frame";
import { DataTablePagination } from "@/components/ui-patterns/data-table/data-table-pagination";
import { DataTableSearchField } from "@/components/ui-patterns/data-table/data-table-search-field";
import { DataTableViewOptions } from "@/components/ui-patterns/data-table/data-table-view-options";
import { listTableFeatures } from "@/components/ui-patterns/data-table/list-table-features";

import { buildTeacherColumns } from "./teachers-columns";
import { TEACHER_PAGE_SIZES } from "./teachers-search";
import type { TeacherRow } from "./teachers-search";

/** The empty page, at module scope. See the note in the accounts table. */
const NO_ROWS: TeacherRow[] = [];

type TeachersTable = ReactTable<typeof listTableFeatures, TeacherRow>;

export interface TeachersDataTableProps {
  /** The page of teachers, or nothing yet while the loader's page is in flight. */
  teachers: TeacherRow[] | undefined;
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  onRetry: () => void;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  search: string;
  onSearchChange: (value: string) => void;
  onResetSearch: () => void;
  hasFilters: boolean;
  onCreateClick: () => void;
  onEditClick: (teacher: TeacherRow) => void;
  onViewClick: (teacher: TeacherRow) => void;
  onDeleteClick: (teacher: TeacherRow) => void;
  onManageTimetableClick: (teacher: TeacherRow) => void;
}

/**
 * The table's accessible name, and the one place the paging is announced.
 *
 * Four sentences, because there are four truths: still loading, nobody at all,
 * nobody matching, and the ordinary case. The one that matters most is the first — a
 * caption that says "No teachers" while the first request is still in flight is a
 * statement about the school that arrived before the school did.
 */
const buildCaption = ({
  hasFilters,
  isLoading,
  pageCount,
  pageIndex,
  total,
}: {
  hasFilters: boolean;
  isLoading: boolean;
  pageCount: number;
  pageIndex: number;
  total: number;
}): string => {
  if (isLoading) {
    return "Teaching establishment, loading. The number of teachers is not known yet.";
  }

  const teachers = total === 1 ? "teacher" : "teachers";
  const filtered = hasFilters ? ` matching the search (${total} in all)` : "";

  if (total === 0) {
    return `No ${teachers}${filtered}.`;
  }

  return `${total} ${teachers}${filtered}. Page ${pageIndex + 1} of ${pageCount}.`;
};

/**
 * The two ends of the register, when there is nobody on it.
 *
 * A search that matched nobody offers the control that clears it; a College with no
 * teachers at all offers the control that creates one. They are different sentences
 * because they are different situations, and the first one is not a statement about
 * the school.
 */
const NoTeachersRow = ({
  hasFilters,
  onCreate,
  onResetSearch,
}: {
  hasFilters: boolean;
  onCreate: () => void;
  onResetSearch: () => void;
}) => (
  <div className="p-6">
    <Empty>
      <EmptyHeader>
        <EmptyTitle>
          {hasFilters ? "No teachers match" : "No teachers yet"}
        </EmptyTitle>
        <EmptyDescription>
          {hasFilters
            ? "Nobody on the establishment matches that search. Clearing it brings the whole register back."
            : "The teaching establishment is empty. Add a teacher to start recording classes, subjects and timetables."}
        </EmptyDescription>
      </EmptyHeader>
      {hasFilters ? (
        <EmptyContent>
          <Button variant="outline" onClick={onResetSearch}>
            <IconX aria-hidden="true" />
            Clear search
          </Button>
        </EmptyContent>
      ) : (
        <EmptyContent>
          <Button onClick={onCreate}>
            <IconPlus aria-hidden="true" />
            Add teacher
          </Button>
        </EmptyContent>
      )}
    </Empty>
  </div>
);

/**
 * A request that failed, which is not an empty register.
 *
 * Says what is known (nothing has been changed), what is not (the register itself),
 * and offers the one thing that can be done about it.
 */
const TeachersErrorPanel = ({ onRetry }: { onRetry: () => void }) => (
  <div className="border-destructive/30 bg-card border px-[22px] py-4">
    <p className="text-destructive text-sm font-bold">
      The teaching establishment could not be loaded
    </p>
    <p className="text-primary/65 mt-1 text-[13px]">
      The server did not return the list of teachers. Nothing has been changed —
      try again.
    </p>
    <Button className="mt-3" variant="outline" size="sm" onClick={onRetry}>
      Try again
    </Button>
  </div>
);

/**
 * Search, and the column menu.
 *
 * Two controls, and no more: the register has one filter, and inventing a second
 * because another list has three would be a filter for something nobody has asked
 * for. A status *filter* is a real gap and belongs here when the establishment is
 * large enough to need one — as a URL param, not as component state.
 */
const TeachersToolbar = ({
  hasFilters,
  ids,
  onResetSearch,
  onSearchChange,
  search,
  table,
}: {
  hasFilters: boolean;
  ids: string;
  onResetSearch: () => void;
  onSearchChange: (value: string) => void;
  search: string;
  table: TeachersTable;
}) => (
  <div className="flex flex-wrap items-end gap-3">
    <DataTableSearchField
      id={`${ids}-search`}
      onCommit={onSearchChange}
      placeholder="Name, email, phone, NIC or service number"
      value={search}
    />

    {hasFilters && (
      <Button variant="ghost" onClick={onResetSearch}>
        <IconX aria-hidden="true" />
        Clear search
      </Button>
    )}

    <DataTableViewOptions table={table} />
  </div>
);

/**
 * The teachers register.
 *
 * The same shape as the accounts table, and deliberately so: sorting, paging and
 * searching are the **server's** — they live in the URL, the route's `loader` turns
 * them into `listTeachers`' input, and the table is handed two `manual*` flags, one
 * page of rows and a total. The table owns which columns are on screen and which
 * rows are ticked, and that is all.
 *
 * There is no filter function and no sort function here, for the reason there is
 * none there: a search applied in the browser to a page of twenty-five would
 * report "1 result" for a search that matched two hundred teachers.
 */
export const TeachersDataTable = ({
  teachers,
  total,
  isLoading,
  isFetching,
  isError,
  onRetry,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  rowSelection,
  onRowSelectionChange,
  search,
  onSearchChange,
  onResetSearch,
  hasFilters,
  onCreateClick,
  onEditClick,
  onViewClick,
  onDeleteClick,
  onManageTimetableClick,
}: TeachersDataTableProps) => {
  const ids = useId();
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>({});

  const columns = useMemo(
    () =>
      buildTeacherColumns({
        onViewClick,
        onEditClick,
        onDeleteClick,
        onManageTimetableClick,
      }),
    [onDeleteClick, onEditClick, onManageTimetableClick, onViewClick]
  );

  const table = useTable({
    features: listTableFeatures,
    columns,
    // Placeholders on a first read, and still the *real* header: it is rendered
    // from the real column definitions, so the loading state cannot promise a
    // column the table does not have.
    data: isLoading || !teachers ? NO_ROWS : teachers,
    getRowId: (row) => row.id,
    rowCount: total,
    manualPagination: true,
    manualSorting: true,
    state: { columnVisibility, pagination, rowSelection, sorting },
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange,
    onRowSelectionChange,
    onSortingChange,
  });

  return (
    <div className="flex flex-col gap-3">
      <TeachersToolbar
        hasFilters={hasFilters}
        ids={ids}
        onResetSearch={onResetSearch}
        onSearchChange={onSearchChange}
        search={search}
        table={table}
      />

      <DataTableFrame
        caption={buildCaption({
          hasFilters,
          isLoading,
          pageIndex: table.state.pagination.pageIndex,
          pageCount: table.getPageCount(),
          total,
        })}
        emptyContent={
          <NoTeachersRow
            hasFilters={hasFilters}
            onCreate={onCreateClick}
            onResetSearch={onResetSearch}
          />
        }
        errorContent={<TeachersErrorPanel onRetry={onRetry} />}
        isError={isError}
        isFetching={isFetching}
        isLoading={isLoading}
        table={table}
      />

      {!isError && (
        <DataTablePagination
          id={ids}
          noun="teacher"
          pageSizes={TEACHER_PAGE_SIZES}
          table={table}
          total={total}
        />
      )}
    </div>
  );
};
