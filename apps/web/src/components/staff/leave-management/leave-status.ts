import { humanizeKey } from "@school-student-teacher-management/db/constants/display";

export type LeaveStatusBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline";

export interface LeaveStatusBadge {
  label: string;
  variant: LeaveStatusBadgeVariant;
}

/**
 * How a leave request's overall status reads.
 *
 * This map existed twice, and both copies indexed it directly:
 * `STATUS_BADGES[request.status].label`. A status the server introduced later
 * would therefore throw during render and blank the whole leave list — an
 * empty-looking page for a teacher whose leave history was perfectly fine.
 * `leaveStatusBadge` looks it up safely instead, showing an unfamiliar status as
 * readable words rather than crashing.
 */
const LEAVE_STATUS_BADGES: Record<string, LeaveStatusBadge> = {
  pending: { label: "Pending", variant: "secondary" },
  recommended: { label: "Recommended (Deputy Principal)", variant: "outline" },
  approved: { label: "Approved (Principal)", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

export const leaveStatusBadge = (status: string | null | undefined) => {
  if (!status) {
    return { label: "Unknown", variant: "outline" } satisfies LeaveStatusBadge;
  }

  return (
    LEAVE_STATUS_BADGES[status] ??
    ({
      label: humanizeKey(status),
      variant: "outline",
    } satisfies LeaveStatusBadge)
  );
};
