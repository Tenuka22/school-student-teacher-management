"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@school-student-teacher-management/ui/components/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import {
  IconArchive,
  IconArrowDown,
  IconArrowUp,
  IconArrowsSort,
  IconBuildingWarehouse,
  IconCategory,
  IconDotsVertical,
  IconHistory,
  IconPackageExport,
  IconPencil,
  IconSwitchHorizontal,
  IconTrash,
  IconUserCheck,
  IconUserMinus,
  IconUserPlus,
} from "@tabler/icons-react";
import type * as React from "react";
import { useCallback, useMemo, useState } from "react";

import {
  ReclaimCustodyDialog,
  TransferOwnershipDialog,
} from "@/components/staff/inventory/custody-dialogs";
import type { InventoryItemView } from "@/components/staff/inventory/inventory-types";
import {
  ConditionBadge,
  CustodyBadge,
  EMPTY_FILTERED_COPY,
  EMPTY_REGISTER_COPY,
  InventoryEmptyState,
  InventoryErrorState,
  InventorySkeleton,
  ItemStatusBadge,
} from "@/components/staff/inventory/shared";
import { formatDateTime } from "@/components/staff/inventory/stock-dialogs";

type SortKey = "name" | "availableQty";
type SortDirection = "asc" | "desc";

/** `null` is a third state and it is the default: the server's own order. */
interface SortState {
  key: SortKey;
  direction: SortDirection;
}

const COLUMN_HEADING = "text-accent text-xs font-extrabold tracking-[0.16em]";

/**
 * The table's accessible name, and the one place the truncation is announced.
 *
 * Three shapes rather than a nested ternary: no total yet (the query has not
 * landed), a truncated page, and a complete one. The middle case is the important
 * one — it is what tells a screen-reader user that the list they are hearing is
 * not the whole store, which the visible line above the table says for everyone
 * else.
 */
const buildTableLabel = (
  rowCount: number,
  totalCount: number | undefined,
  isTruncated: boolean
): string => {
  if (totalCount === undefined) {
    return "Inventory register";
  }

  if (isTruncated) {
    return `Inventory register, showing ${rowCount} of ${totalCount} items`;
  }

  return `Inventory register, ${rowCount} items`;
};

/**
 * The category's colour, as a dot.
 *
 * `categoryColor` is the server's own hex from `inventory_category.color`, and
 * it is `aria-hidden` because the category's **name** sits beside it in the same
 * cell — a colour that was the only channel would leave a reader who cannot
 * distinguish two of them with no way to tell the categories apart at all.
 */
const CategoryDot: React.FC<{ color: string }> = ({ color }) => (
  <span
    aria-hidden="true"
    className="ring-foreground/10 size-2 shrink-0 rounded-full ring-1"
    style={{ backgroundColor: color }}
  />
);

/**
 * The three counters, in the order a clerk reads them.
 *
 * **Available is the emphasised one and the other two are muted, deliberately.**
 * The question this table exists to answer is "what can I hand out right now",
 * and `availableQty` is the server's own derivation of it (`qty - borrowedQty`,
 * floored at zero) rather than something recomputed here — a third
 * implementation of that subtraction is exactly the drift
 * `inventory-calculations.ts` was written to prevent. `qty` and `borrowedQty`
 * stay on the row because the *reason* available is smaller than on hand is the
 * second thing a clerk asks, and a muted pair answers it without competing.
 *
 * The separators are `aria-hidden` and each figure carries its own `sr-only`
 * label, so a screen reader hears "3 on hand, 2 available to hand out, 1 out on
 * loan" rather than "3 slash 2 slash 1".
 */
const StockFigures: React.FC<{ item: InventoryItemView }> = ({ item }) => {
  /*
   * `qty <= minQty` and nothing else, because that is exactly what the server's
   * `lowStockOnly` filter is (`list-items.ts:191-193`) and exactly what the
   * register's "Low stock" card counts — it is a server total, lifted to its own
   * `limit: 1` query.
   *
   * This used to carry a `qty > 0 &&` guard, which quietly made the two count
   * different sets: every out-of-stock line was on the card and badged "Out of
   * stock" on the row, while the card's own hint said "at or below the reorder
   * threshold" — a sentence the row contradicted for the most alarming rows in the
   * register. **The badge was changed rather than the card's copy**, for two
   * reasons. The card is the number somebody acts on and it is a server figure this
   * file cannot qualify without editing `shared/inventory-stats.tsx`; and "0 ≤ 0" is
   * true, so a fully-written-off line honestly *is* at its reorder level. The status
   * column is where "there is none on the shelf" is stated, and it is a different
   * fact from "you have hit the number you set".
   *
   * `lowStockOnly` filters on `minQty` as a *threshold* rather than a floor, so
   * saying so on the row is what stops a reader treating the badge as a fault: the
   * item is *low*, and nobody is forbidden from being low. It is a word, never a
   * colour.
   */
  const isLow = item.qty <= item.minQty;

  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-muted-foreground">
          {item.qty}
          <span className="sr-only"> on hand</span>
        </span>
        <span aria-hidden="true" className="text-muted-foreground/50">
          /
        </span>
        <span className="text-foreground text-sm font-semibold">
          {item.availableQty}
          <span className="sr-only"> available to hand out</span>
        </span>
        <span aria-hidden="true" className="text-muted-foreground/50">
          /
        </span>
        <span className="text-muted-foreground">
          {item.borrowedQty}
          <span className="sr-only"> out on loan</span>
        </span>
      </span>
      {isLow ? (
        /*
         * `text-warning-ink`, not `text-gold`: this is `text-xs` ink on the page
         * background, where `--gold` is 3.87:1 and fails AA for body text. The
         * border stays on `accent/50` because that is a surface, not ink.
         *
         * **No `h-4`.** The badge's own base is `h-5 … py-0.5 text-xs
         * whitespace-nowrap overflow-hidden`, so overriding the height to 16px left a
         * 16px line box in a 16px content box: "At reorder level" was clipped
         * vertically and truncated mid-word with no ellipsis and nothing to hover
         * for. The horizontal padding is tightened instead, which is the axis that
         * had room to spare.
         */
        <Badge
          variant="outline"
          className="border-accent/50 text-warning-ink px-1.5"
        >
          At reorder level
        </Badge>
      ) : null}
    </div>
  );
};

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
 * clicked a header and stayed false for the rest of the session. Three states, three
 * sentences, because the reader's next question is always "what happens if I click
 * again" — and the answer differs per state, including the third click, which is not
 * a repeat of ascending but a hand-back to the server's own order.
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
 * The one sentence that says the sort is a browser-side sort over a capped page,
 * and it is **visible text above the table** rather than a `title`.
 *
 * A `title` is hover-only, so the explanation was invisible to a keyboard user and
 * unreliably announced to a screen reader — and the fact it explains (this control
 * reorders the rows already loaded, and the load is capped) is the difference between
 * "sort" and "sort the register". `SORT_SCOPE_NOTE_ID` is what every sort button
 * points at with `aria-describedby`, so the sentence is read on focus, and it is on
 * the page for everyone else. Same argument the ledger's before/after note was moved
 * on: a `Tooltip` is not in the tab order either.
 */
const SORT_SCOPE_NOTE_ID = "inventory-register-sort-note";

const SORT_SCOPE_NOTE =
  "Sorting runs in your browser over the rows already loaded, which this register caps at 200 lines. On a longer register, narrow the search first — the line above the table says when a page is truncated.";

/** A header that is also the sort control for its column. */
const SortableHead: React.FC<{
  label: string;
  sort: SortState | null;
  activeKey: SortKey;
  onToggle: (key: SortKey) => void;
  className?: string;
}> = ({ label, sort, activeKey, onToggle, className }) => (
  <TableHead aria-sort={ariaSortFor(sort, activeKey)} className={className}>
    <button
      type="button"
      onClick={() => onToggle(activeKey)}
      title={sortHint(sort, activeKey)}
      aria-describedby={SORT_SCOPE_NOTE_ID}
      className="hover:text-foreground flex items-center gap-1 uppercase transition-colors"
    >
      {label}
      <SortGlyph sort={sort} activeKey={activeKey} />
    </button>
  </TableHead>
);

interface InventoryRowProps {
  item: InventoryItemView;
  onOpenItem: (item: InventoryItemView) => void;
  onViewCustody: (item: InventoryItemView) => void;
  onTransferCustody: (item: InventoryItemView) => void;
  onAssignManager: (item: InventoryItemView) => void;
  onTransferOwnership: (item: InventoryItemView) => void;
  onReclaimCustody: (item: InventoryItemView) => void;
  onTakeItem: (item: InventoryItemView) => void;
  onReleaseCustody: (item: InventoryItemView) => void;
  onEditItem: (item: InventoryItemView) => void;
  onRetireItem: (item: InventoryItemView) => void;
  onRestoreItem: (item: InventoryItemView) => void;
}

/**
 * Everything the row's menu can do, and nothing about how the row looks.
 *
 * `Omit` rather than a re-declared list of nine signatures, so the menu and the row
 * cannot disagree about what a handler is and the row can hand its own props
 * straight through with a rest. The row keeps `item` and `onOpenItem` — the click
 * target — and everything else belongs to the menu.
 */
type RowActionProps = Omit<InventoryRowProps, "item" | "onOpenItem">;

interface RowActionMenuProps extends RowActionProps {
  item: InventoryItemView;
}

/**
 * "Retired", as a badge, and the one thing on the row that must not be missed.
 *
 * **Words, and a struck-through date beside them — never a colour alone.** Every
 * other state on this register is carried by a badge whose tone means something
 * (`ItemStatusBadge`, `ConditionBadge`, `CustodyBadge`), and a reader who has
 * learned those four tones will read a fifth one as a fifth kind of *condition*:
 * low, damaged, borrowed. Retired is not a condition of the thing, it is a fact
 * about the record, and it needs its own word to be read as one.
 *
 * The date is in the badge rather than a tooltip because the question a reader
 * actually has about a retired row is "how long has this been off the books", and
 * `deletedAt` is already on the row the server sent — the value is free, and a
 * `title` would hide it from a keyboard user.
 *
 * **`formatDateTime` and not `formatDate`, and that is not a preference.** The
 * feature has one formatter for a `date` column arriving as `YYYY-MM-DD` and one for
 * a `timestamp` arriving as a full ISO string, and `deletedAt` is a `timestamp` —
 * `formatDate` would have concatenated `T00:00:00` onto `2026-09-26T14:32:08.000Z`
 * and printed "Invalid Date" on the one row whose whole job is to be a true
 * statement. The time of day is kept rather than trimmed: two retirements on one day
 * are two different events, and the feature has exactly one timestamp format
 * precisely so a movement and its certificate cannot be rendered two ways.
 *
 * `string | null` rather than `string`, and the badge renders without the date when
 * it is null, because `isRetired` is a boolean derived from `deletedAt !== null`
 * and TypeScript will not narrow the field through it. Inventing a placeholder date
 * would have been the alternative and it would print "Invalid Date" on a row whose
 * whole job is to be a true statement.
 */
const RetiredBadge: React.FC<{ deletedAt: string | null }> = ({
  deletedAt,
}) => (
  <Badge
    variant="outline"
    className="text-muted-foreground gap-1.5 border-dashed tabular-nums"
  >
    <IconArchive />
    {deletedAt ? `Retired ${formatDateTime(deletedAt)}` : "Retired"}
  </Badge>
);

/**
 * The row's actions, as one menu.
 *
 * `w-60` and `align="end"`, unchanged: the menu opens towards the register's right
 * edge so it does not cover the columns a reader is comparing the row against, and
 * the label at the top is the item's own name so a menu that outlives its row — on a
 * scrolled register, or one the reader has lost track of — still says what it is
 * about.
 *
 * **The trigger stops propagation** so opening the menu does not also open the
 * custody history behind it: the row's click target is the history, and the menu is
 * a child of the row, so without this one click raised both.
 *
 * ## A retired row gets one entry, and that is the whole design
 *
 * `items.restore` is on `inventory:update` and is the only procedure in this
 * feature that reaches a retired row. Everything else in the menu below is built on
 * `getLockedItem`, which filters `isNull(deletedAt)` and therefore answers
 * `NOT_FOUND` for a retired item — as do `listCustodyHistory` (the row's own click
 * target), `updateItem`, `stockIn`, `stockOut`, every movement and every custody
 * verb. So on a retired row, nine of the ten entries would be controls the server
 * always refuses, which is the defect AGENTS.md names and which this menu has already
 * had to remove once (see the `hasCustodian` note below).
 *
 * The history is still on file and still reachable: `inventory_custody_history` and
 * `inventory_transaction` are `restrict` from the item, and the change log on the
 * Records pane reads every row either side of the retirement. What is unreachable is
 * the *panel*, and that is stated on the row rather than left to be discovered.
 */
const RowActionMenu = ({ item, ...actions }: RowActionMenuProps) => {
  const {
    onViewCustody,
    onTransferCustody,
    onAssignManager,
    onTransferOwnership,
    onReclaimCustody,
    onTakeItem,
    onReleaseCustody,
    onEditItem,
    onRetireItem,
    onRestoreItem,
  } = actions;
  const hasCustodian = item.custodianStaffId !== null;
  const isRetired = item.deletedAt !== null;

  if (isRetired) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          onClick={(event) => {
            event.stopPropagation();
          }}
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Actions for retired item ${item.name}`}
            />
          }
        >
          <IconDotsVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate">
              {item.name}
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onRestoreItem(item)}>
              <IconArchive />
              Restore to the register
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(event) => {
          event.stopPropagation();
        }}
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Actions for ${item.name}`}
          />
        }
      >
        <IconDotsVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">
            {item.name}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onViewCustody(item)}>
            <IconHistory />
            View custody history
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onTransferCustody(item)}>
            <IconSwitchHorizontal />
            Transfer custody
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAssignManager(item)}>
            <IconUserCheck />
            Assign or change manager
          </DropdownMenuItem>
          {/*
            The two owner verbs, directly below the one that appoints an owner,
            and the order is the argument. These three write a pointer and the
            database refuses the history row without a cause
            (`inventory_custody_history_reason_required` exempts only a first
            claim and a return to the store), so they belong in one block a
            reader can scan as "who is answerable for this"; the self-service
            take/release pair below them is a different weight of thing
            entirely. They used to be reachable only from the foot of the
            custody-history sheet, which meant an administrator had to open a
            panel about the past before a verb about the present was even
            discoverable — on a screen whose whole purpose is to act on a row.

            **Neither entry pre-empts the server, and that is a decision rather
            than an omission.** Each of the two refuses for reasons the browser
            either cannot know or should not guess: a caller who is neither the
            item's owner nor one of the three leadership seats, and an item with
            units out on a dated loan that has to come back through the borrow
            return flow first. The first is a property of the *caller* — and the
            three accounts that can reach this register at all (`admin`,
            `principal`, `vicePrincipal`) hold their authority with no staff row
            by design, so a `managerStaffId === me` check would be a guess that
            is wrong for the default audience; the second is visible on the row
            as `borrowedQty`, and a button disabled on it would hide the one
            thing the user most needs to know, which is *why*. Both dialogs
            state both rules inside the form and quote the server's own
            sentences back. `TakeOrReleaseDialog`'s banner in `custody-dialogs.tsx`
            is the same argument at length, and it is why the register's own
            reworked "Assign to yourself" still ships with an enabled button: a
            control disabled on a guess teaches people to click around it.
          */}
          {/*
            **And not gated on `managerStaffId` either.** `transferOwnership`
            authorises a leadership seat on an item with nobody in charge — "This
            item has nobody in charge of it, so only an administrator can hand
            on the ownership of it" is a refusal aimed at somebody else, not a
            prohibition — and that is exactly the case a `managerStaffId` gate
            would hide, from the one caller for whom the action works. So the
            entry is on every row, as it is on the sheet's foot, and the dialog's
            own preview already has a sentence for the nobody-in-charge case.

            `IconUserPlus` is the sheet's icon and the dialog's own submit icon,
            so the button here and the button at the end of the flow are the same
            picture.
          */}
          <DropdownMenuItem onClick={() => onTransferOwnership(item)}>
            <IconUserPlus />
            Hand on the ownership
          </DropdownMenuItem>
          {/*
            **Gated on `hasCustodian`, which is the component's own rule and not
            a nicety.** `ReclaimCustodyDialog` returns `null` for an unheld item
            and `reclaimCustody` refuses one with "This item is not in anybody's
            custody, so there is nothing to call back" — so an ungated entry is a
            control that opens nothing, which is the same defect as a control that
            always fails, and both have had to be removed from this menu more than
            once. The sheet's foot states the same rule for the same dialog.

            **And "Call it back" is deliberately not "Return to the store",
            although the two write the same pointer.** The owner is reaching into
            a colleague's hands: the holder did not ask for it, cannot see it
            coming, and is the person the record is about to say no longer has
            the item — which is why this is the only write in the feature behind
            a confirm (`ReclaimConfirmDialog`, whose cancel button is "Leave it
            with {holder}"). "Return to the store" is the other direction and the
            opposite weight: the holder giving something back, narrowed server-side
            to the person already holding the item so that a hand-back is always
            voluntary, and deliberately carrying no confirm at all, because a
            second click to confirm a decision the caller has already made about
            their own property teaches people to dismiss confirms.
            `reclaim-custody.ts` is where that is argued at length — folding the
            two together would either make a hand-back demandable by anyone, or
            make every reclaim fail, since not holding the item is the premise.

            Hence `IconBuildingWarehouse` rather than the sheet's `IconUserMinus`:
            that icon is two entries below on "Return to the store", and a menu
            where two near-neighbours answer to the same glyph teaches nothing.
            The warehouse is this file's own picture for the state a reclaim
            produces — it is what `CurrentHolderBadge` prints for "Nobody — it is
            in the store".
          */}
          {hasCustodian ? (
            <DropdownMenuItem onClick={() => onReclaimCustody(item)}>
              <IconBuildingWarehouse />
              Call it back
            </DropdownMenuItem>
          ) : null}
          {/*
            Take and release are the self-service pair, and which one is
            offered follows the pointer rather than a guess about the caller's
            own staff row: `takeItem` only succeeds on a first claim, and
            `releaseCustody` only when somebody holds it. Offering both at
            once would put a guaranteed refusal in the menu every time.
          */}
          {hasCustodian ? (
            <DropdownMenuItem onClick={() => onReleaseCustody(item)}>
              <IconUserMinus />
              Return to the store
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => onTakeItem(item)}>
              <IconPackageExport />
              Take this item
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => onEditItem(item)}>
            <IconPencil />
            Edit details
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onRetireItem(item)}
        >
          <IconTrash />
          Retire item
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/**
 * One line of the register.
 *
 * **The row opens on click; the keyboard path is the name button.**
 * `teachers-list.tsx` — the incumbent table in this app — does exactly this, and
 * for the same reason: making the `<tr>` itself a tab stop *as well as* the
 * button inside it puts one action in the tab order twice, which a screen-reader
 * user hears as "Projector, button" and then "row" and has to work out are the
 * same thing. So the `<tr>` carries the mouse affordance and the name is a real
 * `<button>`, which is focusable and activates on both Enter and Space for free
 * from the platform. The menu's own trigger stops propagation so opening the
 * menu does not also open the item.
 *
 * `cursor-pointer` is the one thing the row was missing. The shared `TableRow`
 * already carries `hover:bg-muted/50`, so a mouse user had a tint and no pointer —
 * which reads as "this row is selected" rather than "this row is a link", and
 * the name's own hover underline was the only real hint. It is the same `cursor-pointer`
 * `my-equipment.tsx` puts on its clickable rows, for the same reason.
 *
 * ## A retired row is neither clickable nor clickable-looking, and says so
 *
 * The row's click target is the custody history, and `listCustodyHistory` refuses
 * a retired item with `NOT_FOUND` — its own comment says a 200-item history of a
 * deleted row "is a dead end". So on a retired row the `<tr>` drops its handler
 * and its pointer, the name becomes plain text rather than a button, and the
 * `hover` tint is replaced by a flat muted band. A control that reliably opens a
 * dead end is the same defect as one that reliably fails, and the honest version of
 * a retired row is one that says what it is instead of pretending to be live.
 *
 * **The badge is the marker and the muted row is the second signal**, on purpose:
 * the badge is what a reader scanning the column sees, the tint is what a reader
 * scanning *across* the rows sees, and neither alone survives a monochrome print or
 * a colour-blind reader. What is *not* used is a red or amber tone — retired is not
 * a fault in the property, and this feature uses those tones for damaged and
 * out-of-stock, which it is.
 *
 * **The menu is the only thing a retired row offers**, and it offers one entry. See
 * `RowActionMenu` for why the other nine are controls the server will always refuse.
 *
 * **The menu is its own component, and the reason is the argument its comments
 * carry.** Every entry below is a decision about a *write* — what it is allowed to
 * appear on, and what it must not pre-empt — and that argument is longer than the
 * markup it explains. Held here it made the row a component nobody could read, and
 * the row is the thing a reader comes to for the columns; the menu is a list of nine
 * verbs with their own rules, so it is now read on its own.
 */
const InventoryRow = ({ item, onOpenItem, ...actions }: InventoryRowProps) => {
  const isRetired = item.deletedAt !== null;

  return (
    <TableRow
      className={
        isRetired
          ? "bg-muted/30 hover:bg-muted/30"
          : "hover:bg-muted/50 cursor-pointer"
      }
      onClick={isRetired ? undefined : () => onOpenItem(item)}
    >
      <TableCell className="max-w-64 whitespace-normal">
        {isRetired ? (
          <div className="flex flex-col items-start gap-0.5 text-left">
            <span className="text-muted-foreground font-medium line-through">
              {item.name}
            </span>
            <span className="text-muted-foreground font-mono text-xs">
              {item.sku}
            </span>
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <CategoryDot color={item.categoryColor} />
              {item.categoryName}
            </span>
            <RetiredBadge deletedAt={item.deletedAt} />
            <span className="text-muted-foreground text-xs">
              Off the working register. Its ledger and custody history are on
              file in the change log.
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenItem(item);
            }}
            className="hover:text-primary flex flex-col items-start gap-0.5 text-left"
          >
            <span className="font-medium underline-offset-4 hover:underline">
              {item.name}
            </span>
            <span className="text-muted-foreground font-mono text-xs">
              {item.sku}
            </span>
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <CategoryDot color={item.categoryColor} />
              {item.categoryName}
            </span>
            {/*
                Tagged or counted in bulk, and the distinction changes what a clerk can
                do with the row. A tagged item has one asset tag per unit, so a borrow
                names a device; a bulk line is a count, and the borrow takes the oldest
                units by the server's own record with nothing to name. It is a third
                muted line rather than a column because it is a property of the line, not
                something to be scanned across — and it is words, not a dot, so it
                survives without colour.
              */}
            <span className="text-muted-foreground text-xs">
              {item.uniqueIdCount > 0
                ? `${item.uniqueIdCount} tagged unit${item.uniqueIdCount === 1 ? "" : "s"}`
                : "Counted in bulk"}
            </span>
          </button>
        )}
      </TableCell>

      {/*
        The signature column. It is the widest cell in the table and the first
        one after the item's identity because it is the reason a reader opens
        this page at all: "who is in charge, and who is holding it" are two
        facts, and `CustodyBadge` renders all four legitimate combinations of them
        rather than leaving a gap where a pointer was null.

        Left rendering on a retired row, and that is a fact rather than an
        oversight: `deleteItem` snapshots the counters and writes no custody row,
        so the pointers on the row are exactly who was responsible when it left the
        register. Muting them would hide the last true statement the row makes.
      */}
      <TableCell className="max-w-72 whitespace-normal">
        <CustodyBadge
          managerName={item.managerName}
          custodianName={item.custodianName}
        />
      </TableCell>

      <TableCell>
        <StockFigures item={item} />
      </TableCell>

      {/*
        `borrowable` is a policy flag rather than a status, and it is the one
        column-adjacent fact that changes what a clerk can do here: an Available
        row that is not borrowable will be refused by `custody.take` with "this
        kind of thing is not handed out to teachers, so it stays with the store".
        Hiding that until the refusal means the register's headline question —
        "what can I hand out" — has a trap in it, so the flag is stated on the row
        in the server's own words. Rendered as text beside the status badge, never
        as a colour.

        **A retired row's status badge is suppressed entirely.** `calculateItemStatus`
        derives `out_of_stock` from `qty` and `borrowedQty` alone, so a retired line
        with 200 chairs reads "Out of stock" and a retired laptop reads "Available"
        — and a derived badge on a row that cannot be lent, issued, written off or
        edited is a badge answering a question the register should not be asking.
        The row's status *is* "retired", the badge above says so, and the two counters
        beside it still show the figures the ledger's two sides refer to.
      */}
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          {isRetired ? (
            <span className="text-muted-foreground text-xs">
              Not on the register — nothing can be lent, issued or written off
            </span>
          ) : (
            <>
              <ItemStatusBadge status={item.status} />
              {item.borrowable ? null : (
                <span className="text-muted-foreground text-xs">
                  Stays in the store
                </span>
              )}
              {/*
                  **The Available / Under Repair reconciliation, on the row.**
                  `calculateItemStatus` only takes an item off the available count for
                  `Damaged`; `Under Repair` deliberately does not, because a repaired
                  device comes back into service and a broken one does not
                  (`inventory-calculations.ts:99-116`). That is the right rule and it
                  produced a row nobody could reconcile: a green "Available" beside a gold
                  "Under Repair" with nothing saying why. The rule used to live only in the
                  edit form's description — on a different screen, about a different moment
                  — so it is stated here, next to the two badges that look contradictory.
                  One line, under the status it qualifies, and only for the combination
                  that needs it.
                */}
              {item.status === "available" &&
              item.condition === "Under Repair" ? (
                <span className="text-muted-foreground text-xs">
                  In for repair, still counted as available
                </span>
              ) : null}
            </>
          )}
        </div>
      </TableCell>

      {/*
        Condition and Location are the two columns that go below `md`. Desktop
        is the design target, and at 1280px there is room for them; below that
        the table scrolls horizontally inside the shadcn `Table` wrapper rather
        than reflowing into cards, because a register that reshapes itself is
        much harder to compare across rows.
      */}
      <TableCell className="hidden md:table-cell">
        {/*
          The one condition the Status column has already said, in the same words
          and the same treatment.

          `ItemStatusBadge`'s `damaged` and `ConditionBadge`'s `Damaged` are both
          `DESTRUCTIVE_SOFT` in `shared/inventory-status-badge.tsx`, so a damaged
          item printed the word "Damaged" twice in two adjacent columns in two
          identical red badges — and `calculateItemStatus` returns `damaged` only
          when `condition === "Damaged"`, so the two were *always* the same fact on
          the same row. Two badges is not emphasis, it is a printing mistake.

          So the Status column keeps the badge (it is the derived, actionable fact:
          the item is off the available count) and this cell states the recorded
          condition in words instead, saying what it caused. The treatments now
          differ — a badge against muted text — which is what the columns are:
          derived state on one side, the recorded fact on the other.

          The condition is `condition` rather than `status` in the test, because an
          item with **no units on hand** and a Damaged condition is badged
          "Out of stock", and there the word "Damaged" is not on screen anywhere
          else and the badge is the right answer.
        */}
        {item.status === "damaged" && !isRetired ? (
          <span className="text-muted-foreground text-xs">
            Damaged — taken off the available count
          </span>
        ) : (
          <ConditionBadge condition={item.condition} />
        )}
      </TableCell>

      <TableCell className="hidden max-w-40 truncate md:table-cell">
        {item.location || "—"}
      </TableCell>

      <TableCell className="w-10">
        <RowActionMenu item={item} {...actions} />
      </TableCell>
    </TableRow>
  );
};

/**
 * The destructive confirmation, and it lives with the table because the row menu
 * is what raises it.
 *
 * `items.remove` is a **soft** delete, and the copy says so: the row leaves the
 * working register and every ledger row that describes it — its unit movements,
 * its custody trail, its borrow history — stays in the database, because an
 * asset register that can lose a row is not an asset register. The server also
 * refuses outright while any unit is borrowed, issued or disposed, and it names
 * the offending asset tag when it does, so the dialog promises a retirement and
 * the refusal is a message about a specific device rather than a surprise.
 */
const RetireItemDialog = ({
  item,
  isPending,
  onCancel,
  onConfirm,
}: {
  item: InventoryItemView | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <AlertDialog
    open={item !== null}
    onOpenChange={(open) => {
      if (!open) {
        onCancel();
      }
    }}
  >
    <AlertDialogContent className="sm:max-w-md">
      <AlertDialogTitle>Retire {item?.name ?? "this item"}</AlertDialogTitle>
      <AlertDialogDescription>
        {item ? (
          <>
            <span className="font-mono text-xs">{item.sku}</span> — {item.qty}{" "}
            unit(s) will leave the working register. Nothing is deleted: the
            movement ledger, the custody trail and every loan of this item stay
            on file and remain auditable. An item cannot be retired while any of
            its units is borrowed, issued or awaiting disposal — the server will
            say which one.
          </>
        ) : null}
      </AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          disabled={isPending}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {isPending ? "Retiring..." : "Retire item"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/**
 * The restore confirmation, and it is an `AlertDialog` for the same reason the
 * retirement one is — **the write is reversible in the other direction too, and
 * that is the whole reason to ask.**
 *
 * A storekeeper who has just turned "Show retired" on is looking at a row that is
 * off the register, and restoring it puts it straight back into the working set:
 * it becomes lendable, issuable, editable and countable again, in front of
 * everyone else using the register. So the dialog states the two things that
 * change — the row comes back, and nothing about its history, counters or
 * responsibilities was lost while it was out — and it names what the server
 * refuses: a restore whose SKU has meanwhile been taken by a live line.
 *
 * **It asks for no reason, and that is `restore-item.ts`'s decision, not an
 * omission here.** There is nothing in this flow to justify: the ledger already
 * carries who retired the item, when, who restored it and when, and the change log
 * carries the full before/after pair. A text box whose value would be "restored" on
 * every invocation is a field nobody reads.
 */
const RestoreItemDialog = ({
  item,
  isPending,
  onCancel,
  onConfirm,
}: {
  item: InventoryItemView | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <AlertDialog
    open={item !== null}
    onOpenChange={(open) => {
      if (!open) {
        onCancel();
      }
    }}
  >
    <AlertDialogContent className="sm:max-w-md">
      <AlertDialogTitle>
        Put {item?.name ?? "this item"} back on the register
      </AlertDialogTitle>
      <AlertDialogDescription>
        {item ? (
          <>
            <span className="font-mono text-xs">{item.sku}</span> — {item.qty}{" "}
            unit(s) and the {item.categoryName.toLowerCase()} it belongs to
            return to the working register with everything they had: the same
            manager and custodian, the same asset tags, the same counted
            quantity. It can be lent, issued, written off and edited again from
            that moment, and the retirement and this restore both stay in the
            change log. The server will refuse if the same code has meanwhile
            been given to a live item.
          </>
        ) : null}
      </AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm} disabled={isPending}>
          {isPending ? "Restoring..." : "Restore to the register"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/**
 * The four pointer columns a custody write can move, and nothing else.
 *
 * It is deliberately not the whole `InventoryItemView`: a local reconciliation is a
 * claim about two facts the register got wrong for a few hundred milliseconds, and
 * a type that can carry more of the row is a type that will eventually carry a `qty`
 * somebody guessed at. Both of the dialogs that report through `onRecorded` move
 * pointers and nothing else — `transferOwnership` writes `managerStaffId` and clears
 * `custodianStaffId` (`transfer-ownership.ts:270-276`) and `reclaimCustody` writes
 * `custodianStaffId` alone (`reclaim-custody.ts:201-204`) — so these four fields are
 * the entire difference between the row the server has and the row the browser is
 * still holding.
 */
interface CustodyPointers {
  managerStaffId: string | null;
  managerName: string | null;
  custodianStaffId: string | null;
  custodianName: string | null;
}

/**
 * A local correction to one row, and the `items` array it was made against.
 *
 * **`source` is the load-bearing field, and it is what retires the patch without an
 * effect.** Both dialogs invalidate the `custody` scope themselves, so the refetch
 * carrying the server's real answer is already in flight the moment `onRecorded`
 * fires; the patch covers the gap between the write landing and that response
 * arriving. The refetch delivers a **new array** for `items`, so `source` stops
 * matching the moment the server has answered and the row is the server's row again.
 *
 * The alternative was a `useEffect` clearing the patch on `items`, which buys the
 * same result one render later — after a frame in which the patch and the refetch
 * disagree, which is precisely the frame `CustodyHistorySheet` derives its `view`
 * during render in order to avoid. And because a patch is a *guess about four
 * columns* rather than a fork of the row, a superseded one is simply not applied: it
 * cannot outvote a later refetch, and it cannot outvote a change another dialog
 * made. Nothing has to remember to clear it, because nothing can reach it.
 */
interface LocalCustodyWrite {
  source: InventoryItemView[] | undefined;
  itemId: string;
  patch: CustodyPointers;
}

/**
 * The two owner dialogs a row menu can open: their targets, and the local patch
 * that reconciles the row behind them.
 *
 * **Why this is a hook and not four pieces of state in the table.** The two dialogs
 * own their mutations, toasts and invalidation, so all that is left is open state —
 * and open state that is *only* useful together with the patch it produces. Split
 * across the table's body it is four `useState`s and two `onRecorded` handlers whose
 * connection is the reader's job to see, which is how a local reconciliation ends up
 * quietly dropped the next time a row menu grows a fifth entry.
 *
 * It takes the row menu's own two handlers, because **opening either verb does two
 * things and needs both.** The table sets its own target, because the dialog's `item`
 * has to be *the row as this table currently believes it* — the one `rows` has just
 * reconciled, not a second copy taken from the page, which would be a fresh stale
 * snapshot and would mount a reclaim for a holder the hand-on has already released.
 * And the page's handler still runs, because the register keeps exactly one answer to
 * "which item is this about" and every other row action upholds it. The two are not
 * competing stores: `selectedItem` is the register's selection, and a target is one
 * dialog's subject.
 */
const useOwnerVerbs = (
  items: InventoryItemView[] | undefined,
  onTransferOwnership: (item: InventoryItemView) => void,
  onReclaimCustody: (item: InventoryItemView) => void
) => {
  const [ownershipTarget, setOwnershipTarget] =
    useState<InventoryItemView | null>(null);
  const [reclaimTarget, setReclaimTarget] = useState<InventoryItemView | null>(
    null
  );
  const [recentWrite, setRecentWrite] = useState<LocalCustodyWrite | null>(
    null
  );

  /**
   * The hand-on's `onRecorded`, turned into a patch on the one row it is about.
   *
   * **What the callback gives us, and what it does not.** `TransferOwnershipDialog`
   * reports `{ staffId, name }` for the new owner — both columns, which is the half
   * the "Responsible" cell reads. It does not report the holder, and that is not an
   * omission in the callback: `transferOwnership` clears `custodianStaffId` in the
   * same `set` that writes the new manager (`transfer-ownership.ts:270-276`), and
   * `TransferOwnershipDialogProps.onRecorded` documents why it reports only the
   * owner. The custody sheet's handler writes the same two nulls by hand for the
   * same reason, and this is that handler, one layer up.
   *
   * **A patch rather than a replacement row, and applied to the row rather than to
   * the page's `selectedItem` — that is the difference from the sheet, and it is the
   * point.** The thing that must stop being stale is the *row*, because the row's
   * menu is what gates "Call it back" on `hasCustodian`. A hand-on clears the
   * holder, so without this the entry would outlive the write by a few hundred
   * milliseconds and then open a `ReclaimCustodyDialog` that returns `null` — a menu
   * item that reliably does nothing, which is the failure this menu has had to remove
   * before.
   *
   * `ownershipTarget` rather than a ref, because this is read during a render the
   * dialog's own `onOpenChange(false)` has not yet invalidated: the target is the
   * only statement of *which* row the callback is about, and the dialog that reported
   * it was opened from it.
   */
  const recordOwnership = useCallback(
    (owner: { staffId: string; name: string | null }) => {
      const target = ownershipTarget;
      if (!target) {
        return;
      }

      setRecentWrite({
        source: items,
        itemId: target.id,
        patch: {
          managerStaffId: owner.staffId,
          managerName: owner.name,
          custodianStaffId: null,
          custodianName: null,
        },
      });
    },
    [items, ownershipTarget]
  );

  /**
   * The reclaim's `onRecorded`, and **the name it carries is deliberately dropped.**
   *
   * `ReclaimCustodyDialog` reports `{ name }` — the *previous* holder — and the
   * feature's own `PartyName` reasoning says a name beside a null pointer is a
   * different fact from a departed staff record, which it strikes through. Here it
   * would be simply false: `reclaim-custody.ts:285-290` returns `custodianStaffId:
   * null` and `custodianName: null` together, the name is in the toast and in the
   * trail, and "nobody — it is in the store" is what the register now says.
   *
   * The manager pair is read back off the target rather than restated, because a
   * reclaim does not touch it: `reclaimCustody`'s `set` is `{ custodianStaffId: null }`
   * and nothing else, and a patch that re-wrote the owner column would be the code
   * disagreeing with the dialog's own promise that calling something back is not a
   * hand-on.
   */
  const recordReclaim = useCallback(() => {
    const target = reclaimTarget;
    if (!target) {
      return;
    }

    setRecentWrite({
      source: items,
      itemId: target.id,
      patch: {
        managerStaffId: target.managerStaffId,
        managerName: target.managerName,
        custodianStaffId: null,
        custodianName: null,
      },
    });
  }, [items, reclaimTarget]);

  const openOwnership = useCallback(
    (item: InventoryItemView) => {
      onTransferOwnership(item);
      setOwnershipTarget(item);
    },
    [onTransferOwnership, setOwnershipTarget]
  );

  const openReclaim = useCallback(
    (item: InventoryItemView) => {
      onReclaimCustody(item);
      setReclaimTarget(item);
    },
    [onReclaimCustody, setReclaimTarget]
  );

  /**
   * `open` is *derived* from the target rather than held beside it, which is the
   * second thing that makes these two cheap: a `null` target is exactly a closed
   * dialog, so there is no second piece of state to fall out of step with the first
   * and no way to reach a mounted dialog for no item.
   */
  const closeOwnership = useCallback(
    (open: boolean) => {
      if (!open) {
        setOwnershipTarget(null);
      }
    },
    [setOwnershipTarget]
  );

  const closeReclaim = useCallback(
    (open: boolean) => {
      if (!open) {
        setReclaimTarget(null);
      }
    },
    [setReclaimTarget]
  );

  return {
    recentWrite,
    openOwnership,
    openReclaim,
    ownershipDialog: {
      open: ownershipTarget !== null,
      item: ownershipTarget,
      onOpenChange: closeOwnership,
      onRecorded: recordOwnership,
    },
    reclaimDialog: {
      open: reclaimTarget !== null,
      item: reclaimTarget,
      onOpenChange: closeReclaim,
      onRecorded: recordReclaim,
    },
  };
};

/**
 * The rows the table draws: the loaded page, sorted, with any local write applied.
 *
 * Its own hook, and the mirror of `useRegisterRows` in `inventory-page.tsx` — that
 * one is the page's predicate over what came back, this is the table's ordering and
 * reconciliation over what it was given. Two of the table's four decisions live here
 * rather than in its body, which is also what keeps the component itself readable.
 *
 * ## The client-side sort, and the assumption it rests on
 *
 * **The server has no sort parameter, and this does not pretend otherwise.**
 * `listItems` orders by `createdAt DESC, id DESC` and offers no alternative, so a
 * "sort by name" control here is a sort of the page the server sent — which is a
 * sort of the *whole* result set only because the page is capped at 200 rows
 * (`REGISTER_PAGE_SIZE` in `inventory-page.tsx`, restating `listItems`' own
 * `DEFAULT_LIMIT`, and the two must stay the same number). A school's asset register
 * is a few hundred lines, not a warehouse.
 *
 * The day that stops being true, the "showing N of M" line above this table is what
 * says so — a truncated page makes the truncation visible, which is the signal to
 * move the sort server-side rather than to leave a control that silently sorts an
 * arbitrary slice.
 *
 * `toSorted` rather than `sort`, so the array held in the query cache is never
 * mutated in place.
 *
 * ## The local patch, applied after the sort
 *
 * `useOwnerVerbs` explains the patch itself and why it is anchored to the `items`
 * array's identity rather than cleared by an effect. Two things belong here because
 * they are this memo's decisions: the patch is applied **after** the sort, so the
 * ordering is still the one the reader's own sort produced, and the fast path is
 * untouched — with no patch this returns the same array reference it always did.
 */
const useSortedRows = (
  items: InventoryItemView[] | undefined,
  sort: SortState | null,
  recentWrite: LocalCustodyWrite | null
): InventoryItemView[] =>
  useMemo(() => {
    const list = items ?? [];
    const sorted = sort
      ? list.toSorted((a, b) => {
          const compared =
            sort.key === "name"
              ? a.name.localeCompare(b.name, undefined, { numeric: true })
              : a.availableQty - b.availableQty;

          return sort.direction === "asc" ? compared : -compared;
        })
      : list;

    if (!recentWrite || recentWrite.source !== items) {
      return sorted;
    }

    return sorted.map((row) =>
      row.id === recentWrite.itemId ? { ...row, ...recentWrite.patch } : row
    );
  }, [items, recentWrite, sort]);

/**
 * The register's column headings, which are also its two sort controls.
 *
 * Its own component for one reason and one only: the seven columns and the argument
 * for the one that is deliberately **not** sortable are a shape, and keeping them
 * out of the table's body keeps the part a reader scrolls to — the rows — readable
 * on its own. `SortableHead` already holds the per-column machinery; this holds the
 * order and the one decision about it.
 */
const RegisterTableHeader: React.FC<{
  sort: SortState | null;
  onToggleSort: (key: SortKey) => void;
}> = ({ sort, onToggleSort }) => (
  <TableHeader>
    <TableRow className="bg-primary hover:bg-primary border-none">
      <SortableHead
        label="Asset"
        sort={sort}
        activeKey="name"
        onToggle={onToggleSort}
        className={COLUMN_HEADING}
      />
      {/*
        The custody column is not sortable and deliberately so: sorting a
        pair of people by one of them produces a half-ordered column that
        reads as a ranking, and nobody has ever asked "who is the most
        responsible custodian".
      */}
      <TableHead className={`${COLUMN_HEADING} max-w-72`}>
        Responsible
      </TableHead>
      <SortableHead
        label="On hand / available / loan"
        sort={sort}
        activeKey="availableQty"
        onToggle={onToggleSort}
        className={COLUMN_HEADING}
      />
      <TableHead className={COLUMN_HEADING}>Status</TableHead>
      <TableHead className={`${COLUMN_HEADING} hidden md:table-cell`}>
        Condition
      </TableHead>
      <TableHead className={`${COLUMN_HEADING} hidden md:table-cell`}>
        Location
      </TableHead>
      <TableHead className={COLUMN_HEADING}>
        <span className="sr-only">Actions</span>
      </TableHead>
    </TableRow>
  </TableHeader>
);

export interface InventoryTableProps {
  items: InventoryItemView[] | undefined;
  totalCount: number | undefined;
  isLoading: boolean;
  /** Whether a filter is narrowing the list — decides which empty state is honest. */
  isFiltered: boolean;
  error: unknown;
  onRetry: () => void;
  onClearFilters: () => void;
  /** False on a fresh install, which is when "seed the categories" is the right first action. */
  hasCategories: boolean;
  isSeedPending: boolean;
  onSeedCategories: () => void;
  onCreateItem: () => void;
  onOpenItem: (item: InventoryItemView) => void;
  onViewCustody: (item: InventoryItemView) => void;
  onTransferCustody: (item: InventoryItemView) => void;
  onAssignManager: (item: InventoryItemView) => void;
  onTransferOwnership: (item: InventoryItemView) => void;
  onReclaimCustody: (item: InventoryItemView) => void;
  onTakeItem: (item: InventoryItemView) => void;
  onReleaseCustody: (item: InventoryItemView) => void;
  onEditItem: (item: InventoryItemView) => void;
  /**
   * Resolves on success and **rejects on a refusal** — a unit still borrowed, issued
   * or awaiting disposal — which is a documented outcome, not an exceptional one. The
   * table catches it (see `retire` below) and the page's mutation handler toasts the
   * server's sentence; this prop is passed straight through rather than wrapped in a
   * `void`-returning shim, because the dialog's confirm handler needs to know the
   * promise can reject.
   */
  onRetireItem: (item: InventoryItemView) => Promise<void>;
  /** Disables the confirm button while the write is in flight. */
  isRetirePending: boolean;
  /**
   * The inverse. **Rejects** for the same documented reason `onRetireItem` does —
   * a live item under the same SKU is a real outcome, and the page's mutation
   * observer toasts the server's sentence.
   */
  onRestoreItem: (item: InventoryItemView) => Promise<void>;
  isRestorePending: boolean;
}

/**
 * The two empty states, and the choice between them.
 *
 * **Which one is shown is the difference between helpful and insulting.** A store
 * with no items at all cannot create one until a category exists — `createItem`
 * requires a `categoryId` behind a `restrict` foreign key — so the first action named
 * on that state is the one that actually unblocks the form, and `categories.seed` is
 * the procedure that exists to do it. "No data" would be true and useless. The
 * filtered state is a different sentence about a store that is *full* and whose
 * filters happen to match nothing, so its action is "clear filters" and its copy
 * says so.
 *
 * Extracted rather than inlined in the table's own body because it is a third of the
 * markup and none of the table's logic: the props are booleans and callbacks, and
 * keeping them in one component is what lets a reader see the branch — filtered or
 * not — as the single decision it is.
 */
const RegisterEmptyState = ({
  isFiltered,
  hasCategories,
  isSeedPending,
  onSeedCategories,
  onCreateItem,
  onClearFilters,
}: {
  isFiltered: boolean;
  hasCategories: boolean;
  isSeedPending: boolean;
  onSeedCategories: () => void;
  onCreateItem: () => void;
  onClearFilters: () => void;
}) => {
  if (isFiltered) {
    return (
      <InventoryEmptyState
        title={EMPTY_FILTERED_COPY.title}
        description={EMPTY_FILTERED_COPY.description}
        action={
          <Button type="button" variant="outline" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    );
  }

  return (
    <InventoryEmptyState
      title={EMPTY_REGISTER_COPY.title}
      description={EMPTY_REGISTER_COPY.description}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {hasCategories ? null : (
            <Button
              type="button"
              variant="outline"
              onClick={onSeedCategories}
              disabled={isSeedPending}
              data-icon="inline-start"
            >
              <IconCategory data-icon="inline-start" />
              {isSeedPending ? "Seeding..." : "Seed categories"}
            </Button>
          )}
          <Button type="button" onClick={onCreateItem} data-icon="inline-start">
            <IconPackageExport data-icon="inline-start" />
            Register the first item
          </Button>
        </div>
      }
    />
  );
};

/**
 * The register, as a table.
 *
 * **No bulk selection, on purpose.** A checkbox column above a school asset register
 * offers one obvious thing: "delete everything ticked". The nearest bulk write this
 * feature has is a disposal, and a disposal takes **a signature, per unit** — it is
 * the one irreversible act in the feature and the reason it is two-staged. A row of
 * ticks that quietly produced a mixed write-off across a borrowed projector and a box
 * of chairs would be a false affordance wearing the costume of a convenience, and it
 * would be one keystroke away from being used on the wrong selection.
 * `teachers-list.tsx` has bulk delete because deleting a teacher is a single,
 * server-guarded, reversible-in-effect record change; retiring inventory is not the
 * same act, so it does not get the same affordance. Every destructive action here is
 * per row, named, and behind an `AlertDialog`.
 */
export const InventoryTable = ({
  items,
  totalCount,
  isLoading,
  isFiltered,
  error,
  onRetry,
  onClearFilters,
  hasCategories,
  isSeedPending,
  onSeedCategories,
  onCreateItem,
  onOpenItem,
  onViewCustody,
  onTransferCustody,
  onAssignManager,
  onTransferOwnership,
  onReclaimCustody,
  onTakeItem,
  onReleaseCustody,
  onEditItem,
  onRetireItem,
  isRetirePending,
  onRestoreItem,
  isRestorePending,
}: InventoryTableProps) => {
  const [sort, setSort] = useState<SortState | null>(null);
  const [retireTarget, setRetireTarget] = useState<InventoryItemView | null>(
    null
  );
  const [restoreTarget, setRestoreTarget] = useState<InventoryItemView | null>(
    null
  );

  const toggleSort = useCallback((key: SortKey) => {
    setSort((previous) => {
      if (previous?.key !== key) {
        // First click on a column is ascending, which is what "sort by name"
        // means to the person who clicked it. For `availableQty` it is
        // deliberate too: the empty end of the column is the interesting end.
        return { key, direction: "asc" };
      }

      if (previous.direction === "asc") {
        return { key, direction: "desc" };
      }

      // Third click hands the ordering back to the server, which is a real
      // third state rather than a repeat of ascending: the register's natural
      // order is newest-first and there is no reason to make the user
      // re-derive it.
      return null;
    });
  }, []);

  /**
   * The write itself, wrapped so a refusal cannot escape as an unhandled rejection.
   *
   * **`items.remove` refuses while any unit is borrowed, issued or awaiting disposal,
   * and a refusal is the documented common case** — it is what a storekeeper retiring
   * a projector in the middle of term will hit. `mutateAsync` rejects, the page's
   * `onError` has already toasted the sentence naming the offending asset tag, and
   * nothing else wants the rejection. `void` on the bare promise put an unhandled
   * rejection on the console for every one of them, which is how a *normal* outcome
   * ends up looking like a bug in the error reporting.
   *
   * `try`/`catch` rather than `.catch()` on the call, because `prefer-await-to-then`
   * is right about the readable form here; and no `finally`, because the React
   * Compiler cannot analyse a `finally` with no `catch` beside it — there is no
   * cleanup to do in the first place.
   */
  const retire = useCallback(
    async (item: InventoryItemView) => {
      try {
        await onRetireItem(item);
      } catch {
        // Reported by the page's mutation observer. See above.
      }
    },
    [onRetireItem]
  );

  /**
   * The restore write, wrapped for the identical reason as `retire` above: a
   * `CONFLICT` on the SKU is a documented outcome rather than an exceptional one,
   * `mutateAsync` rejects, the page's `onError` has already toasted the sentence
   * naming the live line that holds the code, and nothing else wants the rejection.
   */
  const restore = useCallback(
    async (item: InventoryItemView) => {
      try {
        await onRestoreItem(item);
      } catch {
        // Reported by the page's mutation observer.
      }
    },
    [onRestoreItem]
  );

  /**
   * Retire, and close.
   *
   * The dialog closes on the click rather than on the mutation settling, and that
   * is deliberate on both sides: the confirmation has done its job the moment the
   * user confirms, and a dialog frozen open on a spinner while a soft delete
   * completes in a few hundred milliseconds is a worse read than one that gets out
   * of the way. The outcome is not lost — the page's mutation toasts it, and a
   * refusal (a unit still borrowed, issued or awaiting disposal) arrives as a
   * sentence naming the asset tag that caused it.
   */
  const confirmRetire = useCallback(() => {
    const target = retireTarget;
    if (!target) {
      return;
    }

    setRetireTarget(null);
    void retire(target);
  }, [retire, retireTarget]);

  /**
   * Confirm a restore, and close — the same shape as `confirmRetire` above and for
   * the same reason: the confirm has done its job the moment the user confirms, and
   * a dialog frozen on a spinner while a one-column `UPDATE` completes is a worse
   * read than one that gets out of the way. The outcome is not lost; the page's
   * mutation toasts it, including the date the item was retired, which is the fact
   * a reader who just put a row back wants to see.
   */
  const confirmRestore = useCallback(() => {
    const target = restoreTarget;
    if (!target) {
      return;
    }

    setRestoreTarget(null);
    void restore(target);
  }, [restore, restoreTarget]);

  const {
    recentWrite,
    openOwnership,
    openReclaim,
    ownershipDialog,
    reclaimDialog,
  } = useOwnerVerbs(items, onTransferOwnership, onReclaimCustody);

  /**
   * The rows this table draws, and the two decisions behind them.
   *
   * Both arguments live in `useSortedRows` — the assumption the client-side sort
   * rests on, and why the local patch is applied after it rather than before. What is
   * left here is the wiring, which is the table's: the page's rows, the reader's own
   * sort state, and whatever the two owner verbs last wrote.
   */
  const rows = useSortedRows(items, sort, recentWrite);

  const isTruncated =
    totalCount !== undefined && rows.length > 0 && rows.length < totalCount;

  /*
   * The "showing N of M" line itself is the filter bar's, one element above this
   * table — `InventoryFilterBar` renders it from the same `resultCount` /
   * `totalCount` pair and adds the half that matters ("clear a filter to widen
   * the list"). Repeating the sentence here would be noise. What this table
   * contributes instead is the same fact in the one place a screen-reader user
   * can actually reach it: the table's own accessible name, which is otherwise
   * just "table". A sighted reader has the line above; a non-visual one gets it
   * here, and nobody gets it twice.
   */
  const tableLabel = buildTableLabel(rows.length, totalCount, isTruncated);

  if (error) {
    return <InventoryErrorState error={error} onRetry={onRetry} />;
  }

  if (isLoading) {
    return <InventorySkeleton />;
  }

  if (rows.length === 0) {
    return (
      <RegisterEmptyState
        isFiltered={isFiltered}
        hasCategories={hasCategories}
        isSeedPending={isSeedPending}
        onSeedCategories={onSeedCategories}
        onCreateItem={onCreateItem}
        onClearFilters={onClearFilters}
      />
    );
  }

  return (
    <div className="border-primary/14 flex flex-col border">
      {/*
        The sort explanation, in the document rather than in a `title`. It is the one
        sentence that distinguishes "sort" from "reorder the whole register", and a
        `title` is invisible to a keyboard user — every sort button below points at
        this paragraph's id with `aria-describedby`, so it is read on focus as well
        as seen. It sits above the table rather than below it because the affordance
        it qualifies is in the header.
      */}
      <p
        id={SORT_SCOPE_NOTE_ID}
        className="text-muted-foreground border-b px-3 py-2 text-xs"
      >
        {SORT_SCOPE_NOTE}
      </p>
      <Table aria-label={tableLabel}>
        <RegisterTableHeader sort={sort} onToggleSort={toggleSort} />
        <TableBody>
          {rows.map((item) => (
            <InventoryRow
              key={item.id}
              item={item}
              onOpenItem={onOpenItem}
              onViewCustody={onViewCustody}
              onTransferCustody={onTransferCustody}
              onAssignManager={onAssignManager}
              onTransferOwnership={openOwnership}
              onReclaimCustody={openReclaim}
              onTakeItem={onTakeItem}
              onReleaseCustody={onReleaseCustody}
              onEditItem={onEditItem}
              onRetireItem={setRetireTarget}
              onRestoreItem={setRestoreTarget}
            />
          ))}
        </TableBody>
      </Table>

      {/*
        "Showing N of M" is the filter bar's line, above this table, and it is
        deliberately not repeated here: `InventoryFilterBar` renders it against the
        same `resultCount` / `totalCount` pair this table is given, and it adds the
        half that matters ("clear a filter to widen the list"). Two identical
        sentences a few pixels apart would be noise. The count reaches a screen
        reader through the table's `aria-label` above instead, which is the one
        place a non-visual reader can reach it — and because the page hands both
        components the *same* pair, the sighted and the spoken counts cannot
        disagree.
      */}

      <RetireItemDialog
        item={retireTarget}
        isPending={isRetirePending}
        onCancel={() => setRetireTarget(null)}
        onConfirm={confirmRetire}
      />

      {/*
        The mirror of the dialog above, for the same reason it is here: the row
        menu is what raises it, and a dialog opened from a row belongs to the row.
        Mounted beside `RetireItemDialog` rather than in the page because the two
        are the two ends of one action and neither is reachable without a row —
        which is also why a retired row is the only place this one can be opened
        from, and the only place the other one cannot.
      */}
      <RestoreItemDialog
        item={restoreTarget}
        isPending={isRestorePending}
        onCancel={() => setRestoreTarget(null)}
        onConfirm={confirmRestore}
      />

      {/*
        The two owner dialogs, mounted here beside `RetireItemDialog` because the
        row menu is what raises them — the same target-instead-of-a-flag pattern, and
        the same reason for it: a dialog opened from a row belongs to the row, and
        the page's `selectedItem` is a second answer to "which item is this about"
        that these two deliberately do not use. `useOwnerVerbs` builds each one's
        props, including the `open` it derives from the target.

        **No `is*Pending` prop, and that is the proof of who owns the write.** These
        two own their mutations, toasts and invalidation, which is why the page adds
        open state and nothing else. They are the two dialogs in this feature
        deliberately left out of `CustodyDialogs` for that reason, and mounting them
        here is the other of the two doors its own banner comment describes: both
        take an `InventoryItemView | null` and report what they wrote through
        `onRecorded`, so neither door is a special case.
      */}
      <TransferOwnershipDialog {...ownershipDialog} />
      <ReclaimCustodyDialog {...reclaimDialog} />
    </div>
  );
};
