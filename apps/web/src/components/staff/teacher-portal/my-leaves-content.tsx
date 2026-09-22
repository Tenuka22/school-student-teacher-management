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
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ApplyLeaveForm } from "@/components/staff/teacher-portal/apply-leave-form";
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
  LeaveStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  pending: { label: "Pending", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

const formatDateRange = (start: string, end: string) =>
  start === end ? start : `${start} → ${end}`;

export const MyLeavesContent = () => {
  const queryClient = useQueryClient();
  const [isApplyOpen, setIsApplyOpen] = useState(false);

  const myLeavesQuery = useQuery(
    orpc.staff.leaves.listMyLeaves.queryOptions({ input: {} })
  );

  const cancelMutation = useMutation(
    orpc.staff.leaves.cancelLeave.mutationOptions({
      onSuccess: async () => {
        toast.success("Leave request cancelled");
        await queryClient.invalidateQueries({
          queryKey: orpc.staff.leaves.listMyLeaves.queryOptions({ input: {} })
            .queryKey,
        });
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );

  const requests = myLeavesQuery.data?.requests ?? [];
  const pendingRequests = requests.filter((r) => r.status === "pending");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="font-heading text-4xl font-semibold">My Leave</h1>
          <p className="text-muted-foreground mt-2">
            Apply for leave and track the administration&apos;s decision.
          </p>
        </div>
        <Button onClick={() => setIsApplyOpen(true)}>
          <IconPlus className="mr-2 size-4" />
          Apply for Leave
        </Button>
      </div>

      {myLeavesQuery.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`skeleton-${i}`} className="h-24 w-full" />
          ))}
        </div>
      )}

      {!myLeavesQuery.isLoading && requests.length === 0 && (
        <Empty className="min-h-[40vh] border-dashed">
          <EmptyTitle>No leave requests yet</EmptyTitle>
          <EmptyDescription>
            When you apply for leave, your request and the administration&apos;s
            decision will appear here.
          </EmptyDescription>
          <EmptyContent>
            <Button onClick={() => setIsApplyOpen(true)} className="mt-4">
              <IconPlus className="mr-2 size-4" />
              Apply for Leave
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {!myLeavesQuery.isLoading && requests.length > 0 && (
        <div className="space-y-3">
          {pendingRequests.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {pendingRequests.length} pending request
              {pendingRequests.length === 1 ? "" : "s"} awaiting review
            </p>
          )}
          {requests.map((request) => (
            <Card key={request.id}>
              <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {LEAVE_TYPE_LABELS[request.type] ?? request.type}
                    </Badge>
                    <Badge variant={STATUS_BADGES[request.status].variant}>
                      {STATUS_BADGES[request.status].label}
                    </Badge>
                    <span className="text-sm font-medium">
                      {formatDateRange(request.startDate, request.endDate)}
                    </span>
                  </div>
                  {request.reason && (
                    <p className="text-muted-foreground mt-1.5 text-sm">
                      {request.reason}
                    </p>
                  )}
                  {request.reviewComment && (
                    <p className="text-muted-foreground mt-1 text-xs italic">
                      Admin note: {request.reviewComment}
                    </p>
                  )}
                </div>
                {request.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate({ id: request.id })}
                  >
                    Cancel Request
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ApplyLeaveForm
        open={isApplyOpen}
        onOpenChange={setIsApplyOpen}
        onApplied={() => {
          // history refetches via invalidateQueries in the form
        }}
      />
    </div>
  );
};
