import { assertCalendarDate } from "../dates";

/**
 * Default per-year leave quota, seeded for every new academic year.
 *
 * Maternity carries the College's rule: 84 days on full pay, and a further 84
 * days at half pay. The second row used to be `unpaid`, which is a different
 * thing — half pay is still pay, and a teacher reading "unpaid" on their own
 * maternity record would be told the wrong thing about their entitlement.
 */
export const DEFAULT_LEAVE_ENTITLEMENTS = [
  {
    leaveType: "medical",
    paymentStatus: "notApplicable",
    maxDays: 21,
    minDays: 0,
  },
  {
    leaveType: "annual",
    paymentStatus: "notApplicable",
    maxDays: 20,
    minDays: 0,
  },
  {
    leaveType: "casual",
    paymentStatus: "notApplicable",
    maxDays: 20,
    minDays: 0,
  },
  { leaveType: "maternity", paymentStatus: "paid", maxDays: 84, minDays: 0 },
  { leaveType: "maternity", paymentStatus: "halfPay", maxDays: 84, minDays: 0 },
  {
    leaveType: "duty",
    paymentStatus: "notApplicable",
    maxDays: 30,
    minDays: 0,
  },
  {
    leaveType: "other",
    paymentStatus: "notApplicable",
    maxDays: 20,
    minDays: 0,
  },
] as const;

/** Maternity entitlement, stated once so the UI and the seed cannot disagree. */
export const MATERNITY_FULL_PAY_DAYS = 84;
export const MATERNITY_HALF_PAY_DAYS = 84;

export const LEAVE_DAY_PARTS = ["full", "morning", "afternoon"] as const;
export type LeaveDayPart = (typeof LEAVE_DAY_PARTS)[number];

export const LEAVE_PAYMENT_STATUSES = [
  "notApplicable",
  "paid",
  "halfPay",
  "unpaid",
] as const;
export type LeavePaymentStatus = (typeof LEAVE_PAYMENT_STATUSES)[number];

/** How each payment status reads on a request and in an entitlement. */
export const LEAVE_PAYMENT_LABELS: Record<LeavePaymentStatus, string> = {
  notApplicable: "Not applicable",
  paid: "Paid — full pay",
  halfPay: "Half pay",
  unpaid: "Unpaid",
};

const dateAtUtcMidnight = (date: string) => new Date(`${date}T00:00:00Z`);

const DAY_MS = 24 * 60 * 60 * 1000;
const SUNDAY = 0;
const SATURDAY = 6;

/**
 * Every Monday–Friday from `startDate` to `endDate` inclusive, as
 * `YYYY-MM-DD`. Empty when the range is reversed.
 *
 * Throws a `RangeError` on anything that is not a real calendar date: this
 * used to roll `2026-02-30` into March (one day) and turn `2026-13-45` into
 * **zero** days, which let an invalid request through the quota (F-21).
 */
export const listWorkingDates = (
  startDate: string,
  endDate: string
): string[] => {
  assertCalendarDate(startDate);
  assertCalendarDate(endDate);
  const start = dateAtUtcMidnight(startDate).getTime();
  const end = dateAtUtcMidnight(endDate).getTime();

  const dates: string[] = [];
  for (let time = start; time <= end; time += DAY_MS) {
    const date = new Date(time);
    const day = date.getUTCDay();
    if (day !== SUNDAY && day !== SATURDAY) {
      dates.push(date.toISOString().slice(0, 10));
    }
  }
  return dates;
};

export const countWorkingDays = (startDate: string, endDate: string) =>
  listWorkingDates(startDate, endDate).length;

export const calculateLeaveDays = (
  startDate: string,
  endDate: string,
  dayPart: LeaveDayPart
) => {
  if (dayPart === "full") {
    return countWorkingDays(startDate, endDate);
  }

  assertCalendarDate(startDate);
  assertCalendarDate(endDate);
  return startDate === endDate ? 0.5 : 0;
};
