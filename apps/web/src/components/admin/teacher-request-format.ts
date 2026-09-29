/**
 * The two ways a teacher request is dated, in one file because the queue's table
 * and the review dialog have to agree about the same account.
 *
 * Both used to be private to `approve-teacher-dialog.tsx`, so a table column
 * showing "3 days" next to a dialog saying "Today" about the same person was a
 * coin toss. One implementation, two callers.
 */

/** An exact moment as the College reads one, or `Never` when there is none. */
export const formatDateTime = (value: string | null): string => {
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

/**
 * How long somebody has been waiting, in days.
 *
 * Deliberately coarse. The queue is about decisions that take a working day or
 * two, so "Today" and "1 day" are the two answers that change behaviour, and an
 * hour count would suggest a deadline the College has never set. A value the
 * date parser does not recognise reads as an em dash rather than as "Today",
 * because "just now" is the wrong answer for something unparseable.
 */
export const getWaitingFor = (createdAt: string): string => {
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
