"use client";

import { TEACHER_REASSIGNMENT_REASONS } from "@school-student-teacher-management/db/constants/teachers";
import { staffIdSchema } from "@school-student-teacher-management/db/schema/staff";
import {
  Field,
  FieldDescription,
  FieldError,
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
import { useState } from "react";
import * as v from "valibot";

import { TeacherCombobox } from "@/components/staff/class-assignment/teacher-combobox";

interface AssignTeacherFormProps {
  formId: string;
  currentTeacherId?: string | null;
  onSubmit: (data: unknown) => Promise<void>;
  isLoading?: boolean;
}

type ChangeKind = "assigned" | "replaced" | "cleared" | "none";

const resolveChangeKind = (
  currentTeacherId: string,
  nextTeacherId: string
): ChangeKind => {
  if (currentTeacherId === nextTeacherId) {
    return "none";
  }
  if (currentTeacherId && !nextTeacherId) {
    return "cleared";
  }
  if (currentTeacherId && nextTeacherId) {
    return "replaced";
  }
  return "assigned";
};

const CHANGE_KIND_COPY: Record<
  Exclude<ChangeKind, "none">,
  { title: string; description: string }
> = {
  assigned: {
    title: "New assignment",
    description: "This class currently has no homeroom teacher.",
  },
  replaced: {
    title: "Replacing the current teacher",
    description:
      "A reason is required whenever an existing teacher is swapped out mid-year.",
  },
  cleared: {
    title: "Clearing the current teacher",
    description:
      "A reason is required whenever an existing assignment is removed.",
  },
};

export const AssignTeacherForm = ({
  formId,
  currentTeacherId,
  onSubmit,
  isLoading = false,
}: AssignTeacherFormProps) => {
  const [homeroomTeacherId, setHomeroomTeacherId] = useState(
    currentTeacherId || ""
  );
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState("");

  const changeKind = resolveChangeKind(
    currentTeacherId || "",
    homeroomTeacherId
  );
  const requiresReason = changeKind === "replaced" || changeKind === "cleared";

  const schema = v.object({
    homeroomTeacherId: v.union([staffIdSchema, v.literal("")]),
    reason: requiresReason
      ? v.picklist(Object.keys(TEACHER_REASSIGNMENT_REASONS))
      : v.optional(v.string()),
    note: v.optional(v.string()),
  });

  const handleTeacherChange = (value: string) => {
    setHomeroomTeacherId(value);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.homeroomTeacherId;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setGeneralError("");

    const submitData = {
      homeroomTeacherId: homeroomTeacherId || null,
      reason: requiresReason ? reason : undefined,
      note: note.trim() || undefined,
    };

    const result = v.safeParse(schema, {
      homeroomTeacherId: homeroomTeacherId || "",
      reason: requiresReason ? reason : undefined,
      note: note.trim() || undefined,
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.issues) {
        const path = issue.path?.[0]?.key as string | undefined;
        if (path) {
          fieldErrors[path] =
            path === "reason"
              ? "Select a reason"
              : issue.message || "Invalid field";
        }
      }
      setErrors(fieldErrors);
      return;
    }

    try {
      await onSubmit(submitData);
    } catch (error) {
      setGeneralError(
        error instanceof Error ? error.message : "Failed to assign teacher"
      );
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {generalError && (
        <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
          {generalError}
        </div>
      )}

      <Field>
        <FieldLabel htmlFor="teacher">Class Teacher</FieldLabel>
        <TeacherCombobox
          id="teacher"
          value={homeroomTeacherId}
          onValueChange={handleTeacherChange}
          disabled={isLoading}
        />
        <FieldDescription>
          Clear the field to unassign the current teacher.
        </FieldDescription>
        {errors.homeroomTeacherId && (
          <FieldError>{errors.homeroomTeacherId}</FieldError>
        )}
      </Field>

      {changeKind !== "none" && (
        <div className="bg-accent/10 border-accent/30 border p-3 text-sm">
          <p className="font-semibold">{CHANGE_KIND_COPY[changeKind].title}</p>
          <p className="text-muted-foreground">
            {CHANGE_KIND_COPY[changeKind].description}
          </p>
        </div>
      )}

      {requiresReason && (
        <Field data-invalid={!!errors.reason}>
          <FieldLabel htmlFor="reassignment-reason">Reason</FieldLabel>
          <Select
            value={reason}
            onValueChange={(nextReason) => setReason(nextReason ?? "")}
          >
            <SelectTrigger
              id="reassignment-reason"
              disabled={isLoading}
              data-invalid={errors.reason ? true : undefined}
            >
              <SelectValue placeholder="Select a reason" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TEACHER_REASSIGNMENT_REASONS).map(
                ([key, { label }]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
          {errors.reason && <FieldError>{errors.reason}</FieldError>}
        </Field>
      )}

      {changeKind !== "none" && (
        <Field>
          <FieldLabel htmlFor="reassignment-note">Note (optional)</FieldLabel>
          <Textarea
            id="reassignment-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Any additional context for this change..."
            disabled={isLoading}
            rows={3}
          />
        </Field>
      )}
    </form>
  );
};
