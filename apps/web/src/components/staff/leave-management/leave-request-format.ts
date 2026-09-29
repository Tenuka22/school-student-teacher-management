import { humanizeKey } from "@school-student-teacher-management/db/constants/display";
import { countWorkingDays } from "@school-student-teacher-management/db/constants/leave";
import type { LeaveDayPart } from "@school-student-teacher-management/db/schema/leaves";

/**
 * What a leave request is called, how long it is, and how long ago it arrived.
 *
 * One file because the register's table and the review dialog are two views of
 * the same request: a type worded one way in the row and another in the dialog
 * would read as two different kinds of leave, and a "Requested" cell saying
 * "Today" while the dialog says "Yesterday" about the same application is the
 * sort of thing a reviewer notices and then stops trusting.
 *
 * `LEAVE_TYPE_LABELS` is deliberately a `Record<string, string>` with a
 * `humanizeKey` fallback rather than a `Record<LeaveType, string>`: a leave type
 * the College adds next year must render as its own words rather than break the
 * column that shows it.
 */
const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "Annual",
  casual: "Casual",
  duty: "Official Duty",
  maternity: "Maternity",
  medical: "Medical",
  other: "Other",
};

/** The word for a leave type, as the College writes it. */
export const leaveTypeLabel = (type: string): string =>
  LEAVE_TYPE_LABELS[type] ?? humanizeKey(type);

/**
 * Half days, where the *half* is the whole answer.
 *
 * `countWorkingDays` is about whole days, and a morning request is not 0.4 of a
 * day to anybody reading the queue — it is a morning. So only the full-day case
 * asks for a count.
 */
const PARTIAL_DAY_LABELS: Record<Exclude<LeaveDayPart, "full">, string> = {
  afternoon: "Afternoon only",
  morning: "Morning only",
};

/**
 * How much leave is being asked for.
 *
 * Working days rather than calendar days, because a Friday-to-Monday request is
 * one day of cover, not four — the figure a reviewer weighs against the quota.
 * A range with no working day in it says so instead of showing "0", which reads
 * as a missing value rather than as an answer.
 */
export const describeLeaveDays = (
  startDate: string,
  endDate: string,
  dayPart: LeaveDayPart
): string => {
  if (dayPart !== "full") {
    return PARTIAL_DAY_LABELS[dayPart];
  }

  const days = countWorkingDays(startDate, endDate);

  if (days === 0) {
    return "No working days";
  }

  return days === 1 ? "1 working day" : `${days} working days`;
};

/** The two ends of a request on one line; a single day is one date, not one repeated. */
export const formatDateRange = (startDate: string, endDate: string): string =>
  startDate === endDate ? startDate : `${startDate} → ${endDate}`;

/**
 * An exact moment as the College reads one, or `Not recorded` when there is
 * none. A value the date parser does not recognise is returned as it came —
 * an unparseable timestamp should read as itself, not as the epoch.
 */
export const formatDateTime = (value: string | null | undefined): string => {
  if (!value) {
    return "Not recorded";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
};

/**
 * How long ago a request was submitted, in days.
 *
 * Coarse on purpose. Leave is decided in days, so "Today", "Yesterday" and
 * "21 days ago" are the three answers that change what a reviewer does with it,
 * and an hour count would invent a deadline the College has never set. The exact
 * timestamp is still one `title` away for whoever needs it in the log.
 */
export const getRequestedAge = (createdAt: string): string => {
  const created = new Date(createdAt).getTime();

  if (Number.isNaN(created)) {
    return "—";
  }

  const days = Math.floor((Date.now() - created) / 86_400_000);

  if (days <= 0) {
    return "Today";
  }

  if (days === 1) {
    return "Yesterday";
  }

  return `${days} days ago`;
};
