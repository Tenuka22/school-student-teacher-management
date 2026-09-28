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
import type { Column, ReactTable, RowData } from "@tanstack/react-table";
import type * as React from "react";

import type { listTableFeatures } from "./list-table-features";

/**
 * The frame every list table in this app is built in: a caption that names the
 * table and its slice, a real header, and a body that is one of four different
 * things depending on what is true.
 *
 * ## Why the four states are in here and not in each surface
 *
 * Loading, failed, filtered-empty and empty are four different facts. Rendered
 * loosely they collapse into one, and a request that 500s then reads "No records
 * yet" — a sentence about the school that is false, on a screen whose whole job is
 * to describe the school. So a surface passes its own words for the empty states and
 * gets the loading and failed ones for free, because those two are the same
 * everywhere and only ever were accidentally different.
 *
 * The loading state is a **real table with placeholder cells**, not a stack of grey
 * bars, because the header is rendered from the real column definitions: a loading
 * state that promises seven columns and then delivers six is the defect this
 * arrangement exists to prevent.
 *
 * ## Why the table type is not generic over its features
 *
 * It is typed against `listTableFeatures` — one concrete feature set for every list
 * in the app. A table typed as `ReactTable<TFeatures, TData>` with an unresolved
 * `TFeatures` exposes none of the feature APIs at all, because it cannot know
 * whether sorting or paging is one of them: `getIsSorted` and `getPageCount` simply
 * do not exist on that type. The row type stays generic, which is the part that
 * genuinely varies.
 */
export interface DataTableFrameProps<TData extends RowData> {
  table: ReactTable<typeof listTableFeatures, TData>;
  /** The table's accessible name, and where the slice on screen is announced. */
  caption: string;
  /** First read: no data at all, so the body is placeholders. */
  isLoading?: boolean;
  /** A refetch over rows already on screen. Announced, not hidden. */
  isFetching?: boolean;
  /** A failed read. Replaces the table entirely: a failure is not an empty list. */
  isError?: boolean;
  /** What to offer when the request failed. Usually a retry button. */
  errorContent?: React.ReactNode;
  /** What to show when there are no rows. Two surfaces-worth of words, per list. */
  emptyContent?: React.ReactNode;
  /** Placeholder rows on a first read, at this table's row height. */
  skeletonRows?: number;
  /**
   * Optional group headings, positioned by **row index in the body**.
   *
   * The attendance register groups the roll by highest qualification; this is how
   * a table says so. Off by default, and a list with no grouping passes nothing,
   * so the lists that do not want a second shape never pay for one.
   */
  rowGroups?: { startsAt: number; label: string; count?: number }[];
}

const DEFAULT_SKELETON_ROWS = 8;

/**
 * `aria-sort` on the `<th>`, which is the only element allowed to carry it, and
 * only where the column can actually be sorted.
 *
 * A column that cannot be sorted is not "sorted by nothing" — it is not sorted at
 * all, and `none` would tell a screen-reader user the table has an order they can
 * change. So the attribute is absent for those columns.
 *
 * Generic in the column's value type because each accessor column has its own, and
 * none of them is the `unknown` a non-generic parameter would ask for.
 */
/* oxlint-disable react-doctor/only-export-components -- `ariaSortFor` is a pure function beside the <th> it decorates */
export const ariaSortFor = <TData extends RowData, TValue>(
  candidate: Column<typeof listTableFeatures, TData, TValue>
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

const SkeletonRows = ({
  columnCount,
  rows,
}: {
  columnCount: number;
  rows: number;
}) => (
  <>
    {Array.from({ length: rows }, (_unused, row) => (
      // The row index is the identity here on purpose: these are placeholders that
      // are never reordered, keyed or diffed.
      // oxlint-disable-next-line react/no-array-index-key -- static placeholder rows
      <TableRow key={`skeleton-row-${row}`} aria-hidden="true">
        {Array.from({ length: columnCount }, (_placeholder, cell) => (
          // oxlint-disable-next-line react/no-array-index-key -- static placeholder cells
          <TableCell key={`skeleton-cell-${row}-${cell}`}>
            <Skeleton aria-hidden="true" className="h-4 w-full max-w-32" />
          </TableCell>
        ))}
      </TableRow>
    ))}
  </>
);

export const DataTableFrame = <TData extends RowData>({
  table,
  caption,
  isLoading = false,
  isFetching = false,
  isError = false,
  errorContent,
  emptyContent,
  skeletonRows = DEFAULT_SKELETON_ROWS,
  rowGroups,
}: DataTableFrameProps<TData>) => {
  if (isError) {
    return errorContent;
  }

  const { rows } = table.getRowModel();
  const columnCount = table.getVisibleLeafColumns().length;

  /**
   * The body, as one of three things.
   *
   * An if-chain rather than a nested ternary in the markup, because the three are
   * three different screens and a reader should see all three side by side.
   */
  const renderBody = (): React.ReactNode => {
    if (isLoading) {
      return <SkeletonRows columnCount={columnCount} rows={skeletonRows} />;
    }

    if (rows.length === 0) {
      return (
        <TableRow className="hover:bg-transparent">
          <TableCell className="p-0" colSpan={columnCount}>
            {emptyContent}
          </TableCell>
        </TableRow>
      );
    }

    /**
     * The body, with an optional group header before the first row of each group.
     *
     * `rowGroups` is keyed on the **row index within the body**, not on a data
     * value, because the frame cannot know what a group means — "BEd" and
     * "Postgraduate Diploma" are the same shape to it. The caller decides the
     * grouping and says where the boundaries are; the frame only draws the rule
     * and the label. That is why it takes indices and not a key: a key would have
     * to be compared against every row to find its neighbours, and a caller that
     * got the comparison wrong would merge two groups silently.
     */
    const renderedRows: React.ReactNode[] = [];
    /**
     * `startsAt` -> the group starting at that row index, built once.
     *
     * A `find` per row is O(rows x groups), and the frame renders every row on
     * every keystroke that changes the data: a register of sixty teachers in five
     * qualification bands is sixty searches sixty times. Group starts are unique by
     * construction, so a Map is exact here rather than merely faster.
     */
    const groupAtRow = new Map<number, NonNullable<typeof rowGroups>[number]>();
    for (const group of rowGroups ?? []) {
      groupAtRow.set(group.startsAt, group);
    }
    for (const [index, row] of rows.entries()) {
      const group = groupAtRow.get(index);
      if (group) {
        renderedRows.push(
          <TableRow
            className="bg-muted/40 hover:bg-muted/40"
            key={`group-${group.label}`}
          >
            {/*
              A `<th scope="rowgroup">` spanning the table, not a `<td>`: a screen
              reader announcing 8 cells and then "BEd" would present the group name
              as if it belonged to one column, and the whole point of grouping is
              that the name applies to every column beneath it.
            */}
            <TableCell
              className="text-foreground font-heading py-1.5 text-xs font-medium"
              colSpan={columnCount}
            >
              {group.label}
              {typeof group.count === "number" ? (
                <span className="text-muted-foreground ml-2 font-normal tabular-nums">
                  {group.count}
                </span>
              ) : null}
            </TableCell>
          </TableRow>
        );
      }
      renderedRows.push(
        <TableRow
          data-state={row.getIsSelected() ? "selected" : undefined}
          key={row.id}
        >
          {row.getVisibleCells().map((cell) => (
            <TableCell key={cell.id}>
              <table.FlexRender cell={cell} />
            </TableCell>
          ))}
        </TableRow>
      );
    }

    return renderedRows;
  };

  return (
    <div className="border-primary/14 bg-card overflow-hidden border">
      <Table>
        {/*
          A `<caption>`, not an `aria-label`: the caption travels with the table
          when it is navigated cell by cell, which is the difference between "50" and
          "50 of 340 accounts". It is visually hidden because a visible caption above
          a dense records table is a second heading competing with the page's.
        */}
        <TableCaption>{caption}</TableCaption>
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
  );
};
