"use client";

import { staffIdSchema } from "@school-student-teacher-management/db/schema/staff";
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
import { useState } from "react";
import * as v from "valibot";

type Staff = typeof staffTable.$inferSelect;

interface AssignTeacherFormProps {
  formId: string;
  staff: Staff[];
  currentTeacherId?: string | null;
  onSubmit: (data: unknown) => Promise<void>;
  isLoading?: boolean;
}

export const AssignTeacherForm = ({
  formId,
  staff,
  currentTeacherId,
  onSubmit,
  isLoading = false,
}: AssignTeacherFormProps) => {
  const [formData, setFormData] = useState({
    homeroomTeacherId: currentTeacherId || "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState("");

  const schema = v.object({
    homeroomTeacherId: v.union([staffIdSchema, v.literal("")]),
  });

  const handleChange = (value: string | null) => {
    setFormData({ homeroomTeacherId: value ?? "" });
    if (errors.homeroomTeacherId) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.homeroomTeacherId;
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setGeneralError("");

    const submitData = {
      homeroomTeacherId: formData.homeroomTeacherId || null,
    };

    const result = v.safeParse(schema, submitData);

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
        <Select value={formData.homeroomTeacherId} onValueChange={handleChange}>
          <SelectTrigger
            id="teacher"
            disabled={isLoading}
            data-invalid={errors.homeroomTeacherId ? true : undefined}
          >
            <SelectValue placeholder="Select a teacher" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Unassigned</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.homeroomTeacherId && (
          <FieldError>{errors.homeroomTeacherId}</FieldError>
        )}
      </Field>
    </form>
  );
};
