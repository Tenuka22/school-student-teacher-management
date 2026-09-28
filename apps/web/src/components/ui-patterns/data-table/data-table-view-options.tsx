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
import { IconSettings } from "@tabler/icons-react";
import type { ReactTable, RowData } from "@tanstack/react-table";

import type { listTableFeatures } from "./list-table-features";

/**
 * The Columns menu: which columns are on screen.
 *
 * The one piece of table state that is **the client's own** and never reaches the
 * server, because which columns an administrator can see is a property of their
 * screen and not of the school. It is deliberately not in the URL: a shared link
 * that also hid the status column would show a different table to the person it
 * was sent to, and `?columns=name,email` is a param nobody reads.
 *
 * The labels come from each column's `meta.label` rather than its id, for the same
 * reason the sort headers take a label: a menu offering `createdAt` and
 * `employmentStatus` is a list of implementation details wearing a menu's clothes.
 * A column that hides a value somebody needs should be hidden by somebody who
 * chose to, not by a default.
 */
export const DataTableViewOptions = <TData extends RowData>({
  table,
}: {
  table: ReactTable<typeof listTableFeatures, TData>;
}) => {
  // One pass, then one map: a `.filter().map()` chain walks the columns twice.
  const hideableColumns = table
    .getAllColumns()
    .filter((column) => column.getCanHide());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" aria-label="Choose which columns to show" />
        }
      >
        <IconSettings aria-hidden="true" />
        Columns
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {/*
          The label and the items are one `DropdownMenuGroup`: base-ui's group
          label is a *group* part and throws `MenuGroupContext is missing` when it
          is rendered straight into the popup.
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
  );
};
