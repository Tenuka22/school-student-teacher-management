import { employmentStatusLabel } from "@school-student-teacher-management/db/constants/display";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import { useState } from "react";

import { describeBlocker } from "./request-blocker";
import { formatDateTime, getWaitingFor } from "./teacher-request-format";

/**
 * One row of the review, as `listTeacherRequests` returns it.
 *
 * Hand-written to match the handler's return shape rather than inferred from it,
 * because there is no `inferRouterOutput` helper in the installed `@orpc` — the
 * schema lives in `packages/api/src/routers/staff/teacher-requests.ts` and this
 * is its mirror. It drifted once (`sessionCount` became `signInCount`, and
 * `staffRecord` was added for the blocker rules) and the queue broke at three
 * call sites before the compiler noticed, which is exactly the failure a mirror
 * is supposed to catch early.
 */
export interface TeacherRequest {
  id: string;
  name: string;
  email: string;
  username: string | null;
  displayUsername: string | null;
  hasAvatar: boolean;
  role: string | null;
  emailVerified: boolean;
  banned: boolean;
  banReason: string | null;
  createdAt: string;
  updatedAt: string;
  signInCount: number;
  lastSignInAt: string | null;
  lastSignInIp: string | null;
  lastSignInAgent: string | null;
  /** The staff record linked to this account, when there is one. */
  staffRecord: {
    id: string;
    staffCategory: "teacher" | "officeStaff";
    employmentStatus: string | null;
  } | null;
}

const ROLE_LABELS: Record<string, string> = {
  "teacher-requester": "Asked to join as staff",
  user: "General account",
};

const getToneClass = (tone: "default" | "good" | "bad"): string => {
  if (tone === "good") {
    return "text-[#0B5E1A]";
  }

  if (tone === "bad") {
    return "text-destructive";
  }

  return "text-foreground";
};

const getBrowser = (userAgent: string): string => {
  if (/edg\//iu.test(userAgent)) {
    return "Edge";
  }

  if (/chrome\//iu.test(userAgent)) {
    return "Chrome";
  }

  if (/firefox\//iu.test(userAgent)) {
    return "Firefox";
  }

  if (/safari\//iu.test(userAgent)) {
    return "Safari";
  }

  return "Unknown browser";
};

const getPlatform = (userAgent: string): string => {
  if (/windows/iu.test(userAgent)) {
    return "Windows";
  }

  if (/mac os/iu.test(userAgent)) {
    return "macOS";
  }

  if (/android/iu.test(userAgent)) {
    return "Android";
  }

  if (/iphone|ipad/iu.test(userAgent)) {
    return "iOS";
  }

  if (/linux/iu.test(userAgent)) {
    return "Linux";
  }

  return "Unknown platform";
};

const getAgentSummary = (userAgent: string | null): string => {
  if (!userAgent) {
    return "Not recorded";
  }

  return `${getBrowser(userAgent)} on ${getPlatform(userAgent)}`;
};

const DetailRow = ({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "bad";
}) => (
  <div className="border-border flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b py-2 last:border-b-0">
    <dt className="text-muted-foreground text-sm font-medium">{label}</dt>
    <dd className={`max-w-[60ch] text-right text-sm ${getToneClass(tone)}`}>
      {value}
    </dd>
  </div>
);

const getAccountState = (
  request: TeacherRequest
): {
  value: string;
  tone: "default" | "bad";
} => {
  if (!request.banned) {
    return { value: "Active", tone: "default" };
  }

  return {
    value: request.banReason ? `Banned — ${request.banReason}` : "Banned",
    tone: "bad",
  };
};

const getVerification = (
  request: TeacherRequest
): {
  value: string;
  tone: "good" | "bad";
} =>
  request.emailVerified
    ? {
        value: "Confirmed — they entered the code sent to this address",
        tone: "good",
      }
    : { value: "Not confirmed — approval will be refused", tone: "bad" };

const getConfirmLabel = (isPending: boolean, isConfirming: boolean): string => {
  if (isPending) {
    return "Approving…";
  }

  return isConfirming ? "Yes — approve as teacher" : "Approve as teacher";
};

/**
 * What the linked staff record is, in one line.
 *
 * The deciding fact behind three of the server's four refusals, printed as a
 * *fact* rather than a verdict — the verdict is `describeBlocker`'s, and it
 * appears below as its own sentence. "None linked" rather than "Not set",
 * because an account with no staff record is not a record with a gap in it.
 */
const describeStaffRecord = (record: TeacherRequest["staffRecord"]): string => {
  if (!record) {
    return "None linked";
  }

  const category =
    record.staffCategory === "teacher" ? "Teacher" : "Office staff";

  return `${category} · ${employmentStatusLabel(record.employmentStatus)}`;
};

interface ApproveTeacherDialogProps {
  request: TeacherRequest | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (userId: string) => void;
}

/**
 * The full record behind an approval, shown before it is granted.
 *
 * Granting the teacher role is a decision about a real person, so the dialog
 * puts everything the server knows in front of the approver: who they are,
 * how they registered, whether the address is actually proven, whether the
 * account is banned, and when it was last used. Nothing here is a
 * substitute for the check — the server still refuses an unverified account —
 * but "approve" should never be a button pressed without reading anything.
 */
export const ApproveTeacherDialog = ({
  request,
  isPending,
  onOpenChange,
  onApprove,
}: ApproveTeacherDialogProps) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const isOpen = request !== null;
  /**
   * The server's four rules, decided once for the whole dialog.
   *
   * The primary button, the sentence under the footer and the queue's Status
   * column all read this same answer, so a reader cannot be told two different
   * things about one account depending on which of them they happen to look at.
   */
  const blocker = request === null ? null : describeBlocker(request);

  // The second click is the approval: the first reveals what is about to
  // happen, so nobody grants a role by muscle memory.
  const handlePrimary = () => {
    if (!request) {
      return;
    }

    if (!isConfirming) {
      setIsConfirming(true);
      return;
    }

    onApprove(request.id);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setIsConfirming(false);
    }

    onOpenChange(open);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={isOpen}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <div className="text-destructive type-eyebrow">
            Staff registration review
          </div>
          <DialogTitle className="text-foreground text-xl">
            {request?.name}
          </DialogTitle>
          <DialogDescription>
            Check this person is on the College establishment before granting
            the teacher role. Approval gives them the teacher workspace and
            everything in it.
          </DialogDescription>
        </DialogHeader>

        {request && (
          <div className="border-border bg-card border px-[22px] py-2">
            <dl>
              <DetailRow label="Full name" value={request.name} />
              <DetailRow label="Email address" value={request.email} />
              <DetailRow label="Username" value={request.username ?? "—"} />
              <DetailRow
                label="Display name"
                value={request.displayUsername ?? request.username ?? "—"}
              />
              <DetailRow
                label="Registered as"
                value={
                  request.role === null
                    ? "Not recorded"
                    : (ROLE_LABELS[request.role] ?? request.role)
                }
              />
              <DetailRow
                label="Staff record"
                value={describeStaffRecord(request.staffRecord)}
              />
              <DetailRow
                label="Email verified"
                tone={getVerification(request).tone}
                value={getVerification(request).value}
              />
              <DetailRow
                label="Account state"
                tone={getAccountState(request).tone}
                value={getAccountState(request).value}
              />
              <DetailRow
                label="Registered"
                value={`${formatDateTime(request.createdAt)} · waiting ${getWaitingFor(request.createdAt)}`}
              />
              <DetailRow
                label="Last active"
                value={formatDateTime(request.lastSignInAt)}
              />
              <DetailRow
                label="Active sessions"
                value={
                  request.signInCount === 0
                    ? "None — they have not signed in since registering"
                    : `${request.signInCount}`
                }
              />
              <DetailRow
                label="Last used from"
                value={`${getAgentSummary(request.lastSignInAgent)}${request.lastSignInIp ? ` · ${request.lastSignInIp}` : ""}`}
              />
            </dl>
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="border-input text-foreground hover:bg-primary/5 border px-4 py-2 text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending || blocker !== null}
            onClick={handlePrimary}
            className="bg-primary text-primary-foreground hover:bg-primary-hover px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {getConfirmLabel(isPending, isConfirming)}
          </button>
        </DialogFooter>

        {request !== null && !request.emailVerified && (
          <p className="text-destructive text-sm font-medium">
            This account has not confirmed its email address. Ask them to enter
            the code already sent to {request.email}, then review again.
          </p>
        )}

        {request !== null && request.emailVerified && blocker !== null && (
          <p className="text-destructive text-sm font-medium">{blocker}</p>
        )}
      </DialogContent>
    </Dialog>
  );
};
