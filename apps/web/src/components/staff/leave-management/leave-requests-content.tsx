"use client";

import type { LeaveQueue } from "@school-student-teacher-management/api/routers/staff/leaves/list-leave-requests";
import type { LeaveStatus } from "@school-student-teacher-management/db/schema/leaves";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import {
  FieldSet,
  FieldLegend,
} from "@school-student-teacher-management/ui/components/field";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { IconFilterOff, IconInbox, IconInfoCircle } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useReducer, useState } from "react";
import { toast } from "sonner";

import { QueryErrorPanel } from "@/components/query-error-panel";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

import { LeaveRequestCard } from "./leave-request-card";
import type {
  LeaveRequestItem,
  PendingReview,
  ReviewDecision,
} from "./leave-request-card";

type StatusFilter = LeaveStatus | "all";

type AuthorityState = "loading" | "ready" | "failed";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "recommended", label: "Recommended" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

const LEDGER_EMPTY_DESCRIPTION =
  "No teacher has applied for leave in this academic year. Requests appear here as soon as one is submitted from the teacher portal, where the quota is checked.";

/**
 * Review-chain queues. "All" is the full ledger; the other two are the slices a
 * Deputy and a Principal are actually acting on. Each carries the sentence that
 * teaches what an empty one means, because "nothing here" and "nothing anywhere"
 * are different facts about the College.
 */
const QUEUE_FILTERS: { value: LeaveQueue; label: string; empty: string }[] = [
  {
    value: "all",
    label: "Full ledger",
    empty: LEDGER_EMPTY_DESCRIPTION,
  },
  {
    value: "deputy",
    label: "Awaiting DP",
    empty:
      "No untouched request is waiting on the Deputy Principal. Everything here has already been recommended or declined.",
  },
  {
    value: "principal",
    label: "Awaiting Principal",
    empty:
      "Nothing is waiting on the Principal. No request has been recommended, or declined by the Deputy, without a final decision.",
  },
];

/**
 * The queue that matches what this member is responsible for: a Deputy reviews
 * untouched requests, a Principal finalises recommended ones, and anyone else
 * sees the whole ledger. Reachable only once the authority query resolves, so
 * the first paint stays on the full ledger.
 */
const defaultQueue = (isDeputy: boolean, isPrincipal: boolean): LeaveQueue => {
  if (isPrincipal) {
    return "principal";
  }
  if (isDeputy) {
    return "deputy";
  }
  return "all";
};

/**
 * The chain states, counted the way the chain actually works.
 *
 * `finalizedAt` is the marker the server itself uses to close a request, so a
 * rejection counts as final only once the Principal has decided it — a request
 * the Deputy declined is still sitting in the Principal's queue, and counting it
 * as rejected would tell a reviewer their work is done when it is not.
 */
interface ChainFacts {
  status: string;
  finalStatus: "pending" | "approved" | "rejected";
  finalizedAt: string | null;
}

const QUEUE_STATS: {
  key: string;
  label: string;
  test: (request: ChainFacts) => boolean;
}[] = [
  {
    key: "deputy",
    label: "Awaiting Deputy",
    test: (request) => request.status === "pending" && !request.finalizedAt,
  },
  {
    key: "principal",
    label: "Awaiting Principal",
    test: (request) =>
      (request.status === "recommended" || request.status === "rejected") &&
      !request.finalizedAt,
  },
  {
    key: "approved",
    label: "Approved",
    test: (request) =>
      request.finalStatus === "approved" && Boolean(request.finalizedAt),
  },
  {
    key: "rejected",
    label: "Rejected",
    test: (request) =>
      request.finalStatus === "rejected" && Boolean(request.finalizedAt),
  },
  {
    key: "cancelled",
    label: "Cancelled",
    test: (request) => request.status === "cancelled",
  },
];

const LIST_ERROR_FALLBACK = "The server did not return the leave queue.";
const DECISION_ERROR_FALLBACK =
  "The decision was not recorded. Nothing has changed on this request.";

const OUTCOME: Record<ReviewDecision, string> = {
  recommended:
    "Recommendation recorded — the request is now with the Principal.",
  approved: "Request approved — the affected periods are recorded as absence.",
  rejected: "Request rejected, with the reason recorded against it.",
};

const QUEUE_EMPTY_TITLE = (queue: LeaveQueue) => {
  if (queue === "all") {
    return "No leave requests yet";
  }
  if (queue === "deputy") {
    return "Nothing is waiting on the Deputy Principal";
  }
  return "Nothing is waiting on the Principal";
};

const resolveAuthorityState = (query: {
  isPending: boolean;
  isError: boolean;
}): AuthorityState => {
  if (query.isPending) {
    return "loading";
  }
  if (query.isError) {
    return "failed";
  }
  return "ready";
};

const describeResult = ({
  isFirstLoad,
  isListFailed,
  shown,
  total,
  queueLabel,
  isFiltered,
}: {
  isFirstLoad: boolean;
  isListFailed: boolean;
  shown: number;
  total: number;
  queueLabel: string;
  isFiltered: boolean;
}) => {
  if (isFirstLoad) {
    return "Loading the leave queue.";
  }
  if (isListFailed) {
    return "The queue could not be read, so no count is shown.";
  }
  return `Showing ${shown} of ${total} requests · ${queueLabel}${isFiltered ? " · filtered" : ""}.`;
};

interface QueueSummaryProps {
  isFirstLoad: boolean;
  isListFailed: boolean;
  requests: ChainFacts[];
}

/**
 * A real labelled stat row, not a hero number.
 *
 * It is withheld rather than zeroed when the read fails: "0 approved" taken off
 * a request that 500s is the same confident falsehood as an empty-state
 * sentence written from an empty array.
 */
const QueueSummary = ({
  isFirstLoad,
  isListFailed,
  requests,
}: QueueSummaryProps) => (
  <section aria-label="Queue summary" className="border px-4 py-3">
    {isFirstLoad ? (
      <div
        aria-hidden="true"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        {QUEUE_STATS.map((stat) => (
          <div className="space-y-1.5" key={stat.key}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-10" />
          </div>
        ))}
      </div>
    ) : null}
    {isListFailed ? (
      <p className="text-muted-foreground text-xs">
        The queue summary is unavailable — the request for it failed.
      </p>
    ) : null}
    {!isFirstLoad && !isListFailed ? (
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {QUEUE_STATS.map((stat) => (
          <div key={stat.key}>
            <dt className="text-muted-foreground text-xs">{stat.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {requests.filter(stat.test).length}
            </dd>
          </div>
        ))}
      </dl>
    ) : null}
  </section>
);

interface QueueFiltersProps {
  queue: LeaveQueue;
  statusFilter: StatusFilter;
  counts: Map<StatusFilter, number>;
  onQueueChange: (queue: LeaveQueue) => void;
  onStatusChange: (status: StatusFilter) => void;
}

const FilterButton = ({
  label,
  isActive,
  count,
  onClick,
}: {
  label: string;
  isActive: boolean;
  count?: number;
  onClick: () => void;
}) => (
  <Button
    aria-pressed={isActive}
    onClick={onClick}
    size="sm"
    variant={isActive ? "default" : "outline"}
  >
    {label}
    {count ? (
      <Badge className="tabular-nums" variant="secondary">
        {count}
      </Badge>
    ) : null}
  </Button>
);

const QueueFilters = ({
  queue,
  statusFilter,
  counts,
  onQueueChange,
  onStatusChange,
}: QueueFiltersProps) => (
  <div className="flex flex-wrap items-center gap-4">
    <FieldSet className="flex-row flex-wrap gap-1.5">
      <FieldLegend className="sr-only" variant="label">
        Review chain queue
      </FieldLegend>
      {QUEUE_FILTERS.map((filter) => (
        <FilterButton
          isActive={queue === filter.value}
          key={filter.value}
          label={filter.label}
          onClick={() => {
            onQueueChange(filter.value);
          }}
        />
      ))}
    </FieldSet>

    <FieldSet className="flex-row flex-wrap gap-1.5">
      <FieldLegend className="sr-only" variant="label">
        Filter by status
      </FieldLegend>
      {STATUS_FILTERS.map((filter) => (
        <FilterButton
          count={counts.get(filter.value)}
          isActive={statusFilter === filter.value}
          key={filter.value}
          label={filter.label}
          onClick={() => {
            onStatusChange(filter.value);
          }}
        />
      ))}
    </FieldSet>
  </div>
);

interface QueueEmptyProps {
  queue: LeaveQueue;
  onClearFilters: () => void;
}

/**
 * "No leave requests yet" and "nothing is waiting on you" are different claims
 * about the College, so they are different states with different copy — and the
 * second offers the way back to the ledger.
 */
const QueueEmpty = ({ queue, onClearFilters }: QueueEmptyProps) => (
  <Empty className="min-h-[40vh] border-dashed">
    <EmptyHeader>
      <EmptyTitle>{QUEUE_EMPTY_TITLE(queue)}</EmptyTitle>
      <EmptyDescription>
        {queue === "all"
          ? LEDGER_EMPTY_DESCRIPTION
          : (QUEUE_FILTERS.find((filter) => filter.value === queue)?.empty ??
            LEDGER_EMPTY_DESCRIPTION)}
      </EmptyDescription>
    </EmptyHeader>
    {queue === "all" ? null : (
      <EmptyContent>
        <Button onClick={onClearFilters} size="sm" variant="outline">
          <IconInbox aria-hidden="true" />
          Show the full ledger
        </Button>
      </EmptyContent>
    )}
  </Empty>
);

interface FilteredEmptyProps {
  statusLabel: string;
  queueLabel: string;
  total: number;
  onClearFilters: () => void;
}

/** Filtered-to-nothing, which must offer the way out rather than dead-end. */
const FilteredEmpty = ({
  statusLabel,
  queueLabel,
  total,
  onClearFilters,
}: FilteredEmptyProps) => (
  <Empty className="min-h-[40vh] border-dashed">
    <EmptyHeader>
      <EmptyTitle>No {statusLabel.toLowerCase()} requests here</EmptyTitle>
      <EmptyDescription>
        {queueLabel} holds <span className="tabular-nums">{total}</span> request
        {total === 1 ? "" : "s"}, none of them {statusLabel.toLowerCase()}.
        Declined, approved and cancelled requests stay in the ledger — this
        filter only hides them.
      </EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button onClick={onClearFilters} size="sm" variant="outline">
        <IconFilterOff aria-hidden="true" />
        Clear the filters
      </Button>
    </EmptyContent>
  </Empty>
);

interface ReviewState {
  reviewingId: string | null;
  comment: string;
  pending: PendingReview | null;
  decisionError: { id: string; message: string } | null;
  announcement: string;
}

type ReviewAction =
  | { type: "start"; id: string }
  | { type: "close" }
  | { type: "note"; value: string }
  | { type: "decide"; id: string; decision: ReviewDecision }
  | { type: "failed"; id: string; message: string }
  | { type: "settled"; id: string; decision: ReviewDecision };

const INITIAL_REVIEW: ReviewState = {
  reviewingId: null,
  comment: "",
  pending: null,
  decisionError: null,
  announcement: "",
};

/**
 * The review state moves as one thing: a decision that is taken clears the note,
 * the panel and the spinner together, and a failure that leaves the note intact
 * is the one thing that must survive it. Split across five `useState` calls, one
 * missed update leaves a half-typed reason attached to the next card.
 */
const reviewReducer = (
  state: ReviewState,
  action: ReviewAction
): ReviewState => {
  switch (action.type) {
    case "start": {
      return {
        ...state,
        reviewingId: action.id,
        comment: "",
        decisionError: null,
      };
    }
    case "close": {
      return { ...state, reviewingId: null, comment: "" };
    }
    case "note": {
      return { ...state, comment: action.value };
    }
    case "decide": {
      return {
        ...state,
        pending: { id: action.id, decision: action.decision },
        decisionError: null,
      };
    }
    case "failed": {
      return {
        ...state,
        pending: null,
        decisionError: { id: action.id, message: action.message },
      };
    }
    case "settled": {
      return {
        reviewingId: null,
        comment: "",
        pending: null,
        announcement: OUTCOME[action.decision],
        decisionError:
          state.decisionError?.id === action.id ? null : state.decisionError,
      };
    }
    default: {
      return state;
    }
  }
};

interface LeaveReview {
  state: ReviewState;
  isSubmitting: boolean;
  handleStartReview: (id: string) => void;
  handleCloseReview: () => void;
  handleNoteChange: (value: string) => void;
  handleDecide: (
    id: string,
    decision: ReviewDecision,
    overrideReason?: string,
    isFinal?: boolean
  ) => void;
}

/** One row as the queue hands it over, plus the teacher's name for the card. */
type QueueRow = LeaveRequestItem &
  ChainFacts & {
    staffId: string;
    staffName: string;
    staffBadge: string | null;
  };

const buildStatusCounts = (requests: ChainFacts[]) => {
  const counts = new Map<StatusFilter, number>();
  for (const filter of STATUS_FILTERS) {
    counts.set(
      filter.value,
      filter.value === "all"
        ? requests.length
        : requests.filter((request) => request.status === filter.value).length
    );
  }
  return counts;
};

const PageHeading = () => (
  <div>
    <h1 className="font-heading text-4xl font-semibold">Leave Requests</h1>
    <p className="text-muted-foreground mt-2 max-w-prose text-sm">
      The Deputy Principal recommends; the Principal gives the final decision,
      and approval records the affected periods as absence and locks manual
      attendance changes for those days. Quota is enforced when the teacher
      applies — a request that would exceed the year&rsquo;s entitlement is
      refused there, and only approved leave consumes it. Each card therefore
      carries the days the request would charge, not a balance: an
      applicant&rsquo;s remaining balance is their own figure and is not
      readable from this queue.
    </p>
  </div>
);

/** Loading that holds the layout the cards will occupy, not a spinner. */
const QueueSkeleton = () => (
  <div
    aria-busy="true"
    aria-label="Loading the leave queue"
    className="space-y-2"
  >
    {Array.from({ length: 4 }).map((_, index) => (
      <div className="border px-4 py-4" key={`leave-skeleton-${index}`}>
        <Skeleton className="h-4 w-56" />
        <Skeleton className="mt-2 h-3 w-72" />
        <Skeleton className="mt-2 h-3 w-40" />
      </div>
    ))}
  </div>
);

/**
 * What this account may do here, said out loud.
 *
 * Silence used to mean two different things here: "your authority has not
 * loaded yet" and "your account cannot decide anything". A reviewer who lands
 * on a queue with no buttons and no explanation cannot tell whether the screen
 * is broken or the seat is not theirs, so each is stated.
 */
const AuthorityNotice = ({
  authorityError,
  authorityState,
  isDeputy,
  isPrincipal,
  onRetry,
}: {
  authorityError: unknown;
  authorityState: AuthorityState;
  isDeputy: boolean;
  isPrincipal: boolean;
  onRetry: () => void;
}) => {
  if (authorityState === "failed") {
    return (
      <QueryErrorPanel
        message={formatApiErrorMessage(
          authorityError,
          "Your review authority could not be read."
        )}
        note="Until it loads, no request on this page can be actioned."
        onRetry={onRetry}
        title="Your review role could not be read"
      />
    );
  }

  if (authorityState === "ready" && !isDeputy && !isPrincipal) {
    return (
      <p className="border-primary/25 text-muted-foreground border px-2.5 py-2 text-sm">
        This queue is read-only for your account: the decisions on it are the
        Deputy Principal&rsquo;s and the Principal&rsquo;s to make.
      </p>
    );
  }

  return null;
};

const RequestList = ({
  authorityState,
  isDeputy,
  isPrincipal,
  requests,
  review,
  reviewingId,
}: {
  authorityState: AuthorityState;
  isDeputy: boolean;
  isPrincipal: boolean;
  requests: QueueRow[];
  review: LeaveReview;
  reviewingId: string | null;
}) => (
  <>
    <ul className="space-y-2">
      {requests.map((request) => (
        <li key={request.id}>
          <LeaveRequestCard
            authorityState={authorityState}
            comment={review.state.comment}
            decisionError={
              review.state.decisionError?.id === request.id
                ? review.state.decisionError.message
                : null
            }
            isDeputy={isDeputy}
            isPrincipal={isPrincipal}
            isReviewing={reviewingId === request.id}
            isSubmitting={review.isSubmitting}
            onCancelReview={review.handleCloseReview}
            onCommentChange={review.handleNoteChange}
            onDecide={(decision, overrideReason, isFinal) => {
              review.handleDecide(
                request.id,
                decision,
                overrideReason,
                isFinal
              );
            }}
            onStartReview={() => {
              review.handleStartReview(request.id);
            }}
            pending={review.state.pending}
            request={request}
            staffBadge={request.staffBadge}
            staffName={request.staffName}
          />
        </li>
      ))}
    </ul>
    <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
      <IconInfoCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      Declined, approved and cancelled requests stay in the ledger. Use the
      status filters to narrow it, or the queue filters to see only what is
      waiting on a seat.
    </p>
  </>
);

/**
 * The queue itself, and only one of five things: still loading, failed, taught
 * empty, filtered-to-nothing, or the records. They are mutually exclusive by
 * construction rather than by a chain of conditions in the page, and each is
 * reached only from a request that has actually succeeded.
 */
const QueueBody = ({
  isListFailed,
  isSuccess,
  listErrorMessage,
  onClearFilters,
  onRetryList,
  queue,
  queueLabel,
  queueRequests,
  reviewer,
  statusLabel,
  visibleRequests,
}: {
  isListFailed: boolean;
  isSuccess: boolean;
  listErrorMessage: string;
  onClearFilters: () => void;
  onRetryList: () => void;
  queue: LeaveQueue;
  queueLabel: string;
  queueRequests: QueueRow[];
  reviewer: {
    authorityState: AuthorityState;
    isDeputy: boolean;
    isPrincipal: boolean;
    review: LeaveReview;
    reviewingId: string | null;
  };
  statusLabel: string;
  visibleRequests: QueueRow[];
}) => {
  if (isListFailed) {
    return (
      <QueryErrorPanel
        message={listErrorMessage}
        onRetry={onRetryList}
        title="The leave queue could not be loaded"
      />
    );
  }

  if (isSuccess && queueRequests.length === 0) {
    return <QueueEmpty onClearFilters={onClearFilters} queue={queue} />;
  }

  if (isSuccess && visibleRequests.length === 0) {
    return (
      <FilteredEmpty
        onClearFilters={onClearFilters}
        queueLabel={queueLabel}
        statusLabel={statusLabel}
        total={queueRequests.length}
      />
    );
  }

  if (visibleRequests.length === 0) {
    // Still loading, or the read is in flight after a refetch — the page's own
    // skeleton and the existing rows already cover both.
    return null;
  }

  return (
    <RequestList
      authorityState={reviewer.authorityState}
      isDeputy={reviewer.isDeputy}
      isPrincipal={reviewer.isPrincipal}
      requests={visibleRequests}
      review={reviewer.review}
      reviewingId={reviewer.reviewingId}
    />
  );
};

/**
 * Recording a decision, and nothing else about the page.
 *
 * `recommendLeave` and `finalizeLeave` are separate procedures because the seats
 * are separate, and which one a decision belongs to is decided by the seat
 * taking it — `isFinal` — not by the shape of the decision. Routing on the
 * decision string sent a Principal's "Reject (Final)" to the Deputy procedure,
 * which refused it, so the Principal could approve a request but never reject
 * one. The outcome is read back from the server's own response rather than from
 * what was clicked, so the message cannot describe a decision the server did not
 * make.
 */
const useLeaveReview = (year: number): LeaveReview => {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(reviewReducer, INITIAL_REVIEW);

  const invalidateLists = async () => {
    await queryClient.invalidateQueries({
      queryKey: orpc.staff.leaves.listLeaveRequests.queryOptions({
        input: { year },
      }).queryKey,
    });
  };

  const onFailure = (id: string, error: unknown) => {
    const message = formatApiErrorMessage(error, DECISION_ERROR_FALLBACK);
    dispatch({ type: "failed", id, message });
    toast.error(message, {
      description:
        "The request is unchanged, and the note you wrote is still on the card.",
    });
  };

  const recommendMutation = useMutation(
    orpc.staff.leaves.recommendLeave.mutationOptions({
      onSuccess: async (data, variables) => {
        dispatch({
          type: "settled",
          id: variables.id,
          decision: data.status === "recommended" ? "recommended" : "rejected",
        });
        toast.success(
          OUTCOME[data.status === "recommended" ? "recommended" : "rejected"]
        );
        await invalidateLists();
      },
      onError: (error, variables) => {
        onFailure(variables.id, error);
      },
    })
  );

  const finalizeMutation = useMutation(
    orpc.staff.leaves.finalizeLeave.mutationOptions({
      onSuccess: async (data, variables) => {
        dispatch({
          type: "settled",
          id: variables.id,
          decision: data.status === "approved" ? "approved" : "rejected",
        });
        toast.success(
          OUTCOME[data.status === "approved" ? "approved" : "rejected"]
        );
        await invalidateLists();
      },
      onError: (error, variables) => {
        onFailure(variables.id, error);
      },
    })
  );

  const decide = (
    id: string,
    decision: ReviewDecision,
    overrideReason?: string,
    isFinal?: boolean
  ) => {
    // React commits state between discrete clicks, so this covers the window
    // between the click and the mutation reporting itself pending — which is
    // where a double click would otherwise become two decisions.
    if (state.pending) {
      return;
    }

    dispatch({ type: "decide", id, decision });
    const note = state.comment.trim() || undefined;

    if (isFinal ?? decision === "approved") {
      finalizeMutation.mutate({
        id,
        year,
        decision: decision === "approved" ? "approved" : "rejected",
        comment: note,
        overrideReason,
      });
      return;
    }

    recommendMutation.mutate({
      id,
      year,
      decision: decision === "recommended" ? "recommended" : "rejected",
      comment: note,
    });
  };

  return {
    state,
    isSubmitting: recommendMutation.isPending || finalizeMutation.isPending,
    handleStartReview: (id) => {
      dispatch({ type: "start", id });
    },
    handleCloseReview: () => {
      dispatch({ type: "close" });
    },
    handleNoteChange: (value) => {
      dispatch({ type: "note", value });
    },
    handleDecide: decide,
  };
};

export const LeaveRequestsContent = ({ year }: { year: number }) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [queueOverride, setQueueOverride] = useState<LeaveQueue | null>(null);
  const review = useLeaveReview(year);

  // Who is reviewing? The UI shows only the buttons this member can use:
  // Deputy Principal -> recommend controls, Principal -> finalise controls.
  const authorityQuery = useQuery(
    orpc.staff.leaves.getMyAuthority.queryOptions({ input: { year } })
  );
  const isDeputy = authorityQuery.data?.isDeputy ?? false;
  const isPrincipal = authorityQuery.data?.isPrincipal ?? false;
  const authorityState = resolveAuthorityState(authorityQuery);

  // Default to the caller's own queue so the first useful render is the list
  // they must act on. Derived rather than stored, so it corrects itself the
  // moment authority resolves; an explicit pick wins.
  const queue = queueOverride ?? defaultQueue(isDeputy, isPrincipal);

  /**
   * One read of the selected queue, with every status in it.
   *
   * The status filter used to be sent to the server, which made the counts on
   * the filter buttons a lie: with "Approved" selected, the pending count fell
   * to zero because the only rows in hand were approved ones. Reading the whole
   * queue and narrowing it here keeps one request, keeps the counts true, and
   * leaves the queue preset — the slice that carries meaning — on the server,
   * where `finalizedAt` decides what belongs in it.
   */
  const requestsQuery = useQuery(
    orpc.staff.leaves.listLeaveRequests.queryOptions({
      input: { year, ...(queue === "all" ? {} : { queue }) },
    })
  );

  const queueRequests = requestsQuery.data?.requests ?? [];
  const visibleRequests =
    statusFilter === "all"
      ? queueRequests
      : queueRequests.filter((request) => request.status === statusFilter);

  const counts = buildStatusCounts(queueRequests);

  /**
   * What a failed queue read looks like, and what it must never look like.
   *
   * `queueRequests` is `[]` whether the ledger is empty or the request failed,
   * so a screen that only asks "is the list empty?" answers yes and prints a
   * sentence asserting a fact about the staff, which a failed request knows
   * nothing about. Every state below is written against `isPending`/`isError`/
   * `isSuccess` instead, so a taught empty state is only ever reached from a
   * request that actually succeeded.
   */
  const isListFailed = requestsQuery.isError;
  const isFirstLoad = requestsQuery.isPending;
  const listErrorMessage = formatApiErrorMessage(
    requestsQuery.error,
    LIST_ERROR_FALLBACK
  );

  // A row that has left the visible list cannot be reviewed: deriving the open
  // row from the list itself means a decided or filtered-away request closes
  // its own panel, with no effect adjusting state after the fact.
  const reviewingId =
    review.state.reviewingId &&
    visibleRequests.some((request) => request.id === review.state.reviewingId)
      ? review.state.reviewingId
      : null;

  const isFiltered =
    statusFilter !== "all" ||
    (queueOverride !== null &&
      queueOverride !== defaultQueue(isDeputy, isPrincipal));
  const queueLabel =
    QUEUE_FILTERS.find((filter) => filter.value === queue)?.label ?? "queue";
  const statusLabel =
    STATUS_FILTERS.find((filter) => filter.value === statusFilter)?.label ??
    "this status";

  const clearFilters = () => {
    setStatusFilter("all");
    setQueueOverride(null);
  };

  return (
    <div className="space-y-4">
      <PageHeading />

      <QueueFilters
        counts={counts}
        onQueueChange={(next) => {
          setQueueOverride(next);
          setStatusFilter("all");
        }}
        onStatusChange={setStatusFilter}
        queue={queue}
        statusFilter={statusFilter}
      />

      <QueueSummary
        isFirstLoad={isFirstLoad}
        isListFailed={isListFailed}
        requests={queueRequests}
      />

      <AuthorityNotice
        authorityError={authorityQuery.error}
        authorityState={authorityState}
        isDeputy={isDeputy}
        isPrincipal={isPrincipal}
        onRetry={() => {
          void authorityQuery.refetch();
        }}
      />

      <p aria-live="polite" className="text-muted-foreground text-xs">
        {describeResult({
          isFirstLoad,
          isListFailed,
          shown: visibleRequests.length,
          total: queueRequests.length,
          queueLabel,
          isFiltered,
        })}
      </p>

      {isFirstLoad && <QueueSkeleton />}

      <QueueBody
        isListFailed={isListFailed}
        isSuccess={requestsQuery.isSuccess}
        listErrorMessage={listErrorMessage}
        onClearFilters={clearFilters}
        onRetryList={() => {
          void requestsQuery.refetch();
        }}
        queue={queue}
        queueLabel={queueLabel}
        queueRequests={queueRequests}
        reviewer={{
          authorityState,
          isDeputy,
          isPrincipal,
          review,
          reviewingId,
        }}
        statusLabel={statusLabel}
        visibleRequests={visibleRequests}
      />

      <p aria-live="polite" className="sr-only">
        {review.state.announcement}
      </p>
    </div>
  );
};
