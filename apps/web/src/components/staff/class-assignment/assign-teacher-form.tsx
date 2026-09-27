"use client";

import { TEACHER_REASSIGNMENT_REASONS } from "@school-student-teacher-management/db/constants/teachers";
import { staffIdSchema } from "@school-student-teacher-management/db/schema/staff";
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
import { useState } from "react";
import * as v from "valibot";

import { TeacherCombobox } from "@/components/staff/class-assignment/teacher-combobox";
import { formatApiErrorMessage, validationFieldErrors } from "@/lib/api-error";

interface AssignTeacherFormProps {
  formId: string;
  currentTeacherId?: string | null;
  academicYearId?: string;
  onSubmit: (data: unknown) => Promise<void>;
  isLoading?: boolean;
}

type ChangeKind = "assigned" | "replaced" | "cleared" | "none";
type TeacherFieldName = "homeroomTeacherId" | "reason" | "note";
type FieldErrors = Partial<Record<TeacherFieldName, string>>;

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

const focusField = (formId: string, field: TeacherFieldName) => {
  const element = document.querySelector<HTMLElement>(
    `#${CSS.escape(`${formId}-${field === "homeroomTeacherId" ? "teacher" : "reason"}`)}`
  );
  element?.focus();
};

/**
 * Caret to the first control anybody objected to.
 *
 * The reason select only exists once a teacher has actually been changed, so
 * the order is the tab order rather than a fixed list — and the id the reason
 * field carries is derived from `formId`, never a literal.
 */
const focusFirstError = (formId: string, errors: FieldErrors) => {
  const firstInvalid = (["homeroomTeacherId", "reason"] as const).find(
    (field) => errors[field]
  );
  if (firstInvalid) {
    requestAnimationFrame(() => focusField(formId, firstInvalid));
  }
};

const schemaFieldErrors = (
  issues: readonly v.BaseIssue<unknown>[]
): FieldErrors => {
  const mapped: FieldErrors = {};
  for (const issue of issues) {
    const path = issue.path?.[0]?.key as TeacherFieldName | undefined;
    if (path && !mapped[path]) {
      mapped[path] =
        path === "reason"
          ? "Select a reason"
          : (issue.message ?? "Invalid value");
    }
  }
  return mapped;
};

const serverFieldErrors = (error: unknown): FieldErrors => {
  const issues = validationFieldErrors<TeacherFieldName>(error);
  const mapped: FieldErrors = {};
  for (const field of ["homeroomTeacherId", "reason", "note"] as const) {
    const message = issues[field];
    if (message) {
      mapped[field] = message;
    }
  }
  return mapped;
};

export const AssignTeacherForm = ({
  formId,
  currentTeacherId,
  academicYearId,
  onSubmit,
  isLoading = false,
}: AssignTeacherFormProps) => {
  const [homeroomTeacherId, setHomeroomTeacherId] = useState(
    currentTeacherId || ""
  );
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const changeKind = resolveChangeKind(
    currentTeacherId || "",
    homeroomTeacherId
  );
  const requiresReason = changeKind === "replaced" || changeKind === "cleared";

  /**
   * Ids are namespaced by `formId`, not fixed strings.
   *
   * All three class dialogs are mounted at once in `ClassDialogs`, and
   * `id="teacher"` / `id="reassignment-note"` meant a second instance in the
   * same document would point its label at whichever one rendered last — the
   * label and the control silently describing different fields.
   */
  const teacherId = `${formId}-teacher`;
  const reasonId = `${formId}-reason`;
  const noteId = `${formId}-note`;
  const teacherDescriptionId = `${teacherId}-description`;
  const reasonErrorId = `${reasonId}-error`;

  const isBusy = isLoading || isSubmitting;

  const schema = v.object({
    homeroomTeacherId: v.union([staffIdSchema, v.literal("")]),
    reason: requiresReason
      ? v.picklist(Object.keys(TEACHER_REASSIGNMENT_REASONS))
      : v.optional(v.string()),
    note: v.optional(v.string()),
  });

  const reportErrors = (fieldErrors: FieldErrors) => {
    setErrors(fieldErrors);
    focusFirstError(formId, fieldErrors);
  };

  const handleTeacherChange = (value: string) => {
    setHomeroomTeacherId(value);
    if (errors.homeroomTeacherId) {
      const next = { ...errors };
      setErrors({ reason: next.reason });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy) {
      return;
    }
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
      reportErrors(schemaFieldErrors(result.issues));
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(submitData);
    } catch (error) {
      // The server knows things the schema cannot: whether the teacher holds a
      // post in this year at all, and whether a reason is owed.
      const fieldErrors = serverFieldErrors(error);
      if (Object.keys(fieldErrors).length > 0) {
        reportErrors(fieldErrors);
      } else {
        setGeneralError(
          formatApiErrorMessage(
            error,
            "The homeroom teacher could not be assigned."
          )
        );
      }
    }
    setIsSubmitting(false);
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6" noValidate>
      {generalError && (
        <div
          role="alert"
          className="text-destructive border-destructive/40 bg-destructive/10 rounded-none border px-3 py-2 text-sm font-semibold"
        >
          {generalError}
        </div>
      )}

      <FieldGroup>
        <Field data-invalid={Boolean(errors.homeroomTeacherId)}>
          <FieldLabel htmlFor={teacherId}>Homeroom teacher</FieldLabel>
          <TeacherCombobox
            id={teacherId}
            value={homeroomTeacherId}
            onValueChange={handleTeacherChange}
            disabled={isBusy}
            academicYearId={academicYearId}
            invalid={Boolean(errors.homeroomTeacherId)}
            ariaDescribedBy={teacherDescriptionId}
          />
          <FieldDescription id={teacherDescriptionId}>
            Only staff holding a teaching post in this academic year can be
            assigned. Clear the field to unassign the current teacher.
          </FieldDescription>
          {errors.homeroomTeacherId && (
            <FieldError id={`${teacherId}-error`}>
              {errors.homeroomTeacherId}
            </FieldError>
          )}
        </Field>

        {/*
          Announced rather than merely drawn: this panel appears and disappears
          as the selection changes, and "a reason is now required" is not
          something the person is looking at the moment it becomes true.
        */}
        {changeKind !== "none" && (
          <div
            aria-live="polite"
            className="border-accent/40 bg-accent/10 border px-3 py-2 text-sm"
          >
            <p className="font-semibold">
              {CHANGE_KIND_COPY[changeKind].title}
            </p>
            <p className="text-muted-foreground">
              {CHANGE_KIND_COPY[changeKind].description}
            </p>
          </div>
        )}

        {requiresReason && (
          <Field data-invalid={Boolean(errors.reason)}>
            <FieldLabel htmlFor={reasonId}>
              Reason <span aria-hidden="true">*</span>
            </FieldLabel>
            <Select
              value={reason || null}
              onValueChange={(nextReason) => {
                setReason(nextReason ?? "");
                if (errors.reason) {
                  setErrors({});
                }
              }}
              disabled={isBusy}
            >
              <SelectTrigger
                id={reasonId}
                aria-required="true"
                aria-invalid={errors.reason ? true : undefined}
                aria-describedby={errors.reason ? reasonErrorId : undefined}
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
            {errors.reason && (
              <FieldError id={reasonErrorId}>{errors.reason}</FieldError>
            )}
          </Field>
        )}

        {changeKind !== "none" && (
          <Field>
            <FieldLabel htmlFor={noteId}>Note (optional)</FieldLabel>
            <Textarea
              id={noteId}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any additional context for this change…"
              disabled={isBusy}
              rows={3}
            />
          </Field>
        )}
      </FieldGroup>
    </form>
  );
};
