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

import {
  CLASS_CATEGORIES,
  categoryForGrade,
} from "@/components/staff/class-assignment/class-categories";
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
 * selected class's grade, preferring what was set up in "Assign Subjects".
 * Falls back to the full grade-appropriate catalog (from the school's
 * curriculum structure version) when the teacher hasn't set any preferred
 * subjects yet, so period assignment is never a hard dead end. */
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

  const catalogQuery = useQuery(orpc.staff.listSubjects.queryOptions({}));

  const preferred = useMemo(() => {
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

  return useMemo(() => {
    if (preferred.length > 0) {
      return preferred;
    }
    const catalog = catalogQuery.data as unknown[] | undefined;
    if (!(selectedClass && catalog)) {
      return [];
    }
    return (catalog as Subject[]).filter(
      (s) => s.gradeLevel === selectedClass.gradeLevel
    );
  }, [preferred, selectedClass, catalogQuery.data]);
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
  filteredSubjects: Subject[],
  category: string,
  grade: string
) => {
  const sortedPeriods = useMemo(
    () => periodConfig.toSorted((a, b) => a.periodNumber - b.periodNumber),
    [periodConfig]
  );

  const categoryOptions = useMemo(
    () => CLASS_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
    []
  );

  const gradeOptions = useMemo(() => {
    const activeCategory = CLASS_CATEGORIES.find((c) => c.key === category);
    if (!activeCategory) {
      return [];
    }
    const gradesWithClasses = new Set(classes.map((cls) => cls.gradeLevel));
    const options: SelectFieldOption[] = [];
    for (const g of activeCategory.grades) {
      if (gradesWithClasses.has(g)) {
        options.push({ value: String(g), label: `Grade ${g}` });
      }
    }
    return options;
  }, [classes, category]);

  const classOptions = useMemo(() => {
    const gradeNumber = Number(grade);
    if (!grade) {
      return [];
    }
    const options: SelectFieldOption[] = [];
    for (const cls of classes) {
      if (cls.gradeLevel === gradeNumber) {
        options.push({ value: cls.id, label: cls.name });
      }
    }
    return options;
  }, [classes, grade]);

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

  return {
    categoryOptions,
    gradeOptions,
    classOptions,
    dayOptions,
    periodOptions,
    subjectOptions,
  };
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
  category: string;
  grade: string;
  onCategoryChange: (value: string) => void;
  onGradeChange: (value: string) => void;
  categoryOptions: SelectFieldOption[];
  gradeOptions: SelectFieldOption[];
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
  category,
  grade,
  onCategoryChange,
  onGradeChange,
  categoryOptions,
  gradeOptions,
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
      id="classCategory"
      label="Section *"
      value={category}
      onValueChange={onCategoryChange}
      options={categoryOptions}
      placeholder="Select Primary/Secondary/Collegiate"
      disabled={isLoading || isEditMode}
    />

    <SelectField
      id="classGrade"
      label="Grade *"
      value={grade}
      onValueChange={onGradeChange}
      options={gradeOptions}
      placeholder={category ? "Select grade" : "Select a section first"}
      disabled={isLoading || isEditMode || !category}
    />

    <SelectField
      id="classId"
      label="Class *"
      value={formData.classId}
      onValueChange={(value) => handleChange("classId", value)}
      options={classOptions}
      placeholder={grade ? "Select class" : "Select a grade first"}
      disabled={isLoading || isEditMode || !grade}
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

  const initialClass = initialData
    ? classes.find((c) => c.id === initialData.classId)
    : undefined;
  const [category, setCategory] = useState(
    initialClass ? categoryForGrade(initialClass.gradeLevel) : ""
  );
  const [grade, setGrade] = useState(
    initialClass ? String(initialClass.gradeLevel) : ""
  );

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field))
    );
  };

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    setGrade("");
    handleChange("classId", "");
  };

  const handleGradeChange = (value: string) => {
    setGrade(value);
    handleChange("classId", "");
  };

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === formData.classId),
    [classes, formData.classId]
  );

  const filteredSubjects = usePreferredSubjects(
    staffId,
    academicYearId,
    selectedClass
  );

  const {
    categoryOptions,
    gradeOptions,
    classOptions,
    dayOptions,
    periodOptions,
    subjectOptions,
  } = useSelectOptions(
    classes,
    periodConfig,
    filteredSubjects,
    category,
    grade
  );

  const schema = v.object({
    classId: v.pipe(v.string(), v.minLength(1, "Class is required")),
    dayOfWeek: v.pipe(v.string(), v.minLength(1, "Day is required")),
    periodNumber: v.pipe(v.string(), v.minLength(1, "Period is required")),
    subjectKey: v.pipe(v.string(), v.minLength(1, "Subject is required")),
  });

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
      category={category}
      grade={grade}
      onCategoryChange={handleCategoryChange}
      onGradeChange={handleGradeChange}
      categoryOptions={categoryOptions}
      gradeOptions={gradeOptions}
      classOptions={classOptions}
      dayOptions={dayOptions}
      periodOptions={periodOptions}
      subjectOptions={subjectOptions}
    />
  );
};
