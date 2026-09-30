"use client";

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
  IconArrowDown,
  IconArrowUp,
  IconArrowsSort,
} from "@tabler/icons-react";
import type * as React from "react";

/**
 * The table's frame: the column header, the two sort controls, and the
 * placeholder that reserves the same layout while the register is being read.
 *
 * ## Why these three live together
 *
 * `RegisterTableHeader` and `RegisterTableSkeleton` are one definition rather
 * than two, for the reason `RosterHead` / `RosterSkeleton` in
 * `teacher-management/teachers-list.tsx` is: two copies drift, and how they
 * drift is a column that is hidden in the body but not in the header, or a
 * loading state that promises eight columns and then delivers seven. The header
 * carries the one decision about which columns go below `md`, and the skeleton
 * inherits it by rendering the header rather than approximating it.
 *
 * The sort machinery is here for the same reason: `ariaSortFor`, the glyph, the
 * `title` and the scope note are one idea, and they only make sense next to the
 * `<th>` they are attributes of.
 *
 * The file also exports the caption builder and the sort-scope note, which are
 * values rather than components; none of them holds state, so a Fast Refresh that
 * degrades to a full reload of this module when a word changes costs nothing.
 */
/* oxlint-disable react-doctor/only-export-components -- the caption builder and the scope note are pure values that belong beside the header they describe */

export type SortKey = "name" | "availableQty";
export type SortDirection = "asc" | "desc";

/**
 * `null` is a third state and it is the default: the server's own order.
 *
 * A third click on a sorted column hands the ordering back to `listItems`' own
 * `createdAt DESC, id DESC` rather than repeating ascending, because the
 * register's natural order is newest-first and there is no reason to make the
 * user re-derive it.
 */
export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

/**
 * The column labels: deep-green ground, amber small caps. One definition.
 *
 * **`uppercase` is here rather than on the sort button**, which is where it used
 * to live. Only the two sortable columns' labels were inside that button, so the
 * header row read `ASSET | Responsible | ON HAND / AVAILABLE / LOAN | Status |
 * Condition | Location` — six labels in two different cases, which reads as two
 * different tables sharing a row. The weight, the tracking and the case are one
 * treatment and they are set together.
 *
 * `text-accent` on `bg-primary` is deep amber on deep green and measures about
 * 9:1, so the amber is safe *here* and nowhere else on this screen: the same
 * token on the cream page is 3.87:1 and on `bg-accent/20` is 3.45:1, both under
 * AA. Anywhere the ground is not the green band, the ink is `--warning-ink`.
 */
const COLUMN_HEADING =
  "text-accent h-11 text-xs font-extrabold tracking-[0.16em] uppercase";

/**
 * The one sentence that says the sort is a browser-side sort over a capped page,
 * and it is **visible text above the table** rather than a `title`.
 *
 * A `title` is hover-only, so the explanation was invisible to a keyboard user
 * and unreliably announced to a screen reader — and the fact it explains (this
 * control reorders the rows already loaded, and the load is capped) is the
 * difference between "sort" and "sort the register". `SORT_SCOPE_NOTE_ID` is
 * what every sort button points at with `aria-describedby`, so the sentence is
 * read on focus, and it is on the page for everyone else.
 */
export const SORT_SCOPE_NOTE_ID = "inventory-register-sort-note";

export const SORT_SCOPE_NOTE =
  "Sorting runs in your browser over the rows already loaded, which this register caps at 200 lines. On a longer register, narrow the search first — the line above the table says when a page is truncated.";

/** `aria-sort` is on the `<th>`, which is the only element allowed to carry it. */
const ariaSortFor = (
  sort: SortState | null,
  key: SortKey
): "ascending" | "descending" | "none" => {
  if (sort?.key !== key) {
    return "none";
  }

  return sort.direction === "asc" ? "ascending" : "descending";
};

/**
 * The direction glyph, and the fact that it is `aria-hidden`.
 *
 * The sort state is already announced — through `aria-sort` on the header cell,
 * which a screen reader reads as part of the column — so a second signal in the
 * accessible name would be the same fact twice. The icon is for the reader who is
 * looking at the table, and the `title` on the button is for the mouse.
 */
const SortGlyph: React.FC<{ sort: SortState | null; activeKey: SortKey }> = ({
  sort,
  activeKey,
}) => {
  if (sort?.key !== activeKey) {
    return <IconArrowsSort className="size-3 opacity-40" aria-hidden="true" />;
  }

  if (sort.direction === "asc") {
    return <IconArrowUp className="size-3" aria-hidden="true" />;
  }

  return <IconArrowDown className="size-3" aria-hidden="true" />;
};

/**
 * The `title` on a sort control, **derived from the current sort state**.
 *
 * It used to be a fixed string ending "Currently ordered newest first, as the
 * server returned it", which was a sentence that went false the instant anybody
 * clicked a header and stayed false for the rest of the session. Three states,
 * three sentences, because the reader's next question is always "what happens if
 * I click again" — and the answer differs per state, including the third click,
 * which is not a repeat of ascending but a hand-back to the server's own order.
 */
const sortHint = (sort: SortState | null, activeKey: SortKey): string => {
  const what =
    activeKey === "name" ? "by item name" : "by how many units are available";

  if (sort?.key !== activeKey) {
    return `Sort ${what}. Right now the register is in the order the server returned it, newest first.`;
  }

  if (sort.direction === "asc") {
    return `Sorted ${what}, low to high. Click again for high to low, then a third time to go back to the server's order.`;
  }

  return `Sorted ${what}, high to low. Click again to go back to the server's order, newest first.`;
};

/**
 * A header that is also the sort control for its column.
 *
 * **`onToggle` is optional, and that is a state, not a convenience.** While the
 * register is loading the skeleton renders this same header with no `onToggle`,
 * and a button with nothing behind it is a control in the tab order that does
 * nothing — the "a control that reliably does nothing" defect `RowActionMenu` has
 * already had to remove twice on this screen. With no handler the label is
 * rendered as plain header text and the column is not announced as sortable.
 */
const SortableHead: React.FC<{
  label: string;
  sort: SortState | null;
  activeKey: SortKey;
  onToggle?: (key: SortKey) => void;
  className?: string;
}> = ({ label, sort, activeKey, onToggle, className }) => {
  if (!onToggle) {
    return (
      <TableHead scope="col" className={className}>
        {label}
      </TableHead>
    );
  }

  return (
    <TableHead
      scope="col"
      aria-sort={ariaSortFor(sort, activeKey)}
      className={className}
    >
      <button
        type="button"
        onClick={() => onToggle(activeKey)}
        title={sortHint(sort, activeKey)}
        aria-describedby={SORT_SCOPE_NOTE_ID}
        className="hover:text-foreground flex items-center gap-1 transition-colors"
      >
        {label}
        <SortGlyph sort={sort} activeKey={activeKey} />
      </button>
    </TableHead>
  );
};

export interface RegisterTableHeaderProps {
  /**
   * The select-all control, passed in rather than built here.
   *
   * The live table puts a real `Checkbox` in it and the skeleton puts a
   * `Skeleton` of the same size, and the header decides nothing about either —
   * which is what lets one definition serve both without a loading state that
   * offers to select rows that have not arrived.
   */
  selectAll: React.ReactNode;
  /** Omitted by the skeleton, which has nothing to sort yet. */
  sort?: SortState | null;
  onToggleSort?: (key: SortKey) => void;
}

/**
 * The register's column headings, and its two sort controls.
 *
 * The custody column is not sortable and deliberately so: sorting a pair of
 * people by one of them produces a half-ordered column that reads as a ranking,
 * and nobody has ever asked "who is the most responsible custodian".
 */
export const RegisterTableHeader = ({
  selectAll,
  sort = null,
  onToggleSort,
}: RegisterTableHeaderProps) => (
  <TableHeader>
    <TableRow className="bg-primary hover:bg-primary border-none">
      <TableHead scope="col" className={`${COLUMN_HEADING} w-10`}>
        {selectAll}
      </TableHead>
      <SortableHead
        label="Asset"
        sort={sort}
        activeKey="name"
        onToggle={onToggleSort}
        className={COLUMN_HEADING}
      />
      <TableHead scope="col" className={`${COLUMN_HEADING} max-w-72`}>
        Responsible
      </TableHead>
      <SortableHead
        label="On hand / available"
        sort={sort}
        activeKey="availableQty"
        onToggle={onToggleSort}
        className={COLUMN_HEADING}
      />
      <TableHead scope="col" className={COLUMN_HEADING}>
        Status
      </TableHead>
      {/* The two columns that go below `md`; the header hides with the cells. */}
      <TableHead
        scope="col"
        className={`${COLUMN_HEADING} hidden md:table-cell`}
      >
        Condition
      </TableHead>
      <TableHead
        scope="col"
        className={`${COLUMN_HEADING} hidden md:table-cell`}
      >
        Location
      </TableHead>
      <TableHead scope="col" className={COLUMN_HEADING}>
        <span className="sr-only">Actions</span>
      </TableHead>
    </TableRow>
  </TableHeader>
);

/**
 * The number of placeholder rows: a first screen of the register at this app's
 * `text-xs` row height, without pushing the fold.
 */
const SKELETON_ROW_COUNT = 6;

/**
 * The register while its first page is being read.
 *
 * **A real table, not a stack of bars.** The loading state used to be
 * `InventorySkeleton`, which replaces the whole region with six rows of
 * identical bars and no header at all — so the page collapsed from a nine-column
 * register to a stack of grey lines and expanded back again when the rows
 * landed. Now the header band, the column widths, the `hidden md:table-cell`
 * columns and the row rhythm are the real ones and only the cells are
 * placeholders, so the data lands into space that was already reserved.
 *
 * The bars are `aria-hidden` and the region is not, so a screen reader is told
 * the region is in flux and is given a sentence to be busy *about* — `aria-busy`
 * on a region with no text is a flag nothing can read.
 */
export const RegisterTableSkeleton = () => (
  <div
    className="border-primary/14 flex flex-col border"
    aria-busy="true"
    aria-live="polite"
  >
    <span className="sr-only">Loading the inventory register…</span>
    <Table>
      <TableCaption>Inventory register, loading</TableCaption>
      <RegisterTableHeader
        selectAll={<Skeleton aria-hidden="true" className="size-4" />}
      />
      <TableBody aria-hidden="true">
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, row) => (
          // The row index is the identity here on purpose: these are
          // placeholders that are never reordered, keyed or diffed.
          // oxlint-disable-next-line react/no-array-index-key -- static placeholder rows, never reordered
          <TableRow
            key={`register-skeleton-${row}`}
            className="hover:bg-transparent"
          >
            <TableCell>
              <Skeleton className="size-4" />
            </TableCell>
            <TableCell className="max-w-64">
              <div className="flex flex-col gap-1">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-2.5 w-28" />
              </div>
            </TableCell>
            <TableCell className="max-w-72">
              <Skeleton className="h-4 w-32" />
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-28" />
              </div>
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-24" />
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <Skeleton className="h-4 w-20" />
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <Skeleton className="h-3 w-24" />
            </TableCell>
            <TableCell className="w-10">
              <Skeleton className="size-4" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

export interface RegisterCaptionInput {
  /** What the register is, in the app's words, with the year it addresses. */
  registerLabel: string;
  /** The filters in force, as a clause. "no filters applied" when unfiltered. */
  filterSummary: string;
  rowCount: number;
  totalCount: number | undefined;
  isTruncated: boolean;
}

/**
 * The table's accessible name, and the one place the truncation is announced.
 *
 * **A `<caption>`, not an `aria-label`, and that is a real difference.** A table
 * with an `aria-label` has an accessible name and no caption, and the caption is
 * the element that travels with the table when it is navigated by table rather
 * than read linearly — a screen-reader user moving cell by cell is told the
 * column and the row header and nothing about which register it came from. The
 * previous `aria-label` here also *competed* with the table's own first child
 * rather than sitting beside it.
 *
 * Three shapes rather than a nested ternary: a complete page, a truncated one,
 * and — for the skeleton, which has no total yet — a page still resolving. The
 * middle case is the important one: it is what tells a screen-reader user that
 * the list they are hearing is not the whole store, which the visible line above
 * the table says for everyone else.
 */
export const buildRegisterCaption = ({
  registerLabel,
  filterSummary,
  rowCount,
  totalCount,
  isTruncated,
}: RegisterCaptionInput): string => {
  let count = "The number of items is still loading.";
  if (totalCount !== undefined) {
    const noun = rowCount === 1 ? "item" : "items";
    count = isTruncated
      ? `Showing ${rowCount} of ${totalCount} items.`
      : `${rowCount} ${noun}.`;
  }

  return `${registerLabel}. ${count} ${filterSummary}`;
};
