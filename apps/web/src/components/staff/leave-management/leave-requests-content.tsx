"use client";

import type { LeaveStatus } from "@school-student-teacher-management/db/schema/leaves";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
} from "@school-student-teacher-management/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import {
  IconCheck,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconX,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "Annual",
  casual: "Casual",
  medical: "Medical",
  maternity: "Maternity",
  duty: "Official Duty",
  other: "Other",
};

const STATUS_BADGES: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  pending: { label: "Pending", variant: "secondary" },
  recommended: { label: "Recommended (DP)", variant: "outline" },
  approved: { label: "Approved (Final)", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

const formatDateRange = (start: string, end: string) =>
  start === end ? start : `${start} → ${end}`;

type StatusFilter = LeaveStatus | "all";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "recommended", label: "Recommended" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

export const LeaveRequestsContent = () => {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const requestsQuery = useQuery(
    orpc.staff.leaves.listLeaveRequests.queryOptions({
      input:
        statusFilter === "all" ? {} : { status: statusFilter as LeaveStatus },
    })
  );

  // Who is reviewing? The UI shows only the buttons this member can use:
  // Deputy Principal -> recommend controls, Principal -> finalise controls.
  const authorityQuery = useQuery(
    orpc.staff.leaves.getMyAuthority.queryOptions()
  );
  const isDeputy = authorityQuery.data?.isDeputy ?? false;
  const isPrincipal = authorityQuery.data?.isPrincipal ?? false;

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

  const act = (
    mutation: typeof recommendMutation | typeof finalizeMutation,
    id: string,
    decision: "recommended" | "rejected" | "approved"
  ) => {
    mutation.mutate({
      id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      decision,
      comment: comment.trim() || undefined,
    } as never);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-4xl font-semibold">Leave Requests</h1>
        <p className="text-muted-foreground mt-2">
          Review leave applications submitted by teachers — the Deputy
          Principal recommends, the Principal gives the final decision.
          Approving a request does not auto-mark attendance — mark the day on
          the Attendance page.
        </p>
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
            {statusFilter === "all"
              ? "Teachers have not applied for any leave yet. Requests appear here as soon as they are submitted from the teacher portal."
              : "Nothing matches this filter."}
          </EmptyDescription>
        </Empty>
      )}

      {!requestsQuery.isLoading && requests.length > 0 && (
        <div className="space-y-3">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{request.staffName}</span>
                    {request.staffBadge && (
                      <Badge variant="outline">{request.staffBadge}</Badge>
                    )}
                    <Badge variant="secondary">
                      {LEAVE_TYPE_LABELS[request.type] ?? request.type}
                    </Badge>
                    <Badge variant={STATUS_BADGES[request.status].variant}>
                      {STATUS_BADGES[request.status].label}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-2 text-sm">
                    <IconClock className="mr-1 inline size-3.5" />
                    {formatDateRange(request.startDate, request.endDate)}
                    {request.reason ? ` — ${request.reason}` : ""}
                  </p>
                  {request.deputyStatus &&
                    request.deputyStatus !== "pending" && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        Deputy Principal:{" "}
                        {request.deputyStatus === "recommended"
                          ? "recommended"
                          : "not recommended"}
                        {request.deputyComment
                          ? ` — ${request.deputyComment}`
                          : ""}
                      </p>
                    )}
                  {request.reviewComment && (
                    <p className="text-muted-foreground mt-1 text-xs italic">
                      Review note: {request.reviewComment}
                    </p>
                  )}

                  {reviewingId === request.id && (
                    <Field className="mt-3 max-w-md">
                      <FieldLabel htmlFor={`comment-${request.id}`}>
                        Review note (optional)
                      </FieldLabel>
                      <textarea
                        id={`comment-${request.id}`}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
                        rows={2}
                        placeholder="e.g. Approved — arrange cover for 6-B"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        {isDeputy && request.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              disabled={recommendMutation.isPending}
                              onClick={() =>
                                act(
                                  recommendMutation,
                                  request.id,
                                  "recommended"
                                )
                              }
                            >
                              <IconCircleCheck className="mr-1 size-4" />
                              Recommend
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={recommendMutation.isPending}
                              onClick={() =>
                                act(recommendMutation, request.id, "rejected")
                              }
                            >
                              <IconX className="mr-1 size-4" />
                              Not recommended
                            </Button>
                          </>
                        )}
                        {/* Principal step — reachable from "pending" too
                            (implicit override of the DP recommendation). */}
                        {isPrincipal && (
                          <>
                            <Button
                              size="sm"
                              disabled={finalizeMutation.isPending}
                              onClick={() =>
                                act(finalizeMutation, request.id, "approved")
                              }
                            >
                              <IconCheck className="mr-1 size-4" />
                              Approve (Final)
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={finalizeMutation.isPending}
                              onClick={() =>
                                act(finalizeMutation, request.id, "rejected")
                              }
                            >
                              <IconX className="mr-1 size-4" />
                              Reject (Final)
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setReviewingId(null);
                            setComment("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </Field>
                  )}
                </div>

                {request.status !== "approved" &&
                  request.status !== "rejected" &&
                  request.status !== "cancelled" &&
                  reviewingId !== request.id &&
                  (isDeputy || isPrincipal) && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setReviewingId(request.id);
                          setComment("");
                        }}
                      >
                        <IconCircleCheck className="mr-1 size-4" />
                        {isPrincipal ? "Finalise" : "Review"}
                      </Button>
                    </div>
                  )}
              </CardContent>
            </Card>
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
