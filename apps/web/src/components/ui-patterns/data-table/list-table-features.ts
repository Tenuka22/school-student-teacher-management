import {
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";

/**
 * What a list table in this app can do, and — as much as what it leaves out — why.
 *
 * v9 is feature-based: a behaviour exists only if it is named here, and anything
 * left out is tree-shaken. So this list is a set of claims about every list table,
 * and the shared frame, pagination bar and column header are typed against it
 * rather than against a free `TFeatures` parameter — a table typed generically does
 * not expose `getIsSorted` or `getPageCount` at all, because it cannot know whether
 * sorting is one of its features.
 *
 * - `rowSortingFeature` and `rowPaginationFeature` — **no `sortedRowModel` and no
 *   `paginatedRowModel`**, and every list sets `manualSorting` and
 *   `manualPagination` with a `rowCount`. The order and the page are the server's:
 *   a browser-side sort of the current page would order fifty of nine hundred
 *   records and call the answer the whole list.
 *
 *   In v9 `manualSorting` means *the caller sorts* — `getRowModel` hands back the
 *   rows it was given whenever `manualSorting` is set or no `sortedRowModel` is
 *   registered — so the flag is what keeps a server-ordered list from being
 *   re-ordered here, and it is also what keeps `getIsSorted` (which the header
 *   and `aria-sort` are typed against) available at all. The attendance register
 *   is the one list whose order is not the server's: it holds one day of the
 *   whole roll and has no page to mis-order, so it sorts its own rows before it
 *   hands them over, in `attendance-register-table.tsx`.
 * - `columnVisibilityFeature` — the "Columns" menu. This one *is* browser-side,
 *   because which columns a reader can see is a property of their screen and not of
 *   the school.
 * - `rowSelectionFeature` — the checkboxes. A list with no bulk action registers it
 *   and never uses it: an unused slice costs nothing, and a shared frame that had
 *   to work both with and without selection is a frame with two shapes.
 *
 * There is no `columnFilteringFeature` anywhere. Search and filters on a list are
 * ordinary inputs that end up in the query key and in the URL, not column filter
 * state: a filter the table owns but the query does not would filter nothing, and
 * one the query owns but the table does not would leave the table showing rows the
 * server has already excluded.
 */
export const listTableFeatures = tableFeatures({
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  /*
   * A column's name, as the Columns menu and the sort headers say it. Declared here
   * so `columnDef.meta` is typed — the slot is a phantom: the value is stripped at
   * runtime and only its type is used.
   */
  columnMeta: {} as { label: string },
});

/** The feature set every list table in this app is built on. */
export type ListTableFeatures = typeof listTableFeatures;
