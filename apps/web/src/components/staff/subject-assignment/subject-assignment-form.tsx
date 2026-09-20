"use client";

import {
  subjectAssignmentInsertSchema,
  subjectAssignmentUpdateSchema,
} from "@school-student-teacher-management/db/schema/academics";
import type { staff } from "@school-student-teacher-management/db/schema/staff";
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
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import * as v from "valibot";

import { orpc } from "@/utils/orpc";

type Staff = typeof staff.$inferSelect;

const extractFieldErrors = (issues: unknown[]) => {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const issueObj = issue as {
      path?: { key?: string }[] | undefined;
      message?: string | undefined;
    };
    const path = issueObj.path?.[0]?.key;
    if (path) {
      fieldErrors[path] = issueObj.message || "Invalid field";
    }
  }
  return fieldErrors;
};

const getValidationSchema = (isEditMode: boolean) =>
  isEditMode
    ? v.pick(subjectAssignmentUpdateSchema, [
        "subjectKey",
        "gradeLevel",
        "classId",
      ])
    : v.pick(subjectAssignmentInsertSchema, [
        "staffId",
        "academicYearId",
        "subjectKey",
        "gradeLevel",
        "classId",
      ]);

const buildSubmitData = (
  isEditMode: boolean,
  formData: Record<string, string | null>
) => {
  const gradeLevel = Math.trunc(Number(formData.gradeLevel));
  const classId = formData.classId || null;
  return isEditMode
    ? {
        subjectKey: formData.subjectKey,
        gradeLevel,
        classId,
      }
    : {
        staffId: formData.staffId,
        academicYearId: formData.academicYearId,
        subjectKey: formData.subjectKey,
        gradeLevel,
        classId,
      };
};

interface SubjectAssignmentFormContentProps {
  formId: string;
  generalError: string;
  errors: Record<string, string>;
  formData: {
    staffId: string;
    academicYearId: string;
    subjectKey: string;
    gradeLevel: string;
    classId: string;
  };
  handleChange: (field: string, value: string | null) => void;
  validateAndSubmit: (e: React.FormEvent) => Promise<void>;
  isEditMode: boolean;
  isLoading: boolean;
  staff: Staff[];
  lockedStaffId?: string;
  filteredSubjects: { subjectKey: string; gradeLevel: number }[];
  gradeOptions: number[];
  filteredClasses: { id: string; name: string }[];
}

const SubjectAssignmentFormContent = ({
  formId,
  generalError,
  errors,
  formData,
  handleChange,
  validateAndSubmit,
  isEditMode,
  isLoading,
  staff,
  lockedStaffId,
  filteredSubjects,
  gradeOptions,
  filteredClasses,
}: SubjectAssignmentFormContentProps) => (
  <form id={formId} onSubmit={validateAndSubmit} className="space-y-6">
    {generalError && (
      <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
        {generalError}
      </div>
    )}

    {!isEditMode &&
      (lockedStaffId ? (
        <Field>
          <FieldLabel>Teacher</FieldLabel>
          <div className="bg-muted rounded-md px-3 py-2 text-sm">
            {staff.find((s) => s.id === lockedStaffId)?.name ??
              "Selected teacher"}
          </div>
        </Field>
      ) : (
        <Field>
          <FieldLabel htmlFor="teacher">Teacher *</FieldLabel>
          <Select
            value={formData.staffId}
            onValueChange={(value) => {
              if (value) {
                handleChange("staffId", value);
              }
            }}
          >
            <SelectTrigger
              id="teacher"
              disabled={isLoading}
              data-invalid={errors.staffId ? true : undefined}
            >
              <SelectValue placeholder="Select a teacher" />
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
      ))}

    <Field>
      <FieldLabel htmlFor="gradeLevel">Grade Level *</FieldLabel>
      <Select
        value={formData.gradeLevel}
        onValueChange={(value) => {
          if (value) {
            handleChange("gradeLevel", value);
          }
        }}
      >
        <SelectTrigger
          id="gradeLevel"
          disabled={isLoading}
          data-invalid={errors.gradeLevel ? true : undefined}
        >
          <SelectValue placeholder="Select a grade" />
        </SelectTrigger>
        <SelectContent>
          {gradeOptions.map((grade) => (
            <SelectItem key={grade} value={grade.toString()}>
              Grade {grade}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {errors.gradeLevel && <FieldError>{errors.gradeLevel}</FieldError>}
    </Field>

    <Field>
      <FieldLabel htmlFor="subject">Subject *</FieldLabel>
      <Select
        value={formData.subjectKey}
        onValueChange={(value) => {
          if (value) {
            handleChange("subjectKey", value);
          }
        }}
      >
        <SelectTrigger
          id="subject"
          disabled={isLoading || !formData.gradeLevel}
          data-invalid={errors.subjectKey ? true : undefined}
        >
          <SelectValue placeholder="Select a subject" />
        </SelectTrigger>
        <SelectContent>
          {filteredSubjects.map((subject) => (
            <SelectItem key={subject.subjectKey} value={subject.subjectKey}>
              {subject.subjectKey}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!formData.gradeLevel && (
        <FieldDescription>
          Select a grade first to filter subjects
        </FieldDescription>
      )}
      {errors.subjectKey && <FieldError>{errors.subjectKey}</FieldError>}
    </Field>

    <Field>
      <FieldLabel htmlFor="class">Class</FieldLabel>
      <Select
        value={formData.classId}
        onValueChange={(value) => handleChange("classId", value || null)}
      >
        <SelectTrigger
          id="class"
          disabled={isLoading}
          data-invalid={errors.classId ? true : undefined}
        >
          <SelectValue placeholder="Select a class (optional)" />
        </SelectTrigger>
        <SelectContent>
          {filteredClasses.map((cls) => (
            <SelectItem key={cls.id} value={cls.id}>
              {cls.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>
        Optional — leave unset for a grade-wide assignment
      </FieldDescription>
      {errors.classId && <FieldError>{errors.classId}</FieldError>}
    </Field>
  </form>
);

interface SubjectAssignmentFormProps {
  formId: string;
  academicYearId: string;
  staff: Staff[];
  lockedStaffId?: string;
  onSubmit: (data: unknown) => Promise<void>;
  isLoading?: boolean;
  initialData?: {
    id: string;
    staffId: string;
    academicYearId: string;
    subjectKey: string;
    gradeLevel: number;
    classId?: string | null;
  };
}

export const SubjectAssignmentForm = ({
  formId,
  academicYearId,
  staff,
  lockedStaffId,
  onSubmit,
  isLoading = false,
  initialData,
}: SubjectAssignmentFormProps) => {
  const isEditMode = !!initialData;

  const [formData, setFormData] = useState({
    staffId: initialData?.staffId ?? lockedStaffId ?? "",
    academicYearId: initialData?.academicYearId ?? academicYearId,
    subjectKey: initialData?.subjectKey ?? "",
    gradeLevel: initialData?.gradeLevel.toString() ?? "",
    classId: initialData?.classId ?? "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState("");

  const subjectsQuery = useQuery(orpc.staff.listSubjects.queryOptions({}));
  const classesQuery = useQuery(
    orpc.staff.listClasses.queryOptions({
      input: { academicYearId, gradeLevel: undefined },
    })
  );

  const filteredClasses = useMemo(() => {
    if (!(formData.gradeLevel && classesQuery.data)) {
      return [];
    }
    return (
      classesQuery.data as { id: string; name: string; gradeLevel: number }[]
    ).filter(
      (cls) => cls.gradeLevel === Math.trunc(Number(formData.gradeLevel))
    );
  }, [formData.gradeLevel, classesQuery.data]);

  const filteredSubjects = useMemo(() => {
    if (!formData.gradeLevel || !subjectsQuery.data) {
      return [];
    }
    return (
      subjectsQuery.data as { subjectKey: string; gradeLevel: number }[]
    ).filter((s) => s.gradeLevel === Math.trunc(Number(formData.gradeLevel)));
  }, [formData.gradeLevel, subjectsQuery.data]);

  const gradeOptions = useMemo(() => {
    if (!subjectsQuery.data) {
      return [];
    }
    return [
      ...new Set(
        (
          subjectsQuery.data as { subjectKey: string; gradeLevel: number }[]
        ).map((s) => s.gradeLevel)
      ),
    ].toSorted((a, b) => a - b);
  }, [subjectsQuery.data]);

  const handleChange = (field: string, value: string | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors(
      Object.fromEntries(Object.entries(errors).filter(([k]) => k !== field))
    );
  };

  const validateAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setGeneralError("");

    const submitData = buildSubmitData(isEditMode, formData);
    const schema = getValidationSchema(isEditMode);
    const result = v.safeParse(schema, submitData);

    if (!result.success) {
      setErrors(extractFieldErrors(result.issues));
      return;
    }

    try {
      await onSubmit(result.output);
    } catch (error) {
      setGeneralError(
        error instanceof Error ? error.message : "Failed to save assignment"
      );
    }
  };

  return (
    <SubjectAssignmentFormContent
      formId={formId}
      generalError={generalError}
      errors={errors}
      formData={formData}
      handleChange={handleChange}
      validateAndSubmit={validateAndSubmit}
      isEditMode={isEditMode}
      isLoading={isLoading}
      staff={staff}
      lockedStaffId={lockedStaffId}
      filteredSubjects={filteredSubjects}
      gradeOptions={gradeOptions}
      filteredClasses={filteredClasses}
    />
  );
};
