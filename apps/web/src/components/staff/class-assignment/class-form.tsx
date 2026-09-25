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

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {generalError && (
        <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
          {generalError}
        </div>
      )}

      {!initialData && (
        <Field>
          <FieldLabel htmlFor={`${formId}-grade`}>Grade Level *</FieldLabel>
          <Select
            value={formData.gradeLevel.toString()}
            onValueChange={(value) => {
              if (value) {
                handleChange("gradeLevel", Number(value));
              }
            }}
          >
            <SelectTrigger
              id={`${formId}-grade`}
              disabled={isLoading}
              data-invalid={errors.gradeLevel ? true : undefined}
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
          {errors.gradeLevel && <FieldError>{errors.gradeLevel}</FieldError>}
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor={`${formId}-name`}>Class Name *</FieldLabel>
        <Input
          id={`${formId}-name`}
          placeholder="e.g., 10-A, Grade 9 Science"
          value={formData.name}
          onChange={(e) => handleChange("name", e.target.value)}
          disabled={isLoading}
          data-invalid={errors.name ? true : undefined}
        />
        <FieldDescription>
          Unique name for this class within its grade
        </FieldDescription>
        {errors.name && <FieldError>{errors.name}</FieldError>}
      </Field>

      <Field>
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
        >
          <SelectTrigger id={`${formId}-medium`} disabled={isLoading}>
            <SelectValue placeholder="Select medium" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sinhala">Sinhala</SelectItem>
            <SelectItem value="tamil">Tamil</SelectItem>
            <SelectItem value="english">English</SelectItem>
          </SelectContent>
        </Select>
        {errors.medium && <FieldError>{errors.medium}</FieldError>}
      </Field>
    </form>
  );
};
