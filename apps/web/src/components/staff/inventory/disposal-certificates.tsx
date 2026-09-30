"use client";

/**
 * The write-off register's *reading* half: the queue summary, the certificate
 * table, the status history behind each row, and the four sign-off cells.
 *
 * Split out of `disposal-dialogs.tsx` because the table is a different job from the
 * panel (the panel owns the query, the presets and the empty states; this owns the
 * shape of a certificate) and because a certificate is a **document, not a list
 * row** — it has eleven columns because it carries four signatures, and each one
 * is a fact about a different person at a different time.
 *
 * `lifecycle-tabs.tsx` and the tests import `DisposalsPanel` from
 * `disposal-dialogs.tsx`, so the panel and the four dialogs moved to their own
 * files and this file re-exports what they share.
 */
/* oxlint-disable react-doctor/only-export-components -- the reading half of the write-off flow: constants and copy sit beside the components that draw them, so a caller reuses them instead of rewriting them */
import {
  DISPOSAL_FINAL_STATUSES,
  disposalMethodLabel,
  disposalStatusLabel,
} from "@school-student-teacher-management/db/constants/inventory";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@school-student-teacher-management/ui/components/collapsible";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { IconCircleCheck, IconHistory } from "@tabler/icons-react";
import type * as React from "react";

import type { DisposalRecord } from "@/components/staff/inventory/inventory-types";
import { formatCount } from "@/components/staff/inventory/shared";
import {
  PartyName,
  formatDateTime,
} from "@/components/staff/inventory/stock-form-helpers";

/** `listDisposals`' own default and hard ceiling. */
export const DISPOSAL_LIST_LIMIT = 50;

/**
 * The queue presets on the register tab.
 *
 * `final` is the odd one out: `listDisposals` takes a single `disposalStatusSchema`
 * and has no "any of the six terminal outcomes" input, so that preset is a
 * narrowing of the returned page rather than a server filter. See `DisposalsPanel`
 * for what that costs and how the difference is surfaced.
 */
export type DisposalFilter =
  | "all"
  | "pending_approval"
  | "approved"
  | "final"
  | "cancelled";

/**
 * The three queue presets that *are* a single `disposalStatusSchema` value, as
 * opposed to "all" and to the six-outcome group the server has no input for.
 */
const SINGLE_STATUS_FILTERS = [
  "pending_approval",
  "approved",
  "cancelled",
] as const;

export const isSingleStatusFilter = (
  value: DisposalFilter
): value is (typeof SINGLE_STATUS_FILTERS)[number] =>
  (SINGLE_STATUS_FILTERS as readonly string[]).includes(value);

/** True for the six terminal outcomes, narrowing the wire's `string` to the picklist. */
export const isFinalStatus = (
  value: string
): value is (typeof DISPOSAL_FINAL_STATUSES)[number] =>
  (DISPOSAL_FINAL_STATUSES as readonly string[]).includes(value);

/**
 * The queue presets, in the order a person works the ladder.
 *
 * **"Signed off" is first because it is the default.** The panel used to open on
 * `pending_approval`, which is the one stage the server refuses for its most likely
 * viewer: `approveDisposal` compares the actor's staff id against
 * `requestedByStaffId` and returns `FORBIDDEN` when they match, so a principal who
 * raised the request themselves — the common case for a storekeeper's principal,
 * and the case the tab order in `lifecycle-tabs.tsx` explicitly warns about — lands
 * on a queue of rows that cannot be actioned and spends two round trips finding out.
 * The signed-off queue is the one where every row can be finalised, and finalising is
 * the only step in the flow that moves stock, so it is the one worth landing on.
 * Nothing is hidden by the change: the summary table above carries the
 * awaiting-a-signature count in words, and the preset is one click away.
 */
export const DISPOSAL_FILTERS: { value: DisposalFilter; label: string }[] = [
  { value: "approved", label: "Signed off" },
  { value: "pending_approval", label: "Awaiting signature" },
  { value: "final", label: "Finalised" },
  { value: "cancelled", label: "Withdrawn" },
  { value: "all", label: "All certificates" },
];

/**
 * Money with thousand separators and no currency symbol.
 *
 * Nothing in this repo — schema, constants, or any other screen — names a
 * currency, so putting an `LKR` or an `Rs` on one column here would disagree with
 * every other place the same figure is shown. The amount is displayed; the unit is
 * not guessed.
 *
 * The grouping is `formatCount`'s, not a second opinion. This used to hardcode its
 * own `en-US` while the rest of the feature assumed `en-GB` — a per-call-site locale
 * choice that happened to agree today (both render `1,250.50` identically on this
 * repo's runtime) and would not the first time a school formatted something this
 * feature has not thought about yet. The two-decimal part is passed as options
 * because that is a property of a *money* figure, not of how this feature writes a
 * number.
 */
export const formatAmount = (value: string | null): string => {
  if (value === null) {
    return "—";
  }

  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? formatCount(parsed, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : value;
};

/**
 * What each of the six terminal outcomes actually does to the school's books.
 *
 * Keyed by `DISPOSAL_FINAL_STATUSES` and typed as a `Record` over that tuple, so a
 * seventh terminal outcome added to `packages/db/src/constants/inventory.ts` is a
 * **type error here** rather than a finalise dialog that quietly offers six of the
 * seven. The labels themselves come from `disposalStatusLabel`; what is written
 * here is the consequence, which no constants file has an opinion about.
 */
export const FINAL_OUTCOME_CONSEQUENCE: Record<
  (typeof DISPOSAL_FINAL_STATUSES)[number],
  string
> = {
  disposed:
    "Disposed — removed from the register, and nothing is recovered from it",
  recycled:
    "Recycled — removed from the register; the materials were recovered",
  auctioned:
    "Auctioned — removed from the register and sold; any proceeds belong on the certificate",
  written_off:
    "Written off — removed from the register with no proceeds and no recipient",
  donated:
    "Donated — removed from the register and recorded as a donation to the named body",
  returned_to_supplier:
    "Returned to supplier — removed from the register and sent back to the vendor",
};

/**
 * The four header counts, as a **real table**.
 *
 * Rendered locally rather than through `InventoryStatCards`, and deliberately so:
 * that component's six fields (`totalItems`, `lowStockItems`, …) describe the
 * *item* register, and a card labelled "Items" sitting above a count of write-off
 * certificates would be a lie about what the number is. These four come from
 * `listDisposals`' own `summary`, which is computed over the **whole filtered set**
 * rather than the page — a header reading "3 awaiting approval" while the list
 * shows one of them is a bug the user cannot see through.
 *
 * It used to be a four-cell grid of `small label over large number`, which is the
 * hero-metric template at quarter scale: no caption, four unexplained numbers, and
 * a colour per cell doing work the label already does. A `<table>` with a `<caption>`
 * that names the scope and `<th scope="col">` on each header is what a records tool
 * uses, and it is announced correctly.
 */
export const DisposalSummaryStrip: React.FC<{
  summary: {
    pendingApproval: number;
    approved: number;
    finalized: number;
    cancelled: number;
  };
}> = ({ summary }) => (
  <table className="w-full border text-xs">
    <caption className="text-muted-foreground pb-1 text-left">
      Counts across the whole filtered set, not just the page below.
    </caption>
    <thead>
      <tr>
        <th scope="col" className="border px-3 py-1.5 text-left font-medium">
          Awaiting a signature
        </th>
        <th scope="col" className="border px-3 py-1.5 text-left font-medium">
          Signed, not finalised
        </th>
        <th scope="col" className="border px-3 py-1.5 text-left font-medium">
          Finalised &mdash; left the books
        </th>
        <th scope="col" className="border px-3 py-1.5 text-left font-medium">
          Withdrawn
        </th>
      </tr>
    </thead>
    <tbody>
      <tr>
        {/*
         * `text-warning-ink`, not `text-gold`: this is a figure in body-sized type
         * and `--gold` is 3.87:1 on the page, below AA. The two tokens coexist
         * deliberately — `--gold` is still the right one for the `border-accent/50`
         * rules and the `accent` fills on the badges below, where it is a surface
         * rather than ink, and it is used as ink nowhere in this feature.
         */}
        <td className="text-warning-ink border px-3 py-1.5 font-semibold tabular-nums">
          {summary.pendingApproval}
        </td>
        <td className="border px-3 py-1.5 font-semibold tabular-nums">
          {summary.approved}
        </td>
        <td className="text-destructive border px-3 py-1.5 font-semibold tabular-nums">
          {summary.finalized}
        </td>
        <td className="text-muted-foreground border px-3 py-1.5 font-semibold tabular-nums">
          {summary.cancelled}
        </td>
      </tr>
    </tbody>
  </table>
);

/**
 * One certificate's status history, newest first, behind a `Collapsible`.
 *
 * **A `Collapsible` and not a `Tooltip`, deliberately.** A tooltip is reachable by
 * pointer and by focus on its trigger, but it is not in the tab order, it closes on
 * blur, and its content is not reliably announced — which makes it the wrong control
 * for the one thing a reader opens a history to read. A `Collapsible` is a real
 * button: tab to it, press Enter, read the rows, press again.
 *
 * **An empty list here is a normal state, not a failed load.** `listDisposals`
 * returns `history` only when the caller passes `withHistory`, and the absence of
 * the key is the signal that it was not asked for — a `pending_approval` request
 * legitimately has zero transitions because raising one writes none, and approving
 * it is the *first* row that will ever exist. So an empty array here means "asked,
 * and nothing has happened to it yet", and the copy says that rather than showing a
 * spinner or an error.
 *
 * The history is an ordered list of transitions, and the *order* is the information,
 * so it is a real `<table>` rather than a `<Collapsible>` of divs: `<caption>`,
 * `<th scope="row">` on the transition, and the timestamp in the second column means
 * a screen-reader user hears "Raised — today, 09:05" rather than five run-on spans.
 */
const DisposalHistory: React.FC<{
  disposal: DisposalRecord;
  history: NonNullable<DisposalRecord["history"]>;
}> = ({ disposal, history }) => (
  <Collapsible>
    <CollapsibleTrigger
      render={
        <Button
          variant="ghost"
          size="sm"
          data-icon="inline-start"
          aria-label={`Status history for the ${disposal.qty} ${disposal.itemName} write-off`}
        />
      }
    >
      {/*
        An inline-start icon like every other button in this file, so the
        icon-to-label gap here is the button's own `gap-1` rather than a hand-set
        `mr-2`. The count beside the label is the one *trailing* element in the
        feature, and it keeps its `ml-2` — the house idiom sizes the leading gap, not
        the badge that follows the words.
      */}
      <IconHistory aria-hidden="true" data-icon="inline-start" />
      History
      {history.length > 0 ? (
        <Badge variant="outline" className="ml-2 tabular-nums">
          {history.length}
        </Badge>
      ) : null}
    </CollapsibleTrigger>
    <CollapsibleContent>
      {history.length === 0 ? (
        <p className="text-muted-foreground border border-dashed p-3 text-xs">
          No transitions recorded yet. Raising a request writes none by design,
          so this stays empty until somebody signs it off or it is withdrawn.
        </p>
      ) : (
        <table className="w-full border text-xs">
          <caption className="sr-only">
            Every recorded status change to the {disposal.qty}{" "}
            {disposal.itemName} write-off, oldest first, with who made it and
            when.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="px-2 py-1 text-left font-medium">
                Change
              </th>
              <th scope="col" className="px-2 py-1 text-left font-medium">
                Recorded by
              </th>
              <th scope="col" className="px-2 py-1 text-right font-medium">
                When
              </th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry) => (
              <tr
                /**
                 * `changedAt` is the identity of a transition: the history table is
                 * append-only and each row is written by its own insert, so the
                 * timestamp is stable for the life of the row. The array index is
                 * not, and keying a list a user can re-sort or filter by index is
                 * how a row ends up showing somebody else's history.
                 */
                key={entry.changedAt}
              >
                <th scope="row" className="px-2 py-1 text-left font-medium">
                  {entry.fromStatus === null
                    ? "Raised"
                    : `${disposalStatusLabel(entry.fromStatus)} → ${disposalStatusLabel(entry.toStatus)}`}
                </th>
                {/*
                 * `PartyName` rather than a local sentence, and the difference is the
                 * strike-through: a departed colleague's transition is a thing that
                 * happened, and the visual is what stops a reader scanning the list
                 * from taking "No longer on the staff roll" for a step that is still
                 * outstanding. Both columns are read, so this is the one surface in
                 * the feature that used to collapse "they have left" and "they never
                 * had a staff row" into a single gap and now does not.
                 */}
                <td className="text-muted-foreground px-2 py-1">
                  <PartyName
                    name={entry.changedByName}
                    staffId={entry.changedByStaffId}
                    emptyLabel="Account with no staff row"
                  />
                  {entry.note ? (
                    <span className="block italic">{entry.note}</span>
                  ) : null}
                </td>
                <td className="text-muted-foreground px-2 py-1 text-right tabular-nums">
                  {formatDateTime(entry.changedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </CollapsibleContent>
  </Collapsible>
);

/**
 * How a certificate's status badge reads, in the order the ladder is climbed.
 *
 * A request awaiting a signature is the row that needs a decision, so it is the one
 * that gets the emphasised treatment; a finalised certificate is a fact about
 * something that already happened and gets the destructive tone, because from the
 * store's point of view the school does not have the property any more. A signed,
 * not-yet-finalised request is deliberately quiet — it is a stage, not an outcome.
 */
const statusBadgeVariant = (
  isPendingApproval: boolean,
  isFinalOutcome: boolean
): "secondary" | "destructive" | "outline" => {
  if (isPendingApproval) {
    return "secondary";
  }

  if (isFinalOutcome) {
    return "destructive";
  }

  return "outline";
};

/** One actor/timestamp pair, or an explicit "has not happened" for an unset one. */
const SignOffCell: React.FC<{
  name: string | null;
  staffId: string | null;
  at: string | null;
  pending: string;
}> = ({ name, staffId, at, pending }) => {
  if (at === null) {
    return <span className="text-muted-foreground">{pending}</span>;
  }

  return (
    <span className="block">
      {/*
       * The *stage* is the empty state here, not "no name": `pending` says what this
       * column would be holding if the step had not happened yet, which is true
       * whether the column is empty because the step is outstanding or because it
       * never will be. `PartyName` then only speaks when there is a timestamp, so a
       * name can never appear next to "Not finalised".
       */}
      <PartyName
        name={name}
        staffId={staffId}
        emptyLabel="Recorded against an account with no staff row"
      />
      <span className="text-muted-foreground block text-xs tabular-nums">
        {formatDateTime(at)}
      </span>
    </span>
  );
};

/**
 * The write-off register's rows.
 *
 * The row actions are handed in as callbacks rather than reaching for state, so this
 * component cannot open a dialog and the panel cannot accidentally render a decision
 * it does not own.
 */
export const DisposalCertificatesTable: React.FC<{
  disposals: DisposalRecord[];
  onSignOff: (disposal: DisposalRecord) => void;
  onFinalise: (disposal: DisposalRecord) => void;
  onWithdraw: (disposal: DisposalRecord) => void;
}> = ({ disposals, onSignOff, onFinalise, onWithdraw }) => (
  <Table>
    <TableCaption>
      One row per write-off certificate, carrying all four signatures: who
      raised it, who signed it, who finalised it, and who withdrew it.
      Finalising is the only step that moves stock.
    </TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead>Item</TableHead>
        <TableHead className="text-right">Qty</TableHead>
        <TableHead>Reason</TableHead>
        <TableHead>Pinned tags</TableHead>
        <TableHead>Method</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Requested</TableHead>
        <TableHead>Approved</TableHead>
        <TableHead>Finalised</TableHead>
        <TableHead>Cancelled</TableHead>
        <TableHead>Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {disposals.map((disposal) => {
        const isPendingApproval = disposal.pendingApproval;
        const isApproved = disposal.status === "approved";
        const isFinalOutcome = isFinalStatus(disposal.status);

        return (
          <TableRow key={disposal.id}>
            <TableCell>
              <span className="block font-medium">{disposal.itemName}</span>
              <span className="text-muted-foreground font-mono text-xs">
                {disposal.itemSku}
              </span>
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {disposal.qty}
            </TableCell>
            <TableCell className="max-w-64">
              <span className="line-clamp-2">{disposal.reason}</span>
            </TableCell>
            <TableCell>
              {/**
               * Every pinned tag, in full. The certificate is the only record of which
               * specific devices a write-off covered, so a count standing in for the
               * list is a count of nothing.
               */}
              {disposal.units.length > 0 ? (
                <span className="block font-mono text-xs break-all">
                  {disposal.units.map((unit) => unit.uniqueNo).join(", ")}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  &mdash; not pinned
                </span>
              )}
            </TableCell>
            <TableCell>
              {disposal.methodLabel ?? disposalMethodLabel(disposal.method)}
            </TableCell>
            <TableCell>
              <Badge
                variant={statusBadgeVariant(isPendingApproval, isFinalOutcome)}
              >
                {disposal.statusLabel ?? disposalStatusLabel(disposal.status)}
              </Badge>
            </TableCell>
            <TableCell>
              <SignOffCell
                name={disposal.requestedByName}
                staffId={disposal.requestedByStaffId}
                at={disposal.requestedAt}
                pending="Not recorded"
              />
            </TableCell>
            <TableCell>
              <SignOffCell
                name={disposal.approvedByName}
                staffId={disposal.approvedByStaffId}
                at={disposal.approvedAt}
                pending="Awaiting a signature"
              />
            </TableCell>
            <TableCell>
              <SignOffCell
                name={disposal.finalizedByName}
                staffId={disposal.finalizedByStaffId}
                at={disposal.finalizedAt}
                pending="Not finalised"
              />
            </TableCell>
            <TableCell>
              {/*
               * `pending="Not withdrawn"`, and not a dash.
               *
               * The three sibling columns answer an absent step in words —
               * "Awaiting a signature", "Not finalised" — because on a certificate
               * the reader is trying to work out *where in the ladder this is*, and a
               * dash says nothing at all about which step is missing. This column is
               * the fourth of the same ladder, so it answers in the same language.
               */}
              <SignOffCell
                name={disposal.cancelledByName}
                staffId={disposal.cancelledByStaffId}
                at={disposal.cancelledAt}
                pending="Not withdrawn"
              />
              {disposal.cancellationReason ? (
                <span className="text-muted-foreground line-clamp-2 text-xs italic">
                  {disposal.cancellationReason}
                </span>
              ) : null}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {isPendingApproval ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onSignOff(disposal);
                    }}
                    data-icon="inline-start"
                  >
                    <IconCircleCheck
                      aria-hidden="true"
                      data-icon="inline-start"
                    />
                    Sign off
                  </Button>
                ) : null}
                {isApproved ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      onFinalise(disposal);
                    }}
                  >
                    Finalise
                  </Button>
                ) : null}
                {isPendingApproval || isApproved ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      onWithdraw(disposal);
                    }}
                  >
                    Withdraw
                  </Button>
                ) : null}
                {disposal.history ? (
                  <DisposalHistory
                    disposal={disposal}
                    history={disposal.history}
                  />
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  </Table>
);
