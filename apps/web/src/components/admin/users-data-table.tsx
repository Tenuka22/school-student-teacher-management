import {
  ALL_ROLES,
  roleLabel,
} from "@school-student-teacher-management/auth/roles";
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
import { IconBan, IconCircleCheck, IconX } from "@tabler/icons-react";
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

import { buildUserColumns } from "./users-columns";
import { USERS_PAGE_SIZES, USERS_STATUS_OPTIONS } from "./users-search";
import type { AccountRow, RoleFilter, StatusFilter } from "./users-types";
import { ANY_FILTER } from "./users-types";

/**
 * The empty page, at module scope.
 *
 * Not built in a render body: a new `[]` on every render is a new `data` reference,
 * and the table invalidates its data-dependent models when `data` changes — so a
 * first read would rebuild the row model on every frame.
 */
const NO_ROWS: AccountRow[] = [];

/** The type of the table every helper here takes, as one name. */
type AccountsTable = ReactTable<typeof listTableFeatures, AccountRow>;

export interface UsersDataTableProps {
  /**
   * The page of accounts, or nothing yet.
   *
   * Optional because the route's `loader` is what fetches them and a client-side
   * navigation can render this table before the new page has arrived — the previous
   * page is on screen throughout, which is the whole point of `placeholderData` in
   * the query.
   */
  accounts: AccountRow[] | undefined;
  /** The server's total for the filters in force, which is not the row count. */
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
 * The table's accessible name, and the one place the paging is announced.
 *
 * Four sentences, because there are four truths: still loading, nothing at all,
 * nothing matching, and the ordinary case. The one that matters most is the first
 * — a caption that says "No accounts" while the first request is still in flight is
 * a statement about the College that arrived before the College did.
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
 * A filtered-empty state says so in those words and offers the control that clears
 * the filter; a genuinely empty College says that instead, and offers nothing,
 * because there is no action on this page that would create an account — those are
 * issued by an administrator, from a staff record.
 */
const NoAccountsRow = ({
  hasFilters,
  onReset,
}: {
  hasFilters: boolean;
  onReset: () => void;
}) => (
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
 * A request that failed, which is not an empty list.
 *
 * Says what is known (nothing has been changed), what is not (the list itself), and
 * offers the one thing that can be done about it. A retry button inside the failure
 * message is the whole reason a failure message is worth rendering.
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

/**
 * Search, the two filters, and the column menu.
 *
 * The search box is the shared one, which is also where the debounce lives: the
 * box takes the **draft** and reports keystrokes, not the committed `search` prop,
 * because the box must not repaint from the committed value while the user is
 * still typing, or the term they are halfway through replacing disappears under
 * the caret.
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
}) => (
  <div className="flex flex-wrap items-end gap-3">
    <DataTableSearchField
      id={`${ids}-search`}
      onCommit={onSearchChange}
      placeholder="Name, email or username"
      value={search}
    />

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

    <DataTableViewOptions table={table} />
  </div>
);

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
 * `useAdminUsers`' state and in the URL, and the table is handed two `manual*` flags,
 * one page of rows and a total. The table owns exactly two things — which columns are
 * on screen, and which rows are ticked.
 *
 * That split is why there is no filter function and no sort function anywhere here. A
 * filter applied in the browser to a page of fifty would report "1 result" for a
 * search that matched two hundred accounts, and a sort applied here would order
 * those fifty and call the order the register's. `getRowId` returns the account id,
 * so a ticked row is the same row on the next render and a `<tr key>` is stable
 * across a page change.
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
    features: listTableFeatures,
    columns,
    // Placeholders on a first read, and still the *real* header: it is rendered from
    // the real column definitions, so the loading state cannot promise a column the
    // table does not have.
    data: isLoading || !accounts ? NO_ROWS : accounts,
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

  const selectedAccounts = table
    .getSelectedRowModel()
    .rows.map((row) => row.original);

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

      <DataTableFrame
        caption={buildCaption({
          hasFilters,
          isLoading,
          pageIndex: table.state.pagination.pageIndex,
          pageCount: table.getPageCount(),
          total,
        })}
        emptyContent={
          <NoAccountsRow hasFilters={hasFilters} onReset={onResetFilters} />
        }
        errorContent={<AccountsErrorPanel onRetry={onRetry} />}
        isError={isError}
        isFetching={isFetching}
        isLoading={isLoading}
        table={table}
      />

      {!isError && (
        <DataTablePagination
          id={ids}
          noun="account"
          pageSizes={USERS_PAGE_SIZES}
          selectedCount={selectedAccounts.length}
          table={table}
          total={total}
        />
      )}
    </div>
  );
};
