"use client";

import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { Checkbox } from "@school-student-teacher-management/ui/components/checkbox";
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
  TableCell,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import {
  IconArchive,
  IconBuildingWarehouse,
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

import type { InventoryItemView } from "@/components/staff/inventory/inventory-types";
import {
  ConditionBadge,
  CustodyFlow,
  ItemStatusBadge,
} from "@/components/staff/inventory/shared";
import { formatDateTime } from "@/components/staff/inventory/stock-dialogs";

/**
 * One line of the register, and every cell in it.
 *
 * ## Why the cells are components and not markup
 *
 * The row is nine columns of which six carry a decision and a sentence of
 * explanation. Held as one `<tr>` it was a component nobody could read, and the
 * part a reader scrolls to — the rows — was the part with the least readable
 * shape. So the row keeps the columns, the order, the click target and the
 * selection, and each cell that carries a *decision* is its own named function
 * with that decision written down beside it: what the retired row's identity
 * cell says, why the status cell suppresses a derived badge, why the condition
 * cell states a word rather than repeating a badge.
 *
 * The row's action menu is a component for a related reason: every entry below
 * is a decision about a *write* — what it is allowed to appear on, and what it
 * must not pre-empt — and that argument is longer than the markup it explains.
 */

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
 * The item's own photo, as a square thumbnail beside its identity — the
 * register's one visual confirmation that the row and the physical object
 * agree, which the text columns alone cannot give a clerk standing in the
 * store holding the thing.
 *
 * `item.imageUrl` is already the app's own serving URL
 * (`/api/files/<fileId>`, built in `inventory-database.ts`), so this needs no
 * knowledge of MinIO, presigning, or the upload pipeline — it is exactly the
 * same `<img src>` the item form's own preview uses. Unphotographed is the
 * overwhelming majority of a school's store, so the empty state is the
 * category's own colour dot on a plain tile — the one piece of visual
 * identity every row already has, rather than a generic placeholder icon that
 * says nothing about the item.
 */
const AssetThumbnail: React.FC<{ item: InventoryItemView }> = ({ item }) =>
  item.imageUrl ? (
    <img
      alt=""
      className="border-primary/14 size-10 shrink-0 border object-cover"
      src={item.imageUrl}
    />
  ) : (
    <div
      aria-hidden="true"
      className="border-primary/14 bg-muted flex size-10 shrink-0 items-center justify-center border"
    >
      <CategoryDot color={item.categoryColor} />
    </div>
  );

/**
 * The two counters, in the order a clerk reads them.
 *
 * **Available is the emphasised one and the other two are muted, deliberately.**
 * The question this table exists to answer is "what can I hand out right now",
 * and `availableQty` is the server's own derivation of it (`qty`,
 * floored at zero) rather than something recomputed here - a third
 * implementation of that subtraction is exactly the drift
 * `inventory-calculations.ts` was written to prevent. `qty` stays on the row
 * beside it as the on-hand figure a clerk reads second.
 *
 * The separator is `aria-hidden` and each figure carries its own `sr-only`
 * label, so a screen reader hears "3 on hand, 2 available to hand out" rather
 * than "3 slash 2".
 */
const StockFigures: React.FC<{ item: InventoryItemView }> = ({ item }) => {
  /*
   * `qty <= minQty` and nothing else, because that is exactly what the server's
   * `lowStockOnly` filter is and exactly what the register's "Low stock" card
   * counts — it is a server total, lifted to its own `limit: 1` query.
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
      </span>
      {isLow ? (
        /*
         * The `warning` variant, and the badge's whole argument is in its
         * definition in `packages/ui/src/components/badge.tsx`: this is the
         * register's own "needs attention" treatment, `--warning-ink` on
         * `bg-accent/20` at 5.65:1. It was `variant="outline"` with hand-written
         * `border-accent/50 text-warning-ink` classes, which reached the same
         * colours and meant that the next edit to the badge variants would not
         * have reached this row.
         *
         * The border stays on `accent/50` and the fill on `accent/20` because
         * those are surfaces, not ink — and `--gold` is never used for this
         * text, at any size: on the page background it is 3.87:1 and on this
         * badge's own fill 3.45:1, both under AA for `text-xs`.
         *
         * **No `h-4`.** The badge's own base is `h-5 … py-0.5 text-xs
         * whitespace-nowrap overflow-hidden`, so overriding the height to 16px left a
         * 16px line box in a 16px content box and clipped the label vertically. The
         * horizontal padding is tightened instead, which is the axis that had room.
         */
        <Badge variant="warning" className="px-1.5">
          At reorder level
        </Badge>
      ) : null}
    </div>
  );
};

/**
 * "Retired", as a badge, and the one thing on the row that must not be missed.
 *
 * **Words, a dashed edge and a struck-through date beside them — never a colour
 * alone.** Every other state on this register is carried by a badge whose tone
 * means something (`ItemStatusBadge`, `ConditionBadge`, `CustodyFlow`), and a
 * reader who has learned those four tones will read a fifth one as a fifth kind
 * of *condition*: low, damaged, borrowed. Retired is not a condition of the
 * thing, it is a fact about the record, and it needs its own word — and its own
 * *shape*, which is why the border is dashed. A reader who cannot tell the
 * amber fills apart can still tell a dashed edge from a solid one.
 *
 * It is `outline` and not `warning` for the same reason: `warning` is the
 * register's "needs attention" tone, and retired is not a fault in the property.
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

export interface InventoryRowProps {
  item: InventoryItemView;
  isSelected: boolean;
  onToggleSelect: (itemId: string) => void;
  onOpenItem: (item: InventoryItemView) => void;
  onViewCustody: (item: InventoryItemView) => void;
  onTransferCustody: (item: InventoryItemView) => void;
  onAssignManager: (item: InventoryItemView) => void;
  onTransferOwnership: (item: InventoryItemView) => void;
  onReclaimCustody: (item: InventoryItemView) => void;
  onTakeItem: (item: InventoryItemView) => void;
  onReleaseCustody: (item: InventoryItemView) => void;
  /**
   * Whether this caller's role holds `inventory: ["take"]` — the self-service
   * claim and hand-back. `canSelfServeInventory` in
   * `packages/auth/src/roles.ts`, from the session, computed once by the page
   * and handed down rather than read per row.
   *
   * **It decides whether the two entries are drawn, and it is not a security
   * control.** The procedures are gated server-side and narrow again in their
   * handlers; this only stops the register offering a seat two entries that
   * answer `Forbidden` on every row. The Inventory Administrator was the seat
   * that proved it: its grant is the register's, minus `take`, and the register
   * is its own workspace.
   */
  canSelfServe: boolean;
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
type RowActionProps = Omit<
  InventoryRowProps,
  "item" | "onOpenItem" | "isSelected" | "onToggleSelect"
>;

interface RowActionMenuProps extends RowActionProps {
  item: InventoryItemView;
}

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
    canSelfServe,
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
            claim and a first appointment), so they belong in one block a
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

            **And "Call it back" is deliberately not "Hand it back", although
            both are writes to the custodian pointer.** The owner is reaching
            into a colleague's hands: the holder did not ask for it, cannot see
            it coming, and is the person the record is about to say no longer
            has the item — which is why this is the only write in the feature
            behind a confirm (`ReclaimConfirmDialog`, whose cancel button is
            "Leave it with {holder}"). "Hand it back" is the other direction and
            the opposite weight: the holder giving something back, narrowed
            server-side to the person already holding the item so that a
            hand-back is always voluntary, and deliberately carrying no confirm
            at all, because a second click to confirm a decision the caller has
            already made about their own property teaches people to dismiss
            confirms. `reclaim-custody.ts` is where that is argued at length —
            folding the two together would either make a hand-back demandable
            by anyone, or make every reclaim fail, since not holding the item
            is the premise.

            Hence `IconBuildingWarehouse` rather than the sheet's
            `IconUserMinus`: that icon is two entries below on "Hand it back",
            and a menu where two near-neighbours answer to the same glyph
            teaches nothing. The warehouse is this file's own picture for the
            store-side of custody — the direction a reclaim reaches from —
            which separates it from the hand-back's glyph even though the
            reclaim lands on the person in charge rather than on a shelf.
          */}
          {hasCustodian ? (
            <DropdownMenuItem onClick={() => onReclaimCustody(item)}>
              <IconBuildingWarehouse />
              Call it back
            </DropdownMenuItem>
          ) : null}
          {/*
            Take and release are the self-service pair, and two questions decide
            which one — or whether either — is offered.

            **The pointer, not a guess about the caller's own staff row.**
            `takeItem` only succeeds on a first claim and `releaseCustody` only
            when somebody holds it, so offering both at once would put a
            guaranteed refusal in the menu every time.

            **And the caller's grant, which is the other half.** Both sit on
            `requireInventoryPermission("take")`, and the Inventory Administrator
            does not hold it — its grant is the register's, minus the two
            self-service verbs, because custody in this school is set from that
            seat through `transferCustody` rather than by whoever opened the row.
            So the pair is drawn only where it can work, and the store's own verbs
            above (Transfer custody, Call it back) are the ones that seat has.
            A menu entry that answers `Forbidden` on every row is the same
            defect as one that opens nothing, and this register is the Inventory
            Administrator's whole workspace, so the audience that could not use
            them was the *default* one. `get-item-for-scan.ts` already answers
            the same question per item by returning `canTake` and `canHandBack`
            on the row it hands the scanner; this is the same answer for the
            register, and it is a role question, so it is computed once by the
            page rather than asked of the server per row.
          */}
          {/*
            Two flat conditions rather than a nested ternary, and the nesting was
            the only thing that ever made this hard to read: "may they self-serve"
            and "which of the pair does the pointer call for" are two questions,
            so they are two conditions.
          */}
          {canSelfServe && hasCustodian ? (
            <DropdownMenuItem onClick={() => onReleaseCustody(item)}>
              <IconUserMinus />
              Hand it back
            </DropdownMenuItem>
          ) : null}
          {canSelfServe && !hasCustodian ? (
            <DropdownMenuItem onClick={() => onTakeItem(item)}>
              <IconPackageExport />
              Take this item
            </DropdownMenuItem>
          ) : null}
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
 * The item's identity, and the row's only click target.
 *
 * **Only the name opens the custody history — not the row.** An earlier
 * version made the whole `<tr>` clickable, on the reasoning that a mouse user
 * needs a bigger target than one button. In practice it meant every other
 * control a row grew afterwards — the selection checkbox below, a status
 * badge, a future inline action — had to remember to stop propagation or
 * silently open the history sheet instead of doing what it was clicked for.
 * The name is a real `<button>`, focusable and activating on both Enter and
 * Space for free from the platform, and it is now the row's only click
 * target: one place decides what a click on this row means, not every
 * element in it.
 *
 * **It is a `<th scope="row">`, and that is what a register's first column
 * wants to be.** A screen reader moving cell by cell announces the column
 * header for every cell; with the item's own name as a row header it also
 * announces which row it is in, so "2 available to hand out" arrives as
 * "R. Perera's projector, 2 available to hand out" rather than as a bare
 * figure in a nine-column grid. `font-normal` restores the weight the
 * `<th>` would otherwise impose on the SKU and category lines below the name.
 *
 * ## A retired row is neither clickable nor clickable-looking, and says so
 *
 * The row's click target is the custody history, and `listCustodyHistory` refuses
 * a retired item with `NOT_FOUND` — its own comment says a 200-item history of a
 * deleted row "is a dead end". So on a retired row the name becomes plain text
 * rather than a button — there is nothing left to open — and the
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
 */
const AssetCell = ({
  item,
  isRetired,
  onOpenItem,
}: {
  item: InventoryItemView;
  isRetired: boolean;
  onOpenItem: (item: InventoryItemView) => void;
}) => {
  if (isRetired) {
    return (
      <div className="flex items-start gap-2 text-left">
        <AssetThumbnail item={item} />
        <div className="flex min-w-0 flex-col items-start gap-0.5">
          <span className="text-muted-foreground font-medium line-through">
            {item.name}
          </span>
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span className="font-mono">{item.sku}</span>
            <span aria-hidden="true">·</span>
            <CategoryDot color={item.categoryColor} />
            {item.categoryName}
          </span>
          <RetiredBadge deletedAt={item.deletedAt} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 text-left">
      <AssetThumbnail item={item} />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenItem(item);
        }}
        className="hover:text-primary flex min-w-0 flex-col items-start gap-0.5 text-left"
      >
        <span className="font-medium underline-offset-4 hover:underline">
          {item.name}
        </span>
        {/*
          Tagged or counted in bulk, and the distinction changes what a clerk can
          do with the row. A tagged item has one asset tag per unit, so a borrow
          names a device; a bulk line is a count, and the borrow takes the oldest
          units by the server's own record with nothing to name. It is a third
          muted line rather than a column because it is a property of the line, not
          something to be scanned across — and it is words, not a dot, so it
          survives without colour. The SKU and category are combined onto one line
          above it, rather than each getting its own — this asset cell used to be
          four muted lines deep (name, SKU, category, this line), which made every
          row in a 200-line register roughly twice the height a clerk needs to
          scan it.
        */}
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs whitespace-nowrap">
          <span className="font-mono">{item.sku}</span>
          <span aria-hidden="true">·</span>
          <CategoryDot color={item.categoryColor} />
          <span className="truncate">{item.categoryName}</span>
        </span>
        <span className="text-muted-foreground text-xs">
          {item.uniqueIdCount > 0
            ? `${item.uniqueIdCount} tagged unit${item.uniqueIdCount === 1 ? "" : "s"}`
            : "Counted in bulk"}
        </span>
      </button>
    </div>
  );
};

/**
 * The derived status, the policy flag, and the one reconciliation they produce.
 *
 * `borrowable` is a policy flag rather than a status, and it is the one
 * column-adjacent fact that changes what a clerk can do here: an Available
 * row that is not borrowable will be refused by `custody.take` with "this
 * kind of thing is not handed out to teachers, so it stays with the store".
 * Hiding that until the refusal means the register's headline question —
 * "what can I hand out" — has a trap in it, so the flag is stated on the row
 * in the server's own words. Rendered as text beside the status badge, never
 * as a colour.
 *
 * **A retired row's status badge is suppressed entirely.** `calculateItemStatus`
 * derives `out_of_stock` from `qty` and `borrowedQty` alone, so a retired line
 * with 200 chairs reads "Out of stock" and a retired laptop reads "Available"
 * — and a derived badge on a row that cannot be lent, issued, written off or
 * edited is a badge answering a question the register should not be asking.
 * The row's status *is* "retired", the badge above says so, and the two counters
 * beside it still show the figures the ledger's two sides refer to.
 */
const StatusCell = ({
  item,
  isRetired,
}: {
  item: InventoryItemView;
  isRetired: boolean;
}) => (
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
        {item.status === "available" && item.condition === "Under Repair" ? (
          <span className="text-muted-foreground text-xs">
            In for repair, still counted as available
          </span>
        ) : null}
      </>
    )}
  </div>
);

/**
 * The recorded condition, in words.
 *
 * The one condition the Status column has already said, in the same words but the
 * other treatment.
 *
 * `ItemStatusBadge`'s `damaged` and `ConditionBadge`'s `Damaged` are both the
 * lower-emphasis destructive treatment in
 * `shared/inventory-status-badge.tsx`, so a damaged item printed the word
 * "Damaged" twice in two adjacent columns in two identical red badges — and
 * `calculateItemStatus` returns `damaged` only when `condition === "Damaged"`,
 * so the two were *always* the same fact on the same row. Two badges is not
 * emphasis, it is a printing mistake.
 *
 * So the Status column keeps the badge (it is the derived, actionable fact: the
 * item is off the available count) and this cell states the recorded condition
 * in words instead, saying what it caused. The treatments now differ — a badge
 * against muted text — which is what the columns are: derived state on one side,
 * the recorded fact on the other.
 *
 * The condition is `condition` rather than `status` in the test, because an
 * item with **no units on hand** and a Damaged condition is badged
 * "Out of stock", and there the word "Damaged" is not on screen anywhere
 * else and the badge is the right answer.
 */
const ConditionCell = ({
  item,
  isRetired,
}: {
  item: InventoryItemView;
  isRetired: boolean;
}) =>
  item.status === "damaged" && !isRetired ? (
    <span className="text-muted-foreground text-xs">
      Damaged — taken off the available count
    </span>
  ) : (
    <ConditionBadge condition={item.condition} />
  );

/**
 * One line of the register.
 *
 * The order of the columns is the order a clerk reads them in: what it is, who is
 * answerable for it, how many there are, whether it can be handed out, what state
 * the property is in, where it is, and what can be done about it.
 *
 * **The custody column is the widest and the first after identity**, because it is
 * the reason a reader opens this page at all: "who is in charge, and who is holding
 * it" are two facts, and `CustodyFlow` renders all four legitimate combinations of
 * them rather than leaving a gap where a pointer was null.
 *
 * Left rendering on a retired row, and that is a fact rather than an
 * oversight: `deleteItem` snapshots the counters and writes no custody row,
 * so the pointers on the row are exactly who was responsible when it left the
 * register. Muting them would hide the last true statement the row makes.
 *
 * **Condition and Location are the two columns that go below `md`.** Desktop
 * is the design target, and at 1280px there is room for them; below that
 * the table scrolls horizontally inside the shadcn `Table` wrapper rather
 * than reflowing into cards, because a register that reshapes itself is
 * much harder to compare across rows.
 */
export const InventoryRow = ({
  item,
  isSelected,
  onToggleSelect,
  onOpenItem,
  ...actions
}: InventoryRowProps) => {
  const isRetired = item.deletedAt !== null;

  return (
    <TableRow
      className={
        isRetired ? "bg-muted/30 hover:bg-muted/30" : "hover:bg-muted/50"
      }
    >
      <TableCell>
        <Checkbox
          aria-label={`Select ${item.name} for QR labels`}
          checked={isSelected}
          disabled={isRetired}
          onCheckedChange={() => onToggleSelect(item.id)}
        />
      </TableCell>

      {/* The row header: see `AssetCell` for why the item's name is a `<th>`. */}
      <TableCell
        as="th"
        scope="row"
        className="max-w-64 font-normal whitespace-normal"
      >
        <AssetCell item={item} isRetired={isRetired} onOpenItem={onOpenItem} />
      </TableCell>

      <TableCell className="max-w-48 whitespace-normal">
        <CustodyFlow
          managerName={item.managerName}
          custodianName={item.custodianName}
        />
      </TableCell>

      <TableCell>
        <StockFigures item={item} />
      </TableCell>

      <TableCell className="whitespace-normal">
        <StatusCell item={item} isRetired={isRetired} />
      </TableCell>

      <TableCell className="hidden whitespace-normal md:table-cell">
        <ConditionCell item={item} isRetired={isRetired} />
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
