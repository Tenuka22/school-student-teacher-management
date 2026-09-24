"use client";

import type { LeaveQueue } from "@school-student-teacher-management/api/routers/staff/leaves/list-leave-requests";
import type { LeaveStatus } from "@school-student-teacher-management/db/schema/leaves";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { IconCircleX } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

import { LeaveRequestCard } from "./leave-request-card";
import type { ReviewDecision } from "./leave-request-card";

type StatusFilter = LeaveStatus | "all";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "recommended", label: "Recommended" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

/**
 * Review-chain queues. "All" is the full ledger; the other two are the
 * slices a Deputy and a Principal are actually acting on.
 */
const QUEUE_FILTERS: { value: LeaveQueue; label: string }[] = [
  { value: "all", label: "Full ledger" },
  { value: "deputy", label: "Awaiting DP" },
  { value: "principal", label: "Awaiting Principal" },
];

/**
 * The queue that matches what this member is responsible for: a Deputy
 * reviews untouched requests, a Principal finalises recommended ones, and
 * anyone else sees the whole ledger. Reachable only once the authority
 * query resolves, so the first paint stays on the full ledger.
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

export const LeaveRequestsContent = () => {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [queueOverride, setQueueOverride] = useState<LeaveQueue | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  // Who is reviewing? The UI shows only the buttons this member can use:
  // Deputy Principal -> recommend controls, Principal -> finalise controls.
  const authorityQuery = useQuery(
    orpc.staff.leaves.getMyAuthority.queryOptions()
  );
  const isDeputy = authorityQuery.data?.isDeputy ?? false;
  const isPrincipal = authorityQuery.data?.isPrincipal ?? false;

  // Default to the caller's own queue so the first useful render is the
  // list they must act on. Derived rather than stored, so it corrects
  // itself the moment authority resolves; an explicit pick wins.
  const queue = queueOverride ?? defaultQueue(isDeputy, isPrincipal);

  const requestsQuery = useQuery(
    orpc.staff.leaves.listLeaveRequests.queryOptions({
      input: {
        ...(statusFilter === "all" ? {} : { status: statusFilter }),
        ...(queue === "all" ? {} : { queue }),
      },
    })
  );

  const invalidateLists = async () => {
    await queryClient.invalidateQueries({
      queryKey: orpc.staff.leaves.listLeaveRequests.queryOptions({ input: {} })
        .queryKey,
    });
  };

  // Two-step chain actions (see LEAVE_SYSTEM_DESIGN.md §2):
  // recommendLeave = Deputy Principal, finalizeLeave = Principal (final).
  const recommendMutation = useMutation(
    orpc.staff.leaves.recommendLeave.mutationOptions({
      onSuccess: async () => {
        toast.success("Recommendation recorded — waiting for the Principal");
        setReviewingId(null);
        setComment("");
        await invalidateLists();
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
        setReviewingId(null);
        setComment("");
        await invalidateLists();
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );

  const requests = requestsQuery.data?.requests ?? [];
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const recommendedCount = requests.filter(
    (r) => r.status === "recommended"
  ).length;

  const act = (id: string, decision: ReviewDecision) => {
    const mutation =
      decision === "approved" ? finalizeMutation : recommendMutation;

    mutation.mutate({
      id,
      decision,
      comment: comment.trim() || undefined,
    } as never);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-4xl font-semibold">Leave Requests</h1>
        <p className="text-muted-foreground mt-2">
          Review leave applications submitted by teachers — the Deputy Principal
          recommends, the Principal gives the final decision. Approving a
          request does not auto-mark attendance — mark the day on the Attendance
          page.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {QUEUE_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            variant={queue === filter.value ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setQueueOverride(filter.value);
              setStatusFilter("all");
            }}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            variant={statusFilter === filter.value ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(filter.value)}
          >
            {filter.label}
            {filter.value === "pending" && pendingCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pendingCount}
              </Badge>
            )}
            {filter.value === "recommended" && recommendedCount > 0 && (
              <Badge variant="outline" className="ml-2">
                {recommendedCount}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      {requestsQuery.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`skeleton-${i}`} className="h-28 w-full" />
          ))}
        </div>
      )}

      {!requestsQuery.isLoading && requests.length === 0 && (
        <Empty className="min-h-[40vh] border-dashed">
          <EmptyTitle>No leave requests</EmptyTitle>
          <EmptyDescription>
            {queue !== "all" || statusFilter !== "all"
              ? "Nothing matches this queue and filter."
              : "Teachers have not applied for any leave yet. Requests appear here as soon as they are submitted from the teacher portal."}
          </EmptyDescription>
        </Empty>
      )}

      {!requestsQuery.isLoading && requests.length > 0 && (
        <div className="space-y-3">
          {requests.map((request) => (
            <LeaveRequestCard
              key={request.id}
              request={request}
              staffName={request.staffName}
              staffBadge={request.staffBadge}
              isDeputy={isDeputy}
              isPrincipal={isPrincipal}
              isReviewing={reviewingId === request.id}
              comment={comment}
              isSubmitting={
                recommendMutation.isPending || finalizeMutation.isPending
              }
              onCommentChange={setComment}
              onStartReview={() => {
                setReviewingId(request.id);
                setComment("");
              }}
              onCancelReview={() => {
                setReviewingId(null);
                setComment("");
              }}
              onDecide={(decision) => act(request.id, decision)}
            />
          ))}
        </div>
      )}

      {requests.some((r) => r.status === "rejected") && (
        <p className="text-muted-foreground text-xs">
          <IconCircleX className="mr-1 inline size-3.5" />
          Rejected requests stay in the history — filter to Pending to hide
          them.
        </p>
      )}
    </div>
  );
};
