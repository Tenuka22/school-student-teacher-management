"use client";

import {
  MATERNITY_FULL_PAY_DAYS,
  MATERNITY_HALF_PAY_DAYS,
} from "@school-student-teacher-management/db/constants/leave";
import {
  DEFAULT_PRIMARY_PERIOD_RANGE,
  DEFAULT_SECONDARY_PERIOD_RANGE,
} from "@school-student-teacher-management/db/periods";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { DatePicker } from "@/components/date-picker";
import { orpc } from "@/utils/orpc";

const LEAVE_TYPES = [
  { value: "annual", label: "Annual" },
  { value: "casual", label: "Casual" },
  { value: "medical", label: "Medical" },
  { value: "maternity", label: "Maternity" },
  { value: "duty", label: "Official Duty" },
  { value: "other", label: "Other" },
] as const;

interface ApplyLeaveFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}

interface FormState {
  type: string;
  startDate: string;
  endDate: string;
  dayPart: "full" | "morning" | "afternoon";
  maternityPaymentStatus: "paid" | "halfPay";
  reason: string;
}

const EMPTY_FORM: FormState = {
  type: "",
  startDate: "",
  endDate: "",
  dayPart: "full",
  maternityPaymentStatus: "paid",
  reason: "",
};

export const ApplyLeaveForm = ({
  open,
  onOpenChange,
  onApplied,
}: ApplyLeaveFormProps) => {
  const queryClient = useQueryClient();
  const academicYearsQuery = useQuery(
    orpc.staff.listAcademicYears.queryOptions()
  );
  const currentYear = academicYearsQuery.data?.find(
    (academicYear) => academicYear.isCurrent
  );
  const policyQuery = useQuery({
    ...orpc.staff.attendance.getPolicy.queryOptions({
      input: { academicYearId: currentYear?.id ?? "" },
    }),
    enabled: Boolean(currentYear?.id),
  });
  const policy = policyQuery.data?.policy;
  const primaryRange = {
    startPeriodNumber:
      policy?.primaryStartPeriodNumber ??
      DEFAULT_PRIMARY_PERIOD_RANGE.startPeriodNumber,
    endPeriodNumber:
      policy?.primaryEndPeriodNumber ??
      DEFAULT_PRIMARY_PERIOD_RANGE.endPeriodNumber,
  };
  const secondaryRange = {
    startPeriodNumber:
      policy?.secondaryStartPeriodNumber ??
      DEFAULT_SECONDARY_PERIOD_RANGE.startPeriodNumber,
    endPeriodNumber:
      policy?.secondaryEndPeriodNumber ??
      DEFAULT_SECONDARY_PERIOD_RANGE.endPeriodNumber,
  };
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});

  const applyMutation = useMutation(
    orpc.staff.leaves.applyLeave.mutationOptions({
      onSuccess: async () => {
        toast.success(
          "Leave request submitted — awaiting Deputy Principal recommendation"
        );
        setForm(EMPTY_FORM);
        onOpenChange(false);
        onApplied();
        await queryClient.invalidateQueries({
          queryKey: orpc.staff.leaves.listMyLeaves.queryOptions({ input: {} })
            .queryKey,
        });
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );

  const setField = <K extends keyof FormState>(
    field: K,
    value: FormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const nextErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.type) {
      nextErrors.type = "Select a leave type";
    }
    if (!form.startDate) {
      nextErrors.startDate = "Pick the first day of leave";
    }
    if (!form.endDate) {
      nextErrors.endDate = "Pick the last day of leave";
    }
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      nextErrors.endDate = "End date cannot be before the start date";
    }
    if (form.dayPart !== "full" && form.startDate !== form.endDate) {
      nextErrors.dayPart = "Half-day leave must use one date";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    applyMutation.mutate({
      type: form.type as (typeof LEAVE_TYPES)[number]["value"],
      startDate: form.startDate,
      endDate: form.endDate,
      dayPart: form.dayPart,
      paymentStatus:
        form.type === "maternity"
          ? form.maternityPaymentStatus
          : "notApplicable",
      reason: form.reason.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply for Leave</DialogTitle>
          <DialogDescription>
            Your request goes to the Deputy Principal for recommendation, then
            to the Principal for the final decision. You&apos;ll see the outcome
            in &quot;My Leave&quot;.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FieldGroup>
            <Field>
              <FieldLabel>Leave type *</FieldLabel>
              <Select
                value={form.type}
                onValueChange={(value: string | null) => {
                  if (value) {
                    setField("type", value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {LEAVE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {errors.type && <FieldError>{errors.type}</FieldError>}
            </Field>

            {form.type === "maternity" && (
              <Field>
                <FieldLabel htmlFor="maternity-payment">
                  Maternity payment
                </FieldLabel>
                <Select
                  value={form.maternityPaymentStatus}
                  onValueChange={(value: string | null) => {
                    if (value === "paid" || value === "halfPay") {
                      setField("maternityPaymentStatus", value);
                    }
                  }}
                >
                  <SelectTrigger id="maternity-payment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="paid">
                        Full pay — {MATERNITY_FULL_PAY_DAYS} days
                      </SelectItem>
                      <SelectItem value="halfPay">
                        Half pay — {MATERNITY_HALF_PAY_DAYS} days
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  The College grants {MATERNITY_FULL_PAY_DAYS} days of maternity
                  leave on full pay and a further {MATERNITY_HALF_PAY_DAYS} days
                  at half pay, per person. Each has its own quota, counted
                  against approved leave in this academic year.
                </FieldDescription>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="leave-start">From *</FieldLabel>
                <DatePicker
                  id="leave-start"
                  value={form.startDate}
                  onChange={(isoDate) => setField("startDate", isoDate)}
                />
                {errors.startDate && (
                  <FieldError>{errors.startDate}</FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="leave-end">To *</FieldLabel>
                <DatePicker
                  id="leave-end"
                  value={form.endDate}
                  onChange={(isoDate) => setField("endDate", isoDate)}
                />
                <FieldDescription>
                  Same as &quot;From&quot; for one day
                </FieldDescription>
                {errors.endDate && <FieldError>{errors.endDate}</FieldError>}
              </Field>
            </div>

            <Field>
              <FieldLabel>Duration *</FieldLabel>
              <Select
                value={form.dayPart}
                onValueChange={(value: string | null) => {
                  if (
                    value === "full" ||
                    value === "morning" ||
                    value === "afternoon"
                  ) {
                    setField("dayPart", value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="full">Full day</SelectItem>
                    <SelectItem value="morning">
                      {`First half — Primary (P${primaryRange.startPeriodNumber}–P${primaryRange.endPeriodNumber})`}
                    </SelectItem>
                    <SelectItem value="afternoon">
                      {`Second half — Secondary (P${secondaryRange.startPeriodNumber}–P${secondaryRange.endPeriodNumber})`}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                Half-days have no monthly allowance. Two approved half-days
                count as one full leave day; the third is recorded as a half
                day.
              </FieldDescription>
              {errors.dayPart && <FieldError>{errors.dayPart}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="leave-reason">Reason</FieldLabel>
              <Textarea
                id="leave-reason"
                value={form.reason}
                onChange={(e) => setField("reason", e.target.value)}
                rows={3}
                placeholder="e.g. Family wedding out of town"
              />
            </Field>
          </FieldGroup>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={applyMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={applyMutation.isPending}>
              {applyMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
