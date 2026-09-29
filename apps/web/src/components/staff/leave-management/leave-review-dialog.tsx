import { humanizeKey } from "@school-student-teacher-management/db/constants/display";
import { LEAVE_PAYMENT_LABELS } from "@school-student-teacher-management/db/constants/leave";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import { useState } from "react";

import type { LeaveAction, LeaveRequest } from "./leave-request";
import { canReviewLeave, isDeputyBypassed } from "./leave-request";
import {
  describeLeaveDays,
  formatDateRange,
  formatDateTime,
  getRequestedAge,
  leaveTypeLabel,
} from "./leave-request-format";
import { leaveStatusBadge } from "./leave-status";

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="border-border flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b py-2 last:border-b-0">
    <dt className="text-muted-foreground text-sm font-medium">{label}</dt>
    <dd className="max-w-[60ch] text-right text-sm">{value}</dd>
  </div>
);

const describeDeputyStep = (request: LeaveRequest): string => {
  const decision =
    request.deputyStatus === "pending"
      ? "No decision yet"
      : humanizeKey(request.deputyStatus);

  return request.deputyComment
    ? `${decision} — ${request.deputyComment}`
    : decision;
};

interface LeaveDecisionPanelProps {
  request: LeaveRequest;
  /** False when the signed-in member has nothing left to do here. */
  canDecide: boolean;
  isDeputy: boolean;
  isPrincipal: boolean;
  isPending: boolean;
  onDecide: (action: LeaveAction) => void;
  /** Shuts the dialog without deciding anything. */
  onCancel: () => void;
}

/**
 * The note and the buttons — the half of the dialog that carries state.
 *
 * It is a component of its own for two reasons, both of them about the note.
 * Its `useState` lives here rather than in the dialog, so closing the dialog
 * unmounts it and the next request opens with an empty box: a note carried over
 * from the previous request is a comment about one teacher filed against
 * another, which is exactly the sort of mistake an approval screen must not make
 * possible. And splitting it out is what keeps the dialog itself small enough to
 * read.
 *
 * **The note is required only when it is an override.** `finalizeLeave` reads
 * `overrideReason` alone when it checks that a Principal is allowed to act
 * without a Deputy recommendation, and refuses with `BAD_REQUEST` when it is
 * missing — so the field is labelled as a requirement, the reason is written
 * above it, and both finalise buttons are disabled until there is text in it.
 * The reader meets the rule before the click rather than as an error after it.
 */
const LeaveDecisionPanel = ({
  request,
  canDecide,
  isDeputy,
  isPrincipal,
  isPending,
  onDecide,
  onCancel,
}: LeaveDecisionPanelProps) => {
  const [note, setNote] = useState("");
  const needsOverride = isPrincipal && isDeputyBypassed(request);
  const isNoteMissing = needsOverride && note.trim() === "";
  const isDisabled = isPending || isNoteMissing;

  const recommend = (decision: "recommended" | "rejected") => {
    onDecide({ comment: note.trim(), decision, kind: "recommend" });
  };

  const finalize = (decision: "approved" | "rejected") => {
    if (needsOverride) {
      onDecide({ decision, kind: "finalize", overrideReason: note.trim() });
      return;
    }

    onDecide({ comment: note.trim(), decision, kind: "finalize" });
  };

  return (
    <>
      {canDecide && (
        <Field>
          <FieldLabel htmlFor={`leave-note-${request.id}`}>
            {needsOverride
              ? "Override reason (required)"
              : "Review note (optional)"}
          </FieldLabel>
          <Textarea
            id={`leave-note-${request.id}`}
            onChange={(event) => {
              setNote(event.target.value);
            }}
            placeholder={
              needsOverride
                ? "e.g. Deputy Principal unavailable — cover arranged for 6-B"
                : "e.g. Approved — arrange cover for 6-B"
            }
            rows={3}
            value={note}
          />
          {needsOverride && (
            <p className="text-muted-foreground text-sm">
              The Deputy Principal has not recommended this request, so the
              server will not accept a final decision without your reason for
              acting without one.
            </p>
          )}
        </Field>
      )}

      <DialogFooter className="sm:justify-between">
        {canDecide && (
          <div className="flex flex-wrap gap-2">
            {isDeputy && request.status === "pending" && (
              <>
                <Button
                  disabled={isPending}
                  onClick={() => {
                    recommend("recommended");
                  }}
                >
                  Recommend
                </Button>
                <Button
                  disabled={isPending}
                  onClick={() => {
                    recommend("rejected");
                  }}
                  variant="destructive"
                >
                  Not recommended
                </Button>
              </>
            )}
            {isPrincipal && (
              <>
                <Button
                  disabled={isDisabled}
                  onClick={() => {
                    finalize("approved");
                  }}
                >
                  Approve (Final)
                </Button>
                <Button
                  disabled={isDisabled}
                  onClick={() => {
                    finalize("rejected");
                  }}
                  variant="destructive"
                >
                  Reject (Final)
                </Button>
              </>
            )}
          </div>
        )}
        <Button onClick={onCancel} variant="ghost">
          Cancel
        </Button>
      </DialogFooter>
    </>
  );
};

interface LeaveReviewDialogProps {
  /** The request under review, or nothing when the dialog is shut. */
  request: LeaveRequest | null;
  isDeputy: boolean;
  isPrincipal: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onDecide: (action: LeaveAction) => void;
}

/**
 * One leave request, everything the server knows about it, and the decision.
 *
 * This used to be an inline panel inside each row of the list, which meant a
 * list of forty requests carried forty textareas and every reviewer control at
 * once. It is a dialog now, for the same reason the accounts list opens one:
 * the row is for scanning, and a decision about a person's leave is read
 * before it is pressed.
 *
 * **The authority decides which procedure, not the decision** — see `LeaveAction`
 * in `leave-request.ts`, which is where the old routing went wrong.
 */
export const LeaveReviewDialog = ({
  request,
  isDeputy,
  isPrincipal,
  isPending,
  onDecide,
  onOpenChange,
}: LeaveReviewDialogProps) => {
  const isOpen = request !== null;
  const canDecide =
    request !== null && canReviewLeave(request, { isDeputy, isPrincipal });
  const badge = request === null ? null : leaveStatusBadge(request.status);

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <div className="type-eyebrow text-muted-foreground">
            Leave request
          </div>
          <DialogTitle className="text-foreground text-xl">
            {request?.staffName}
          </DialogTitle>
          <DialogDescription>
            {isPrincipal
              ? "Your decision is final and closes the request. Approving marks the days on the attendance register."
              : "Your decision passes the request to the Principal, who gives the final one."}
          </DialogDescription>
        </DialogHeader>

        {request && badge && (
          <div className="border-border bg-card border px-[22px] py-2">
            <div className="border-border flex flex-wrap items-center gap-2 border-b py-2">
              <Badge className={badge.className} variant={badge.variant}>
                {badge.label}
              </Badge>
              <Badge variant="secondary">{leaveTypeLabel(request.type)}</Badge>
              {request.staffBadge && (
                <Badge variant="outline">{request.staffBadge}</Badge>
              )}
            </div>
            <dl>
              <DetailRow
                label="Dates"
                value={`${formatDateRange(request.startDate, request.endDate)} — ${describeLeaveDays(request.startDate, request.endDate, request.dayPart)}`}
              />
              <DetailRow
                label="Payment"
                value={LEAVE_PAYMENT_LABELS[request.paymentStatus]}
              />
              <DetailRow label="Reason" value={request.reason ?? "Not given"} />
              <DetailRow
                label="Deputy Principal"
                value={describeDeputyStep(request)}
              />
              <DetailRow
                label="Principal"
                value={
                  request.finalizedAt === null
                    ? "Not decided yet"
                    : `${humanizeKey(request.finalStatus)}${request.principalComment ? ` — ${request.principalComment}` : ""}`
                }
              />
              <DetailRow
                label="Requested"
                value={`${formatDateTime(request.createdAt)} — ${getRequestedAge(request.createdAt)}`}
              />
              <DetailRow
                label="Finalised"
                value={formatDateTime(request.finalizedAt)}
              />
            </dl>
          </div>
        )}

        {request && (
          <LeaveDecisionPanel
            canDecide={canDecide}
            isDeputy={isDeputy}
            isPending={isPending}
            isPrincipal={isPrincipal}
            key={request.id}
            onDecide={onDecide}
            onCancel={() => {
              onOpenChange(false);
            }}
            request={request}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
