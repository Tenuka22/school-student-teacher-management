import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import { useState } from "react";

/** One row of the review, as `listTeacherRequests` returns it. */
export interface TeacherRequest {
  id: string;
  name: string;
  email: string;
  username: string | null;
  displayUsername: string | null;
  hasAvatar: boolean;
  role: string;
  emailVerified: boolean;
  banned: boolean;
  banReason: string | null;
  createdAt: string;
  updatedAt: string;
  sessionCount: number;
  lastSeenAt: string | null;
  lastSeenIp: string | null;
  lastSeenAgent: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  "teacher-requester": "Asked to join as staff",
  user: "General account",
};

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return "Never";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getWaitingFor = (createdAt: string): string => {
  const created = new Date(createdAt).getTime();

  if (Number.isNaN(created)) {
    return "—";
  }

  const days = Math.floor((Date.now() - created) / 86_400_000);

  if (days <= 0) {
    return "Today";
  }

  if (days === 1) {
    return "1 day";
  }

  return `${days} days`;
};
const getToneClass = (tone: "default" | "good" | "bad"): string => {
  if (tone === "good") {
    return "text-[#0B5E1A]";
  }

  if (tone === "bad") {
    return "text-[#A51919]";
  }

  return "text-[#013405]";
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
  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[#013405]/8 py-2 last:border-b-0">
    <dt className="text-[12px] font-bold tracking-[0.14em] text-[#013405]/55">
      {label}
    </dt>
    <dd
      className={`max-w-[60ch] text-right text-[13.5px] ${getToneClass(tone)}`}
    >
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
    return "APPROVING…";
  }

  return isConfirming ? "YES — APPROVE AS TEACHER" : "APPROVE AS TEACHER";
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
          <div className="text-[12px] font-extrabold tracking-[0.24em] text-[#A51919]">
            STAFF REGISTRATION REVIEW
          </div>
          <DialogTitle className="font-heading text-[26px] font-semibold text-[#013405]">
            {request?.name}
          </DialogTitle>
          <DialogDescription>
            Check this person is on the College establishment before granting
            the teacher role. Approval gives them the teacher workspace and
            everything in it.
          </DialogDescription>
        </DialogHeader>

        {request && (
          <div className="border border-[#013405]/14 bg-[#fffdf6] px-[22px] py-2">
            <dl>
              <DetailRow label="FULL NAME" value={request.name} />
              <DetailRow label="EMAIL ADDRESS" value={request.email} />
              <DetailRow label="USERNAME" value={request.username ?? "—"} />
              <DetailRow
                label="DISPLAY NAME"
                value={request.displayUsername ?? request.username ?? "—"}
              />
              <DetailRow
                label="REGISTERED AS"
                value={ROLE_LABELS[request.role] ?? request.role}
              />
              <DetailRow
                label="EMAIL VERIFIED"
                tone={getVerification(request).tone}
                value={getVerification(request).value}
              />
              <DetailRow
                label="ACCOUNT STATE"
                tone={getAccountState(request).tone}
                value={getAccountState(request).value}
              />
              <DetailRow
                label="REGISTERED"
                value={`${formatDateTime(request.createdAt)} · waiting ${getWaitingFor(request.createdAt)}`}
              />
              <DetailRow
                label="LAST ACTIVE"
                value={formatDateTime(request.lastSeenAt)}
              />
              <DetailRow
                label="ACTIVE SESSIONS"
                value={
                  request.sessionCount === 0
                    ? "None — they have not signed in since registering"
                    : `${request.sessionCount}`
                }
              />
              <DetailRow
                label="LAST USED FROM"
                value={`${getAgentSummary(request.lastSeenAgent)}${request.lastSeenIp ? ` · ${request.lastSeenIp}` : ""}`}
              />
            </dl>
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="border border-[#013405]/30 px-4 py-2 text-xs font-extrabold tracking-[0.04em] text-[#013405] transition-colors hover:bg-[#013405]/5"
          >
            CANCEL
          </button>
          <button
            type="button"
            disabled={isPending || request?.emailVerified !== true}
            onClick={handlePrimary}
            className="bg-[#013405] px-4 py-2 text-xs font-extrabold tracking-[0.04em] text-[#FFF8E7] transition-colors hover:bg-[#064A12] disabled:opacity-50"
          >
            {getConfirmLabel(isPending, isConfirming)}
          </button>
        </DialogFooter>

        {request && !request.emailVerified && (
          <p className="text-[12.5px] leading-relaxed text-[#A51919]">
            This account has not confirmed its email address. Ask them to enter
            the code already sent to {request.email}, then review again.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};
