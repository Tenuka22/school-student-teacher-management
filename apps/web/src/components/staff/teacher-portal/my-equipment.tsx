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
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@school-student-teacher-management/ui/components/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import {
  IconClipboard,
  IconHistory,
  IconMessageReport,
  IconPackageExport,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import { useRef } from "react";
import type { ReactNode } from "react";

import type {
  CustodyHistoryEntry,
  InventoryItemView,
  TransferReason,
} from "@/components/staff/inventory/inventory-types";
import {
  ConditionBadge,
  InventoryEmptyState,
  InventoryErrorState,
  InventoryInlineNotice,
  InventorySkeleton,
} from "@/components/staff/inventory/shared";
import {
  PartyName,
  formatDateTime,
} from "@/components/staff/inventory/stock-dialogs";
import { LentOutSection } from "@/components/staff/teacher-portal/lent-out-section";
import { ReclaimDialog } from "@/components/staff/teacher-portal/reclaim-dialog";
import { TakeItemDialog } from "@/components/staff/teacher-portal/take-item-dialog";
import { TransferOwnershipDialog } from "@/components/staff/teacher-portal/transfer-ownership-dialog";
import { useMyEquipment } from "@/components/staff/teacher-portal/use-my-equipment";

/**
 * The cap on the hand-back note, matching the administrator's `TakeOrReleaseDialog`
 * and the 500 the field has always been given. A sentence is the target; a
 * paragraph is a letter, and a letter to the next person is a different
 * instrument from a note on a custody row.
 */
const RELEASE_NOTE_MAX_LENGTH = 500;

/**
 * One person's name on a custody-history row is `PartyName`, imported from the
 * inventory feature — **not the copy this file used to declare.**
 *
 * There were two implementations of the same three cases, and they had already
 * drifted: the shared one said "No longer on the staff roll" and this one said
 * "former staff member", so a hand-over by a colleague who has since left read
 * two different ways depending on which screen you were looking at. The shared
 * component is the one that survives, because it is the one the four
 * certificates and the register already use, and the wording it carries is the
 * clearer of the two: it names the *roll*, which is what actually changed.
 *
 * Importing across the folder boundary is not a new thing for this file — it
 * already takes `CustodyHistoryEntry`, `ConditionBadge` and the empty states
 * from `@/components/staff/inventory/**` — and it is not a cycle: nothing in
 * that feature's import graph reaches `@/components/staff/teacher-portal`.
 * `emptyLabel` stays a per-call-site prop, as it is everywhere else, because the
 * empty slot means something different in each place: "nobody" for the manager
 * columns, "the store" for the custodian ones.
 */

/** The three counters, in one cell, each announced for a screen reader. */
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
 * The category's own colour, beside its name.
 *
 * `categoryColor` and `categoryName` arrive on the item view from a live join
 * rather than from a copy on the item row, so this needs no `categories.list`
 * call of its own — a second request to colour eight dots would be a request
 * the page does not need to make.
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
 * The column that replaced the item status, and the two questions in it.
 *
 * `ItemStatusBadge` said "Available" beside a laptop the teacher was holding, and
 * "Borrowed" beside a line of twenty they were answerable for because one of
 * them was out with a colleague. `calculateItemStatus` derives that from `qty`,
 * `borrowedQty` and `condition` — `custodianStaffId` is not one of its inputs —
 * so the badge is a fact about a register *line*, printed on a page whose whole
 * subject is one person's property. A teacher can do nothing about it, and
 * "Available" beside the machine under their arm tells them the school counts it
 * as free, which is the belief a laptop walks out of the building on.
 *
 * What replaces it is the state the teacher can act on, and it is per-item and
 * true: **is this out on loan** (`borrowedQty > 0` — the number of units away
 * from the store, and the one fact that decides whether a hand-back is even
 * possible) and **where it is** (the recorded `location`, the second question a
 * teacher asks about an item they are answerable for).
 *
 * The possession line is a fourth state the sections cannot express, and it is
 * the common one: an item they are in charge of can be in *another teacher's*
 * hands, which is the whole reason `CustodyBadge` has four treatments. Naming
 * that holder by name is the fact that saves a walk to the wrong classroom.
 * Numbers are left to `Counters` one cell to the left, so the same figure is not
 * printed twice on one row.
 */
const WhereItIs = ({
  item,
  isHeldByViewer,
}: {
  item: InventoryItemView;
  isHeldByViewer: boolean;
}) => {
  let where: string;

  if (item.borrowedQty > 0) {
    where = "Out on loan";
  } else if (isHeldByViewer) {
    where = "With you";
  } else if (item.custodianStaffId === null) {
    where = "In the store";
  } else {
    where = `With ${item.custodianName ?? "another teacher"}`;
  }

  return (
    <span className="flex flex-col items-start gap-0.5 whitespace-normal">
      <span>{where}</span>
      <span className="text-muted-foreground text-xs">
        {item.location || "No location recorded"}
      </span>
    </span>
  );
};

/**
 * One row of either table.
 *
 * **The hand-back is derived from the row, never from the section it is in.**
 * `releaseCustody` authorises on `custodianStaffId !== actor.staffId` and never
 * looks at the manager column, so "am I the holder?" is the only question that
 * decides it — and the teacher who is *both* manager and custodian of an item is
 * the ordinary case, not the exotic one. Passing a section-level `canRelease`
 * made the one row that survives the dedupe unable to do the one thing this page
 * exists to let them do, so `isHeldByViewer` is asked of the row itself.
 *
 * `canReportProblem` *is* section-level, and deliberately so: reporting is the
 * duty that comes with being in charge of something, and it is offered only
 * where that duty is raised.
 *
 * **The row is not a tab stop.** It carries the mouse affordance and the "History"
 * button is the keyboard path — the arrangement `inventory-table.tsx` settled on
 * for the same reason, and the reason is in its comment: a focusable `<tr>` *and*
 * a button inside it put one action in the tab order twice, which a screen-reader
 * user hears as two different things to activate. An earlier version of this file
 * claimed the row was "the only way to it without a pointer" while the row
 * already had `tabIndex={0}` — it was a second, differently-named door to the
 * same room.
 */
const EquipmentRow = ({
  item,
  isHeldByViewer,
  canReportProblem,
  onOpenHistory,
  onOpenRelease,
  onReportProblem,
}: {
  item: InventoryItemView;
  isHeldByViewer: boolean;
  canReportProblem: boolean;
  onOpenHistory: (item: InventoryItemView) => void;
  onOpenRelease: (item: InventoryItemView) => void;
  onReportProblem: (item: InventoryItemView) => void;
}) => (
  <TableRow className="cursor-pointer" onClick={() => onOpenHistory(item)}>
    <TableCell>
      <span className="block font-medium">{item.name}</span>
      <span className="text-muted-foreground block font-mono text-xs">
        {item.sku}
      </span>
    </TableCell>
    <TableCell>
      <Category item={item} />
    </TableCell>
    <TableCell>
      <Counters item={item} />
    </TableCell>
    <TableCell>
      <WhereItIs item={item} isHeldByViewer={isHeldByViewer} />
    </TableCell>
    <TableCell>
      <ConditionBadge condition={item.condition} />
    </TableCell>
    <TableCell className="text-right">
      {/*
        The row opens the history on click; the buttons below are the same
        actions with visible names, and the keyboard path. Each stops propagation
        so acting on a row does not also fire the row's own click.
      */}
      <div className="flex items-center justify-end gap-3">
        {canReportProblem ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Report a problem with ${item.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onReportProblem(item);
            }}
          >
            <IconMessageReport data-icon="inline-start" />
            Report a problem
          </Button>
        ) : null}
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
        {isHeldByViewer ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Hand back ${item.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpenRelease(item);
            }}
          >
            Hand back
          </Button>
        ) : null}
      </div>
    </TableCell>
  </TableRow>
);

/**
 * One of the sections that describe what a teacher already has: a count, a table,
 * or the reason it is empty.
 *
 * The two empty states are **different facts and are written differently on
 * purpose**. "Nothing is entrusted to you" is about responsibility and is
 * resolved by an administrator giving you something; "you are not holding
 * anything" is about possession and is resolved by you signing for something.
 * One shared string would tell a teacher who is between the two that they own
 * nothing, which is the misreading this page is built to prevent.
 *
 * The section decides **one** thing and no more: whether the reporting duty
 * applies, because that is genuinely a property of the section ("you are in
 * charge of these"). It decides nothing about the hand-back, which belongs to
 * the row — see `EquipmentRow`.
 *
 * **There are two of these and not three, and the reason is not tidiness.** "Lent
 * out by me" is a different set of rows from a different read, with a different
 * first column and two actions neither of these has; it is
 * `lent-out-section.tsx`, and it enforces its own rule about existing only when
 * the viewer has rows.
 */
const EquipmentSection = ({
  title,
  description,
  items,
  emptyTitle,
  emptyDescription,
  isLoading,
  canReportProblem,
  holdsItem,
  onOpenHistory,
  onOpenRelease,
  onReportProblem,
}: {
  title: string;
  description: string;
  items: InventoryItemView[];
  emptyTitle: string;
  emptyDescription: string;
  isLoading: boolean;
  canReportProblem: boolean;
  holdsItem: (item: InventoryItemView) => boolean;
  onOpenHistory: (item: InventoryItemView) => void;
  onOpenRelease: (item: InventoryItemView) => void;
  onReportProblem: (item: InventoryItemView) => void;
}) => {
  let body: ReactNode;

  if (isLoading) {
    body = (
      <div className="p-3">
        <InventorySkeleton rows={4} />
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <InventoryEmptyState title={emptyTitle} description={emptyDescription} />
    );
  } else {
    body = (
      <Table>
        {/*
          `scope="col"` on every heading, explicitly. A `<th>` inside a `<thead>`
          row is column-scoped by the HTML algorithm, so a screen reader was
          probably getting this right already — but "probably", from a rule
          nobody in the file can read, is not a thing to lean on when the
          attribute is one word.
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
              CATEGORY
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
              WHERE IT IS
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
            <EquipmentRow
              key={item.id}
              item={item}
              isHeldByViewer={holdsItem(item)}
              canReportProblem={canReportProblem}
              onOpenHistory={onOpenHistory}
              onOpenRelease={onOpenRelease}
              onReportProblem={onReportProblem}
            />
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-xl font-semibold">
          {title}
          <span className="text-muted-foreground ml-2 text-sm font-normal tabular-nums">
            {isLoading ? "—" : items.length}
          </span>
        </h2>
        <p className="text-muted-foreground max-w-prose text-sm">
          {description}
        </p>
      </div>

      <div className="border-primary/14 overflow-x-auto border">{body}</div>
    </section>
  );
};

/**
 * One change of hands, or one change of who is in charge.
 *
 * The two kinds share a timeline because they are interleaved on the same
 * record and the question is always "what happened to this thing" — but they
 * are **visually told apart**, because a manager change and a custody change
 * answer different questions and a reader who cannot tell them apart cannot use
 * the trail. The coloured left rail carries the distinction, and the server's
 * own `changeTypeLabel` names it in words.
 */
const HistoryEntry = ({ entry }: { entry: CustodyHistoryEntry }) => {
  const isManagerChange = entry.changeType.startsWith("manager_");

  return (
    <li
      className={`border-l-2 pl-3 ${
        isManagerChange ? "border-l-accent" : "border-l-primary"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{entry.changeTypeLabel}</p>
        <time
          dateTime={entry.changedAt}
          /**
           * `formatDateTime` — the feature's own `en-GB` date — rather than a bare
           * `toLocaleString()`. With no argument the format is whatever the
           * browser is set to, so the tooltip on a teacher's own custody trail
           * rendered `09/05/2026, 09:05:00` on one machine and
           * `05/09/2026, 09:05` on another, while the register this trail belongs
           * to prints one way everywhere.
           */
          title={formatDateTime(entry.changedAt)}
          className="text-muted-foreground text-xs tabular-nums"
        >
          {formatDistanceToNow(new Date(entry.changedAt), { addSuffix: true })}
        </time>
      </div>

      <p className="text-muted-foreground mt-1 text-sm">
        {isManagerChange ? (
          <>
            In charge:{" "}
            <PartyName
              name={entry.previousManagerName}
              staffId={entry.previousManagerStaffId}
              emptyLabel="nobody"
            />{" "}
            →{" "}
            <PartyName
              name={entry.newManagerName}
              staffId={entry.newManagerStaffId}
              emptyLabel="nobody"
            />
          </>
        ) : (
          <>
            Held by:{" "}
            <PartyName
              name={entry.previousCustodianName}
              staffId={entry.previousCustodianStaffId}
              emptyLabel="the store"
            />{" "}
            →{" "}
            <PartyName
              name={entry.newCustodianName}
              staffId={entry.newCustodianStaffId}
              emptyLabel="the store"
            />
          </>
        )}
      </p>

      <p className="text-muted-foreground mt-0.5 text-xs">
        Reason: {entry.reasonLabel}
      </p>

      {entry.note ? (
        <p className="mt-1 text-sm italic">&ldquo;{entry.note}&rdquo;</p>
      ) : null}
    </li>
  );
};

/**
 * The whole custody trail for one item, in a side panel.
 *
 * Base UI's dialog already closes on Esc and restores focus, so the keyboard
 * contract is met by the primitive. A side panel rather than a centred dialog
 * because a teacher reads this against the list behind it — the panel covers
 * the right-hand third and leaves the two sections visible.
 */
const CustodyHistorySheet = ({
  item,
  entries,
  isLoading,
  isError,
  error,
  onClose,
  onRetry,
}: {
  item: InventoryItemView | null;
  entries: CustodyHistoryEntry[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onClose: () => void;
  onRetry: () => Promise<unknown>;
}) => {
  let body: ReactNode;

  if (isLoading) {
    body = <InventorySkeleton rows={4} />;
  } else if (isError) {
    body = (
      <InventoryErrorState
        error={error}
        onRetry={() => {
          void onRetry();
        }}
      />
    );
  } else if (entries.length === 0) {
    body = (
      <InventoryEmptyState
        title="Nothing recorded yet"
        description="This item has never changed hands, and nobody has been recorded as taking charge of it. The first change will appear here."
      />
    );
  } else {
    body = (
      <ol className="space-y-4">
        {entries.map((entry) => (
          <HistoryEntry key={entry.id} entry={entry} />
        ))}
      </ol>
    );
  }

  return (
    <Sheet open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {item ? `Custody history — ${item.name}` : "Custody history"}
          </SheetTitle>
          <SheetDescription>
            Every recorded change of hands and every change of who is in charge,
            newest first.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">{body}</div>
      </SheetContent>
    </Sheet>
  );
};

/**
 * The page's title, its one-line promise, and the one action that adds rather than
 * moves.
 *
 * ## Where "Take an item" sits, and why it is in the header
 *
 * **It is a page-level action and not a section one, and the taxonomy is the
 * reason.** "In my charge", "In my hands" and "Lent out by me" are the three ties
 * the page is built to teach, and all three are statements about a relationship
 * that *already exists*. Taking something is the opposite: it is how one starts.
 * Filing the control under "In my charge" would teach the wrong thing before the
 * teacher had chosen an item, by implying the shelf is somewhere inside their
 * obligations — and it is the only action on the page that **adds a row** rather
 * than moving one, so the header is also where the page can be read as "here is
 * what you have" with this sitting apart as "here is how you get more".
 *
 * The subtitle names all three states and nothing more, because it is a promise
 * the headings keep and not an explanation. It used to teach the distinction as
 * well, and so did the notice below it, and so did both section descriptions:
 * three deliveries of one idea before the first row, in about 200px of screen, is a
 * page that stops being read. The explanation survives in the notice, which is the
 * one place it belongs.
 */
const EquipmentHeader = ({
  canTakeFromTheShelf,
  onTake,
}: {
  canTakeFromTheShelf: boolean;
  onTake: () => void;
}) => (
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 className="font-heading text-4xl font-semibold">My Equipment</h1>
      <p className="text-muted-foreground mt-2 max-w-prose">
        What you are in charge of, what you are holding, and what is out with
        somebody else.
      </p>
    </div>

    {/*
      Gated on the account having a staff record rather than on a role, and the
      reason is `take-item.ts`: it refuses an account with no `staff` row before it
      opens a transaction, and the seeded `admin` / `principal` / `vicePrincipal`
      seats are exactly that by design. A button rendered in that state is a button
      that always fails — the defect this page had to remove twice already. See
      `canTakeFromTheShelf` for the `isError` half of the gate.
    */}
    {canTakeFromTheShelf ? (
      <Button type="button" onClick={onTake} data-icon="inline-start">
        <IconPackageExport data-icon="inline-start" />
        Take an item
      </Button>
    ) : null}
  </div>
);

/**
 * The three-idea explainer, in one paragraph, above the fold.
 *
 * A teacher arriving from a timetable and a leave page has never seen the register
 * and has no reason to guess that "in charge of", "holding" and "lent out by me"
 * are three different records. Without this the page is *decoded* — the teacher
 * works the distinctions out from three unexplained headings — rather than
 * *understood*. It is hidden when there is no staff record, because there are then
 * no ideas to tell apart, only one thing to go and fix.
 *
 * **One notice, extended — and not a second one bolted on.** A page with two
 * explainers reads as two explainers: the reader skims the first, assumes the
 * second is a repetition, and misses the one sentence in it that would have
 * mattered. The third idea therefore goes *into* the paragraph that was already
 * there, in the same voice and under the same length discipline.
 *
 * The counter-example is still the sentence that earns the rest: an item on a
 * shelf, with a teacher who has never touched it, and who would still be the one
 * asked about it.
 *
 * And the "listed once" rule is stated **plainly, including the case that cannot
 * happen.** An item cannot be both in your hands and lent out by you —
 * `custody.lent`'s predicate excludes items the caller both owns and holds, and
 * that exclusion is a server fact rather than a filter this page applies — so the
 * reader is told so instead of being left to wonder whether they are looking at
 * one item twice. The rule that *does* have a client-side exception is the
 * owner-and-holder one, and it is named with the reason: you are listed once, under
 * the stronger claim, and the hand-back is still reachable from there.
 */
const ThreeIdeasNotice = ({ hidden }: { hidden: boolean }) => {
  if (hidden) {
    return null;
  }

  return (
    <InventoryInlineNotice
      tone="info"
      title="In charge of something, holding something, and lending it out are three different things"
      description="In charge means it is yours to answer for — it may be sitting on a shelf and you would still be the one asked where it is. Holding means the thing is physically in your hands until you hand it back. Lent out by you means a colleague is the one holding it while you stay the one answerable for it. An item is listed once, under whichever of the three fits: if you are both in charge of something and holding it, it is listed under In my charge, and you can still hand it back from there. Nothing can be lent out by you and in your hands at the same time — the person holding it is somebody else."
    />
  );
};

/**
 * Search only, and the whole of the page's filter.
 *
 * The status picker that used to sit here was removed with the status column, and
 * for the same reason: it filtered a derived value that says nothing about the
 * teacher's own property, and it sent that value to `listMyItems`, where a
 * hand-edited `?status=` could fail its picklist and replace the whole page with an
 * error. One box, one param, one thing that cannot be made to fail.
 *
 * **The label is `sr-only` and the placeholder carries the rest**, which is the
 * arrangement the rest of this app's search boxes use: the placeholder disappears
 * the moment there is a term in the box, and a label that vanishes is a label a
 * screen-reader user has already read once and a sighted user cannot find.
 */
const EquipmentSearchBar = ({
  search,
  onSearchChange,
  hasActiveFilters,
  onClearFilters,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <div className="relative flex-1 basis-64">
      <IconSearch className="text-muted-foreground absolute top-3 left-3 size-4" />
      <label htmlFor="my-equipment-search" className="sr-only">
        Search your equipment by name, tag or location
      </label>
      <Input
        id="my-equipment-search"
        className="pl-10"
        placeholder="Search by name, tag or location…"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
    </div>

    {hasActiveFilters ? (
      <Button type="button" variant="ghost" onClick={onClearFilters}>
        <IconX data-icon="inline-start" />
        Clear filters
      </Button>
    ) : null}
  </div>
);

/**
 * Handing an item back.
 *
 * Handing an item back is a real act with a consequence, and a stray click must not
 * sign school property away. It is named in full, and the server's own refusal — an
 * item on loan has to go back through its borrow record — is shown verbatim rather
 * than guessed at in advance.
 *
 * The note is the server's own optional `note` (`releaseCustody`). It is the only
 * free text a teacher can attach to a self-service write, and it is not decoration:
 * it lands on the custody history row and on the ledger transaction, so the
 * description says where, because a teacher who knows the words are permanent writes
 * a better sentence than one filling in a box. It stays optional and one line deep —
 * most hand-backs are unremarkable, and an empty box should not feel like something
 * to be got right.
 *
 * **`initialFocus` is the cancel button, and adding the note field is why.** Base UI
 * moves focus to the first tabbable element in the popup, and until this field
 * existed that was "Keep holding it". With a textarea in front of the footer it
 * becomes the note box — where Enter inserts a newline, so a teacher who opened the
 * dialog to confirm would type into a field instead of handing the item back, and
 * would have to read the dialog to find the button they came for. Focus belongs on
 * the safe option until the teacher deliberately leaves it, and the ref lives here
 * with the markup that uses it.
 */
const ReleaseDialog = ({
  item,
  note,
  onNoteChange,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  item: InventoryItemView | null;
  note: string;
  onNoteChange: (note: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <AlertDialogContent initialFocus={cancelRef} className="sm:max-w-md">
        <AlertDialogTitle>Hand this item back?</AlertDialogTitle>
        <AlertDialogDescription>
          {item
            ? `${item.name} (${item.sku}) goes back to the store and stops being in your hands. It stays on the register, and the change is recorded with your name and the time. You can be given it again afterwards, but nothing here brings it back on its own.`
            : "This item goes back to the store and stops being in your hands."}
        </AlertDialogDescription>
        <Field>
          <FieldLabel htmlFor="my-equipment-release-note">
            Add a note (optional)
          </FieldLabel>
          <Textarea
            id="my-equipment-release-note"
            rows={2}
            maxLength={RELEASE_NOTE_MAX_LENGTH}
            disabled={isPending}
            placeholder="Where it is going back to, or anything the next person should know."
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
          />
          <FieldDescription>
            Goes onto this item&rsquo;s custody history, permanently, where the
            next person to look will read it.
          </FieldDescription>
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef} disabled={isPending}>
            Keep holding it
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>
            {isPending ? "Handing back..." : "Hand it back"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

/**
 * The owner's two verbs over an item a colleague is holding.
 *
 * Each dialog owns nothing but its own markup: the state is in `useMyEquipment`
 * next to the mutation, and the outcome is toasted exactly once, from there. Two
 * things about the arrangement are worth stating rather than leaving to be
 * discovered:
 *
 * - **Only one of the two can be open at a time, for the same reason
 *   `CustodyDialogs` gives.** `TransferReasonField` renders a `useId`-derived id
 *   today, so a collision is no longer possible — but a confirm stacked on top of a
 *   dialog is still a dialog on top of a dialog, and Base UI does not arbitrate
 *   between them. The page opens one per action, and neither of these can be
 *   reached while the other is up, because both are opened from a row and the row is
 *   behind the dialog.
 * - **Neither needs a role check in this page, and adding one would be worse than
 *   useless.** Both are opened from a row whose `managerStaffId` is the reader's, by
 *   the predicate of the read that produced it. `manageOwn` is a *grant*, not a
 *   scope, so a client-side role test could only ever be a guess at the handler's
 *   own `isOwner` check — and it would hide the action from exactly the three
 *   leadership seats that are also allowed to use it.
 */
const OwnerVerbDialogs = ({
  reclaimItem,
  reclaimReason,
  onReclaimReasonChange,
  reclaimNote,
  onReclaimNoteChange,
  onReclaimOpenChange,
  onReclaimSubmit,
  isReclaimPending,
  transferItem,
  ownerName,
  onTransferOpenChange,
  onTransferSubmit,
  isTransferPending,
}: {
  reclaimItem: InventoryItemView | null;
  reclaimReason: string;
  onReclaimReasonChange: (reason: string) => void;
  reclaimNote: string;
  onReclaimNoteChange: (note: string) => void;
  onReclaimOpenChange: (open: boolean) => void;
  onReclaimSubmit: (values: {
    reason: TransferReason;
    note?: string;
  }) => Promise<void>;
  isReclaimPending: boolean;
  transferItem: InventoryItemView | null;
  ownerName: string | null;
  onTransferOpenChange: (open: boolean) => void;
  onTransferSubmit: (values: {
    newOwnerStaffId: string;
    reason: TransferReason;
    note?: string;
  }) => Promise<void>;
  isTransferPending: boolean;
}) => (
  <>
    <ReclaimDialog
      open={Boolean(reclaimItem)}
      onOpenChange={onReclaimOpenChange}
      item={reclaimItem}
      isPending={isReclaimPending}
      reason={reclaimReason}
      onReasonChange={onReclaimReasonChange}
      note={reclaimNote}
      onNoteChange={onReclaimNoteChange}
      onSubmit={onReclaimSubmit}
    />

    <TransferOwnershipDialog
      open={Boolean(transferItem)}
      onOpenChange={onTransferOpenChange}
      item={transferItem}
      ownerName={ownerName}
      isPending={isTransferPending}
      onSubmit={onTransferSubmit}
    />
  </>
);

/**
 * The teacher's own page: what they are in charge of, what they are holding, and
 * what they have lent out.
 *
 * Markup only — every query, mutation, filter and piece of dialog state lives
 * in `useMyEquipment`, so this file reads as the page and nothing else.
 */
export const MyEquipment = () => {
  const {
    isLoading,
    isError,
    error,
    refetch,
    total,
    accountName,
    holdsItem,
    inCharge,
    inHands,
    lentOut,
    isStaffRecordMissing,
    copyLinkRequest,
    copyProblemReport,
    search,
    setSearch,
    hasActiveFilters,
    clearFilters,
    historyItem,
    openHistory,
    closeHistory,
    isHistoryLoading,
    isHistoryError,
    historyError,
    history,
    refetchHistory,
    releaseItem,
    releaseNote,
    setReleaseNote,
    openRelease,
    handleReleaseOpenChange,
    confirmRelease,
    isReleasePending,
    reclaimItem,
    reclaimReason,
    setReclaimReason,
    reclaimNote,
    setReclaimNote,
    openReclaim,
    handleReclaimOpenChange,
    confirmReclaim,
    isReclaimPending,
    transferItem,
    openTransfer,
    handleTransferOpenChange,
    confirmTransfer,
    isTransferPending,
    takeOpen,
    openTake,
    handleTakeOpenChange,
    confirmTake,
    isTakePending,
  } = useMyEquipment();

  /**
   * Whether the page may offer "Take an item" at all, and this is the whole gate.
   *
   * `takeItem` refuses an account with no `staff` row before it opens a
   * transaction — "Your account has no staff record, so equipment cannot be
   * assigned to you" — and the seeded `admin` / `principal` / `vicePrincipal`
   * seats are exactly that, by design. So a button rendered in that state is a
   * button that always fails, and offering one was a defect this page had to
   * remove twice already; the state itself is named a few lines below, as
   * `isStaffRecordMissing`, and is reused here rather than re-derived.
   *
   * `isError` is folded in for the same instinct's sake: a page whose own read
   * failed has no idea what the caller's staff record says, and the honest answer
   * to "can I take something?" is then "not until that is fixed" rather than a
   * guess.
   */
  const canTakeFromTheShelf = !isStaffRecordMissing && !isError;

  /**
   * The two numbers behind "Showing X of Y", and **both count items rather than
   * rows.**
   *
   * `custody.myItems` is `managerStaffId = me OR custodianStaffId = me`, and every
   * row the third section shows satisfies `managerStaffId = me`, so the third
   * read's `total` is a **subset of this one's**, not a second population. Adding
   * them counts every lent item twice and prints a "of Y" that is larger than the
   * number of things this teacher is connected to; `total` alone is the honest
   * denominator, and it is why the hook does not hand out `lentTotal` at all.
   *
   * The numerator is a set for the same reason, and it is not derivable from one
   * array: an item the teacher both owns and has lent is on screen in **two**
   * tables, at two altitudes, so `inCharge.length + inHands.length + lentOut.length`
   * double-counts it and produces a "Showing 6 of 7" that is a number about
   * nothing in particular. The two reads also page independently, so a lent row
   * can arrive here that is *not* in the current `myItems` page — which is the
   * second reason the union is taken over ids rather than read off `items`.
   */
  const shownCount = new Set(
    [...inCharge, ...inHands, ...lentOut].map((item) => item.id)
  ).size;
  const matchedCount = total;

  return (
    <div className="space-y-6">
      <EquipmentHeader
        canTakeFromTheShelf={canTakeFromTheShelf}
        onTake={openTake}
      />

      <ThreeIdeasNotice hidden={isStaffRecordMissing} />

      {/*
        A genuine read failure. The account-having-no-staff-record case is NOT
        this: it arrives as a successful empty answer and is rendered below as
        what it is.
      */}
      {isError ? (
        <InventoryErrorState
          error={error}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : null}

      {isStaffRecordMissing ? (
        <InventoryEmptyState
          title="Your account has no staff record"
          description={
            accountName
              ? `You are signed in as ${accountName}, but there is no staff record for your account, so the equipment register has nothing to match you against. This is not an error, and it does not mean you own nothing — it means you are not yet a person in the staff register. Ask an administrator to link your account to your staff record, and everything you are in charge of or holding will appear here.`
              : "There is no staff record for your account, so the equipment register has nothing to match you against. This is not an error, and it does not mean you own nothing — it means you are not yet a person in the staff register. Ask an administrator to link your account to your staff record, and everything you are in charge of or holding will appear here."
          }
          action={
            <Button type="button" variant="outline" onClick={copyLinkRequest}>
              <IconClipboard data-icon="inline-start" />
              Copy a request for the office
            </Button>
          }
        />
      ) : null}

      {!isError && !isStaffRecordMissing ? (
        <>
          <EquipmentSearchBar
            search={search}
            onSearchChange={setSearch}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearFilters}
          />

          {/*
            `matchedCount` is counted before the server's page limit, so when it is
            larger than what arrived the list is showing a page of a bigger match
            set — and saying so is the difference between a count and a number that
            stops growing. One read's `total` against the number of distinct items
            on screen, because the third section's rows are already counted inside
            the first read (see the note in the component body).
          */}
          {!isLoading && matchedCount > shownCount ? (
            <p className="text-muted-foreground text-sm tabular-nums">
              Showing {shownCount} of {matchedCount}. Narrow it down with the
              search box.
            </p>
          ) : null}

          {/*
            `canReportProblem` is the section's own fact and it is passed
            explicitly, so the duty this section raises has the affordance that
            discharges it. `holdsItem` is passed rather than a `canRelease`
            flag, because a teacher who is in charge of an item *and* holding it
            appears in this section alone and must still find the hand-back here.
          */}
          <EquipmentSection
            title="In my charge"
            description="You are the person responsible for these. They may be on a shelf, in a store room or in use — you would be the one asked about them."
            items={inCharge}
            isLoading={isLoading}
            canReportProblem
            holdsItem={holdsItem}
            emptyTitle="Nothing is entrusted to you"
            emptyDescription="No item on the register names you as the person responsible for it. When an administrator puts you in charge of something, it will appear here — along with the obligation that comes with it: knowing where it is, and reporting it if it breaks or goes missing."
            onOpenHistory={openHistory}
            onOpenRelease={openRelease}
            onReportProblem={(item) => {
              void copyProblemReport(item);
            }}
          />

          <EquipmentSection
            title="In my hands"
            description="You are holding these. They are yours until you hand them back, and you cannot hand back something that is out on loan."
            items={inHands}
            isLoading={isLoading}
            canReportProblem={false}
            holdsItem={holdsItem}
            emptyTitle="You are not holding anything"
            emptyDescription="You have not signed for any equipment, so there is nothing here for you to return. When the store gives you something to take, it will appear in this list until it goes back."
            onOpenHistory={openHistory}
            onOpenRelease={openRelease}
            onReportProblem={(item) => {
              void copyProblemReport(item);
            }}
          />

          {/*
            The third section, and **below the other two deliberately**.

            Its own rule is that it exists only when there are rows, and that rule
            is why the order matters less than it looks: a teacher with nothing lent
            out sees two sections, exactly as they did before this was added, and a
            teacher with something lent out sees it last — after "In my hands",
            which is where they were already looking, and after "In my charge", where
            the same items are also listed. Putting it first would have put the
            hardest fact on a page at the moment the reader arrives, above the two
            simpler ones they came for.

            **The same item appearing in two sections is not a duplicate row.** "In
            my charge" is the same item as one line of the reader's property, with
            the actions a person has over a thing they answer for; this is the same
            item as a colleague's possession, with the owner's two verbs over it.
            The notice above says "listed once", and what that sentence has to mean
            for the rule to be true is *once per state* — which is what it says,
            and why the two sections are allowed to describe the same object at
            two altitudes.
          */}
          <LentOutSection
            items={lentOut}
            onOpenHistory={openHistory}
            onOpenReclaim={openReclaim}
            onOpenTransfer={openTransfer}
          />
        </>
      ) : null}

      <CustodyHistorySheet
        item={historyItem}
        entries={history}
        isLoading={isHistoryLoading}
        isError={isHistoryError}
        error={historyError}
        onClose={closeHistory}
        onRetry={refetchHistory}
      />

      <ReleaseDialog
        item={releaseItem}
        note={releaseNote}
        onNoteChange={setReleaseNote}
        onOpenChange={handleReleaseOpenChange}
        onConfirm={confirmRelease}
        isPending={isReleasePending}
      />

      <OwnerVerbDialogs
        reclaimItem={reclaimItem}
        reclaimReason={reclaimReason}
        onReclaimReasonChange={setReclaimReason}
        reclaimNote={reclaimNote}
        onReclaimNoteChange={setReclaimNote}
        onReclaimOpenChange={handleReclaimOpenChange}
        onReclaimSubmit={confirmReclaim}
        isReclaimPending={isReclaimPending}
        transferItem={transferItem}
        ownerName={accountName}
        onTransferOpenChange={handleTransferOpenChange}
        onTransferSubmit={confirmTransfer}
        isTransferPending={isTransferPending}
      />

      <TakeItemDialog
        open={takeOpen}
        onOpenChange={handleTakeOpenChange}
        isPending={isTakePending}
        onSubmit={confirmTake}
      />
    </div>
  );
};

/**
 * Alias for the route component.
 *
 * The other two teacher-portal routes name their component after the route
 * (`MyLeavesContent`, `MyProfileContent`). This page is written `MyEquipment`
 * because the file is `my-equipment.tsx`; the alias means a route written
 * either way resolves to the same component.
 */
export { MyEquipment as MyEquipmentContent };
