"use client";

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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { DatePicker } from "@/components/date-picker";
import { RequiredMark } from "@/components/ui-patterns/required-mark";
import { errorId, fieldA11y } from "@/lib/field-a11y";
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
  reason: string;
}

const EMPTY_FORM: FormState = {
  type: "",
  startDate: "",
  endDate: "",
  reason: "",
};

export const ApplyLeaveForm = ({
  open,
  onOpenChange,
  onApplied,
}: ApplyLeaveFormProps) => {
  const queryClient = useQueryClient();
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

  const setField = (field: keyof FormState, value: string) => {
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

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    applyMutation.mutate({
      type: form.type as (typeof LEAVE_TYPES)[number]["value"],
      startDate: form.startDate,
      endDate: form.endDate,
      reason: form.reason.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply for leave</DialogTitle>
          <DialogDescription>
            Your request goes to the Deputy Principal for recommendation, then
            to the Principal for the final decision. You&apos;ll see the outcome
            in &quot;My Leave&quot;.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FieldGroup>
            <Field data-invalid={Boolean(errors.type)}>
              <FieldLabel htmlFor="leave-type">
                Leave type <RequiredMark />
              </FieldLabel>
              <Select
                value={form.type}
                onValueChange={(value: string | null) => {
                  if (value) {
                    setField("type", value);
                  }
                }}
              >
                <SelectTrigger
                  {...fieldA11y("leave-type", {
                    error: errors.type,
                    required: true,
                  })}
                >
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && (
                <FieldError id={errorId("leave-type")}>
                  {errors.type}
                </FieldError>
              )}
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.startDate)}>
                <FieldLabel htmlFor="leave-start">
                  From <RequiredMark />
                </FieldLabel>
                <DatePicker
                  id="leave-start"
                  value={form.startDate}
                  onChange={(isoDate) => setField("startDate", isoDate)}
                />
                {errors.startDate && (
                  <FieldError>{errors.startDate}</FieldError>
                )}
              </Field>
              <Field data-invalid={Boolean(errors.endDate)}>
                <FieldLabel htmlFor="leave-end">
                  To <RequiredMark />
                </FieldLabel>
                <DatePicker
                  id="leave-end"
                  value={form.endDate}
                  onChange={(isoDate) => setField("endDate", isoDate)}
                />
                <FieldDescription>
                  Use the same date as &quot;From&quot; for a single day.
                </FieldDescription>
                {errors.endDate && <FieldError>{errors.endDate}</FieldError>}
              </Field>
            </div>

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

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={applyMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={applyMutation.isPending}>
              {applyMutation.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
