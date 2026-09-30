import {
  Card,
  CardContent,
} from "@school-student-teacher-management/ui/components/card";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import {
  IconAlertTriangle,
  IconBuildingWarehouse,
  IconCoins,
  IconInbox,
  IconPackage,
  IconStack2,
} from "@tabler/icons-react";
import type * as React from "react";

/*
 * `formatCount` is exported from beside the card that uses it on purpose: it is a
 * pure string function with no state, so a Fast Refresh that degrades to a full
 * reload of this module when it changes costs nothing — and `shared/index.ts`
 * re-exports this file wholesale, so the write-off dialog reaches the feature's
 * only number formatter through the same import path it already uses for
 * `InventoryEmptyState`. Splitting it out to satisfy the lint rule would mean a
 * new file, a new line in the barrel, and one more place to look.
 */
/* oxlint-disable react-doctor/only-export-components -- the feature's one number formatter lives with the only card that renders one */

export interface InventoryStats {
  /** Distinct items in the register (rows, not units). */
  totalItems: number;
  /** Every physical unit the school owns, tagged or counted in bulk. */
  totalUnits: number;
  /** Units on hand and not out on loan. */
  availableUnits: number;
  /** Units currently out with a borrower. */
  borrowedUnits: number;
  /** Items whose `qty` is zero. */
  outOfStockItems: number;
  /** Items at or below their `minQty` reorder threshold. */
  lowStockItems: number;
}

/**
 * The one place a number in this feature is turned into a string.
 *
 * **The locale is declared, not inherited, and there is exactly one of them.**
 * This feature has two number formatters and they disagreed: this one said
 * `en-US`, the write-off dialog's `formatAmount` said `en-US`, and every date in
 * the feature says `en-GB`. Two spellings of "how this app writes a number" is one
 * more thing that can drift, and a school that later gets a currency, a compact
 * count or a percentage would find the two sites rendering them differently — which
 * is the failure that is cheap to prevent now and expensive to find later.
 *
 * **Stated honestly, because the obvious justification is false: the two locales
 * render today's figures identically.** Checked against this repo's own runtime
 * (Node, full ICU) — `(1250).toLocaleString("en-US")` and
 * `(1250).toLocaleString("en-GB")` both return `"1,250"`, and both return
 * `"1,250.50"` for the money figure. So a quantity of 1,250 was *not* appearing as
 * `1,250` on one card and `1 250` on another; that symptom is a property of a
 * hand-typed space, not of these two locales. What was true before this change is
 * narrower and still worth fixing: the locale was chosen per call site, by
 * accident, in two places that did not agree with the rest of the feature.
 *
 * The locale is also pinned rather than left to `navigator.language`, which is a
 * separate decision with the same reasoning: the convention is a property of the
 * school, so a machine set to some other locale must not reformat the register
 * underneath the user.
 *
 * Declared in this file, and exported, because this is the one module in
 * `shared/` that renders a figure and imports nothing from the feature: putting it
 * beside `formatDateTime` in `stock-dialogs.tsx` would be a cycle, because that file
 * imports the `shared` barrel this one is re-exported by. `shared/index.ts` picks it
 * up through its existing `export *`, so a caller writes
 * `import { formatCount } from "@/components/staff/inventory/shared"` and never
 * learns which file it is in.
 */
const COUNT_FORMATTER = new Intl.NumberFormat("en-GB");

/**
 * A count, formatted for a Sri Lankan school register.
 *
 * `options` is passed straight through to `Intl.NumberFormat` and defaults to none,
 * which is what every count in the feature wants: no currency, no decimals, no forced
 * digits. It exists for the one figure that is not a count — a money amount with two
 * decimal places — so that "how this feature writes a number" stays a single answer
 * even where the number is an amount rather than a quantity.
 */
export const formatCount = (
  value: number,
  options?: Intl.NumberFormatOptions
): string =>
  options
    ? new Intl.NumberFormat("en-GB", options).format(value)
    : COUNT_FORMATTER.format(value);

type StatTone = "default" | "warning" | "danger";

/**
 * `--warning-ink` rather than `--gold` for the two warning figures.
 *
 * These numbers are read at `text-xl` — large-text AA is 3:1, and `--gold` clears
 * that comfortably — but they are *figures*, not headings: a number out of context
 * is body text, and the same "Borrowed" state is carried by a `text-xs` badge on
 * the register's own rows, where `--gold` is 3.45:1. One warning hue, one
 * legibility floor, whatever the size it is set at. The arithmetic is in
 * `packages/ui/src/styles/globals.css`.
 */
const TONE_CLASS: Record<StatTone, string> = {
  default: "text-foreground",
  warning: "text-warning-ink",
  danger: "text-destructive",
};

interface StatDefinition {
  key: keyof InventoryStats;
  label: string;
  hint: string;
  tone: StatTone;
  Icon: React.ComponentType<{ className?: string }>;
}

/**
 * The six numbers, in the order a storekeeper reads them: how big the store is, how
 * much of it is actually usable, and what needs attention.
 *
 * **There were seven, and the seventh is the one worth explaining.** There used to
 * be an "Items with no manager" card here, argued for at length as the one figure a
 * school administrator actually goes and does something about: an item with a holder
 * and nobody accountable for it is school property somebody is holding and nobody is
 * answerable for, and on its own card it read as a work list. It is gone because the
 * state it counted cannot exist — `inventory_item.manager_staff_id` is `NOT NULL`, so
 * every item is answerable to a named person from the moment it is registered — and a
 * card that can only ever read 0 is worse than no card: it tells a storekeeper the
 * question has been answered when nothing was asked. The "No manager only" filter
 * beside it went for the same reason, and `CustodyBadge`'s gap chips are now the only
 * place the shape of that row is still drawn from.
 */
const STAT_DEFINITIONS: StatDefinition[] = [
  {
    key: "totalItems",
    label: "Items",
    hint: "Distinct lines in the register",
    tone: "default",
    Icon: IconPackage,
  },
  {
    key: "totalUnits",
    label: "Units",
    hint: "Every physical unit, tagged or bulk",
    tone: "default",
    Icon: IconStack2,
  },
  {
    key: "availableUnits",
    label: "Available",
    hint: "On hand and not out on loan",
    tone: "default",
    Icon: IconInbox,
  },
  {
    key: "borrowedUnits",
    label: "Borrowed",
    hint: "Out with a borrower right now",
    tone: "warning",
    Icon: IconCoins,
  },
  {
    key: "lowStockItems",
    label: "Low stock",
    hint: "At or below the reorder threshold",
    tone: "warning",
    Icon: IconAlertTriangle,
  },
  {
    key: "outOfStockItems",
    label: "Out of stock",
    hint: "Nothing on hand at all",
    tone: "danger",
    Icon: IconBuildingWarehouse,
  },
];

/**
 * The register's summary row.
 *
 * ## A definition list, not a hero metric
 *
 * This row used to be the template the craft floor bans: seven cards, each one a
 * large figure with a `text-xs text-muted-foreground` caption underneath it. The
 * caption was *smaller* than the number, so the number was the thing being read
 * and the words describing what it counted were the decoration. A storekeeper
 * glancing across the row saw "1,250" and had to go and work out which of seven
 * columns that was.
 *
 * It is a `<dl>` now, which is the HTML that already answers the question this
 * row is asking: a term (`<dt>`, the label, at `text-sm` — legible, and *not*
 * smaller than the figure it names) and its value (`<dd>`, `tabular-nums`). A
 * screen reader announces "Items, 1,250, Distinct lines in the register" from
 * the structure, with no `aria-label` bolted onto a `<p>` and nothing for the
 * next person to keep in step by hand.
 *
 * ## The hint is inside the value's cell and in the accessible name
 *
 * Each figure's hint states what it counts rather than paraphrasing the label —
 * "Every physical unit, tagged or bulk" is the difference between `totalUnits`
 * and `totalItems`, and it is the sentence that stops a reader adding the two.
 * It is a real `<p>` in the cell, not a `title`: the table's other explanations
 * moved off `title` for the same reason, and a `title` is hover-only.
 *
 * `isLoading` swaps the figure for a skeleton of the same size rather than
 * blanking the card, so the row does not collapse and re-expand under the user on
 * every refetch. The label and hint stay: they are the only place the register
 * states what each of these words means.
 *
 * **These are `<Card>`s and not `<Button>`s, and that is not an oversight.** One of
 * them used to be a filter's figure, with the filter's control rendered by the page
 * immediately below this row, and the arrangement was: the card states the figure,
 * the hint names the control that acts on it. That card is gone with its filter, and
 * the argument for the rest is simpler than the one it replaces — a number nobody
 * can act on from this row is a number to *read*, and a row of `<button>`s in the
 * tab order above a table is six more stops between the reader and the register
 * itself. A figure that wanted a control would be a filter, and filters live in the
 * filter bar.
 */
export const InventoryStatCards: React.FC<{
  stats: InventoryStats;
  isLoading?: boolean;
}> = ({ stats, isLoading = false }) => (
  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
    {STAT_DEFINITIONS.map(({ key, label, hint, tone, Icon }) => (
      <Card key={key} size="sm">
        <CardContent>
          <dl className="flex flex-col gap-1">
            {/*
              The label goes first in the source order, so a screen reader meets
              "Items" before "1,250" — and the icon is `aria-hidden` because the
              word beside it already says it, so the glyph is a third channel for
              a sighted reader and noise in the tree for everyone else.
            */}
            <dt className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
              <Icon aria-hidden="true" className="size-3.5 shrink-0" />
              {label}
            </dt>
            <dd
              className={`text-xl font-medium tabular-nums ${TONE_CLASS[tone]}`}
            >
              {isLoading ? (
                <Skeleton className="h-5 w-8" />
              ) : (
                formatCount(stats[key])
              )}
            </dd>
            <dd className="text-muted-foreground text-xs">{hint}</dd>
          </dl>
        </CardContent>
      </Card>
    ))}
  </div>
);
