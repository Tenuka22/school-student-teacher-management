import {
  ALL_ROLES,
  roleLabel,
} from "@school-student-teacher-management/auth/roles";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@school-student-teacher-management/ui/components/dropdown-menu";
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@school-student-teacher-management/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import {
  IconBan,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconCircleCheck,
  IconSearch,
  IconSettings,
  IconX,
} from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import type {
  Column,
  ColumnVisibilityState,
  OnChangeFn,
  PaginationState,
  ReactTable,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import { useEffect, useEffectEvent, useId, useMemo, useState } from "react";
import type * as React from "react";

import { buildUserColumns } from "./users-columns";
import { USERS_PAGE_SIZES, USERS_STATUS_OPTIONS } from "./users-search";
import { usersTableFeatures } from "./users-table-features";
import type { AccountRow, RoleFilter, StatusFilter } from "./users-types";
import { ANY_FILTER } from "./users-types";

/**
 * Long enough that a fast typist is not firing a request per character, short
 * enough that the list feels like it answered.
 *
 * The reason is the network, and it is the same reason the inventory register
 * debounces: `onSearchChange` writes `?q=`, the query key changes, the route's
 * `loader` re-runs and `listAccounts` is asked again. Nothing here sequences
 * those requests, so an earlier response can land after a later one and repaint
 * the list with the rows for a term the user has already finished typing.
 * Holding the term for 300 ms collapses a typed word into one request and
 * removes the race with it.
 */
const SEARCH_DEBOUNCE_MS = 300;

/** Rows of placeholders on a first read, at this table's row height. */
const SKELETON_ROWS = 8;

/**
 * The empty page, at module scope.
 *
 * Not built in a render body: a new `[]` on every render is a new `data`
 * reference, and the table invalidates its data-dependent models when `data`
 * changes — so a first read would rebuild the row model on every frame.
 */
const NO_ROWS: AccountRow[] = [];

/** The type of the table every helper here takes, as one name. */
type AccountsTable = ReactTable<typeof usersTableFeatures, AccountRow>;

export interface UsersDataTableProps {
  /**
   * The page of accounts, or nothing yet.
   *
   * Optional because the route's `loader` is what fetches them and a client-side
   * navigation can render this table before the new page has arrived — the
   * previous page is on screen throughout, which is the whole point of
   * `placeholderData` in the query.
   */
  accounts: AccountRow[] | undefined;
  /** The server's total for the filters in force, which is not the row count. */
  total: number;
  /** First read: nothing on screen at all, so the body is placeholders. */
  isLoading: boolean;
  /** A refetch over data already on screen — a page change, a filter, a ban. */
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
  role: RoleFilter;
  onRoleChange: (value: RoleFilter) => void;
  status: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  hasFilters: boolean;
  onResetFilters: () => void;
  isBanPending: boolean;
  onBan: (user: AccountRow, banned: boolean) => void;
  onRevokeSessions: (user: AccountRow) => void;
  onBulkBan: (accounts: AccountRow[], banned: boolean) => void;
}

/**
 * `aria-sort` on the `<th>`, which is the only element allowed to carry it, and
 * only where the column can actually be sorted.
 *
 * A column that cannot be sorted is not "sorted by nothing" — it is not sorted
 * at all, and `none` would tell a screen-reader user the table has an order they
 * can change. So the attribute is absent for those columns.
 *
 * Generic in the column's value type because each accessor column has its own —
 * `Column<…, string>` for the name, `Column<…, string | null>` for the login —
 * and none of them is the `unknown` a non-generic parameter would ask for.
 */
const ariaSortFor = <TValue,>(
  candidate: Column<typeof usersTableFeatures, AccountRow, TValue>
): "ascending" | "descending" | "none" | undefined => {
  if (!candidate.getCanSort()) {
    return undefined;
  }

  const sorted = candidate.getIsSorted();

  if (sorted === "asc") {
    return "ascending";
  }

  if (sorted === "desc") {
    return "descending";
  }

  return "none";
};

/**
 * The table's accessible name, and the one place the paging is announced.
 *
 * A `<caption>`, not an `aria-label`: the caption travels with the table when it
 * is navigated cell by cell, which is the difference between "50" and "50 of 340
 * accounts". It is visually hidden because a visible caption above this table
 * would be a second heading competing with the page's.
 *
 * Four sentences, because there are four truths: still loading, nothing at all,
 * nothing matching, and the ordinary case. The one that matters most is the
 * first — a caption that says "No accounts" while the first request is still in
 * flight is a statement about the College that arrived before the College did.
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
    return "Accounts, loading. The number of accounts is not known yet.";
  }

  const accounts = total === 1 ? "account" : "accounts";
  const filtered = hasFilters
    ? ` matching the filters on screen (${total} in all)`
    : "";

  if (total === 0) {
    return `No accounts${filtered}.`;
  }

  return `${total} ${accounts}${filtered}. Page ${pageIndex + 1} of ${pageCount}.`;
};

/**
 * The two ends of the list, when there are none.
 *
 * A filtered-empty state says so in those words and offers the control that
 * clears the filter; a genuinely empty College says that instead, and offers
 * nothing, because there is no action on this page that would create an account
 * — those are issued by an administrator, from a staff record.
 */
const NoAccountsRow: React.FC<{
  hasFilters: boolean;
  onReset: () => void;
}> = ({ hasFilters, onReset }) => (
  <div className="p-6">
    <Empty>
      <EmptyHeader>
        <EmptyTitle>
          {hasFilters ? "No accounts match" : "No accounts yet"}
        </EmptyTitle>
        <EmptyDescription>
          {hasFilters
            ? "Nothing on record matches the search and filters above. Clearing them brings the whole list back."
            : "Nobody has been given an account that can sign in. Office staff accounts are issued by an administrator."}
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
  </div>
);

/**
 * Placeholder rows, in a real table.
 *
 * A stack of grey bars outside the table would collapse the page from a
 * seven-column register to a stack of lines and expand it back again when the
 * rows landed. The header above is the real one, so only the cells are
 * placeholders and the data lands into space that was already reserved.
 */
const SkeletonRows: React.FC<{ columnCount: number }> = ({ columnCount }) => (
  <>
    {Array.from({ length: SKELETON_ROWS }, (_row, row) => (
      // The row index is the identity here on purpose: these are placeholders
      // that are never reordered, keyed or diffed.
      // oxlint-disable-next-line react/no-array-index-key -- static placeholder rows
      <TableRow key={`skeleton-row-${row}`} aria-hidden="true">
        {Array.from({ length: columnCount }, (_placeholder, cell) => (
          // oxlint-disable-next-line react/no-array-index-key -- static placeholder cells
          <TableCell key={`skeleton-cell-${row}-${cell}`}>
            <Skeleton className="h-4 w-full max-w-32" />
          </TableCell>
        ))}
      </TableRow>
    ))}
  </>
);

/**
 * A request that failed, which is not an empty list.
 *
 * Says what is known (nothing has been changed), what is not (the list itself),
 * and offers the one thing that can be done about it. A retry button inside the
 * failure message is the whole reason a failure message is worth rendering.
 */
const AccountsErrorPanel = ({ onRetry }: { onRetry: () => void }) => (
  <div className="border-destructive/30 bg-card border px-[22px] py-4">
    <p className="text-destructive text-sm font-bold">
      The account list could not be loaded
    </p>
    <p className="text-primary/65 mt-1 text-[13px]">
      The server did not return the account list. Nothing has been changed — try
      again.
    </p>
    <Button className="mt-3" variant="outline" size="sm" onClick={onRetry}>
      Try again
    </Button>
  </div>
);

/** The slice of accounts on screen, said in words as well as in buttons. */
const rangeText = (total: number, first: number, last: number): string => {
  if (total === 0) {
    return "No accounts";
  }

  const accounts = total === 1 ? "account" : "accounts";

  return `Showing ${first}–${last} of ${total} ${accounts}`;
};

/**
 * The page controls, which say exactly which slice of the accounts is on screen.
 *
 * The table used to stop at 200 rows with nothing to indicate it, so an
 * administrator managing a larger College saw a list that looked complete. The
 * count is therefore stated in words as well as in buttons, and the page size is
 * a select rather than a fixed number, because "50" chosen by the code is a
 * decision nobody made and nobody can change.
 */
const TableFooterBar = ({
  ids,
  selectedCount,
  table,
  total,
}: {
  ids: string;
  selectedCount: number;
  table: AccountsTable;
  total: number;
}) => {
  const { pageIndex, pageSize } = table.state.pagination;
  const pageCount = table.getPageCount();
  const first = total === 0 ? 0 : pageIndex * pageSize + 1;
  const last = Math.min((pageIndex + 1) * pageSize, total);

  return (
    <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-xs">
      <p aria-live="polite">
        {rangeText(total, first, last)}
        {selectedCount > 0 && ` · ${selectedCount} selected`}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="font-semibold" htmlFor={`${ids}-page-size`}>
            Rows per page
          </label>
          <Select
            value={String(pageSize)}
            onValueChange={(value: string | null) => {
              if (value) {
                /*
                 * A new page size re-numbers every page, so the index goes back
                 * to the first: page 6 of fifty rows is not page 6 of ten. The
                 * value is written through the table's own callback rather than
                 * `table.setPageSize`, which would reset the page in a second
                 * write and re-render the list twice for one keystroke.
                 */
                table.setPagination({ pageIndex: 0, pageSize: Number(value) });
              }
            }}
          >
            <SelectTrigger className="w-20" id={`${ids}-page-size`} size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {USERS_PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <span className="font-semibold">
          Page {Math.min(pageIndex + 1, pageCount)} of {pageCount}
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="First page"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.firstPage()}
          >
            <IconChevronsLeft aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <IconChevronLeft aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <IconChevronRight aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Last page"
            disabled={!table.getCanLastPage()}
            onClick={() => table.lastPage()}
          >
            <IconChevronsRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * Search, the two filters, and the column menu.
 *
 * The search box takes the **draft** and reports keystrokes, not the committed
 * `search` prop, because the debounce lives here: the box must not repaint from
 * the committed value while the user is still typing, or the term they are
 * halfway through replacing disappears under the caret.
 */
const AccountsToolbar = ({
  hasFilters,
  ids,
  onResetFilters,
  onRoleChange,
  onSearchChange,
  onStatusChange,
  role,
  search,
  status,
  table,
}: {
  hasFilters: boolean;
  ids: string;
  onResetFilters: () => void;
  onRoleChange: (value: RoleFilter) => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: StatusFilter) => void;
  role: RoleFilter;
  search: string;
  status: StatusFilter;
  table: AccountsTable;
}) => {
  const [draft, setDraft] = useState(search);
  const [emitted, setEmitted] = useState(search);

  /*
   * Keep the box in step when the committed term changes from outside — the
   * "Clear filters" button, or anything else that resets the list. Done as a
   * render-time adjustment against the last value seen rather than in an effect,
   * because an effect would paint one frame with the old term in the box while
   * the list is already filtered by the new one: a search box showing something
   * the list is not filtered by looks exactly like a search that failed.
   */
  if (search !== emitted) {
    setEmitted(search);
    setDraft(search);
  }

  /**
   * `onSearchChange` is read through an effect event so the debounce timer is
   * not torn down and restarted on every re-render with a new callback
   * identity. Restarting on every render would mean the timer never fires on a
   * busy page — the search would stop working, intermittently.
   */
  const emit = useEffectEvent((next: string) => {
    onSearchChange(next);
  });

  useEffect(() => {
    if (draft === search) {
      return;
    }

    const timeout = setTimeout(() => emit(draft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [draft, search]);

  // One pass, then one map: a `.filter().map()` chain walks the columns twice.
  const hideableColumns = table
    .getAllColumns()
    .filter((column) => column.getCanHide());

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field className="min-w-[16rem] flex-1">
        <FieldLabel htmlFor={`${ids}-search`}>Search</FieldLabel>
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <IconSearch
              aria-hidden="true"
              className="text-muted-foreground size-4"
            />
          </InputGroupAddon>
          <InputGroupInput
            id={`${ids}-search`}
            type="search"
            placeholder="Name, email or username"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </InputGroup>
      </Field>

      <Field className="w-52">
        <FieldLabel htmlFor={`${ids}-role`}>Role</FieldLabel>
        <Select
          value={role}
          onValueChange={(value: string | null) => {
            onRoleChange((value ?? ANY_FILTER) as RoleFilter);
          }}
        >
          <SelectTrigger id={`${ids}-role`}>
            <SelectValue placeholder="Every role" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ANY_FILTER}>Every role</SelectItem>
              {ALL_ROLES.map((option) => (
                <SelectItem key={option} value={option}>
                  {roleLabel(option)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <Field className="w-56">
        <FieldLabel htmlFor={`${ids}-status`}>Status</FieldLabel>
        <Select
          value={status}
          onValueChange={(value: string | null) => {
            onStatusChange((value ?? ANY_FILTER) as StatusFilter);
          }}
        >
          <SelectTrigger id={`${ids}-status`}>
            <SelectValue placeholder="Any status" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ANY_FILTER}>Any status</SelectItem>
              {USERS_STATUS_OPTIONS.map((option) => (
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

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              aria-label="Choose which columns to show"
            />
          }
        >
          <IconSettings aria-hidden="true" />
          Columns
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/*
            The label and the items are one `DropdownMenuGroup`: base-ui's group
            label is a *group* part and throws `MenuGroupContext is missing` when
            it is rendered straight into the popup.
          */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {hideableColumns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(checked) => column.toggleVisibility(checked)}
              >
                {column.columnDef.meta?.label ?? column.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

/**
 * The selection bar, and the only reason the checkboxes exist.
 *
 * It takes the filter row's own line rather than adding one, so a ticked row is
 * always somewhere the eye already is, and the number of accounts about to be
 * banned is stated before the button that bans them.
 */
const SelectionBar = ({
  accounts,
  isPending,
  onBulkBan,
  onClear,
}: {
  accounts: AccountRow[];
  isPending: boolean;
  onBulkBan: (accounts: AccountRow[], banned: boolean) => void;
  onClear: () => void;
}) => (
  <div className="border-primary/25 bg-primary/5 flex flex-wrap items-center gap-3 border px-4 py-2.5">
    <p className="text-primary text-sm font-bold">
      {accounts.length} {accounts.length === 1 ? "account" : "accounts"}{" "}
      selected
    </p>
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="destructive"
        disabled={isPending}
        onClick={() => onBulkBan(accounts, true)}
      >
        <IconBan aria-hidden="true" />
        Ban selected
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => onBulkBan(accounts, false)}
      >
        <IconCircleCheck aria-hidden="true" />
        Unban selected
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear}>
        Clear selection
      </Button>
    </div>
    <p className="text-muted-foreground max-w-prose text-xs">
      Each account is asked for its own confirmation, and a ban that does not
      take is reported rather than counted. The institutional logins are refused
      by the server, so they are left alone.
    </p>
  </div>
);

/**
 * The accounts table.
 *
 * ## What is the server's and what is the table's
 *
 * Sorting, paging, searching and both filters are the **server's**: they live in
 * `useAdminUsers`' state and in the query key, and the table is handed two
 * `manual*` flags, one page of rows and a total. The table owns exactly two
 * things — which columns are on screen, and which rows are ticked.
 *
 * That split is why there is no filter function and no sort function anywhere in
 * this file. A filter applied in the browser to a page of fifty would report "1
 * result" for a search that matched two hundred accounts, and a sort applied
 * here would order those fifty and call the order the register's. `getRowId`
 * returns the account id, so a ticked row is the same row on the next render and
 * a `<tr key>` is stable across a page change.
 *
 * ## The four states
 *
 * Loading, failed, filtered-empty and empty are four different facts and are
 * rendered as four different things. A request that 500s used to render "No
 * accounts yet", which reads as a true statement about the College and invites a
 * deletion nobody meant.
 */
export const UsersDataTable = ({
  accounts,
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
  role,
  onRoleChange,
  status,
  onStatusChange,
  hasFilters,
  onResetFilters,
  isBanPending,
  onBan,
  onRevokeSessions,
  onBulkBan,
}: UsersDataTableProps) => {
  const ids = useId();
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>({});

  const columns = useMemo(
    () => buildUserColumns({ onBan, onRevokeSessions, isBanPending }),
    [isBanPending, onBan, onRevokeSessions]
  );

  const table = useTable({
    features: usersTableFeatures,
    columns,
    // Placeholders on a first read, and still the *real* header: it is rendered
    // from the real column definitions above, so the loading state cannot
    // promise a column the table does not have.
    data: isLoading || !accounts ? NO_ROWS : accounts,
    getRowId: (row) => row.id,
    /** The server's total, which is what the page count is calculated from. */
    rowCount: total,
    manualPagination: true,
    manualSorting: true,
    state: { columnVisibility, pagination, rowSelection, sorting },
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange,
    onRowSelectionChange,
    onSortingChange,
  });

  const { rows } = table.getRowModel();
  const columnCount = table.getVisibleLeafColumns().length;
  const selectedAccounts = table
    .getSelectedRowModel()
    .rows.map((row) => row.original);

  /**
   * The body, as one of three things.
   *
   * An if-chain rather than a nested ternary in the markup, because the three
   * are three *different screens* and a reader should be able to see all three
   * side by side: a table that is loading, a table with nothing in it, and a
   * table with accounts in it.
   */
  const renderBody = (): React.ReactNode => {
    if (isLoading) {
      return <SkeletonRows columnCount={columnCount} />;
    }

    if (rows.length === 0) {
      return (
        <TableRow className="hover:bg-transparent">
          <TableCell className="p-0" colSpan={columnCount}>
            <NoAccountsRow hasFilters={hasFilters} onReset={onResetFilters} />
          </TableCell>
        </TableRow>
      );
    }

    return rows.map((row) => (
      <TableRow
        key={row.id}
        data-state={row.getIsSelected() ? "selected" : undefined}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id}>
            <table.FlexRender cell={cell} />
          </TableCell>
        ))}
      </TableRow>
    ));
  };

  return (
    <div className="flex flex-col gap-3">
      <AccountsToolbar
        hasFilters={hasFilters}
        ids={ids}
        onResetFilters={onResetFilters}
        onRoleChange={onRoleChange}
        onSearchChange={onSearchChange}
        onStatusChange={onStatusChange}
        role={role}
        search={search}
        status={status}
        table={table}
      />

      {selectedAccounts.length > 0 && (
        <SelectionBar
          accounts={selectedAccounts}
          isPending={isBanPending}
          onBulkBan={onBulkBan}
          onClear={() => table.resetRowSelection(true)}
        />
      )}

      {isError ? (
        <AccountsErrorPanel onRetry={onRetry} />
      ) : (
        <div className="border-primary/14 bg-card overflow-hidden border">
          <Table>
            <TableCaption>
              {buildCaption({
                hasFilters,
                isLoading,
                pageIndex: table.state.pagination.pageIndex,
                pageCount: table.getPageCount(),
                total,
              })}
            </TableCaption>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow
                  key={headerGroup.id}
                  className="bg-primary hover:bg-primary border-none"
                >
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      aria-sort={ariaSortFor(header.column)}
                      className="text-accent h-11"
                    >
                      {header.isPlaceholder ? null : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody aria-busy={isFetching}>{renderBody()}</TableBody>
          </Table>
        </div>
      )}

      {!isError && (
        <TableFooterBar
          ids={ids}
          selectedCount={selectedAccounts.length}
          table={table}
          total={total}
        />
      )}
    </div>
  );
};
