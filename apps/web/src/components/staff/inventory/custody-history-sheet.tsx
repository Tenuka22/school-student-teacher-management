"use client";

/**
 * The trail, in a `Sheet` and not a `Dialog`.
 *
 * It is a record the reader scrolls and compares, and the reason to reach for a
 * side panel rather than a centred modal is that the register stays behind it: a
 * reader who opens the trail for one row and then wants it for the next is doing a
 * comparison, and a modal makes that two dismissals per row. The panel is also the
 * only place in the feature where the two halves of the history can be read against
 * each other at once, which is the entire reason they share a table.
 *
 * ## Why this is a `<table>` and not the timeline it used to be
 *
 * The old version rendered an `<ol>` with a decorative rail down the side. It was
 * a good-looking list and the wrong shape: a custody history is read by
 * *column* — "show me every time the custodian changed and never the manager" is
 * a question a table answers by reading two cells down, and an `<ol>` answers by
 * reading every row in full. It is also a legal-ish record, and a record has to be
 * navigable by header, nameable by `<caption>`, and legible in a column order a
 * screen reader can hold.
 *
 * The icon and the badge treatment are kept, and they are what tell a custody row
 * from a manager row apart — so the distinction survives losing the rail.
 */
import { inventoryItemIdSchema } from "@school-student-teacher-management/db/schema/inventory";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@school-student-teacher-management/ui/components/sheet";
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
  IconUserCheck,
  IconUserCog,
  IconUserMinus,
  IconUserPlus,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import * as v from "valibot";

import {
  IN_STORE,
  NO_MANAGER,
} from "@/components/staff/inventory/custody-form";
import {
  ReclaimCustodyDialog,
  TransferOwnershipDialog,
} from "@/components/staff/inventory/custody-owner-dialogs";
import type {
  CustodyHistoryEntry,
  InventoryItemView,
} from "@/components/staff/inventory/inventory-types";
import {
  InventoryEmptyState,
  InventoryErrorState,
  InventoryInlineNotice,
} from "@/components/staff/inventory/shared";
import { PartyName } from "@/components/staff/inventory/stock-form-helpers";
import { orpc } from "@/utils/orpc";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Days per unit, for the coarse end of the ladder.
 *
 * The approximations a calendar would not agree with — a month is not 30 days — are
 * deliberate and confined to the *readable* half of the answer. The claim an auditor
 * acts on is the exact timestamp, which rides along in the `sr-only` span beside
 * this string and in the `datetime` attribute.
 */
const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30.44;
const DAYS_PER_YEAR = 365.25;

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat("en-GB", {
  numeric: "auto",
});

/** Built once rather than per row: a `DateTimeFormat` is not cheap to construct. */
const ABSOLUTE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * The instant one history sheet is measured against, and the midnight it is
 * measured from.
 *
 * A trail is read as a list, and a list has one "now". Taking `Date.now()` per row
 * means two rows either side of a render boundary can disagree about the instant —
 * a row can read "2 days ago" next to a row that reads "3 days ago" about the same
 * evening — and the ladder below is then walked once per row per render. Hoisting
 * it to one call per sheet makes it one.
 *
 * `midnight` is what turns "yesterday" into a calendar fact. A fixed 86,400,000 ms
 * is right only at noon; at 11am, 36 hours ago is a day *and a half* ago and would
 * print as "yesterday" under a naive threshold, which for a record is a claim about
 * a date and not merely a rounding.
 */
interface RelativeClock {
  now: number;
  midnight: number;
}

const startOfLocalDay = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const createRelativeClock = (): RelativeClock => {
  const now = Date.now();
  return { now, midnight: startOfLocalDay(now) };
};

/**
 * "3 days ago", read upwards from the smallest unit.
 *
 * The original walked a six-entry table from the largest unit down, so *every* row
 * paid six comparisons to discover that a transfer from this morning is a matter of
 * minutes — and recent rows are nearly all of them. Ascending, the common case
 * costs two.
 *
 * `suppressHydrationWarning` is still needed on the element that prints this: the
 * value depends on `Date.now()`, which can land on either side of a render boundary
 * between the server's HTML and the client's first paint.
 */
const formatRelative = (iso: string, clock: RelativeClock): string => {
  const then = Date.parse(iso);

  if (Number.isNaN(then)) {
    return "at an unrecorded time";
  }

  const elapsed = clock.now - then;

  if (Math.abs(elapsed) < MINUTE_MS) {
    return "just now";
  }

  const minutes = Math.round(elapsed / MINUTE_MS);
  if (Math.abs(minutes) < 60) {
    return RELATIVE_FORMATTER.format(-minutes, "minute");
  }

  const hours = Math.round(elapsed / HOUR_MS);
  if (Math.abs(hours) < 24) {
    return RELATIVE_FORMATTER.format(-hours, "hour");
  }

  const days = Math.round((clock.midnight - startOfLocalDay(then)) / DAY_MS);
  if (Math.abs(days) < DAYS_PER_WEEK) {
    return RELATIVE_FORMATTER.format(-days, "day");
  }

  if (Math.abs(days) < DAYS_PER_MONTH) {
    return RELATIVE_FORMATTER.format(-Math.round(days / DAYS_PER_WEEK), "week");
  }

  if (Math.abs(days) < DAYS_PER_YEAR) {
    return RELATIVE_FORMATTER.format(
      -Math.round(days / DAYS_PER_MONTH),
      "month"
    );
  }

  return RELATIVE_FORMATTER.format(-Math.round(days / DAYS_PER_YEAR), "year");
};

const formatAbsolute = (iso: string): string =>
  ABSOLUTE_FORMATTER.format(new Date(iso));

/**
 * Manager changes and custody changes, told apart at a glance — and now also in a
 * column.
 *
 * The two live in one table (`inventoryCustodyHistory`) and in one sheet here, on
 * purpose. An audit asks "what happened to this item", and splitting the two kinds
 * of change onto separate screens would answer half of that question — and the
 * halves interleave, because a hand-over in March is often followed by an
 * accountability change in April on the same cupboard. So they share the trail and
 * are distinguished by four channels at once: the icon in the change cell, the
 * `changeTypeLabel` the server generated, the badge's treatment, and the wording of
 * the before-and-after pair. Colour is the last of those and never the only one.
 */
const CustodyHistoryEntryRow = ({
  entry,
  clock,
}: {
  entry: CustodyHistoryEntry;
  /** The sheet's single instant, so every row is measured against the same one. */
  clock: RelativeClock;
}) => {
  /**
   * `changeType` is the closed six-value picklist from `CUSTODY_CHANGE_TYPES`,
   * split three-and-three between the two kinds, so the prefix is an exact
   * discriminator rather than a guess. Deriving the *kind* from the change type —
   * rather than from "which id happens to be non-null" — is what stops a
   * `custody_released` row (whose new custodian is null by definition) from being
   * misread as a manager row.
   */
  const isCustodyChange = !entry.changeType.startsWith("manager");

  const previousName = isCustodyChange
    ? entry.previousCustodianName
    : entry.previousManagerName;
  const previousId = isCustodyChange
    ? entry.previousCustodianStaffId
    : entry.previousManagerStaffId;
  const nextName = isCustodyChange
    ? entry.newCustodianName
    : entry.newManagerName;
  const nextId = isCustodyChange
    ? entry.newCustodianStaffId
    : entry.newManagerStaffId;

  /**
   * What the empty side of each pair is called. A custodian that becomes nobody has
   * gone back on a shelf; a manager that becomes nobody has been left unaccountable
   * for, which is a different and more serious thing to read in a register — and it
   * is the state this feature exists to close.
   */
  const emptyLabel = isCustodyChange ? IN_STORE : NO_MANAGER;
  const Icon = isCustodyChange ? IconUserCheck : IconUserCog;

  /*
   * `text-warning-ink`, not `text-gold`, and the two tokens coexist on purpose.
   * `--gold` is a *fill* token for this feature and on the page background it is
   * 3.87:1, under the 4.5:1 AA threshold for body text. `--warning-ink` is the same
   * hue darkened for ink specifically: 6.12:1 on the page and 5.65:1 on the badge
   * fill, so the same word reads the same way wherever it lands. The arithmetic is
   * in `packages/ui/src/styles/globals.css`.
   */
  const markerClass = isCustodyChange
    ? "bg-accent/25 text-warning-ink"
    : "bg-primary/25 text-primary";

  return (
    <TableRow>
      {/*
        `scope="row"` on the change cell, so a screen reader reading the row
        linearly hears *what happened* before *to whom* — which is the order the
        question is asked in, and the reason the icon and the badge sit here rather
        than in a column of their own.
      */}
      <TableCell as="th" scope="row" className="font-normal">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`flex size-4 shrink-0 items-center justify-center rounded-full ${markerClass}`}
          >
            <Icon className="size-2.5" />
          </span>
          <Badge
            variant={isCustodyChange ? "outline" : "default"}
            className={
              isCustodyChange ? "border-accent/50 text-warning-ink" : undefined
            }
          >
            {entry.changeTypeLabel}
          </Badge>
        </span>
      </TableCell>
      <TableCell className="whitespace-normal">
        <PartyName
          name={previousName}
          staffId={previousId}
          emptyLabel={emptyLabel}
        />
      </TableCell>
      <TableCell className="whitespace-normal">
        <PartyName name={nextName} staffId={nextId} emptyLabel={emptyLabel} />
      </TableCell>
      <TableCell>
        {/*
          The instant is in the accessibility tree, not only in a `title`. A trail
          is read to answer *when*, and the relative string is a lossy answer: "2
          days ago" is a different claim on the third of March than on the fifth.
          `title` is a mouse affordance — `<time>` is not focusable, so a keyboard or
          screen-reader user never reached the exact value that the file's own comment
          called "the claim that matters". The `sr-only` span is announced by
          everyone; the `title` stays for the pointer. It is placed *after* the
          visible text so the reading order is "3 days ago" then the full stamp, which
          is how a person would say it. `tabular-nums` is on the `Table` itself.
        */}
        <time
          dateTime={entry.changedAt}
          title={formatAbsolute(entry.changedAt)}
          suppressHydrationWarning
          className="text-muted-foreground"
        >
          {formatRelative(entry.changedAt, clock)}
          <span className="sr-only">
            {" — "}
            {formatAbsolute(entry.changedAt)}
          </span>
        </time>
      </TableCell>
      <TableCell className="whitespace-normal">
        {entry.reasonLabel}
        {entry.note ? (
          <>
            {" — "}
            <span className="text-foreground/80">{entry.note}</span>
          </>
        ) : null}
      </TableCell>
    </TableRow>
  );
};

/**
 * The sheet's three bodies, so `CustodyHistorySheet` stays a composition rather
 * than a four-way branch in a scroll container.
 *
 * **A failed read is never drawn as an empty list.** That distinction is the whole
 * reason this is a separate component: `entries.length === 0` on a *successful*
 * request is a fact about the store ("nothing has ever happened to this item") and
 * `error` is an outage. Rendering the second as the first is a confident,
 * well-written, false claim about an item nobody is accountable for — so the error
 * state is settled **before** the empty state is reachable, and the empty state
 * names why it is a fact rather than a gap.
 */
const CustodyHistoryBody: React.FC<{
  isLoading: boolean;
  error: unknown;
  entries: CustodyHistoryEntry[];
  onRetry: () => void;
}> = ({ isLoading, error, entries, onRetry }) => {
  if (isLoading) {
    return (
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
        <span className="sr-only">
          Loading this item&rsquo;s custody history…
        </span>
        <div aria-hidden="true" className="flex flex-col gap-4">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
              <Skeleton className="h-3 w-48" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <InventoryErrorState error={error} onRetry={onRetry} />;
  }

  if (entries.length === 0) {
    return (
      <InventoryEmptyState
        title="No custody changes recorded"
        description="This item has never been assigned to a manager or held by a member of staff. The first transfer, appointment or claim will appear here — and nothing before that point is missing. The item was simply in the store."
      />
    );
  }

  /*
   * One clock for the whole sheet, taken after the states above have been settled
   * and above the `map`. Two reasons, and both are about the list rather than the
   * sheet: every row is measured against the same instant, so two rows cannot
   * disagree about what "now" is across a render boundary, and `Date.now()` is called
   * once per render rather than once per row per render.
   */
  const clock = createRelativeClock();

  return (
    <Table>
      {/*
        The caption is the table's accessible name and its first child, so it is
        what a screen reader announces before the rows. It names the item and says
        which way the list runs, because "newest first" is the sort the server did
        and nothing else on screen states it.
      */}
      <TableCaption>
        Every recorded change of manager and custodian for this item, newest
        first. Each row gives what changed, who held it before, who holds it
        now, when it happened and why.
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">What changed</TableHead>
          <TableHead scope="col">Was held by</TableHead>
          <TableHead scope="col">Now held by</TableHead>
          <TableHead scope="col">When</TableHead>
          <TableHead scope="col">Why</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <CustodyHistoryEntryRow key={entry.id} entry={entry} clock={clock} />
        ))}
      </TableBody>
    </Table>
  );
};

export interface CustodyHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemView | null;
}

/**
 * **The two owner verbs are reached from the foot of this panel, and this is a
 * considered place for them rather than a convenient one.** A reader who has just
 * read a trail is the one person on the screen who knows *why* a change happened,
 * and an owner deciding to call something back is making a decision about the same
 * two columns the table above is about. The alternative — the register's row menu —
 * is the other door to the same dialogs and a sibling's file; the dialogs are
 * exported, take their item as a prop and own their mutations, so either door works
 * and neither is a special case.
 */
export const CustodyHistorySheet = ({
  open,
  onOpenChange,
  item,
}: CustodyHistorySheetProps) => {
  /**
   * The wire carries `id` as a plain `string` where the procedure's input is the
   * branded `InventoryItemId`, so it is parsed through the repository's own id
   * schema here — a validation rather than an assertion, at the one place in this
   * file where the two meet. It cannot throw for a string input, and the query is
   * disabled unless there is an item, so the empty-string fallback is never sent.
   */
  const itemId = v.parse(inventoryItemIdSchema, item?.id ?? "");

  const historyQuery = useQuery(
    orpc.inventory.custody.history.queryOptions({
      input: { itemId },
      enabled: open && item !== null,
    })
  );

  const entries = historyQuery.data ?? [];

  const [isOwnershipOpen, setIsOwnershipOpen] = useState(false);
  const [isReclaimOpen, setIsReclaimOpen] = useState(false);

  /**
   * What one of the two dialogs below has written while this panel is open.
   *
   * `item` is the register's **snapshot** of the row, taken when the sheet was
   * opened, and a snapshot is stale the moment a write lands: without this the panel
   * would keep offering to call back an item that is already in the store, and the
   * hand-on dialog would keep telling a storekeeper that the previous owner is still
   * the owner. It is cleared when the panel closes, because a fresh open hands over a
   * freshly fetched row and an override from the last visit would then be masking
   * somebody else's change rather than this panel's own.
   *
   * `useMemo` rather than a `useEffect` that copies `item` into state: the value is
   * *derived* from the prop plus the override, so deriving it during render is the
   * whole of the requirement and an effect would only add a frame in which the two
   * disagree.
   */
  const [written, setWritten] = useState<{
    itemId: string;
    managerStaffId: string | null;
    managerName: string | null;
    custodianStaffId: string | null;
    custodianName: string | null;
  } | null>(null);

  const view: InventoryItemView | null = useMemo(() => {
    if (!item || !written || written.itemId !== item.id) {
      return item;
    }

    return { ...item, ...written };
  }, [item, written]);

  /**
   * Whether the trail above is currently *not* on screen, and why.
   *
   * **This is the partially-loaded case, and it used to be invisible.** The item
   * loads with the register row the panel was opened from, and the history is a
   * second request: for a moment — or for good, if it fails — the foot of the panel
   * offers "Hand on the ownership" and "Call it back from S. Fernando" underneath a
   * body that is a skeleton or an error. Both of those are decisions somebody makes
   * *by reading the trail*, and a reader who is shown a panel with no readable trail
   * has been shown something that looks complete. So the foot says so, in words,
   * while the trail is absent. The buttons stay enabled on purpose: the notice
   * explains, and a disabled control with no recovery is the failure mode this
   * folder keeps arguing against.
   *
   * A named function with early returns rather than a chain of conditionals,
   * because this is the one place in the panel where "what does the reader think
   * they are looking at" is decided, and a four-way ternary is the shape nobody can
   * check.
   */
  const describeTrailGap = (): string | null => {
    if (!view) {
      return "No item is selected, so there is no history to show.";
    }
    if (historyQuery.isLoading) {
      return "The custody history for this item is still loading, so what is below is not being decided from the trail.";
    }
    if (historyQuery.isError) {
      return "The custody history for this item could not be read, so what is below is not being decided from the trail. The item row itself did load — only its history is missing.";
    }
    return null;
  };

  const trailGap = describeTrailGap();

  const openOwnership = () => {
    setIsReclaimOpen(false);
    setIsOwnershipOpen(true);
  };

  const openReclaim = () => {
    setIsOwnershipOpen(false);
    setIsReclaimOpen(true);
  };

  const closeSheet = (next: boolean) => {
    if (!next) {
      setWritten(null);
      setIsOwnershipOpen(false);
      setIsReclaimOpen(false);
    }
    onOpenChange(next);
  };

  return (
    <Sheet open={open} onOpenChange={closeSheet}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="font-heading text-base">
            Custody history
          </SheetTitle>
          <SheetDescription>
            {item ? (
              <>
                {item.name}{" "}
                <span className="font-mono text-xs">({item.sku})</span> — every
                recorded change of manager and custodian, newest first
              </>
            ) : (
              "Every recorded change of manager and custodian, newest first"
            )}
          </SheetDescription>
        </SheetHeader>

        <div
          className="flex-1 overflow-y-auto p-4"
          aria-busy={historyQuery.isLoading || undefined}
        >
          <CustodyHistoryBody
            entries={entries}
            error={historyQuery.error}
            isLoading={historyQuery.isLoading}
            onRetry={() => {
              void historyQuery.refetch();
            }}
          />
        </div>

        {/*
          The foot of the panel, and the only part of it that writes. The two verbs
          are kept apart on the face of the panel for the same reason they are kept
          apart in the dialogs: one changes who answers for the item, the other
          changes who has it, and a row of undifferentiated "custody" buttons is how a
          register gets handed-on ownership by accident.

          The reclaim is offered only when somebody is holding the item, because
          `reclaimCustody` refuses it with "This item is not in anybody's custody, so
          there is nothing to call back" — a control that always fails is worse than no
          control, and the sentence it would have produced is already on screen in the
          holder's own badge above.
        */}
        <div className="flex flex-col gap-3 border-t p-4">
          <p className="text-muted-foreground text-xs">
            Two different changes, two different reasons. One changes who the
            school asks about this item; the other changes who is holding it.
          </p>
          {trailGap ? (
            <InventoryInlineNotice
              tone="warning"
              title="This panel is not complete yet"
              description={trailGap}
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openOwnership}
              disabled={!view}
              data-icon="inline-start"
            >
              <IconUserPlus data-icon="inline-start" />
              Hand on the ownership
            </Button>
            {view?.custodianStaffId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openReclaim}
                data-icon="inline-start"
              >
                <IconUserMinus data-icon="inline-start" />
                Call it back from {view.custodianName ?? "its holder"}
              </Button>
            ) : (
              <span className="text-muted-foreground text-xs">
                Nobody is holding it, so there is nothing to call back.
              </span>
            )}
          </div>
        </div>
      </SheetContent>

      <TransferOwnershipDialog
        open={isOwnershipOpen}
        onOpenChange={setIsOwnershipOpen}
        item={view}
        onRecorded={(owner) => {
          /*
           * The holder is cleared in the same transaction as the hand-on, so this is
           * two columns rather than one. Reading that off `transfer-ownership.ts`
           * rather than leaving the panel to refetch is what stops it offering a
           * reclaim against a holder the write has already released.
           */
          setWritten({
            itemId,
            managerStaffId: owner.staffId,
            managerName: owner.name,
            custodianStaffId: null,
            custodianName: null,
          });
        }}
      />

      <ReclaimCustodyDialog
        open={isReclaimOpen}
        onOpenChange={setIsReclaimOpen}
        item={view}
        onRecorded={() => {
          /*
           * **The name is deliberately dropped, and the server drops it too.**
           * `reclaim-custody.ts` returns `custodianStaffId: null` *and*
           * `custodianName: null`; the previous holder's name is in the toast and in
           * the trail. Carrying it onto the view would put a name beside a null
           * pointer, and this folder has spent a great deal of argument establishing
           * that a name with no pointer behind it is a *different* fact from a
           * departed staff record — the one `PartyName` strikes through. Here it would
           * simply be a lie in the badge: the hand-on dialog's own "this also clears
           * the current holder" notice reads `custodianStaffId`, and its preview reads
           * `custodianName`, so a carried-over name would have the register claiming
           * the previous holder still has the item on the one screen that knows they do
           * not.
           *
           * The owner is read back off `view` rather than restated, because a reclaim
           * does not touch it: the whole point of the dialog is that calling something
           * back is not a hand-on, and an override that restated the manager column
           * would be the code disagreeing with the copy.
           */
          setWritten({
            itemId,
            managerStaffId: view?.managerStaffId ?? null,
            managerName: view?.managerName ?? null,
            custodianStaffId: null,
            custodianName: null,
          });
        }}
      />
    </Sheet>
  );
};
