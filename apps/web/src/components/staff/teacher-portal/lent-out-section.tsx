"use client";

import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { IconHistory } from "@tabler/icons-react";

import type { InventoryItemView } from "@/components/staff/inventory/inventory-types";
import { ConditionBadge } from "@/components/staff/inventory/shared";
import { PartyName } from "@/components/staff/inventory/stock-dialogs";

/**
 * The three counters, in one cell, each announced for a screen reader.
 *
 * **This is a second copy of the cell in `my-equipment.tsx` and it has to stay in
 * step with it.** The obvious refactor is to lift it into a shared module, and the
 * reason it is not done here is the same one that keeps the two `PartyName`-shaped
 * facts in this feature shared while the rest of it is duplicated: this folder and
 * the inventory folder are being edited by different agents at the same time, and
 * a third file with a cross-folder export in it is a merge conflict waiting to
 * happen. So the duplication is deliberate, it is two dozen lines, and the rule is
 * that the two copies must never be allowed to differ — an owner reading the same
 * row in two sections of one page must not be shown two different sets of numbers,
 * because the second one is the one they start doubting.
 *
 * It is here at all because "is there another one on the shelf" is the question a
 * teacher asks *before* calling a set of twenty back off a colleague, and
 * `availableQty` is what answers it. That is also why the whole of the owner's
 * question is the three numbers and not the derived `ItemStatusBadge`: the badge
 * is a fact about a register *line*, and the register counts the school's stock
 * rather than answering anything about this owner.
 */
const Counters = ({ item }: { item: InventoryItemView }) => (
  <span className="flex items-center gap-1.5 tabular-nums">
    <span>
      <span className="sr-only">On hand: </span>
      {item.qty}
    </span>
    <span aria-hidden="true" className="text-muted-foreground/50">
      /
    </span>
    <span className="text-muted-foreground">
      <span className="sr-only">Free in the store: </span>
      {item.availableQty}
    </span>
    <span aria-hidden="true" className="text-muted-foreground/50">
      /
    </span>
    <span className="text-muted-foreground">
      <span className="sr-only">Out on loan: </span>
      {item.borrowedQty}
    </span>
  </span>
);

/**
 * The category's own colour, beside its name — the second copy, for the same
 * reason and under the same rule as `Counters`.
 */
const Category = ({ item }: { item: InventoryItemView }) => (
  <span className="flex items-center gap-1.5">
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: item.categoryColor }}
    />
    <span className="text-muted-foreground">{item.categoryName}</span>
  </span>
);

/**
 * **The cell this whole section exists for.**
 *
 * Every other table on this page answers "where is it" with a place and a
 * condition. Here the answer is a person, and it is the first column after the
 * item's own name because it is the fact the owner opened the page for: an item
 * they are answerable for, which they cannot see and cannot reach. Printing
 * "Somewhere else" beside a location would be a worse answer than printing
 * nothing, and printing the location *instead* of the name is how an owner walks
 * to the wrong classroom.
 *
 * `PartyName` and not a bare `??`, because `inventory_item.custodianStaffId` is
 * `set null` rather than cascaded when a staff record goes, and a colleague who
 * has left the school can still be the recorded holder of an item: the pointer
 * says somebody is in possession and the name renders struck through, which is a
 * different — and actionable — fact from "the store has it". The folder's shared
 * component is the one that draws that distinction, and this file imports it
 * rather than re-deriving a third wording for it.
 *
 * The location goes underneath, because it is still a fact about the item and the
 * reader who needs it is the reader deciding whether to chase the person. The
 * "OUT ON LOAN" line is *not* repeated here: `borrowedQty` is in the counters two
 * cells to the left, and the same figure printed twice on one row is the thing
 * `my-equipment.tsx`'s `WhereItIs` comment goes out of its way to avoid.
 */
const WhoHasIt = ({ item }: { item: InventoryItemView }) => (
  <span className="flex flex-col items-start gap-0.5 whitespace-normal">
    <PartyName
      name={item.custodianName}
      staffId={item.custodianStaffId}
      emptyLabel="the store"
    />
    <span className="text-muted-foreground text-xs">
      {item.location || "No location recorded"}
    </span>
  </span>
);

interface LentOutSectionProps {
  items: InventoryItemView[];
  onOpenHistory: (item: InventoryItemView) => void;
  onOpenReclaim: (item: InventoryItemView) => void;
  onOpenTransfer: (item: InventoryItemView) => void;
}

/**
 * One row of this table.
 *
 * **Two owner verbs, and they are the only actions offered.** `reclaimCustody` and
 * `transferOwnership` are both `manageOwn`, and both are narrowed in their own
 * handlers to "the caller is this item's `managerStaffId`, or is one of the three
 * leadership seats" — a check a grant cannot express, which is why the UI needs no
 * role test to know they are legitimate here: every row in this list came back from
 * a query that says `managerStaffId = me`, so every row is one the server will let
 * these two run against. What the UI *does* have to decide is what **not** to
 * offer, and that is the two verbs from the other sections:
 *
 * - **No "Hand back".** It is `releaseCustody`, which authorises on the caller
 *   being the holder. Nobody on this page holds any of these rows — the section's
 *   predicate requires `custodianStaffId <> me` — so the button would always be
 *   refused. The teacher's route back to holding the item is `takeItem` from the
 *   take dialog, and it is offered there.
 * - **No "Report a problem".** That duty comes with being in charge of something
 *   and it is discharged from "In my charge", where the same item is also listed —
 *   an item you own and have lent appears in both, at two altitudes, and the
 *   reporting affordance belongs to the section that raises the obligation.
 *
 * The row is **not** a tab stop, for the reason `my-equipment.tsx` records at
 * length: a focusable `<tr>` *and* a button inside it put one action in the tab
 * order twice, which a screen-reader user hears as two different things to
 * activate. The row carries the mouse affordance; "History" is the keyboard path.
 */
const LentRow = ({
  item,
  onOpenHistory,
  onOpenReclaim,
  onOpenTransfer,
}: {
  item: InventoryItemView;
} & Omit<LentOutSectionProps, "items">) => (
  <TableRow className="cursor-pointer" onClick={() => onOpenHistory(item)}>
    <TableCell>
      <span className="block font-medium">{item.name}</span>
      <span className="text-muted-foreground block font-mono text-xs">
        {item.sku}
      </span>
      <Category item={item} />
    </TableCell>
    <TableCell>
      <WhoHasIt item={item} />
    </TableCell>
    <TableCell>
      <Counters item={item} />
    </TableCell>
    <TableCell>
      <ConditionBadge condition={item.condition} />
    </TableCell>
    <TableCell className="text-right">
      {/*
        Each stops propagation, so acting on a row does not also fire the row's own
        click into the history sheet — the same arrangement, and the same reason,
        as the two sections above.
      */}
      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Custody history for ${item.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpenHistory(item);
          }}
        >
          <IconHistory data-icon="inline-start" />
          History
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Call ${item.name} back from ${item.custodianName ?? "the person holding it"}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpenReclaim(item);
          }}
        >
          Call it back
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Hand ${item.name} on to somebody else`}
          onClick={(event) => {
            event.stopPropagation();
            onOpenTransfer(item);
          }}
        >
          Transfer ownership
        </Button>
      </div>
    </TableCell>
  </TableRow>
);

/**
 * "Lent out by me": the things you are answerable for that a colleague is holding
 * right now.
 *
 * ## The predicate, and why it is a separate read
 *
 * `orpc.inventory.custody.lent` — `managerStaffId = me AND custodianStaffId IS NOT
 * NULL AND custodianStaffId <> me`. It is a separate read because `custody.myItems`
 * cannot express the pair: it is `managerStaffId = me OR custodianStaffId = me`, so
 * an item the caller owns *and* has lent arrives in the same array, carrying the
 * fact that would have mattered — the holder is somebody else — in a column nothing
 * on the page was splitting on. The server's two `ne`-safe arms are both needed
 * (`custodianStaffId <> me` alone is `null` for an item sitting unheld, and a
 * `WHERE` evaluating to `null` would drop every such item the school owns), and
 * neither subsumes the other.
 *
 * An item you own and are also holding is **structurally excluded**, and that is
 * the point rather than a gap: it is on "In my charge" already, and listing it here
 * as well would make an owner look like a lender of their own property — the exact
 * misreading this page exists to prevent. So the "listed once" rule the other two
 * sections keep by a client-side filter is kept here by the server, and the
 * teacher's page can promise it without having to work out the exceptions.
 *
 * ## Why there is no empty state, and no loading skeleton
 *
 * **"You have lent nothing" is good news, and it needs no chrome.** A heading with
 * a `0` beside it is a worse answer than no heading at all: it is a claim about the
 * world, printed above a table that has nothing in it, on a page the reader came to
 * for something else. So the section renders **only when the viewer has rows**, and
 * its absence *is* the message. This is also the only section on the page that is
 * not a statement about an obligation or a possession, which is precisely why it
 * cannot borrow the other two's chrome and stay honest.
 *
 * The cost is that this read has no placeholder of its own while it is in flight —
 * a teacher with three lent items on a slow connection sees two sections and then
 * three. That is an acceptable price and it is bounded by the other two sections
 * showing theirs, so the page has already said it is loading. The alternative
 * (render, then withdraw) is the worse failure: a heading that appears and then
 * disappears is a message that turned out to be false, and this page is built to
 * stop printing those.
 *
 * ## And there is no lend date on the row, because there is not one
 *
 * `InventoryItemView` carries `custodianName` and no timestamp: `inventory_item` has
 * no "lent since" column, and inventing one from `updatedAt` would be a lie about
 * a field that changes for half a dozen unrelated reasons. The date the owner wants
 * — *how long has she had it* — **is** recorded, in `custody.history`, which is the
 * "History" action every row here carries. So the honest fix, if the school starts
 * asking the question in the room rather than in an audit, is a per-item `lentAt`
 * on the row: a column on the server and one derived field on this section, and not
 * a number reconstructed in the browser from a table that may not have been read.
 */
export const LentOutSection = ({
  items,
  onOpenHistory,
  onOpenReclaim,
  onOpenTransfer,
}: LentOutSectionProps) => {
  // The one rule this component enforces about itself, stated once so that a
  // caller cannot render an empty section by passing an empty array.
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-xl font-semibold">
          Lent out by me
          <span className="text-muted-foreground ml-2 text-sm font-normal tabular-nums">
            {items.length}
          </span>
        </h2>
        <p className="text-muted-foreground max-w-prose text-sm">
          You are in charge of these and a colleague is the one holding them
          right now. You are still the one answerable for them, so you can call
          one back or hand the whole thing on — and the history on each row says
          when it left your hands.
        </p>
      </div>

      <div className="border-primary/14 overflow-x-auto border">
        <Table>
          {/*
            `scope="col"` on every heading, explicitly, for the reason
            `my-equipment.tsx` gives rather than relying on the HTML algorithm: a
            `<th>` inside a `<thead>` row is column-scoped already, so this is one
            word spent on something a reader of this file can see. The header row
            styling matches the two sections above it, so the page reads as one set
            of tables rather than three.
          */}
          <TableHeader>
            <TableRow className="bg-primary hover:bg-primary border-none">
              <TableHead
                className="text-accent h-11 text-xs font-extrabold tracking-[0.16em]"
                scope="col"
              >
                ITEM
              </TableHead>
              <TableHead
                className="text-accent h-11 text-xs font-extrabold tracking-[0.16em]"
                scope="col"
              >
                WHO HAS IT
              </TableHead>
              <TableHead
                className="text-accent h-11 text-xs font-extrabold tracking-[0.16em]"
                scope="col"
              >
                ON HAND / FREE / OUT
              </TableHead>
              <TableHead
                className="text-accent h-11 text-xs font-extrabold tracking-[0.16em]"
                scope="col"
              >
                CONDITION
              </TableHead>
              <TableHead
                className="text-accent h-11 text-right text-xs font-extrabold tracking-[0.16em]"
                scope="col"
              >
                ACTIONS
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <LentRow
                key={item.id}
                item={item}
                onOpenHistory={onOpenHistory}
                onOpenReclaim={onOpenReclaim}
                onOpenTransfer={onOpenTransfer}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
};
