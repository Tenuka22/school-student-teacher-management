import { humanizeKey } from "@school-student-teacher-management/db/constants/display";

/**
 * Mirrors the `Badge` variants this screen can draw. Pending and recommended are
 * the two states a reviewer acts on, so they carry the shared `warning` and
 * `success` fills rather than bespoke class names — the fill and its ink were
 * measured once, in `badge.tsx`, and are not re-derived here.
 */
export type LeaveStatusBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "ghost"
  | "success"
  | "warning";

/**
 * Icon key for a status, resolved to a component by whichever screen draws it.
 *
 * A status must never be carried by colour alone: a colourblind approver
 * scanning a queue of forty requests has to be able to tell "waiting on me"
 * from "done" from "declined" without decoding a hue. So every status has its
 * own glyph here as well as its own label, and `cancelled` is struck through as
 * well as greyed.
 */
export type LeaveStatusIcon =
  | "clock"
  | "circle-check"
  | "rosette-check"
  | "circle-x"
  | "ban"
  | "circle-dot";

export interface LeaveStatusBadge {
  /** The words on the badge. Never abbreviated to a state nobody can read. */
  label: string;
  variant: LeaveStatusBadgeVariant;
  /** A distinct glyph per status — see `LeaveStatusIcon`. */
  icon: LeaveStatusIcon;
  /**
   * The one non-colour difference between two statuses that share a fill.
   * Kept as a plain class string so this module stays free of JSX.
   */
  className: string;
  /**
   * The sentence behind the label, exposed as the badge's accessible name so
   * a screen reader hears "Pending — no Deputy Principal decision yet" rather
   * than a bare "Pending" with no idea who owes the next move.
   */
  description: string;
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
 *
 * The fills come from the shared `Badge` variants and nothing is tinted here:
 * `warning` is `--warning-ink` on `--accent/20` and `success` is `--success` on
 * `--success/10`, both measured in `badge.tsx` against `--card`.
 */
const LEAVE_STATUS_BADGES: Record<string, LeaveStatusBadge> = {
  pending: {
    label: "Pending",
    variant: "warning",
    icon: "clock",
    className: "",
    description: "Pending — no Deputy Principal decision yet",
  },
  recommended: {
    label: "Recommended (Deputy Principal)",
    variant: "success",
    icon: "circle-check",
    className: "",
    description: "Recommended by the Deputy Principal — awaiting the Principal",
  },
  approved: {
    label: "Approved (Principal)",
    variant: "default",
    icon: "rosette-check",
    className: "",
    description: "Approved by the Principal — final",
  },
  rejected: {
    label: "Rejected",
    variant: "destructive",
    icon: "circle-x",
    className: "",
    description: "Rejected — not granted",
  },
  cancelled: {
    label: "Cancelled",
    variant: "ghost",
    icon: "ban",
    className: "line-through",
    description: "Cancelled by the teacher — withdrawn, never decided",
  },
};

/** A status this build does not know, drawn neutrally rather than crashed on. */
const UNKNOWN_STATUS_BADGE: LeaveStatusBadge = {
  label: "Unknown",
  variant: "ghost",
  icon: "circle-dot",
  className: "",
  description: "Status not recognised by this screen",
};

export const leaveStatusBadge = (
  status: string | null | undefined
): LeaveStatusBadge => {
  if (!status) {
    return { ...UNKNOWN_STATUS_BADGE };
  }

  return (
    LEAVE_STATUS_BADGES[status] ?? {
      ...UNKNOWN_STATUS_BADGE,
      label: humanizeKey(status),
    }
  );
};
