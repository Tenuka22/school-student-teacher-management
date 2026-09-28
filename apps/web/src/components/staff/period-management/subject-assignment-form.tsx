"use client";

import {
  Field,
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
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import * as v from "valibot";

import { RequiredMark } from "@/components/ui-patterns/required-mark";
import { errorId, fieldA11y } from "@/lib/field-a11y";
import { orpc } from "@/utils/orpc";

interface Subject {
  subjectKey: string;
  gradeLevel: number;
}

interface SubjectAssignmentFormProps {
  formId: string;
  gradeLevel: number;
  dayOfWeek: number;
  periodNumber: number;
  academicYearId: string | undefined;
  onSubmit: (data: unknown) => Promise<void>;
  isLoading?: boolean;
}

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export const SubjectAssignmentForm = ({
  formId,
  gradeLevel,
  dayOfWeek,
  periodNumber,
  onSubmit,
  isLoading = false,
}: SubjectAssignmentFormProps) => {
  const [formData, setFormData] = useState({
    subjectKey: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState("");

  const subjectsQuery = useQuery(orpc.staff.listSubjects.queryOptions({}));

  const filteredSubjects = useMemo(() => {
    const subjects = subjectsQuery.data as unknown[] | undefined;
    if (!subjects) {
      return [];
    }
    return (subjects as Subject[]).filter((s) => s.gradeLevel === gradeLevel);
  }, [gradeLevel, subjectsQuery.data]);

  const schema = v.object({
    subjectKey: v.pipe(v.string(), v.minLength(1, "Subject is required")),
  });

  const handleChange = (field: string, value: string | null) => {
    if (!value) {
      return;
    }
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setErrors((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field))
    );
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
        error instanceof Error ? error.message : "Failed to add subject"
      );
    }
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

      <div>
        <p className="text-foreground m-0 text-sm font-medium">
          Timetable slot
        </p>
        <p className="text-muted-foreground m-0 mt-1 text-sm">
          {DAY_NAMES[dayOfWeek]} · Period {periodNumber}
        </p>
      </div>

      <Field data-invalid={Boolean(errors.subjectKey)}>
        <FieldLabel htmlFor={`${formId}-subjectKey`}>
          Subject <RequiredMark />
        </FieldLabel>
        <Select
          value={formData.subjectKey}
          onValueChange={(value: string) => {
            if (value) {
              handleChange("subjectKey", value);
            }
          }}
        >
          <SelectTrigger
            {...fieldA11y(`${formId}-subjectKey`, {
              error: errors.subjectKey,
              required: true,
            })}
            disabled={isLoading || filteredSubjects.length === 0}
          >
            <SelectValue placeholder="Select subject" />
          </SelectTrigger>
          <SelectContent>
            {filteredSubjects.map((subject) => (
              <SelectItem key={subject.subjectKey} value={subject.subjectKey}>
                {subject.subjectKey}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.subjectKey && (
          <FieldError id={errorId(`${formId}-subjectKey`)}>
            {errors.subjectKey}
          </FieldError>
        )}
      </Field>
    </form>
  );
};
