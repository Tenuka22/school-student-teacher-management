import {
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";

/**
 * What the accounts table opts into, and — as much as what it leaves out — why.
 *
 * v9 is feature-based: a behaviour exists only if it is named here, and anything
 * left out is tree-shaken. So this list is a set of claims about the table.
 *
 * - `rowSortingFeature` — the four sortable headers. **No `sortedRowModel`**, and
 *   `manualSorting: true` in the table options: the order comes from the server
 *   (`listAccounts`), because a browser-side sort of the current page would
 *   order fifty of nine hundred accounts and call the result the whole list.
 * - `rowPaginationFeature` — for the same reason **no `paginatedRowModel`**; the
 *   table is handed one page plus the total, which is what `rowCount` is for.
 * - `columnVisibilityFeature` — the "Columns" menu. This one *is* browser-side,
 *   because which columns an administrator can see is a property of their
 *   screen, not of the College.
 * - `rowSelectionFeature` — the checkboxes, which exist for the bulk ban in the
 *   toolbar. A selection with nothing to do with it is a control that reliably
 *   does nothing, which is worse than no checkbox.
 *
 * There is no `columnFilteringFeature` either. The search box and the two filter
 * selects are ordinary inputs that end up in the query key (see
 * `useAdminUsers`), not column filter state: a filter the table owns but the
 * query does not would filter nothing, and one the query owns but the table does
 * not would leave the table showing rows the server has already excluded.
 */
export const usersTableFeatures = tableFeatures({
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  /*
   * A column's name, as the Columns menu and the sort buttons say it. Declared
   * here so `columnDef.meta` is typed — the slot is a phantom: the value is
   * stripped at runtime and only its type is used.
   */
  columnMeta: {} as { label: string },
});

/**
 * The first generic argument to `createColumnHelper`, `Column` and `Table`.
 *
 * Passing it is what tells a column which feature APIs exist, so `column.getCanSort()`
 * is not a type error on a table that has no sorting.
 */
export type UsersTableFeatures = typeof usersTableFeatures;
