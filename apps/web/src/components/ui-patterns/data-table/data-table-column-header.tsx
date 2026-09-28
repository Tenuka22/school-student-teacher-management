import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@school-student-teacher-management/ui/components/dropdown-menu";
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsSort,
} from "@tabler/icons-react";

/**
 * The direction glyph, and the fact that it is `aria-hidden`.
 *
 * The direction is already announced — through `aria-sort` on the `<th>`, which the
 * table sets from the same state — so putting it in the accessible name as well
 * would say it twice. The glyph is for the reader looking at the table.
 */
const SortGlyph = ({ sorted }: { sorted: false | "asc" | "desc" }) => {
  if (sorted === "asc") {
    return <IconArrowUp aria-hidden="true" className="size-3.5" />;
  }

  if (sorted === "desc") {
    return <IconArrowDown aria-hidden="true" className="size-3.5" />;
  }

  return (
    <IconArrowsSort
      aria-hidden="true"
      className="text-muted-foreground size-3.5 opacity-60"
    />
  );
};

/**
 * The `title` on a sort control, **derived from the current state**.
 *
 * It says what the next click will do, which is the only question a sort control is
 * ever asked, and it changes when the state does: a fixed string reads correctly
 * once and then lies for the rest of the session.
 */
const sortHint = (sorted: false | "asc" | "desc", label: string): string => {
  const what = label.toLowerCase();

  if (sorted === "asc") {
    return `Sorted by ${what}, A to Z. Activate to sort Z to A.`;
  }

  if (sorted === "desc") {
    return `Sorted by ${what}, Z to A. Activate to sort A to Z.`;
  }

  return `Not sorted by ${what}. Activate to sort A to Z.`;
};

/**
 * A header that is also the sort control for its column.
 *
 * The name is passed in rather than read off `column.id`, because the two disagree
 * on the column a reader cares most about: the id is `createdAt` and the name is
 * "Created". A tooltip that offers `createdAt` is an implementation detail wearing
 * a control's clothes.
 *
 * A **button that opens a menu of the three orders** rather than a two-state
 * toggle, because a list whose order is in the URL has a third state to reach —
 * its own default — and a toggle has nowhere to put it. The default belongs to the
 * list, so `onSort(null)` is what "back to the default" means here; the caller
 * decides what its default is.
 *
 * A column the server cannot order by gets a plain string in its column
 * definition, not this with a handler that does nothing.
 */
export const DataTableColumnHeader = ({
  label,
  onSort,
  sorted,
}: {
  label: string;
  /** `null` is the list's own default order. */
  onSort: (direction: "asc" | "desc" | null) => void;
  sorted: false | "asc" | "desc";
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      className="hover:text-foreground -ml-2 flex h-8 items-center gap-1.5 px-2 text-left transition-colors"
      title={sortHint(sorted, label)}
    >
      {label}
      <SortGlyph sorted={sorted} />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="min-w-48">
      <DropdownMenuItem onClick={() => onSort("asc")}>
        <IconArrowUp aria-hidden="true" />
        Ascending
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onSort("desc")}>
        <IconArrowDown aria-hidden="true" />
        Descending
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={sorted === false}
        onClick={() => onSort(null)}
      >
        <IconArrowsSort aria-hidden="true" />
        Back to the default order
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
