"use client"

import * as React from "react"
import { cn } from "cn"

/**
 * A records table.
 *
 * The wrapper scrolls horizontally and the table never overflows its column:
 * the product constraint is "tables scroll rather than overflow", and this is
 * where that is enforced — a `min-w-` on the table or a `table-fixed` here
 * would push the last column off the page instead.
 *
 * Two props decide how the frame behaves:
 *
 * - `stickyHeader` keeps the `<thead>` row pinned while the body scrolls. The
 *   header carries an opaque background of its own, because a translucent one
 *   would let the rows read through the column labels.
 * - `striped` bands alternate rows. It is opt-in: a 200-row ledger reads better
 *   unbanded, and a 12-row queue reads better banded.
 *
 * `hidden md:table-cell` on a head or cell is the supported way to drop a
 * column on a narrow window, and it works because the wrapper scrolls instead of
 * forcing a minimum width.
 */
function Table({
  className,
  stickyHeader = false,
  ...props
}: React.ComponentProps<"table"> & { stickyHeader?: boolean }) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full max-w-full overflow-x-auto overscroll-x-contain"
    >
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom text-xs tabular-nums",
          stickyHeader &&
            "[&_[data-slot=table-header]]:[&_tr]:sticky [&_[data-slot=table-header]]:[&_tr]:top-0 [&_[data-slot=table-header]]:[&_tr]:z-20 [&_[data-slot=table-header]]:[&_tr]:bg-background [&_[data-slot=table-header]]:[&_th]:bg-background",
          className
        )}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

/**
 * The row group.
 *
 * `striped` alternates a `--muted` wash on odd rows. The wash is never the only
 * cue: every row keeps its `border-b`, so the banding reinforces a structure
 * that is already legible without colour.
 */
function TableBody({
  className,
  striped = false,
  ...props
}: React.ComponentProps<"tbody"> & { striped?: boolean }) {
  return (
    <tbody
      data-slot="table-body"
      className={cn(
        "[&_tr:last-child]:border-0",
        striped && "[&>tr:nth-child(odd)]:bg-muted/40",
        className
      )}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * One record.
 *
 * `hover` and `focus-within` get the same fill, because in this app a record is
 * reached by keyboard as often as by pointer — tabbing into a row's action
 * button must look like pointing at the row, or the keyboard user has no idea
 * which record they are about to act on.
 */
function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 focus-within:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

/**
 * A column header.
 *
 * `scope="col"` by default. Without it, a screen reader reading a cell gives no
 * indication of which column the value belongs to, which in a nine-column
 * register is the difference between "42" and "42 borrowed units". Pass
 * `scope="row"` for the header cell of a row, and `colgroup`/`rowgroup` when a
 * header spans several columns.
 */
function TableHead({
  className,
  scope = "col",
  numeric = false,
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      scope={scope}
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        numeric && "text-right",
        className
      )}
      {...props}
    />
  )
}

/**
 * A cell.
 *
 * `numeric` right-aligns and keeps digits on one set of widths, so a column of
 * quantities lines up on the decimal instead of on whatever the proportional
 * figures decide. The table also sets `tabular-nums` globally, which is what
 * does the actual work where the face has the feature.
 *
 * `as="th"` with a `scope` turns a cell into a row header, which is how a
 * two-column label/value table — a timetabled teacher's details, a leave
 * request's summary — keeps its row labels attached to their values for anyone
 * reading it in a linear order.
 */
function TableCell({
  className,
  as,
  scope,
  numeric = false,
  ...props
}: React.ComponentProps<"td"> & {
  as?: "td" | "th"
  scope?: React.ComponentProps<"th">["scope"]
  numeric?: boolean
}) {
  const Component = as ?? "td"
  return (
    <Component
      data-slot="table-cell"
      scope={scope}
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        numeric && "text-right tabular-nums",
        className
      )}
      {...props}
    />
  )
}

/**
 * The table's name.
 *
 * A `<caption>` is the only element that can name a table for a screen reader,
 * and it has to be the table's *first* child to be announced. It is visually
 * hidden by default: in a dense records tool a visible caption above every table
 * is a second heading competing with the page's, and the name belongs to the
 * accessibility tree rather than the layout. Pass `visuallyHidden={false}` where
 * a visible label is genuinely wanted.
 */
function TableCaption({
  className,
  visuallyHidden = true,
  ...props
}: React.ComponentProps<"caption"> & { visuallyHidden?: boolean }) {
  return (
    <caption
      data-slot="table-caption"
      className={cn(
        visuallyHidden
          ? "sr-only"
          : "mt-4 text-xs text-muted-foreground text-balance",
        className
      )}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
