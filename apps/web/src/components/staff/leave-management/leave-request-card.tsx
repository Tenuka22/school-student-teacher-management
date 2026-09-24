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

export interface LeaveRequestItem {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: string;
  deputyStatus: string | null;
  deputyComment: string | null;
  reviewComment: string | null;
}

export type ReviewDecision = "recommended" | "rejected" | "approved";

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

const CLOSED_STATUSES = new Set(["approved", "rejected", "cancelled"]);

const formatDateRange = (start: string, end: string) =>
  start === end ? start : `${start} → ${end}`;

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
  onDecide: (decision: ReviewDecision) => void;
}

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
  const isClosed = CLOSED_STATUSES.has(request.status);
  const canAct = !isClosed && (isDeputy || isPrincipal);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{staffName}</span>
            {staffBadge && <Badge variant="outline">{staffBadge}</Badge>}
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

          {request.deputyStatus && request.deputyStatus !== "pending" && (
            <p className="text-muted-foreground mt-1 text-xs">
              Deputy Principal:{" "}
              {request.deputyStatus === "recommended"
                ? "recommended"
                : "not recommended"}
              {request.deputyComment ? ` — ${request.deputyComment}` : ""}
            </p>
          )}

          {request.reviewComment && (
            <p className="text-muted-foreground mt-1 text-xs italic">
              Review note: {request.reviewComment}
            </p>
          )}

          {isReviewing && (
            <Field className="mt-3 max-w-md">
              <FieldLabel htmlFor={`comment-${request.id}`}>
                Review note (optional)
              </FieldLabel>
              <textarea
                id={`comment-${request.id}`}
                value={comment}
                onChange={(e) => onCommentChange(e.target.value)}
                className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
                rows={2}
                placeholder="e.g. Approved — arrange cover for 6-B"
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
                {/* The Principal step is reachable from "pending" too — an
                    implicit override of the Deputy recommendation. */}
                {isPrincipal && (
                  <>
                    <Button
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => onDecide("approved")}
                    >
                      <IconCheck className="mr-1 size-4" />
                      Approve (Final)
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isSubmitting}
                      onClick={() => onDecide("rejected")}
                    >
                      <IconX className="mr-1 size-4" />
                      Reject (Final)
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={onCancelReview}>
                  Cancel
                </Button>
              </div>
            </Field>
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
