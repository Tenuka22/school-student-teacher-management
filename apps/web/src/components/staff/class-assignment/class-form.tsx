"use client";

import { GRADE_LEVELS } from "@school-student-teacher-management/db/constants/grades";
import {
  classInsertSchema,
  classUpdateSchema,
} from "@school-student-teacher-management/db/schema/academics";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { useState } from "react";
import * as v from "valibot";

import { formatApiErrorMessage, validationFieldErrors } from "@/lib/api-error";

type ClassFieldName = "gradeLevel" | "name" | "medium";
type FieldErrors = Partial<Record<ClassFieldName, string>>;

const ALL_FIELDS: ClassFieldName[] = ["gradeLevel", "name", "medium"];

interface ClassFormProps {
  formId: string;
  academicYearId: string;
  onSubmit: (data: unknown) => Promise<void>;
  isLoading?: boolean;
  initialData?: {
    id: string;
    academicYearId: string;
    gradeLevel: number;
    name: string;
    medium: string;
    homeroomTeacherId?: string | null;
  };
}

const focusField = (formId: string, field: ClassFieldName) => {
  const element = document.querySelector<HTMLElement>(
    `#${CSS.escape(`${formId}-${field}`)}`
  );
  element?.focus();
};

/**
 * Move the caret to the first control anybody objected to.
 *
 * A form that renders its errors and leaves the caret wherever it was has told
 * the user what is wrong and then hidden it: the next thing a screen reader
 * announces is whatever the field after the failure happens to be. Ordered by
 * tab position, so the caret lands where reading would have gone anyway.
 */
const focusFirstError = (formId: string, errors: FieldErrors) => {
  const firstInvalid = ALL_FIELDS.find((field) => errors[field]);
  if (firstInvalid) {
    requestAnimationFrame(() => focusField(formId, firstInvalid));
  }
};

/** Keep every error except the one whose field has just been corrected. */
const withoutField = (
  errors: FieldErrors,
  field: ClassFieldName
): FieldErrors => {
  const next: FieldErrors = {};
  for (const name of ALL_FIELDS) {
    const message = errors[name];
    if (name !== field && message) {
      next[name] = message;
    }
  }
  return next;
};

/**
 * Put the server's objections back on the fields they belong to.
 *
 * The class-name uniqueness constraint lives in the database, so the client
 * schema cannot know about it and a duplicate name arrives as a refusal. A
 * refusal that only reaches a toast is a refusal attached to nothing.
 */
const serverFieldErrors = (error: unknown): FieldErrors => {
  const issues = validationFieldErrors<ClassFieldName>(error);
  const mapped: FieldErrors = {};
  for (const field of ALL_FIELDS) {
    const message = issues[field];
    if (message) {
      mapped[field] = message;
    }
  }
  return mapped;
};

const schemaFieldErrors = (
  issues: readonly v.BaseIssue<unknown>[]
): FieldErrors => {
  const mapped: FieldErrors = {};
  for (const issue of issues) {
    const path = issue.path?.[0]?.key as ClassFieldName | undefined;
    if (path && !mapped[path]) {
      mapped[path] = issue.message || "Invalid value";
    }
  }
  return mapped;
};

/**
 * `aria-invalid`, or nothing at all.
 *
 * The base-lyra controls style themselves from `aria-invalid` and not from a
 * `data-invalid` attribute, so the earlier `data-invalid` on these inputs drew
 * a red message with a control that looked perfectly valid — the error text
 * without the error state.
 */
const ariaInvalid = (message?: string) => (message ? true : undefined);

/** The message under a field, or nothing. */
const FieldMessage = ({ id, message }: { id: string; message?: string }) =>
  message ? <FieldError id={id}>{message}</FieldError> : null;

export const ClassForm = ({
  formId,
  academicYearId,
  onSubmit,
  isLoading = false,
  initialData,
}: ClassFormProps) => {
  const [formData, setFormData] = useState({
    academicYearId: initialData?.academicYearId || academicYearId,
    gradeLevel: initialData?.gradeLevel || "",
    name: initialData?.name || "",
    medium: initialData?.medium || "sinhala",
  });

  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState("");
  /**
   * The parent disables the submit button from its own mutation state, which
   * arrives a tick after the click. Without this the same form can be submitted
   * twice inside one frame, and class names are unique within a grade — so the
   * second write is a constraint violation surfacing as a confusing error after
   * a success toast.
   */
  const [isSubmitting, setIsSubmitting] = useState(false);

  const schema = initialData
    ? v.pick(classUpdateSchema, ["name", "medium"])
    : v.pick(classInsertSchema, [
        "academicYearId",
        "gradeLevel",
        "name",
        "medium",
      ]);

  const isBusy = isLoading || isSubmitting;

  const reportErrors = (fieldErrors: FieldErrors) => {
    setErrors(fieldErrors);
    focusFirstError(formId, fieldErrors);
  };

  const handleChange = (field: ClassFieldName, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (errors[field]) {
      setErrors(withoutField(errors, field));
    }
  };

  const describedBy = (field: ClassFieldName, ...extra: string[]) =>
    [...extra, errors[field] ? `${formId}-${field}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy) {
      return;
    }
    setErrors({});
    setGeneralError("");

    const result = v.safeParse(schema, formData);
    if (!result.success) {
      reportErrors(schemaFieldErrors(result.issues));
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(result.output);
    } catch (error) {
      const fieldErrors = serverFieldErrors(error);
      if (Object.keys(fieldErrors).length > 0) {
        reportErrors(fieldErrors);
      } else {
        setGeneralError(
          formatApiErrorMessage(error, "The class could not be saved.")
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
        {!initialData && (
          <Field data-invalid={Boolean(errors.gradeLevel)}>
            <FieldLabel htmlFor={`${formId}-grade`}>
              Grade Level <span aria-hidden="true">*</span>
            </FieldLabel>
            <Select
              // `null` is Base UI's "nothing selected". An empty string reads
              // as a real option with no label, which is why the placeholder
              // never appeared on a fresh form.
              value={
                formData.gradeLevel === "" ? null : String(formData.gradeLevel)
              }
              onValueChange={(value) => {
                handleChange("gradeLevel", value ? Number(value) : "");
              }}
              disabled={isBusy}
            >
              <SelectTrigger
                id={`${formId}-grade`}
                aria-required="true"
                aria-invalid={ariaInvalid(errors.gradeLevel)}
                aria-describedby={describedBy("gradeLevel")}
              >
                <SelectValue placeholder="Select a grade" />
              </SelectTrigger>
              <SelectContent>
                {GRADE_LEVELS.map((grade) => (
                  <SelectItem key={grade} value={String(grade)}>
                    Grade {grade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldMessage
              id={`${formId}-gradeLevel-error`}
              message={errors.gradeLevel}
            />
          </Field>
        )}

        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor={`${formId}-name`}>
            Class Name <span aria-hidden="true">*</span>
          </FieldLabel>
          <Input
            id={`${formId}-name`}
            placeholder="e.g. 10-A, Grade 9 Science"
            value={formData.name}
            onChange={(e) => handleChange("name", e.target.value)}
            disabled={isBusy}
            aria-required="true"
            aria-invalid={ariaInvalid(errors.name)}
            aria-describedby={describedBy("name", `${formId}-name-description`)}
          />
          <FieldDescription id={`${formId}-name-description`}>
            Unique name for this class within its grade
          </FieldDescription>
          <FieldMessage id={`${formId}-name-error`} message={errors.name} />
        </Field>

        <Field data-invalid={Boolean(errors.medium)}>
          <FieldLabel htmlFor={`${formId}-medium`}>
            Medium of Instruction
          </FieldLabel>
          <Select
            value={formData.medium}
            onValueChange={(value) => {
              if (value) {
                handleChange("medium", value);
              }
            }}
            disabled={isBusy}
          >
            <SelectTrigger
              id={`${formId}-medium`}
              aria-invalid={ariaInvalid(errors.medium)}
              aria-describedby={describedBy("medium")}
            >
              <SelectValue placeholder="Select medium" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sinhala">Sinhala</SelectItem>
              <SelectItem value="tamil">Tamil</SelectItem>
              <SelectItem value="english">English</SelectItem>
            </SelectContent>
          </Select>
          <FieldMessage id={`${formId}-medium-error`} message={errors.medium} />
        </Field>
      </FieldGroup>
    </form>
  );
};
