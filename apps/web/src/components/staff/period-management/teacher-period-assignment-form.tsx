"use client";

import type { periodConfig as periodConfigTable } from "@school-student-teacher-management/db/schema/periods";
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

interface Class {
  id: string;
  name: string;
  gradeLevel: number;
}
interface Subject {
  subjectKey: string;
  gradeLevel: number;
}
type PeriodConfig = typeof periodConfigTable.$inferSelect;

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** Subjects this teacher already prefers / has previously taught for the
 * selected class's grade - not the full school-wide subject catalog - so
 * period assignment stays consistent with what was set up in "Assign
 * Subjects". */
const usePreferredSubjects = (
  staffId: string,
  academicYearId: string,
  selectedClass: Class | undefined
) => {
  const subjectsQuery = useQuery(
    orpc.staff.listSubjectAssignments.queryOptions({
      input: {
        academicYearId,
        staffId: staffId as never,
        gradeLevel: undefined,
        subjectKey: undefined,
      },
    })
  );

  return useMemo(() => {
    const subjects = subjectsQuery.data as unknown[] | undefined;
    if (!(selectedClass && subjects)) {
      return [];
    }
    const subjectKeys = new Set<string>();
    for (const s of subjects as Subject[]) {
      if (s.gradeLevel === selectedClass.gradeLevel) {
        subjectKeys.add(s.subjectKey);
      }
    }
    return [...subjectKeys].map((subjectKey) => ({
      subjectKey,
      gradeLevel: selectedClass.gradeLevel,
    }));
  }, [selectedClass, subjectsQuery.data]);
};

const extractFieldErrors = (
  issues: readonly { path?: readonly { key?: unknown }[]; message: string }[]
): Record<string, string> => {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path?.[0]?.key as string | undefined;
    if (path) {
      fieldErrors[path] = issue.message || "Invalid field";
    }
  }
  return fieldErrors;
};

interface AssignmentFormData {
  classId: string;
  dayOfWeek: string;
  periodNumber: string;
  subjectKey: string;
}

const submitAssignmentForm = async (
  schema: v.GenericSchema,
  formData: AssignmentFormData,
  onSubmit: (data: unknown) => Promise<void>,
  setErrors: (errors: Record<string, string>) => void,
  setGeneralError: (message: string) => void
) => {
  const result = v.safeParse(schema, formData);

  if (!result.success) {
    setErrors(extractFieldErrors(result.issues));
    return;
  }

  const output = result.output as AssignmentFormData;
  try {
    await onSubmit({
      classId: output.classId,
      dayOfWeek: Number(output.dayOfWeek),
      periodNumber: Number(output.periodNumber),
      subjectKey: output.subjectKey,
    });
  } catch (error) {
    setGeneralError(
      error instanceof Error ? error.message : "Failed to save assignment"
    );
  }
};

interface SelectFieldOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectFieldOption[];
  placeholder: string;
  disabled?: boolean;
  error?: string;
}

const SelectField = ({
  id,
  label,
  value,
  onValueChange,
  options,
  placeholder,
  disabled = false,
  error,
}: SelectFieldProps) => (
  <Field data-invalid={!!error}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select value={value} onValueChange={(next) => next && onValueChange(next)}>
      <SelectTrigger id={id} disabled={disabled} data-invalid={!!error}>
        <SelectValue placeholder={placeholder}>
          {(selectedValue: string | null) =>
            options.find((option) => option.value === selectedValue)?.label ??
            placeholder
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    {error && <FieldError>{error}</FieldError>}
  </Field>
);

const useSelectOptions = (
  classes: Class[],
  periodConfig: PeriodConfig[],
  filteredSubjects: Subject[]
) => {
  const sortedPeriods = useMemo(
    () => periodConfig.toSorted((a, b) => a.periodNumber - b.periodNumber),
    [periodConfig]
  );

  const classOptions = useMemo(
    () =>
      classes.map((cls) => ({
        value: cls.id,
        label: `${cls.name} (Grade ${cls.gradeLevel})`,
      })),
    [classes]
  );

  const dayOptions = useMemo(
    () =>
      DAY_NAMES.slice(1).map((day, index) => ({
        value: String(index + 1),
        label: day,
      })),
    []
  );

  const periodOptions = useMemo(
    () =>
      sortedPeriods.map((period) => ({
        value: String(period.periodNumber),
        label: `Period ${period.periodNumber} (${period.startTime}-${period.endTime})`,
      })),
    [sortedPeriods]
  );

  const subjectOptions = useMemo(
    () =>
      filteredSubjects.map((subject) => ({
        value: subject.subjectKey,
        label: subject.subjectKey,
      })),
    [filteredSubjects]
  );

  return { classOptions, dayOptions, periodOptions, subjectOptions };
};

interface TeacherPeriodAssignmentFormContentProps {
  formId: string;
  generalError: string;
  errors: Record<string, string>;
  formData: AssignmentFormData;
  handleChange: (field: keyof AssignmentFormData, value: string) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  isLoading: boolean;
  isEditMode: boolean;
  isSlotLocked: boolean;
  classOptions: SelectFieldOption[];
  dayOptions: SelectFieldOption[];
  periodOptions: SelectFieldOption[];
  subjectOptions: SelectFieldOption[];
}

const TeacherPeriodAssignmentFormContent = ({
  formId,
  generalError,
  errors,
  formData,
  handleChange,
  handleSubmit,
  isLoading,
  isEditMode,
  isSlotLocked,
  classOptions,
  dayOptions,
  periodOptions,
  subjectOptions,
}: TeacherPeriodAssignmentFormContentProps) => (
  <form id={formId} onSubmit={handleSubmit} className="space-y-6">
    {generalError && (
      <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
        {generalError}
      </div>
    )}

    <SelectField
      id="classId"
      label="Class *"
      value={formData.classId}
      onValueChange={(value) => handleChange("classId", value)}
      options={classOptions}
      placeholder="Select class"
      disabled={isLoading || isEditMode}
      error={errors.classId}
    />

    <SelectField
      id="dayOfWeek"
      label="Day *"
      value={formData.dayOfWeek}
      onValueChange={(value) => handleChange("dayOfWeek", value)}
      options={dayOptions}
      placeholder="Select day"
      disabled={isLoading || isSlotLocked}
      error={errors.dayOfWeek}
    />

    <SelectField
      id="periodNumber"
      label="Period *"
      value={formData.periodNumber}
      onValueChange={(value) => handleChange("periodNumber", value)}
      options={periodOptions}
      placeholder="Select period"
      disabled={isLoading || isSlotLocked}
      error={errors.periodNumber}
    />

    <SelectField
      id="subjectKey"
      label="Subject *"
      value={formData.subjectKey}
      onValueChange={(value) => handleChange("subjectKey", value)}
      options={subjectOptions}
      placeholder="Select subject"
      disabled={isLoading || subjectOptions.length === 0}
      error={errors.subjectKey}
    />
    {formData.classId && subjectOptions.length === 0 && (
      <p className="text-muted-foreground text-sm">
        This teacher has no preferred subjects for this grade yet. Assign their
        subjects first.
      </p>
    )}
  </form>
);

interface TeacherPeriodAssignmentFormProps {
  formId: string;
  staffId: string;
  academicYearId: string;
  classes: Class[];
  periodConfig: PeriodConfig[];
  onSubmit: (data: unknown) => Promise<void>;
  isLoading?: boolean;
  /** Editing an existing slot: class/day/period are the row's identity and
   * locked; only the subject can change. Omit for creating a new slot. */
  initialData?: {
    classId: string;
    dayOfWeek: number;
    periodNumber: number;
    subjectKey: string;
  };
  /** Creating a new slot from a specific grid cell: day/period are already
   * known and locked, but class/subject are still open (lets a combined
   * session add another class at an already-occupied slot). */
  prefillSlot?: { dayOfWeek: number; periodNumber: number };
}

export const TeacherPeriodAssignmentForm = ({
  formId,
  staffId,
  academicYearId,
  classes,
  periodConfig,
  onSubmit,
  isLoading = false,
  initialData,
  prefillSlot,
}: TeacherPeriodAssignmentFormProps) => {
  const isEditMode = !!initialData;
  const isSlotLocked = isEditMode || !!prefillSlot;

  const [formData, setFormData] = useState({
    classId: initialData?.classId || "",
    dayOfWeek:
      initialData || prefillSlot
        ? String((initialData ?? prefillSlot)?.dayOfWeek)
        : "",
    periodNumber:
      initialData || prefillSlot
        ? String((initialData ?? prefillSlot)?.periodNumber)
        : "",
    subjectKey: initialData?.subjectKey || "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState("");

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === formData.classId),
    [classes, formData.classId]
  );

  const filteredSubjects = usePreferredSubjects(
    staffId,
    academicYearId,
    selectedClass
  );

  const { classOptions, dayOptions, periodOptions, subjectOptions } =
    useSelectOptions(classes, periodConfig, filteredSubjects);

  const schema = v.object({
    classId: v.pipe(v.string(), v.minLength(1, "Class is required")),
    dayOfWeek: v.pipe(v.string(), v.minLength(1, "Day is required")),
    periodNumber: v.pipe(v.string(), v.minLength(1, "Period is required")),
    subjectKey: v.pipe(v.string(), v.minLength(1, "Subject is required")),
  });

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setGeneralError("");

    await submitAssignmentForm(
      schema,
      formData,
      onSubmit,
      setErrors,
      setGeneralError
    );
  };

  return (
    <TeacherPeriodAssignmentFormContent
      formId={formId}
      generalError={generalError}
      errors={errors}
      formData={formData}
      handleChange={handleChange}
      handleSubmit={handleSubmit}
      isLoading={isLoading}
      isEditMode={isEditMode}
      isSlotLocked={isSlotLocked}
      classOptions={classOptions}
      dayOptions={dayOptions}
      periodOptions={periodOptions}
      subjectOptions={subjectOptions}
    />
  );
};
