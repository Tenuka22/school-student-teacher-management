/**
 * Calendar dates as this app stores them: `YYYY-MM-DD` text.
 *
 * JavaScript's `Date` is permissive — `new Date("2026-02-30")` is 2 March and
 * `new Date("2026-13-45")` is `Invalid Date` — so a format regex alone let
 * both through, and `calculateLeaveDays` then counted the first as one day and
 * the second as **zero**, which is a quota bypass (forensic audit F-21). A
 * date is valid here only if it survives a round trip through UTC unchanged.
 */

const ISO_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/u;

/** True for a real calendar date in `YYYY-MM-DD` form (leap years included). */
export const isCalendarDate = (value: string): boolean => {
  if (!ISO_DATE_SHAPE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

/**
 * The school's time zone. Sri Lanka has one zone, no daylight saving.
 */
export const SCHOOL_TIME_ZONE = "Asia/Colombo";

const SCHOOL_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHOOL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Today's date at the school, as `YYYY-MM-DD` (forensic audit F-20).
 *
 * "Today" used to be the UTC date in some places and the server's local date
 * in others. Colombo is UTC+05:30, so from midnight to 05:30 every UTC "today"
 * was yesterday at the school, and a server not on Colombo time disagreed
 * with both. The school day is the one that matters to a register, a due
 * date or a monthly allowance, so it is computed here, explicitly.
 */
export const schoolToday = (now: Date = new Date()): string =>
  SCHOOL_DATE_FORMAT.format(now);

/** Throws a `RangeError` naming the value unless it is a real calendar date. */
export const assertCalendarDate = (value: string): void => {
  if (!isCalendarDate(value)) {
    throw new RangeError(`Not a calendar date: ${value}`);
  }
};
