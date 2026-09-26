import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@school-student-teacher-management/ui/components/card";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import {
  IconAlertTriangle,
  IconBuildingWarehouse,
  IconCoins,
  IconInbox,
  IconPackage,
  IconStack2,
  IconUserOff,
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
  /**
   * Items with no `managerStaffId` — **counted over the page the server returned**,
   * not over the school. See the card's own hint, which has to say so.
   */
  unassignedItems: number;
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

type StatTone = "default" | "warning" | "danger" | "gap";

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
  gap: "text-warning-ink",
};

interface StatDefinition {
  key: keyof InventoryStats;
  label: string;
  hint: string;
  tone: StatTone;
  Icon: React.ComponentType<{ className?: string }>;
}

/**
 * The seven numbers, in the order a storekeeper reads them: how big the store
 * is, how much of it is actually usable, what needs attention, and what has
 * nobody responsible for it.
 *
 * **`unassignedItems` gets a card of its own, and that is the point of the
 * row.** Every other figure here is a report: totals, a low-stock warning, a
 * count of things that are gone. "Items with no manager" is the one number a
 * school administrator actually goes and does something about, because an item
 * with a custodian and no manager is school property that somebody is holding
 * and nobody is accountable for — the state `CustodyBadge` writes out as "No
 * manager" and the one this feature exists to close. Buried inside a combined
 * card it would be read once and forgotten; on its own it is a work list.
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
  {
    key: "unassignedItems",
    label: "No manager",
    /**
     * **The count is of the loaded page, and the hint has to say so** — this is the
     * one card whose number is not the same kind of number as its six neighbours.
     * `totalItems` and `lowStockItems` are server totals; this one is a predicate
     * applied to the rows `listItems` returned, so it moves when a filter is applied
     * and it cannot exceed `REGISTER_PAGE_SIZE` (200). "Nobody is accountable for the
     * item" reads as a statement about the school, which makes a 12 that is really a
     * 12-of-this-page look like the whole store's answer.
     *
     * The page-side fix in `inventory-page.tsx` states the scope honestly the moment
     * the "No manager only" filter is on (`buildUnassignedScopeNote`); this is the
     * half that has to be true in **every** state, including the one where no filter
     * is on and the register is truncated anyway. So the hint names the two things
     * that bound it — the page, and the control that re-derives it — and the
     * `CustodyBadge` gap chip is worded from this same sentence, so the card, the
     * chip and the sentence beside the toggle describe one set of rows.
     */
    hint: "No manager on the page shown — filter with No manager only",
    tone: "gap",
    Icon: IconUserOff,
  },
];

/**
 * The register's summary row.
 *
 * Values are rendered through `tabular-nums` so a column of them stays aligned
 * as they change — a storekeeper watching `availableUnits` fall while
 * `borrowedUnits` rises is comparing digits, and proportional figures make that
 * comparison a guess.
 *
 * `isLoading` swaps the figure for a skeleton of the same size rather than
 * blanking the card, so the row does not collapse and re-expand under the user
 * on every refetch. The label and hint stay: they are the only place the
 * register states what each of these words means.
 *
 * **These are `<Card>`s and not `<Button>`s, and that is not an oversight.** The
 * "No manager" card is a *filter's* figure, and the filter's control is the "No
 * manager only" toggle the page renders immediately below this row — a toggle
 * rather than a one-shot, because it is a filter and needs an `off` the user can
 * see and press. Making the card itself the door would mean a second control for
 * one filter, a `pressed` state to keep in step with the first, and a row of seven
 * `<button>`s in the tab order above the table. The card states the figure and the
 * hint names the control that acts on it, which is the arrangement a keyboard user
 * can actually reach.
 */
export const InventoryStatCards: React.FC<{
  stats: InventoryStats;
  isLoading?: boolean;
}> = ({ stats, isLoading = false }) => (
  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
    {STAT_DEFINITIONS.map(({ key, label, hint, tone, Icon }) => (
      <Card key={key} size="sm" className="gap-2">
        <CardHeader>
          <CardTitle className="text-muted-foreground text-xs font-medium">
            {label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p
            className={`flex items-center gap-1.5 text-xl font-medium tabular-nums ${TONE_CLASS[tone]}`}
          >
            <Icon className="size-4 shrink-0" />
            {isLoading ? (
              <Skeleton className="h-5 w-8" />
            ) : (
              formatCount(stats[key])
            )}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
        </CardContent>
      </Card>
    ))}
  </div>
);
