import {
  leavePaymentLabel,
  leaveTypeLabel,
} from "@school-student-teacher-management/db/constants/leave-labels";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
} from "@school-student-teacher-management/ui/components/card";
import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import {
  IconCheck,
  IconCircleCheck,
  IconClock,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";

import { leaveStatusBadge } from "@/components/staff/leave-management/leave-status";

export interface LeaveRequestItem {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  dayPart: "full" | "morning" | "afternoon";
  paymentStatus: "notApplicable" | "paid" | "halfPay" | "unpaid";
  reason: string | null;
  status: string;
  deputyStatus: string | null;
  deputyComment: string | null;
  finalStatus: "pending" | "approved" | "rejected";
  finalizedAt: string | null;
  principalComment: string | null;
  reviewComment: string | null;
}

export type ReviewDecision = "recommended" | "rejected" | "approved";

const formatDateRange = (start: string, end: string) =>
  start === end ? start : `${start} â†’ ${end}`;

const formatDayPart = (dayPart: LeaveRequestItem["dayPart"]) => {
  if (dayPart === "morning") {
    return " Â· First half (Primary)";
  }
  if (dayPart === "afternoon") {
    return " Â· Second half (Secondary)";
  }
  return "";
};

const MaternityPaymentBadge = ({ request }: { request: LeaveRequestItem }) => {
  if (
    request.type !== "maternity" ||
    request.paymentStatus === "notApplicable"
  ) {
    return null;
  }
  return (
    <Badge variant="outline">{leavePaymentLabel(request.paymentStatus)}</Badge>
  );
};

const DeputyDecisionNote = ({ request }: { request: LeaveRequestItem }) => {
  if (!request.deputyStatus || request.deputyStatus === "pending") {
    return null;
  }
  return (
    <p className="text-muted-foreground mt-1 text-xs">
      Deputy Principal:{" "}
      {request.deputyStatus === "recommended"
        ? "recommended"
        : "not recommended"}
      {request.deputyComment ? ` â€” ${request.deputyComment}` : ""}
    </p>
  );
};

interface LeaveRequestCardProps {
  request: LeaveRequestItem;
  staffName: string;
  staffBadge: string | null;
  isDeputy: boolean;
  isPrincipal: boolean;
  isReviewing: boolean;
  comment: string;
  isSubmitting: boolean;
  onCommentChange: (value: string) => void;
  onStartReview: () => void;
  onCancelReview: () => void;
  onDecide: (decision: ReviewDecision, overrideReason?: string) => void;
}

interface ReviewControlsProps {
  request: LeaveRequestItem;
  isDeputy: boolean;
  isPrincipal: boolean;
  isSubmitting: boolean;
  comment: string;
  onCommentChange: (value: string) => void;
  onCancel: () => void;
  onDecide: (decision: ReviewDecision, overrideReason?: string) => void;
}

const ReviewControls = ({
  request,
  isDeputy,
  isPrincipal,
  isSubmitting,
  comment,
  onCommentChange,
  onCancel,
  onDecide,
}: ReviewControlsProps) => {
  const [overrideDecision, setOverrideDecision] =
    useState<ReviewDecision | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const requiresOverride =
    isPrincipal &&
    (request.status !== "recommended" ||
      request.deputyStatus !== "recommended");

  const decide = (decision: ReviewDecision) => {
    if (requiresOverride) {
      setOverrideDecision(decision);
      setOverrideOpen(true);
      return;
    }
    onDecide(decision);
  };

  return (
    <>
      <Field className="mt-3 max-w-md">
        <FieldLabel htmlFor={`comment-${request.id}`}>
          Review note (optional)
        </FieldLabel>
        <textarea
          id={`comment-${request.id}`}
          value={comment}
          onChange={(event) => onCommentChange(event.target.value)}
          className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
          rows={2}
          placeholder="e.g. Approved â€” arrange cover for 6-B"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {isDeputy && request.status === "pending" && (
            <>
              <Button
                size="sm"
                disabled={isSubmitting}
                onClick={() => onDecide("recommended")}
              >
                <IconCircleCheck className="mr-1 size-4" />
                Recommend
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={isSubmitting}
                onClick={() => onDecide("rejected")}
              >
                <IconX className="mr-1 size-4" />
                Not recommended
              </Button>
            </>
          )}
          {isPrincipal && (
            <>
              <Button
                size="sm"
                disabled={isSubmitting}
                onClick={() => decide("approved")}
              >
                <IconCheck className="mr-1 size-4" />
                Approve (Final)
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={isSubmitting}
                onClick={() => decide("rejected")}
              >
                <IconX className="mr-1 size-4" />
                Reject (Final)
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Field>
      <AlertDialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Confirm Principal override</AlertDialogTitle>
          <AlertDialogDescription>
            This request has not completed the Deputy review step. The Principal
            will {overrideDecision === "approved" ? "approve" : "reject"} it and
            the decision will be final. Continue?
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (overrideDecision) {
                  onDecide(
                    overrideDecision,
                    comment.trim() || "Principal override"
                  );
                }
                setOverrideOpen(false);
              }}
            >
              Confirm
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

/**
 * One leave request with the actions the signed-in member is actually
 * allowed to take: recommend (Deputy) and finalise (Principal). Split out
 * of the queue so the list component stays readable.
 */
export const LeaveRequestCard = ({
  request,
  staffName,
  staffBadge,
  isDeputy,
  isPrincipal,
  isReviewing,
  comment,
  isSubmitting,
  onCommentChange,
  onStartReview,
  onCancelReview,
  onDecide,
}: LeaveRequestCardProps) => {
  const isClosed =
    request.status === "approved" ||
    request.status === "cancelled" ||
    (request.status === "rejected" && (!!request.finalizedAt || !isPrincipal));
  const canAct = !isClosed && (isDeputy || isPrincipal);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{staffName}</span>
            {staffBadge && <Badge variant="outline">{staffBadge}</Badge>}
            <Badge variant="secondary">{leaveTypeLabel(request.type)}</Badge>
            <MaternityPaymentBadge request={request} />
            <Badge variant={leaveStatusBadge(request.status).variant}>
              {leaveStatusBadge(request.status).label}
            </Badge>
          </div>

          <p className="text-muted-foreground mt-2 text-sm">
            <IconClock className="mr-1 inline size-3.5" />
            {formatDateRange(request.startDate, request.endDate)}
            {formatDayPart(request.dayPart)}
            {request.reason ? ` â€” ${request.reason}` : ""}
          </p>

          <DeputyDecisionNote request={request} />

          {request.reviewComment && (
            <p className="text-muted-foreground mt-1 text-xs italic">
              Review note: {request.reviewComment}
            </p>
          )}

          {isReviewing && (
            <ReviewControls
              request={request}
              isDeputy={isDeputy}
              isPrincipal={isPrincipal}
              isSubmitting={isSubmitting}
              comment={comment}
              onCommentChange={onCommentChange}
              onCancel={onCancelReview}
              onDecide={onDecide}
            />
          )}
        </div>

        {canAct && !isReviewing && (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={onStartReview}>
              <IconCircleCheck className="mr-1 size-4" />
              {isPrincipal ? "Finalise" : "Review"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
