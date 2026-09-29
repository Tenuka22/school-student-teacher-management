import type {
  DeputyStatus,
  FinalStatus,
  LeaveDayPart,
  LeavePaymentStatus,
  LeaveStatus,
  LeaveType,
} from "@school-student-teacher-management/db/schema/leaves";

/**
 * What a leave request is on this screen, and the two rules about it.
 *
 * A `.ts` module rather than a home inside `leave-review-dialog.tsx`, because
 * four files need the shape — the columns, the table, the content component and
 * the dialog — and a module that exports a component cannot export anything
 * else without breaking Fast Refresh. What a request *is*, and who may act on
 * it, are facts about the ledger; the dialog is one view of them.
 *
 * ## The row, as `listLeaveRequests` returns it
 *
 * Hand-written to match the handler's return shape rather than inferred from
 * it, because there is no `inferRouterOutput` helper in the installed `@orpc` —
 * the schema lives in `packages/api/src/routers/staff/leaves/list-leave-requests.ts`
 * and this is its mirror. The same discipline as `TeacherRequest` in
 * `approve-teacher-dialog.tsx`, for the same reason: a field the server renames
 * should break one file at compile time rather than a column at render time.
 */
export interface LeaveRequest {
  id: string;
  staffId: string;
  staffName: string;
  staffBadge: string | null;
  type: LeaveType;
  startDate: string;
  endDate: string;
  dayPart: LeaveDayPart;
  paymentStatus: LeavePaymentStatus;
  reason: string | null;
  status: LeaveStatus;
  deputyStatus: DeputyStatus;
  deputyComment: string | null;
  finalStatus: FinalStatus;
  principalComment: string | null;
  finalizedAt: string | null;
  reviewComment: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

/** What the reviewer's role lets them do on this screen. */
export interface LeaveAuthority {
  isDeputy: boolean;
  isPrincipal: boolean;
}

type RecommendDecision = "recommended" | "rejected";
type FinalizeDecision = "approved" | "rejected";

export type ReviewDecision = RecommendDecision | FinalizeDecision;

/**
 * A decision, already shaped as the procedure that will take it.
 *
 * The two steps are two procedures and not one with a flag, so the choice of
 * which to call belongs here, next to the buttons that decide it — and not in
 * the page, where it used to be decided by looking at the decision itself.
 * That was wrong in a way that only ever showed up on a click: a Principal
 * pressing "Reject (Final)" chose `recommendLeave` (because the decision was
 * not `approved`), and the server answered "Only the Deputy Principal can
 * recommend leave requests". Routing by *who is acting* is the correct test.
 */
export type LeaveAction =
  | {
      /** The Deputy's step: a recommendation, never a final decision. */
      comment: string;
      decision: RecommendDecision;
      kind: "recommend";
    }
  | {
      comment?: string;
      decision: FinalizeDecision;
      kind: "finalize";
      /**
       * The Principal's reason for acting without a Deputy recommendation.
       * Required by the server whenever the request is not in `recommended`
       * state — see `isDeputyBypassed`.
       */
      overrideReason?: string;
    };

/** A request nobody can act on any more. */
export const isTerminalRequest = (request: LeaveRequest): boolean =>
  request.status === "approved" ||
  request.status === "cancelled" ||
  request.finalizedAt !== null;

/**
 * Is the Principal acting without a Deputy recommendation behind them?
 *
 * The server's own expression, `isBypass` in `leadership-review.ts`, not a
 * re-derivation: the two have to agree or the dialog will offer a button the
 * handler refuses. A bypass needs an `overrideReason`, which is why the dialog
 * knows about it at all.
 */
export const isDeputyBypassed = (request: LeaveRequest): boolean =>
  request.deputyStatus !== "recommended" || request.status !== "recommended";

/**
 * Whether the signed-in member still has a decision to make here.
 *
 * Mirrors `finalizeLeave`'s own guard rather than the status word: a request the
 * Deputy turned down is still open — `recommendLeave` does not set
 * `finalizedAt` — and the Principal is expected to be able to decide it, which
 * is exactly why the server's `principal` queue keeps `rejected` in it. The old
 * card keyed this off `status`, so a Deputy-rejected request was drawn as closed
 * while the server was still offering it to the Principal.
 *
 * The Deputy's half is narrower still: their buttons only ever exist for a
 * request nobody has recommended yet, because a second Deputy decision is
 * refused by the server.
 */
export const canReviewLeave = (
  request: LeaveRequest,
  authority: LeaveAuthority
): boolean => {
  if (isTerminalRequest(request)) {
    return false;
  }

  if (authority.isPrincipal) {
    return true;
  }

  return authority.isDeputy && request.status === "pending";
};
