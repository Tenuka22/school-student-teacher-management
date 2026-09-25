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

export const countWorkingDays = (startDate: string, endDate: string) => {
  const start = dateAtUtcMidnight(startDate);
  const end = dateAtUtcMidnight(endDate);
  const dayMs = 24 * 60 * 60 * 1000;
  const dayCount = Math.max(
    0,
    Math.floor((end.getTime() - start.getTime()) / dayMs) + 1
  );

  const dates = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date;
  });
  let count = 0;
  for (const date of dates) {
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) {
      count += 1;
    }
  }

  return count;
};

export const calculateLeaveDays = (
  startDate: string,
  endDate: string,
  dayPart: LeaveDayPart
) => {
  if (dayPart === "full") {
    return countWorkingDays(startDate, endDate);
  }

  return startDate === endDate ? 0.5 : 0;
};
