import { LEAVE_PAYMENT_LABELS } from "./leave";

export { LEAVE_PAYMENT_LABELS } from "./leave";

const NOT_APPLICABLE_LABEL = LEAVE_PAYMENT_LABELS.notApplicable;

/**
 * Display names for the leave categories.
 *
 * This map existed four times across the app — the apply form, the teacher's
 * own list, the review card and the teacher dashboard — and one of them missed
 * `duty` entirely, so the historical view printed the raw key `duty` where every
 * other screen said "Official Duty".
 */
export const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "Annual Leave",
  casual: "Casual Leave",
  medical: "Medical Leave",
  maternity: "Maternity Leave",
  duty: "Official Duty",
  other: "Other Leave",
};

/** The word for a leave category, with a readable fallback for a new one. */
export const leaveTypeLabel = (
  leaveType: string | null | undefined
): string => {
  if (!leaveType) {
    return "Leave";
  }

  return (
    LEAVE_TYPE_LABELS[leaveType] ??
    leaveType.charAt(0).toUpperCase() + leaveType.slice(1)
  );
};

/** How a request's payment status reads. */
export const leavePaymentLabel = (
  paymentStatus: string | null | undefined
): string => {
  if (!paymentStatus) {
    return NOT_APPLICABLE_LABEL;
  }

  return (
    LEAVE_PAYMENT_LABELS[paymentStatus as keyof typeof LEAVE_PAYMENT_LABELS] ??
    paymentStatus
  );
};
