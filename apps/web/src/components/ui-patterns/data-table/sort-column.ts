import type { CellData, Column, RowData } from "@tanstack/react-table";

import type { ListTableFeatures } from "./list-table-features";

/**
 * What a header does with the direction it was handed — the other half of
 * `DataTableColumnHeader`, and its own module because that file is a component
 * and Fast Refresh wants a file of components to hold only components.
 *
 * Two of the menu's three choices are expressible as `toggleSorting`, and the
 * third is not. Given an explicit `desc`, TanStack's `column_toggleSorting`
 * sets `hasManualValue` and drops the branch that ever removes a sort — so
 * `null`, which call sites turn into `direction === "desc"`, came out as
 * *ascending* with the glyph still on, and "Back to the default order" quietly
 * sorted instead of restoring anything. `clearSorting` is the branch that
 * empties the state, and an empty state is the only way back to the order the
 * caller rather than the table considers default.
 *
 * Every list built on `listTableFeatures` wires `onSortingChange`, so that
 * cleared state reaches the page's own `sort`/`dir` writer — or its local
 * `SortingState` — and lands on the default the writer already knows.
 */
export const sortColumn = <
  TData extends RowData,
  TValue extends CellData = CellData,
>(
  column: Column<ListTableFeatures, TData, TValue>,
  direction: "asc" | "desc" | null
): void => {
  if (direction === null) {
    column.clearSorting();
    return;
  }

  column.toggleSorting(direction === "desc");
};
