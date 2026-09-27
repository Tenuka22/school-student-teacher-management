import {
  MATERNITY_FULL_PAY_DAYS,
  MATERNITY_HALF_PAY_DAYS,
  calculateLeaveDays,
} from "@school-student-teacher-management/db/constants/leave";
import {
  leavePaymentLabel,
  leaveTypeLabel,
} from "@school-student-teacher-management/db/constants/leave-labels";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
} from "@school-student-teacher-management/ui/components/card";
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
  FieldError,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@school-student-teacher-management/ui/components/field";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import {
  IconBan,
  IconCalendarEvent,
  IconCircleCheck,
  IconCircleDot,
  IconCircleX,
  IconClock,
  IconInfoCircle,
  IconRosetteDiscountCheck,
  IconX,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import { useRef, useState } from "react";

import { leaveStatusBadge } from "./leave-status";

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
  /** Returned by `listLeaveRequests`; shown on the card as the filed date. */
  createdAt?: string;
}

export type ReviewDecision = "recommended" | "rejected" | "approved";

/**
 * Which decision is in flight, and for which request.
 *
 * `isSubmitting` alone cannot tell a row which of its own buttons is working, so
 * a reviewer pressing "Approve" twice would see nothing change between the two
 * clicks. The acting row also takes `aria-busy` from this.
 */
export interface PendingReview {
  id: string;
  decision: ReviewDecision;
}

type AuthorityState = "loading" | "ready" | "failed";

const ISO_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Leave dates are stored as `YYYY-MM-DD` strings and counted as UTC midnights
 * by the server's own `calculateLeaveDays`. Parsing one in a local timezone
 * would show a request a day earlier for anyone west of Greenwich, so the
 * string is pinned to UTC before it is formatted — and the exact ISO value stays
 * in the `<time dateTime>` for anyone who needs it.
 */
const formatIsoDate = (value: string) =>
  ISO_DATE.format(new Date(`${value.slice(0, 10)}T00:00:00Z`));

const dayPartLabel = (dayPart: LeaveRequestItem["dayPart"]) => {
  if (dayPart === "morning") {
    return "First half (Primary)";
  }
  if (dayPart === "afternoon") {
    return "Second half (Secondary)";
  }
  return "Full day";
};

/**
 * The days this request is worth, counted by the server's own function.
 *
 * `calculateLeaveDays` is the call `applyLeave` makes when it checks the quota,
 * so the figure on this card is the figure the quota was checked against — not
 * a second formula written to look similar. Consumption is derived from
 * *approved* requests only, so this is what the request would charge if it is
 * approved; pending and rejected requests consume nothing.
 */
const requestDayCount = (request: LeaveRequestItem) =>
  calculateLeaveDays(request.startDate, request.endDate, request.dayPart);

const formatDayCount = (days: number) => {
  if (days === 0) {
    return "0 days counted";
  }
  if (days === 0.5) {
    return "Half a day";
  }
  return `${days} working days`;
};

/**
 * Whether the Deputy step recommended this request.
 *
 * Read from `deputyStatus` alone and never from the overall `status`: the status
 * is overwritten with the Principal's decision on finalisation, so a test that
 * also required `status === "recommended"` would report every ordinary approval
 * as a bypass of the Deputy step.
 */
const deputyStepComplete = (request: LeaveRequestItem) =>
  request.deputyStatus === "recommended";

const STATUS_ICONS = {
  clock: IconClock,
  "circle-check": IconCircleCheck,
  "rosette-check": IconRosetteDiscountCheck,
  "circle-x": IconCircleX,
  ban: IconBan,
  "circle-dot": IconCircleDot,
} as const;

const isMaternity = (request: LeaveRequestItem) => request.type === "maternity";

/**
 * A status is never colour alone: the badge carries its own glyph, its own
 * words, and a sentence for anyone who cannot use either of those.
 *
 * A Deputy's decline and the Principal's final rejection share one server status
 * — `rejected` — but they are different decisions at different steps, and the
 * first is still open for the Principal to overturn. Painting both the same red
 * tells a reviewer the matter is closed while it is sitting in their own queue,
 * so the open one gets its own words, its own glyph and a neutral fill.
 */
const StatusBadge = ({ request }: { request: LeaveRequestItem }) => {
  if (request.status === "rejected" && !request.finalizedAt) {
    return (
      <Badge
        title="Declined by the Deputy Principal — the Principal can still decide it"
        variant="secondary"
      >
        <IconCircleX aria-hidden="true" />
        Declined by Deputy
        <span className="sr-only">
          {" "}
          — declined by the Deputy Principal, awaiting the Principal
        </span>
      </Badge>
    );
  }

  const badge = leaveStatusBadge(request.status);
  const StatusIcon = STATUS_ICONS[badge.icon];

  return (
    <Badge
      className={badge.className}
      title={badge.description}
      variant={badge.variant}
    >
      <StatusIcon aria-hidden="true" />
      {badge.label}
      <span className="sr-only"> — {badge.description}</span>
    </Badge>
  );
};

/**
 * The College's maternity rule, in the words the code enforces.
 *
 * 84 days at full pay and a further 84 at half pay, **per person**, with the two
 * tiers counted as separate quotas — `halfPay` is half pay, never unpaid, and
 * the two are never collapsed into one label. Nothing here groups requests by
 * maternity event, because nothing in the data model can: `leave_request`
 * carries no event reference, so "per person" is the only reading that can be
 * stated honestly.
 */
const MaternityRuleNote = ({ request }: { request: LeaveRequestItem }) => (
  <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
    <IconInfoCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
    <span>
      Maternity: {MATERNITY_FULL_PAY_DAYS} days at full pay, then a further{" "}
      {MATERNITY_HALF_PAY_DAYS} days at half pay, per person. Each tier is a
      quota of its own, so this request is charged to the{" "}
      {leavePaymentLabel(request.paymentStatus)} tier. The ledger holds no
      maternity event, so the count is per person and requests are not grouped
      into one.
    </span>
  </p>
);

/**
 * Where the two-step chain stands, and the reason recorded at each step.
 *
 * The Principal's comment is read here because it is the only place a rejection
 * reason survives: the queue used to render the Deputy's note and the legacy
 * review note, and silently dropped the words the Principal actually recorded
 * when they rejected a request.
 */
const ChainSummary = ({ request }: { request: LeaveRequestItem }) => {
  const deputyActed =
    request.deputyStatus === "recommended" ||
    request.deputyStatus === "rejected";
  const principalActed = Boolean(request.finalizedAt);
  // A final decision taken without a recommendation is a bypass, and the row
  // says so — an approval that skipped the Deputy step must not read as one
  // that went through it.
  const bypassed = principalActed && !deputyStepComplete(request);

  if (!deputyActed && !principalActed) {
    return null;
  }

  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs">
      {deputyActed && (
        <>
          <dt className="text-muted-foreground">Deputy Principal</dt>
          <dd>
            {request.deputyStatus === "recommended"
              ? "Recommended"
              : "Not recommended"}
            {request.deputyComment ? ` — ${request.deputyComment}` : ""}
          </dd>
        </>
      )}
      {principalActed && (
        <>
          <dt className="text-muted-foreground">Principal</dt>
          <dd>
            {request.finalStatus === "approved" ? "Approved" : "Rejected"}
            {bypassed ? " without the Deputy step" : ""}
            {request.finalizedAt ? (
              <>
                {" · "}
                <time className="tabular-nums" dateTime={request.finalizedAt}>
                  {formatIsoDate(request.finalizedAt)}
                </time>
              </>
            ) : null}
            {request.principalComment ? ` — ${request.principalComment}` : ""}
          </dd>
        </>
      )}
    </dl>
  );
};

/** Who asked, for what, over which dates, and why. */
const RequestSummary = ({
  request,
  staffName,
  staffBadge,
}: {
  request: LeaveRequestItem;
  staffName: string;
  staffBadge: string | null;
}) => (
  <div className="min-w-0 space-y-1.5">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-sm font-semibold">{staffName}</span>
      {staffBadge ? (
        <span className="text-muted-foreground text-xs tabular-nums">
          Service No. {staffBadge}
        </span>
      ) : null}
      <Badge variant="secondary">{leaveTypeLabel(request.type)}</Badge>
      {isMaternity(request) ? (
        <Badge
          variant={request.paymentStatus === "unpaid" ? "warning" : "success"}
        >
          {leavePaymentLabel(request.paymentStatus)}
        </Badge>
      ) : null}
    </div>

    <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
      <IconCalendarEvent aria-hidden="true" className="size-3.5 shrink-0" />
      <time className="tabular-nums" dateTime={request.startDate}>
        {formatIsoDate(request.startDate)}
      </time>
      {request.startDate !== request.endDate && (
        <>
          <span aria-hidden="true">–</span>
          <time className="tabular-nums" dateTime={request.endDate}>
            {formatIsoDate(request.endDate)}
          </time>
        </>
      )}
      <span aria-hidden="true">·</span>
      {dayPartLabel(request.dayPart)}
      {request.createdAt ? (
        <>
          <span aria-hidden="true">·</span>
          filed
          <time className="tabular-nums" dateTime={request.createdAt}>
            {formatIsoDate(request.createdAt)}
          </time>
        </>
      ) : null}
    </p>

    <p className="max-w-prose text-sm">
      {request.reason ?? (
        <span className="text-muted-foreground">
          No reason was given with this request.
        </span>
      )}
    </p>

    {request.reviewComment ? (
      <p className="text-muted-foreground text-xs">
        Earlier review note: {request.reviewComment}
      </p>
    ) : null}

    <ChainSummary request={request} />
    {isMaternity(request) ? <MaternityRuleNote request={request} /> : null}
  </div>
);

/**
 * Status, what the request costs the quota, and the one action this seat owns.
 *
 * The action area holds a skeleton's shape while the reviewer's own authority is
 * still loading, so the queue does not gain a column a beat after it paints.
 */
const RequestActions = ({
  request,
  canAct,
  canFinalise,
  isReviewing,
  isSubmitting,
  authorityState,
  onStartReview,
}: {
  request: LeaveRequestItem;
  canAct: boolean;
  canFinalise: boolean;
  isReviewing: boolean;
  isSubmitting: boolean;
  authorityState: AuthorityState;
  onStartReview: () => void;
}) => (
  <div className="flex flex-wrap items-start gap-2 md:flex-col md:items-end">
    <StatusBadge request={request} />

    <p className="text-xs md:text-right">
      <span className="font-semibold tabular-nums">
        {formatDayCount(requestDayCount(request))}
      </span>{" "}
      <span className="text-muted-foreground">
        charged to the {leaveTypeLabel(request.type)}
        {isMaternity(request)
          ? ` quota (${leavePaymentLabel(request.paymentStatus)})`
          : " quota"}
      </span>
    </p>

    {canAct && !isReviewing ? (
      <Button
        disabled={isSubmitting}
        onClick={onStartReview}
        size="sm"
        variant="outline"
      >
        {canFinalise ? "Finalise" : "Review"}
      </Button>
    ) : null}

    {authorityState === "loading" ? <Skeleton className="h-7 w-24" /> : null}
  </div>
);

interface DecisionButtonProps {
  decision: ReviewDecision;
  isFinal: boolean;
  isBusy: boolean;
  isSubmitting: boolean;
  label: string;
  icon: Icon;
  variant: "default" | "destructive";
  onDecide: (decision: ReviewDecision, isFinal: boolean) => void;
}

/**
 * One decision control.
 *
 * The button's own `loading` state does three things this screen depends on:
 * it stops a second activation reaching the server, it marks the control
 * `aria-busy`, and it swaps the label for a spinner of the same footprint — so
 * the button is the same width before, during and after the click. A control
 * that resizes under the pointer is how a reviewer ends up pressing Approve
 * twice, and it is also why the label never changes with the state.
 */
const DecisionButton = ({
  decision,
  isFinal,
  isBusy,
  isSubmitting,
  label,
  icon: DecisionIcon,
  variant,
  onDecide,
}: DecisionButtonProps) => (
  <Button
    disabled={isSubmitting}
    loading={isBusy}
    onClick={() => {
      onDecide(decision, isFinal);
    }}
    size="sm"
    variant={variant}
  >
    <DecisionIcon aria-hidden="true" />
    {label}
  </Button>
);

interface ReviewControlsProps {
  request: LeaveRequestItem;
  canRecommend: boolean;
  canFinalise: boolean;
  requiresOverride: boolean;
  isSubmitting: boolean;
  pendingDecision: PendingReview | null;
  comment: string;
  decisionError: string | null;
  onCommentChange: (value: string) => void;
  onCancel: () => void;
  onDecide: (
    decision: ReviewDecision,
    overrideReason?: string,
    isFinal?: boolean
  ) => void;
}

const REASON_REQUIRED: Record<ReviewDecision, string> = {
  recommended: "Record a note before recommending this request.",
  approved: "Say why the Deputy step is being bypassed before recording this.",
  rejected: "Record a reason, so the teacher knows what was decided and why.",
};

const DECISION_ACTION: Record<ReviewDecision, string> = {
  recommended: "Recommend to the Principal",
  approved: "Approve (final)",
  rejected: "Reject (final)",
};

const describeRole = (canRecommend: boolean, canFinalise: boolean) => {
  if (canFinalise && canRecommend) {
    return "You hold both positions on this chain: as Deputy Principal you recommend or decline, as Principal you give the final decision.";
  }
  if (canFinalise) {
    return "As Principal your decision is final. Approving also records the affected periods as absence and locks manual attendance changes for those days.";
  }
  return "As Deputy Principal you recommend or decline; the Principal makes the final decision.";
};

/**
 * The decision, taken on the card rather than behind a modal.
 *
 * An approver working down a queue needs the rest of the queue in view while
 * they decide, so this opens inline: the note, the controls this seat owns, and
 * the reason a decision is or is not yet possible. The one interruption kept is
 * the Principal's bypass of the Deputy step — a final, irreversible decision
 * that skipped a control point — and that is a confirmation, not a form: the
 * reason is typed here, on the card, so `Esc` cannot throw it away.
 */
const ReviewControls = ({
  request,
  canRecommend,
  canFinalise,
  requiresOverride,
  isSubmitting,
  pendingDecision,
  comment,
  decisionError,
  onCommentChange,
  onCancel,
  onDecide,
}: ReviewControlsProps) => {
  const [noteError, setNoteError] = useState<string | null>(null);
  const [overrideDecision, setOverrideDecision] =
    useState<ReviewDecision | null>(null);
  const goBackRef = useRef<HTMLButtonElement | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const overrideOpen = overrideDecision !== null;

  const isBusyWith = (decision: ReviewDecision) =>
    pendingDecision?.id === request.id && pendingDecision.decision === decision;

  /**
   * Whether this decision needs a reason recorded. Declining, rejecting and
   * bypassing the Deputy step are the three a teacher will read back later and
   * ask about, so each carries one; approving a properly recommended request
   * does not.
   */
  const reasonRequired = (decision: ReviewDecision, isFinal: boolean) =>
    decision !== "approved" || (isFinal && requiresOverride);

  const attempt = (decision: ReviewDecision, isFinal: boolean) => {
    // The second click of a double click must not become a second decision.
    if (isSubmitting || isBusyWith(decision)) {
      return;
    }

    const reason = comment.trim();

    if (reasonRequired(decision, isFinal)) {
      if (reason.length === 0) {
        setNoteError(REASON_REQUIRED[decision]);
        // A keyboard user who pressed a decision button is still on that
        // button; the thing they now have to change is the note, so focus goes
        // there rather than leaving the error to be found.
        noteRef.current?.focus();
        return;
      }

      if (isFinal && requiresOverride) {
        setOverrideDecision(decision);
        return;
      }

      onDecide(decision, requiresOverride ? reason : undefined, isFinal);
      return;
    }

    onDecide(decision, undefined, isFinal);
  };

  const closeOverride = () => {
    setOverrideDecision(null);
  };

  return (
    <div className="border-t px-4 py-3">
      <FieldSet className="gap-2">
        <FieldLegend className="mb-0 text-xs font-semibold" variant="label">
          Record a decision
        </FieldLegend>
        <p className="text-muted-foreground max-w-prose text-xs">
          {describeRole(canRecommend, canFinalise)}
        </p>

        {requiresOverride && (
          <p className="border-warning-ink/45 text-warning-ink border px-2.5 py-2 text-xs">
            The Deputy Principal has not recommended this request, so a decision
            now bypasses that step and must carry a reason.
          </p>
        )}

        {/*
          `Field` owns the wiring: the textarea claims the control id, the label
          points at it, and the error registers itself in `aria-describedby` — so
          a missing reason is announced against the box the reviewer has to fill
          in, not only in a toast.
        */}
        <Field
          className="max-w-xl"
          invalid={noteError !== null}
          required={requiresOverride}
        >
          <FieldLabel>
            Review note
            <span className="text-muted-foreground font-normal">
              {" "}
              — required to decline, reject, or bypass the Deputy step
            </span>
          </FieldLabel>
          <Textarea
            onChange={(event) => {
              setNoteError(null);
              onCommentChange(event.target.value);
            }}
            placeholder="e.g. Approved — arrange cover for 6-B"
            ref={noteRef}
            rows={2}
            value={comment}
          />
          {noteError ? <FieldError>{noteError}</FieldError> : null}
        </Field>

        {decisionError && (
          <p
            className="border-destructive/45 text-destructive max-w-prose border px-2.5 py-2 text-xs"
            role="alert"
          >
            {decisionError} Nothing was recorded — the request is unchanged, so
            you can try again.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {canRecommend && (
            <DecisionButton
              decision="recommended"
              icon={IconCircleCheck}
              isBusy={isBusyWith("recommended")}
              isFinal={false}
              isSubmitting={isSubmitting}
              label="Recommend"
              onDecide={attempt}
              variant="default"
            />
          )}
          {canRecommend && (
            <DecisionButton
              decision="rejected"
              icon={IconX}
              isBusy={isBusyWith("rejected")}
              isFinal={false}
              isSubmitting={isSubmitting}
              label="Not recommended"
              onDecide={attempt}
              variant="destructive"
            />
          )}
          {canFinalise && (
            <DecisionButton
              decision="approved"
              icon={IconRosetteDiscountCheck}
              isBusy={isBusyWith("approved")}
              isFinal
              isSubmitting={isSubmitting}
              label="Approve (Final)"
              onDecide={attempt}
              variant="default"
            />
          )}
          {canFinalise && (
            <DecisionButton
              decision="rejected"
              icon={IconX}
              isBusy={isBusyWith("rejected")}
              isFinal
              isSubmitting={isSubmitting}
              label="Reject (Final)"
              onDecide={attempt}
              variant="destructive"
            />
          )}
          <Button
            disabled={isSubmitting}
            onClick={onCancel}
            size="sm"
            variant="ghost"
          >
            Close
          </Button>
        </div>
      </FieldSet>

      {/*
        A confirmation, deliberately not a form. The reason is already typed on
        the card, so nothing here can be lost to `Esc`, focus lands on "Go back"
        rather than on the button that finalises, and the dialog is the one
        interruption on this page — the irreversible one.
      */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            closeOverride();
          }
        }}
        open={overrideOpen}
      >
        <DialogContent
          className="sm:max-w-[440px]"
          initialFocus={goBackRef}
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>
              {overrideDecision === "rejected" ? "Reject" : "Approve"} without
              the Deputy step?
            </DialogTitle>
            <DialogDescription>
              This request has not completed the Deputy review. Your decision is
              final: it is written to the record and cannot be undone here.{" "}
              {overrideDecision === "rejected"
                ? "The teacher will see it as declined."
                : "Approval records the affected periods as absence."}
            </DialogDescription>
          </DialogHeader>
          <p className="bg-muted border-primary/20 border px-2.5 py-2 text-xs">
            <span className="font-semibold">Reason to be recorded: </span>“
            {comment.trim()}”
          </p>
          <DialogFooter>
            <Button
              onClick={closeOverride}
              ref={goBackRef}
              size="sm"
              variant="outline"
            >
              Go back
            </Button>
            <Button
              disabled={isSubmitting}
              onClick={() => {
                if (overrideDecision) {
                  onDecide(overrideDecision, comment.trim(), true);
                }
                closeOverride();
              }}
              size="sm"
              variant={
                overrideDecision === "rejected" ? "destructive" : "default"
              }
            >
              {overrideDecision
                ? DECISION_ACTION[overrideDecision]
                : DECISION_ACTION.approved}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
  onDecide: (
    decision: ReviewDecision,
    overrideReason?: string,
    isFinal?: boolean
  ) => void;
  /** Which request and decision are in flight, for the spinner and `aria-busy`. */
  pending?: PendingReview | null;
  /**
   * The last failure on this row, named and left in place rather than being a
   * toast that has already vanished by the time the reviewer looks for it.
   */
  decisionError?: string | null;
  /**
   * Whether the reviewer's own authority has resolved. Until it has, the action
   * area holds its shape with a skeleton instead of appearing a beat later, and
   * a failure to read it is stated rather than silently showing no buttons.
   */
  authorityState?: AuthorityState;
}

/**
 * One leave request as one record: who asked, for what, over which dates, what
 * it is worth in days, which quota those days are charged to, and where the
 * chain stands.
 *
 * The actions shown are only the ones this seat owns — recommend or decline for
 * a Deputy Principal, approve or reject for the Principal — and nothing at all
 * for anyone else, so the queue never offers a decision the server would refuse.
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
  pending = null,
  decisionError = null,
  authorityState = "ready",
}: LeaveRequestCardProps) => {
  // What this seat can do with this row, from the same facts the server checks:
  // `finalizedAt` closes the chain, a Deputy acts only on an untouched request,
  // and a Principal acts on anything still open.
  const canRecommend =
    isDeputy && request.status === "pending" && !request.finalizedAt;
  const canFinalise =
    isPrincipal &&
    !request.finalizedAt &&
    request.status !== "cancelled" &&
    request.status !== "approved";
  // A Principal acting on a row the Deputy has not recommended is bypassing the
  // chain, which the server permits only with a recorded reason.
  const requiresOverride = canFinalise && !deputyStepComplete(request);

  return (
    <Card aria-busy={pending?.id === request.id ? true : undefined}>
      <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:gap-6">
        <RequestSummary
          request={request}
          staffBadge={staffBadge}
          staffName={staffName}
        />
        <RequestActions
          authorityState={authorityState}
          canAct={canRecommend || canFinalise}
          canFinalise={canFinalise}
          isReviewing={isReviewing}
          isSubmitting={isSubmitting}
          onStartReview={onStartReview}
          request={request}
        />
      </CardContent>

      {isReviewing && (
        <ReviewControls
          canFinalise={canFinalise}
          canRecommend={canRecommend}
          comment={comment}
          decisionError={decisionError}
          isSubmitting={isSubmitting}
          onCancel={onCancelReview}
          onCommentChange={onCommentChange}
          onDecide={onDecide}
          pendingDecision={pending}
          request={request}
          requiresOverride={requiresOverride}
        />
      )}
    </Card>
  );
};
