import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
} from "@tabler/icons-react";
import type { ReactTable, RowData } from "@tanstack/react-table";

import type { listTableFeatures } from "./list-table-features";

/** The slice of a list on screen, said in words as well as in buttons. */
const rangeText = (
  total: number,
  first: number,
  last: number,
  noun: string
) => {
  if (total === 0) {
    return `No ${noun}`;
  }

  return `Showing ${first}–${last} of ${total} ${
    total === 1 ? noun : `${noun}s`
  }`;
};

/**
 * The page controls, which say exactly which slice of the list is on screen.
 *
 * The count is stated in words as well as in buttons, because a list that stops
 * silently at a cap reads as complete: the teachers list used to show every
 * teacher and the accounts list used to stop at 200 rows with nothing to indicate
 * it, and an administrator managing a larger College saw a list that looked
 * finished.
 *
 * The page size is a select rather than a fixed number, because "50" chosen by the
 * code is a decision nobody made and nobody can change. It writes
 * `pageIndex: 0` in the same call as the new size, because a new size re-numbers
 * every page and page 6 of fifty rows is not page 6 of ten.
 */
export const DataTablePagination = <TData extends RowData>({
  id,
  noun,
  pageSizes,
  selectedCount = 0,
  table,
  total,
}: {
  /** Namespaced per table by the caller, so two tables on a page do not collide. */
  id: string;
  /** What one row is called, for the count: "teacher", "account", "loan". */
  noun: string;
  pageSizes: readonly number[];
  selectedCount?: number;
  table: ReactTable<typeof listTableFeatures, TData>;
  /** The server's total for the filters in force, which is not the row count. */
  total: number;
}) => {
  const { pageIndex, pageSize } = table.state.pagination;
  const pageCount = table.getPageCount();
  const first = total === 0 ? 0 : pageIndex * pageSize + 1;
  const last = Math.min((pageIndex + 1) * pageSize, total);

  return (
    <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-xs">
      <p aria-live="polite">
        {rangeText(total, first, last, noun)}
        {selectedCount > 0 && ` · ${selectedCount} selected`}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="font-semibold" htmlFor={`${id}-page-size`}>
            Rows per page
          </label>
          <Select
            value={String(pageSize)}
            onValueChange={(value: string | null) => {
              if (value) {
                table.setPagination({ pageIndex: 0, pageSize: Number(value) });
              }
            }}
          >
            <SelectTrigger className="w-20" id={`${id}-page-size`} size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {pageSizes.map((size) => (
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
