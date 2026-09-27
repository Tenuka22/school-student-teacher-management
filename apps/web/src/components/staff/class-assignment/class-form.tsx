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

import { RequiredMark } from "@/components/ui-patterns/required-mark";
import { descriptionId, errorId, fieldA11y } from "@/lib/field-a11y";

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

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState("");

  const schema = initialData
    ? v.pick(classUpdateSchema, ["name", "medium"])
    : v.pick(classInsertSchema, [
        "academicYearId",
        "gradeLevel",
        "name",
        "medium",
      ]);

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = {} as Record<string, string>;
        for (const key of Object.keys(prev)) {
          if (key !== field) {
            newErrors[key] = prev[key];
          }
        }
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setGeneralError("");

    const result = v.safeParse(schema, formData);

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.issues) {
        const path = issue.path?.[0]?.key as string | undefined;
        if (path) {
          fieldErrors[path] = issue.message || "Invalid field";
        }
      }
      setErrors(fieldErrors);
      return;
    }

    try {
      await onSubmit(result.output);
    } catch (error) {
      setGeneralError(
        error instanceof Error ? error.message : "Failed to save class"
      );
    }
  };

  const ids = {
    gradeLevel: `${formId}-gradeLevel`,
    name: `${formId}-name`,
    medium: `${formId}-medium`,
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {generalError && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive p-3 text-sm"
        >
          {generalError}
        </div>
      )}

      {!initialData && (
        <Field data-invalid={Boolean(errors.gradeLevel)}>
          <FieldLabel htmlFor={ids.gradeLevel}>
            Grade <RequiredMark />
          </FieldLabel>
          <Select
            value={formData.gradeLevel.toString()}
            onValueChange={(value) => {
              if (value) {
                handleChange("gradeLevel", Number(value));
              }
            }}
          >
            <SelectTrigger
              {...fieldA11y(ids.gradeLevel, {
                error: errors.gradeLevel,
                required: true,
              })}
              disabled={isLoading}
            >
              <SelectValue placeholder="Select a grade" />
            </SelectTrigger>
            <SelectContent>
              {GRADE_LEVELS.map((grade) => (
                <SelectItem key={grade} value={grade.toString()}>
                  Grade {grade}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.gradeLevel && (
            <FieldError id={errorId(ids.gradeLevel)}>
              {errors.gradeLevel}
            </FieldError>
          )}
        </Field>
      )}

      <Field data-invalid={Boolean(errors.name)}>
        <FieldLabel htmlFor={ids.name}>
          Class name <RequiredMark />
        </FieldLabel>
        <Input
          {...fieldA11y(ids.name, {
            error: errors.name,
            hasDescription: true,
            required: true,
          })}
          placeholder="e.g. 10-A"
          value={formData.name}
          onChange={(e) => handleChange("name", e.target.value)}
          autoComplete="off"
          disabled={isLoading}
        />
        <FieldDescription id={descriptionId(ids.name)}>
          Must be unique within its grade.
        </FieldDescription>
        {errors.name && (
          <FieldError id={errorId(ids.name)}>{errors.name}</FieldError>
        )}
      </Field>

      <Field data-invalid={Boolean(errors.medium)}>
        <FieldLabel htmlFor={ids.medium}>Medium of instruction</FieldLabel>
        <Select
          value={formData.medium}
          onValueChange={(value) => {
            if (value) {
              handleChange("medium", value);
            }
          }}
        >
          <SelectTrigger
            {...fieldA11y(ids.medium, { error: errors.medium })}
            disabled={isLoading}
          >
            <SelectValue placeholder="Select medium" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sinhala">Sinhala</SelectItem>
            <SelectItem value="tamil">Tamil</SelectItem>
            <SelectItem value="english">English</SelectItem>
          </SelectContent>
        </Select>
        {errors.medium && (
          <FieldError id={errorId(ids.medium)}>{errors.medium}</FieldError>
        )}
      </Field>
    </form>
  );
};
