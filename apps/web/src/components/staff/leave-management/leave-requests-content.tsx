"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useListSearchWriter } from "@/components/ui-patterns/data-table/use-list-search-writer";
import { PageHeader } from "@/components/ui-patterns/page-header";
import { useActiveYear } from "@/lib/paths";
import { orpc } from "@/utils/orpc";

import type { LeaveAction, LeaveRequest } from "./leave-request";
import { LeaveRequestsDataTable } from "./leave-requests-data-table";
import {
  toLeaveLedgerInput,
  toLeaveRequestsSearchParams,
  validateLeaveRequestsSearch,
} from "./leave-requests-search";
import type { LeaveRequestsSearch } from "./leave-requests-search";
import { LeaveReviewDialog } from "./leave-review-dialog";

/**
 * The leadership leave queue: the ledger as one table, and the decision behind
 * each row's button.
 *
 * ## Why this is a table and not a column of cards
 *
 * It was a stack of cards, each one a `<Card>` carrying the teacher, the type,
 * the dates, the reason, the Deputy's note, the reviewer's note and its own
 * inline textarea with up to four buttons — forty of those is a screenful of
 * paragraph that cannot be scanned, sorted, searched or filtered, and the
 * textarea meant every row on the page was a live form. The row now carries the
 * five things a reviewer scans for and the rest moved into
 * `LeaveReviewDialog`, opened from the row's button.
 *
 * ## What the URL owns
 *
 * Search, queue, status and sort are the route's validated query string, handed
 * down rather than read here: the route owns the contract
 * (`leave-requests-search.ts`) and this component must not import the route file,
 * because the route imports this one. Every write goes back out through
 * `useListSearchWriter`, which navigates — one copy of the queue's view state,
 * in the URL, and no second one here.
 *
 * ## The queue is derived, not stored
 *
 * "Which queue should I open on?" is a question about the reviewer's role, so it
 * is answered by `resolveLeaveQueue` from the authority query rather than kept
 * in `useState`: it corrects itself the moment authority resolves, and an
 * explicit pick in the URL always wins.
 */
export const LeaveRequestsContent = ({
  search,
}: {
  search: LeaveRequestsSearch;
}) => {
  const queryClient = useQueryClient();
  const activeYear = useActiveYear();
  const year = Number(activeYear);
  const hasYear = Boolean(activeYear) && !Number.isNaN(year);
  const [reviewing, setReviewing] = useState<LeaveRequest | null>(null);

  const write = useListSearchWriter(
    validateLeaveRequestsSearch,
    toLeaveRequestsSearchParams
  );

  // Who is reviewing? The row shows only the button this member can use:
  // Deputy Principal -> recommend controls, Principal -> finalise controls.
  const authorityQuery = useQuery(
    orpc.staff.leaves.getMyAuthority.queryOptions({
      input: { year },
      enabled: hasYear,
    })
  );
  const isDeputy = authorityQuery.data?.isDeputy ?? false;
  const isPrincipal = authorityQuery.data?.isPrincipal ?? false;
  /**
   * One object, memoised, because `LeaveRequestsDataTable` rebuilds its columns
   * from it — a fresh `{ isDeputy, isPrincipal }` on every render would rebuild
   * them on every render too.
   */
  const authority = useMemo(
    () => ({ isDeputy, isPrincipal }),
    [isDeputy, isPrincipal]
  );

  const ledgerInput = useMemo(() => toLeaveLedgerInput(year), [year]);

  const requestsQuery = useQuery(
    orpc.staff.leaves.listLeaveRequests.queryOptions({
      input: ledgerInput,
      enabled: hasYear,
    })
  );

  const invalidateLedger = async () => {
    await queryClient.invalidateQueries({
      queryKey: orpc.staff.leaves.listLeaveRequests.queryOptions({
        input: ledgerInput,
      }).queryKey,
    });
  };

  // Two-step chain actions (see LEAVE_SYSTEM_DESIGN.md §2):
  // recommendLeave = Deputy Principal, finalizeLeave = Principal (final).
  const recommendMutation = useMutation(
    orpc.staff.leaves.recommendLeave.mutationOptions({
      onSuccess: async () => {
        toast.success("Recommendation recorded — waiting for the Principal");
        setReviewing(null);
        await invalidateLedger();
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );

  const finalizeMutation = useMutation(
    orpc.staff.leaves.finalizeLeave.mutationOptions({
      onSuccess: async () => {
        toast.success("Decision finalised");
        setReviewing(null);
        await invalidateLedger();
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );

  /**
   * Send one decision to the procedure that can take it.
   *
   * The choice is already made — `LeaveAction.kind` says whether the reviewer
   * is recommending or finalising — so this forwards rather than re-deciding.
   * That separation is the whole point: the old version inferred the procedure
   * from the decision itself and sent a Principal's "Reject (Final)" to
   * `recommendLeave`, which answered "Only the Deputy Principal can recommend
   * leave requests".
   *
   * An override arrives as `overrideReason` and never as `comment`, because
   * `finalizeLeave` reads only `overrideReason` when it is checking that a
   * bypass was justified; `comment` is nulled rather than omitted so the two
   * fields cannot both end up on the same row.
   */
  const act = (action: LeaveAction) => {
    if (reviewing === null) {
      return;
    }

    if (action.kind === "recommend") {
      recommendMutation.mutate({
        comment: action.comment,
        decision: action.decision,
        id: reviewing.id,
        year,
      });
      return;
    }

    finalizeMutation.mutate({
      comment: action.comment ?? null,
      decision: action.decision,
      id: reviewing.id,
      overrideReason: action.overrideReason,
      year,
    });
  };

  const isDeciding = recommendMutation.isPending || finalizeMutation.isPending;

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHeader
        eyebrow="Staff management"
        title="Leave requests"
        description={
          <>
            Review leave applications submitted by teachers — the Deputy
            Principal recommends, the Principal gives the final decision.
            Approving a request does not auto-mark attendance — mark the day on
            the Attendance page.
          </>
        }
      />

      <LeaveRequestsDataTable
        authority={authority}
        isDeciding={isDeciding}
        isError={requestsQuery.isError}
        isFetching={requestsQuery.isFetching}
        isLoading={requestsQuery.isPending}
        onRetry={() => {
          void requestsQuery.refetch();
        }}
        onReview={setReviewing}
        onSearchChange={(patch) => {
          write(patch);
        }}
        requests={requestsQuery.data?.requests}
        search={search}
      />

      <LeaveReviewDialog
        isDeputy={isDeputy}
        isPending={isDeciding}
        isPrincipal={isPrincipal}
        onDecide={act}
        onOpenChange={(open) => {
          if (!open) {
            setReviewing(null);
          }
        }}
        request={reviewing}
      />
    </div>
  );
};
