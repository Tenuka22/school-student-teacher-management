"use client";

/**
 * The disposal register: every write-off certificate, who raised it, who signed it,
 * who finalised it, and — optionally — how it got there.
 *
 * The row actions are driven entirely by `pendingApproval` and `status`, both of
 * which come from the server. Deriving "can I act on this" in the client would be a
 * second implementation of the ladder, and the one place it must not drift is the
 * buttons a principal clicks.
 */
import { Button } from "@school-student-teacher-management/ui/components/button";
import { FieldLabel } from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import { IconPlus } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";

import {
  DISPOSAL_FILTERS,
  DISPOSAL_LIST_LIMIT,
  DisposalCertificatesTable,
  DisposalSummaryStrip,
  isFinalStatus,
  isSingleStatusFilter,
} from "@/components/staff/inventory/disposal-certificates";
import type { DisposalFilter } from "@/components/staff/inventory/disposal-certificates";
import {
  ApproveDisposalDialog,
  CancelDisposalDialog,
  FinalizeDisposalDialog,
} from "@/components/staff/inventory/disposal-decision-dialogs";
import { DisposalRequestDialog } from "@/components/staff/inventory/disposal-request-dialog";
import type { DisposalRecord } from "@/components/staff/inventory/inventory-types";
import {
  InventoryEmptyState,
  InventoryErrorState,
  InventorySkeleton,
} from "@/components/staff/inventory/shared";
import { orpc } from "@/utils/orpc";

/**
 * The write-off queue's empty state, and the reason it is a function rather than two
 * string constants.
 *
 * The three states are genuinely different facts, and only one of them is a mistake.
 * An empty queue filtered to *awaiting a signature* while the summary says there are
 * some pending is impossible — the summary and the list are computed from the same
 * `where` in one round trip — so that combination is surfaced as a data inconsistency
 * rather than as a cheerful "all clear". An empty *finalised* list is the normal
 * condition of a school that has not yet had to destroy anything. And an entirely
 * empty register is the one state that is actually telling the user to do something.
 */
const disposalEmptyTitle = (
  filter: DisposalFilter,
  pendingApproval: number
): string => {
  if (filter === "pending_approval") {
    return pendingApproval > 0
      ? "The queue says these are signed, but no row is"
      : "Nothing is waiting for a signature";
  }
  if (filter === "approved") {
    return "No certificate is signed off and un-actioned";
  }
  if (filter === "cancelled") {
    return "No write-off has been withdrawn";
  }
  if (filter === "final") {
    return "Nothing has been finalised yet";
  }
  return "No school property has been written off";
};

const disposalEmptyDescription = (
  filter: DisposalFilter,
  hasFilter: boolean,
  summary: { pendingApproval: number; approved: number } | undefined
): string => {
  if (filter === "pending_approval" && summary && summary.pendingApproval > 0) {
    return "The summary above counts requests awaiting a signature, but no row is listed. Both numbers come from the same filtered set, so this is worth reporting rather than retrying — the list and the header are describing different things.";
  }
  if (filter === "pending_approval") {
    return "Every write-off request has been dealt with. Raising one puts a certificate in front of somebody who has to sign it, and the stock does not move until they do — so an empty queue means nothing is waiting on a decision.";
  }
  if (filter === "approved") {
    return "Nothing has been signed off and left waiting. A signed request can still be finalised, and finalising is the only step that takes stock off the books.";
  }
  if (filter === "cancelled") {
    return "No write-off request has been withdrawn. Withdrawing is for a request that turned out to be based on a miscount, a duplicated tag, or a device that turned out to be working.";
  }
  if (filter === "final") {
    return "A school that has not yet had to destroy anything looks exactly like this. A finalised certificate is the record of something that already happened — it cannot be created by finalising from here.";
  }
  if (hasFilter) {
    return "No certificate matches this search or queue. Clear them to see every write-off on record.";
  }
  return "The write-off register is empty, which is the best state it can be in. A certificate is a proposal first: raising one moves no stock, a second person has to sign it, and only finalising takes the property off the books.";
};

export const DisposalsPanel = () => {
  /**
   * "Signed off", not "Awaiting signature" — see `DISPOSAL_FILTERS` for why: the
   * awaiting-a-signature queue is the one stage the server refuses for the person most
   * likely to open it, so it is the worst place to land.
   */
  const [filter, setFilter] = useState<DisposalFilter>("approved");
  const [search, setSearch] = useState("");
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [approving, setApproving] = useState<DisposalRecord | null>(null);
  const [finalizing, setFinalizing] = useState<DisposalRecord | null>(null);
  const [cancelling, setCancelling] = useState<DisposalRecord | null>(null);
  const idBase = `disposals-${useId().replaceAll(/[^\dA-Za-z_-]/gu, "")}`;

  const disposalsQuery = useQuery(
    orpc.inventory.disposals.list.queryOptions({
      input: {
        limit: DISPOSAL_LIST_LIMIT,
        // Asked for explicitly, because `history` is absent from the response unless it
        // is — and an absent key cannot be told from an empty one.
        withHistory: true,
        ...(isSingleStatusFilter(filter) ? { status: filter } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      },
    })
  );

  const disposals = useMemo(
    () => disposalsQuery.data?.disposals ?? [],
    [disposalsQuery.data]
  );
  const summary = disposalsQuery.data?.summary;
  const total = disposalsQuery.data?.total ?? 0;
  const hasFilter = filter !== "all" || Boolean(search.trim());

  /**
   * The "Finalised" preset is a **client-side** narrowing of the returned page, not a
   * server filter, and the only place in this feature that is true.
   *
   * `disposalStatusSchema` is a closed picklist and `listDisposals` has no "any of
   * these six" input, so there is no way to ask the server for the terminal set as a
   * group. The summary's `finalized` count is the server's own figure for the same
   * thing across the whole filtered set, and it is rendered above — so if the narrowed
   * page and that count disagree, the difference is the page limit (50) rather than a
   * filter that does not work. Stated in words below the table rather than left for a
   * reader to infer from a number.
   */
  const visibleDisposals = useMemo(
    () =>
      filter === "final"
        ? disposals.filter((row) => isFinalStatus(row.status))
        : disposals,
    [disposals, filter]
  );

  return (
    <div className="space-y-4">
      {summary ? <DisposalSummaryStrip summary={summary} /> : null}

      {/**
       * The queue presets, as real buttons with `aria-pressed`, inside a `fieldset`
       * with a visually-hidden legend.
       *
       * **A group and not a tablist.** These are filters over one list rather than
       * tabs over several panels: a `role="tab"` would promise the arrow-key navigation
       * and the one-panel-per-tab structure that `Tabs` actually provides, and this has
       * neither. The `fieldset` gives the group a real name that is announced once,
       * instead of five buttons a screen-reader user meets with no indication of what
       * they are filtering.
       */}
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">
          Filter the write-off register by stage
        </legend>
        {DISPOSAL_FILTERS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={filter === option.value ? "default" : "outline"}
            aria-pressed={filter === option.value}
            onClick={() => {
              setFilter(option.value);
            }}
          >
            {option.label}
          </Button>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-56">
          <FieldLabel htmlFor={`${idBase}-search`}>Search</FieldLabel>
          <Input
            id={`${idBase}-search`}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="Reason, notes, item name or SKU"
            className="mt-1"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setIsRequestOpen(true);
          }}
          data-icon="inline-start"
        >
          <IconPlus aria-hidden="true" data-icon="inline-start" />
          Raise a write-off
        </Button>
      </div>

      {disposalsQuery.isLoading ? <InventorySkeleton rows={6} /> : null}

      {/**
       * A failed read never renders as an empty register. The empty state below is
       * gated on `!isError`, so "we could not reach the server" and "this school has
       * never written anything off" cannot look alike — and the second of those is a
       * claim a clerk acts on.
       */}
      {disposalsQuery.isError ? (
        <InventoryErrorState
          error={disposalsQuery.error}
          onRetry={() => {
            void disposalsQuery.refetch();
          }}
        />
      ) : null}

      {!disposalsQuery.isLoading &&
      !disposalsQuery.isError &&
      visibleDisposals.length === 0 ? (
        <InventoryEmptyState
          title={disposalEmptyTitle(filter, summary?.pendingApproval ?? 0)}
          description={disposalEmptyDescription(filter, hasFilter, summary)}
        />
      ) : null}

      {!disposalsQuery.isLoading &&
      !disposalsQuery.isError &&
      visibleDisposals.length > 0 ? (
        <>
          <DisposalCertificatesTable
            disposals={visibleDisposals}
            onSignOff={setApproving}
            onFinalise={setFinalizing}
            onWithdraw={setCancelling}
          />

          {/**
           * **Two different numbers, and this line says which is which.**
           *
           * It used to read "Showing 12 of 30 certificates" under a *Finalised*
           * preset, where 12 is a browser-side narrowing of the 50 rows the server
           * sent and 30 is the server's own count for the same filter. Two filters
           * presented as one, and a reader comparing the two figures against the
           * "Finalised" count in the table above had no way to know that the gap was
           * the page limit rather than a broken filter. The Finalised branch now names
           * the mechanism and the page size; every other preset is a single server
           * filter and says the simple thing.
           */}
          <p className="text-muted-foreground text-xs">
            {filter === "final" ? (
              <>
                Showing {visibleDisposals.length} of the {total} certificates
                this queue returned, narrowed in your browser rather than on the
                server: there is no &ldquo;any of the six terminal
                outcomes&rdquo; filter, so the {DISPOSAL_LIST_LIMIT} rows below
                the page limit are filtered here. The{" "}
                <span className="font-medium">Finalised</span> count in the
                table above is the server&rsquo;s own figure across the whole
                set, so the two can differ by more than this page holds.
              </>
            ) : (
              <>
                Showing {visibleDisposals.length} of {total} certificates.
                Requests awaiting a signature are listed first, newest within
                each group.
              </>
            )}
          </p>
        </>
      ) : null}

      <DisposalRequestDialog
        open={isRequestOpen}
        onOpenChange={setIsRequestOpen}
      />
      <ApproveDisposalDialog
        disposal={approving}
        open={approving !== null}
        onOpenChange={(next) => {
          if (!next) {
            setApproving(null);
          }
        }}
      />
      <FinalizeDisposalDialog
        disposal={finalizing}
        open={finalizing !== null}
        onOpenChange={(next) => {
          if (!next) {
            setFinalizing(null);
          }
        }}
      />
      <CancelDisposalDialog
        disposal={cancelling}
        open={cancelling !== null}
        onOpenChange={(next) => {
          if (!next) {
            setCancelling(null);
          }
        }}
      />
    </div>
  );
};
