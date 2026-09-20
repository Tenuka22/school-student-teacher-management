"use client";

import type { staff as staffTable } from "@school-student-teacher-management/db/schema/staff";
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

import { orpc } from "@/utils/orpc";

type Staff = typeof staffTable.$inferSelect;
interface Subject {
  subjectKey: string;
  gradeLevel: number;
}

interface PeriodAssignmentFormProps {
  formId: string;
  staff: Staff[];
  gradeLevel: number;
  dayOfWeek: number;
  periodNumber: number;
  onSubmit: (data: unknown) => Promise<void>;
  isLoading?: boolean;
  initialData?: {
    staffId: string;
    subjectKey: string;
  };
}

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export const PeriodAssignmentForm = ({
  formId,
  staff,
  gradeLevel,
  dayOfWeek,
  periodNumber,
  onSubmit,
  isLoading = false,
  initialData,
}: PeriodAssignmentFormProps) => {
  const [formData, setFormData] = useState({
    staffId: initialData?.staffId || "",
    subjectKey: initialData?.subjectKey || "",
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
    staffId: v.pipe(v.string(), v.minLength(1, "Staff is required")),
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
        error instanceof Error ? error.message : "Failed to assign period"
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
        <FieldLabel>Period</FieldLabel>
        <div className="text-muted-foreground text-sm">
          {DAY_NAMES[dayOfWeek]} - Period {periodNumber}
        </div>
      </Field>

      <Field>
        <FieldLabel htmlFor="staffId">Teacher *</FieldLabel>
        <Select
          value={formData.staffId}
          onValueChange={(value) => {
            if (value) {
              handleChange("staffId", value);
            }
          }}
        >
          <SelectTrigger
            id="staffId"
            disabled={isLoading}
            data-invalid={errors.staffId ? true : undefined}
          >
            <SelectValue placeholder="Select teacher" />
          </SelectTrigger>
          <SelectContent>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.staffId && <FieldError>{errors.staffId}</FieldError>}
      </Field>

      <Field>
        <FieldLabel htmlFor="subjectKey">Subject *</FieldLabel>
        <Select
          value={formData.subjectKey}
          onValueChange={(value) => {
            if (value) {
              handleChange("subjectKey", value);
            }
          }}
        >
          <SelectTrigger
            id="subjectKey"
            disabled={isLoading || filteredSubjects.length === 0}
            data-invalid={errors.subjectKey ? true : undefined}
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
        {errors.subjectKey && <FieldError>{errors.subjectKey}</FieldError>}
      </Field>
    </form>
  );
};
