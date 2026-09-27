/*
 * `role="status"` is spelled out rather than swapped for `<output>`: this is a
 * live-region line about the slot being edited, not the result of a calculation.
 */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a status line is not a form output, and the live region is the point */
"use client";

import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import { Checkbox } from "@school-student-teacher-management/ui/components/checkbox";
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
import { useMemo, useRef, useState } from "react";
import * as v from "valibot";

import {
  CLASS_CATEGORIES,
  categoryForGrade,
} from "@/components/staff/class-assignment/class-categories";
import { errorId, fieldA11y } from "@/lib/field-a11y";
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
interface TeacherSlot {
  id: string;
  classId: string;
  className: string;
  dayOfWeek: number;
  periodNumber: number;
}

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/**
 * The subjects catalogued for the selected grade, and whether that list can be
 * believed yet.
 *
 * The pending case matters: an empty list while the catalog is still loading
 * looks exactly like a grade with no subjects, and telling an administrator
 * that their grade has no subjects when the answer has not arrived is a false
 * claim about their own data.
 */
const useSubjectsForGrade = (
  selectedClass: Class | undefined,
  academicYearId: string | undefined
) => {
  const catalogQuery = useQuery({
    ...orpc.staff.listSubjects.queryOptions({
      input: { academicYearId: academicYearId ?? "" },
    }),
    enabled: Boolean(academicYearId),
  });

  const subjects = useMemo(() => {
    const catalog = catalogQuery.data as unknown[] | undefined;
    if (!(selectedClass && catalog)) {
      return [];
    }
    return (catalog as Subject[]).filter(
      (s) => s.gradeLevel === selectedClass.gradeLevel
    );
  }, [catalogQuery.data, selectedClass]);

  return {
    subjects,
    isPending: catalogQuery.isPending,
    isError: catalogQuery.isError,
  };
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

const schema = v.object({
  classId: v.pipe(v.string(), v.minLength(1, "Class is required")),
  dayOfWeek: v.pipe(v.string(), v.minLength(1, "Day is required")),
  periodNumber: v.pipe(v.string(), v.minLength(1, "Period is required")),
  subjectKey: v.pipe(v.string(), v.minLength(1, "Subject is required")),
});

const FIELD_ORDER: (keyof AssignmentFormData)[] = [
  "classId",
  "dayOfWeek",
  "periodNumber",
  "subjectKey",
];

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
  hint?: string;
  /**
   * The control to focus when this field is the first invalid one. A shadcn
   * `Select` trigger is a button, and `id`/`aria-labelledby` is how the label
   * reaches it — a `<label for>` cannot, because a button is not a labelable
   * element.
   */
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
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
      <SelectTrigger {...fieldA11y(id, { error })} disabled={disabled}>
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
    {error && <FieldError id={errorId(id)}>{error}</FieldError>}
  </Field>
);

const useSelectOptions = (
  classes: Class[],
  filteredSubjects: Subject[],
  category: string,
  grade: string
) => {
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
  }, [category, classes]);

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
      CODE_DEFINED_PERIODS.map((period) => ({
        value: String(period.periodNumber),
        label: `Period ${period.periodNumber} (${period.startTime}–${period.endTime})`,
      })),
    []
  );

  const subjectOptions = useMemo(
    () =>
      filteredSubjects.map((subject) => ({
        value: subject.subjectKey,
        label: subjectLabel(subject.subjectKey),
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

const COMBINED_SESSION_HINT_ID = "teacher-period-combined-session-hint";

/**
 * What to say under the subject control.
 *
 * "No subjects for this grade" is only true once the catalog has answered, and
 * only after a class has been chosen — a form that has not been filled in yet
 * has no grade to have no subjects.
 */
const subjectHint = (subjects: {
  isPending: boolean;
  isError: boolean;
  hasSubjectsForGrade: boolean;
}): string | undefined => {
  if (subjects.isPending) {
    return "Loading the subjects catalogued for this year…";
  }
  if (subjects.isError) {
    return "The subjects catalog could not be read, so there is nothing to choose from yet.";
  }
  if (!subjects.hasSubjectsForGrade) {
    return "No subjects are catalogued for this grade in this academic year, so there is nothing to assign. Subjects come from the structure versions.";
  }
  return undefined;
};

/**
 * The slot this teacher already holds, and the way to declare it.
 *
 * Nothing in the timetable stops one teacher being in two classes at once — that
 * is how a combined session works — but the conflict scan reports the overlap
 * unless the row is marked. This is where that mark is made, so the grid can
 * later call the slot a combined session instead of a clash.
 */
const SharedSlotNotice = ({
  classNames,
  formId,
  isCombinedSession,
  isLoading,
  onCombinedSessionChange,
}: {
  classNames: string[];
  formId: string;
  isCombinedSession: boolean;
  isLoading: boolean;
  onCombinedSessionChange: (checked: boolean) => void;
}) => (
  <div className="space-y-3">
    <p
      className="border-warning-ink/40 bg-accent/14 text-warning-ink border p-3 text-sm leading-relaxed"
      role="status"
    >
      {`This teacher is already timetabled in that slot for ${classNames.join(", ")}. Two classes in one slot is how a combined session is recorded — mark it below and the conflict scan will leave it out of its report.`}
    </p>
    <Field orientation="horizontal">
      <Checkbox
        aria-describedby={COMBINED_SESSION_HINT_ID}
        checked={isCombinedSession}
        disabled={isLoading}
        id={`${formId}-combined-session`}
        onCheckedChange={(checked) => onCombinedSessionChange(checked === true)}
      />
      <div>
        <FieldLabel
          className="font-normal"
          htmlFor={`${formId}-combined-session`}
        >
          This is an intentional combined session, not a scheduling mistake
        </FieldLabel>
        <FieldDescription id={COMBINED_SESSION_HINT_ID}>
          {isCombinedSession
            ? "Will be saved as a combined session, so an overlap in this slot is not reported as a clash."
            : "Leave this unticked for an ordinary period. An unticked overlap in a slot this teacher already holds is reported as a clash."}
        </FieldDescription>
      </div>
    </Field>
  </div>
);

interface TeacherPeriodAssignmentFormContentProps {
  formId: string;
  generalError: string;
  errors: Record<string, string>;
  formData: AssignmentFormData;
  handleChange: (field: keyof AssignmentFormData, value: string) => void;
  handleSubmit: (event: React.FormEvent) => void;
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
  classRef: React.RefObject<HTMLButtonElement | null>;
  dayRef: React.RefObject<HTMLButtonElement | null>;
  periodRef: React.RefObject<HTMLButtonElement | null>;
  subjectRef: React.RefObject<HTMLButtonElement | null>;
  subjects: {
    isPending: boolean;
    isError: boolean;
    hasSubjectsForGrade: boolean;
  };
  sharedSlotNotice: React.ReactNode;
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
  classRef,
  dayRef,
  periodRef,
  subjectRef,
  subjects,
  sharedSlotNotice,
}: TeacherPeriodAssignmentFormContentProps) => (
  <form id={formId} onSubmit={handleSubmit} className="space-y-5">
    {generalError && (
      <div
        role="alert"
        className="bg-destructive/10 text-destructive p-3 text-sm"
      >
        {generalError}
      </div>
    )}

    <SelectField
      disabled={isLoading || isEditMode}
      hint={
        isEditMode
          ? "The class is the row's identity and cannot be changed."
          : undefined
      }
      id="classCategory"
      label="Section *"
      onValueChange={onCategoryChange}
      options={categoryOptions}
      placeholder="Select Primary/Secondary/Collegiate"
      value={category}
    />

    <SelectField
      disabled={isLoading || isEditMode || !category}
      id="classGrade"
      label="Grade *"
      onValueChange={onGradeChange}
      options={gradeOptions}
      placeholder={category ? "Select grade" : "Select a section first"}
      value={grade}
    />

    <SelectField
      disabled={isLoading || isEditMode || !grade}
      error={errors.classId}
      id="classId"
      label="Class *"
      onValueChange={(value) => handleChange("classId", value)}
      options={classOptions}
      placeholder={grade ? "Select class" : "Select a grade first"}
      triggerRef={classRef}
      value={formData.classId}
    />

    <SelectField
      disabled={isLoading || isSlotLocked}
      error={errors.dayOfWeek}
      hint={isSlotLocked ? "The day comes from the slot you chose." : undefined}
      id="dayOfWeek"
      label="Day *"
      onValueChange={(value) => handleChange("dayOfWeek", value)}
      options={dayOptions}
      placeholder="Select day"
      triggerRef={dayRef}
      value={formData.dayOfWeek}
    />

    <SelectField
      disabled={isLoading || isSlotLocked}
      error={errors.periodNumber}
      hint={
        isSlotLocked
          ? "The period comes from the slot you chose. Times are fixed by the school day."
          : undefined
      }
      id="periodNumber"
      label="Period *"
      onValueChange={(value) => handleChange("periodNumber", value)}
      options={periodOptions}
      placeholder="Select period"
      triggerRef={periodRef}
      value={formData.periodNumber}
    />

    <SelectField
      disabled={isLoading || !subjects.hasSubjectsForGrade}
      error={errors.subjectKey}
      hint={subjectHint(subjects)}
      id="subjectKey"
      label="Subject *"
      onValueChange={(value) => handleChange("subjectKey", value)}
      options={subjectOptions}
      placeholder={
        subjects.hasSubjectsForGrade
          ? "Select subject"
          : "No subjects for this grade"
      }
      triggerRef={subjectRef}
      value={formData.subjectKey}
    />

    {sharedSlotNotice}
  </form>
);

interface TeacherPeriodAssignmentFormProps {
  formId: string;
  classes: Class[];
  academicYearId?: string;
  onSubmit: (data: unknown) => Promise<void>;
  isLoading?: boolean;
  /** Editing an existing slot: class/day/period are the row's identity and
   * locked; only the subject can change. Omit for creating a new slot. */
  initialData?: {
    classId: string;
    dayOfWeek: number;
    periodNumber: number;
    subjectKey: string;
    isCombinedSession?: boolean;
  };
  /** Creating a new slot from a specific grid cell: day/period are already
   * known and locked, but class/subject are still open (lets a combined
   * session add another class at an already-occupied slot). */
  prefillSlot?: { dayOfWeek: number; periodNumber: number };
  /** Whose timetable this is. Used to notice that the chosen slot is already
   * held by this teacher for another class, which is what a combined session
   * looks like from here. */
  staffId?: string;
}

/**
 * The form's starting values.
 *
 * Editing an existing row and adding to a chosen slot are the same form with
 * different amounts of the answer already supplied, so the state is derived in
 * one place: an edit locks class, day and period, a prefilled slot locks day and
 * period and leaves the class open (which is how a second class is added to a
 * slot that already has one).
 */
const initialFormData = (
  initialData: TeacherPeriodAssignmentFormProps["initialData"],
  prefillSlot: TeacherPeriodAssignmentFormProps["prefillSlot"]
): AssignmentFormData => {
  const knownSlot = initialData ?? prefillSlot;
  return {
    classId: initialData?.classId ?? "",
    dayOfWeek: knownSlot ? String(knownSlot.dayOfWeek) : "",
    periodNumber: knownSlot ? String(knownSlot.periodNumber) : "",
    subjectKey: initialData?.subjectKey ?? "",
  };
};

/**
 * The classes this teacher already holds in the chosen slot.
 *
 * The database allows one teacher in two classes at the same slot on purpose,
 * and the conflict scan only stays quiet when the overlapping rows are marked as
 * a combined session. Without this read the form would invite a second class in
 * an occupied slot and save it unmarked, which the scan would then report as a
 * clash — the form would manufacture the very error it exists to prevent.
 */
const useSharedSlot = ({
  academicYearId,
  classId,
  dayOfWeek,
  periodNumber,
  staffId,
}: {
  academicYearId: string | undefined;
  classId: string;
  dayOfWeek: string;
  periodNumber: string;
  staffId: string | undefined;
}): { classNames: string[] } | null => {
  const weekQuery = useQuery({
    ...orpc.staff.periods.listTeacherTimetable.queryOptions({
      input: { academicYearId: academicYearId ?? "", staffId: staffId ?? "" },
    }),
    enabled: Boolean(academicYearId && staffId),
  });

  return useMemo(() => {
    const day = Number(dayOfWeek);
    const period = Number(periodNumber);
    if (!(day >= 1 && period >= 1)) {
      return null;
    }
    const week = (weekQuery.data ?? []) as unknown as TeacherSlot[];
    const classNames: string[] = [];
    for (const entry of week) {
      const isAnotherClassInThisSlot =
        entry.dayOfWeek === day &&
        entry.periodNumber === period &&
        entry.classId !== classId;
      if (isAnotherClassInThisSlot) {
        classNames.push(entry.className);
      }
    }
    return classNames.length > 0 ? { classNames } : null;
  }, [classId, dayOfWeek, periodNumber, weekQuery.data]);
};

export const TeacherPeriodAssignmentForm = ({
  formId,
  classes,
  academicYearId,
  onSubmit,
  isLoading = false,
  initialData,
  prefillSlot,
  staffId,
}: TeacherPeriodAssignmentFormProps) => {
  const isEditMode = Boolean(initialData);
  const isSlotLocked = isEditMode || Boolean(prefillSlot);

  const [formData, setFormData] = useState(() =>
    initialFormData(initialData, prefillSlot)
  );
  const [isCombinedSession, setIsCombinedSession] = useState(
    initialData?.isCombinedSession ?? false
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState("");

  const classRef = useRef<HTMLButtonElement | null>(null);
  const dayRef = useRef<HTMLButtonElement | null>(null);
  const periodRef = useRef<HTMLButtonElement | null>(null);
  const subjectRef = useRef<HTMLButtonElement | null>(null);

  const initialClass = initialData
    ? classes.find((c) => c.id === initialData.classId)
    : undefined;
  const [category, setCategory] = useState(
    initialClass ? categoryForGrade(initialClass.gradeLevel) : ""
  );
  const [grade, setGrade] = useState(
    initialClass ? String(initialClass.gradeLevel) : ""
  );

  const handleChange = (field: keyof AssignmentFormData, value: string) => {
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

  const subjectCatalog = useSubjectsForGrade(selectedClass, academicYearId);

  const sharedSlot = useSharedSlot({
    academicYearId,
    classId: formData.classId,
    dayOfWeek: formData.dayOfWeek,
    periodNumber: formData.periodNumber,
    staffId,
  });

  const {
    categoryOptions,
    gradeOptions,
    classOptions,
    dayOptions,
    periodOptions,
    subjectOptions,
  } = useSelectOptions(classes, subjectCatalog.subjects, category, grade);

  /** Move focus to the first control the schema rejected. */
  const focusFirstInvalid = (fieldErrors: Record<string, string>) => {
    const firstInvalid = FIELD_ORDER.find((field) => fieldErrors[field]);
    if (!firstInvalid) {
      return;
    }
    const refs: Record<
      keyof AssignmentFormData,
      React.RefObject<HTMLButtonElement | null>
    > = {
      classId: classRef,
      dayOfWeek: dayRef,
      periodNumber: periodRef,
      subjectKey: subjectRef,
    };
    refs[firstInvalid].current?.focus();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    // A second submit while a write is in flight would send the same row twice.
    if (isLoading) {
      return;
    }
    setErrors({});
    setGeneralError("");

    const result = v.safeParse(schema, formData);
    if (!result.success) {
      const fieldErrors = extractFieldErrors(result.issues);
      setErrors(fieldErrors);
      focusFirstInvalid(fieldErrors);
      return;
    }

    try {
      await onSubmit({
        classId: result.output.classId,
        dayOfWeek: Number(result.output.dayOfWeek),
        periodNumber: Number(result.output.periodNumber),
        subjectKey: result.output.subjectKey,
        ...(isCombinedSession ? { isCombinedSession: true } : {}),
      });
    } catch (error) {
      setGeneralError(
        error instanceof Error
          ? error.message
          : "Failed to save the assignment. Nothing was changed."
      );
    }
  };

  const sharedSlotNotice = sharedSlot ? (
    <SharedSlotNotice
      classNames={sharedSlot.classNames}
      formId={formId}
      isCombinedSession={isCombinedSession}
      isLoading={isLoading}
      onCombinedSessionChange={setIsCombinedSession}
    />
  ) : null;

  return (
    <TeacherPeriodAssignmentFormContent
      category={category}
      categoryOptions={categoryOptions}
      classOptions={classOptions}
      classRef={classRef}
      dayOptions={dayOptions}
      dayRef={dayRef}
      errors={errors}
      formData={formData}
      formId={formId}
      generalError={generalError}
      grade={grade}
      gradeOptions={gradeOptions}
      handleChange={handleChange}
      handleSubmit={(event) => {
        void handleSubmit(event);
      }}
      isEditMode={isEditMode}
      isLoading={isLoading}
      isSlotLocked={isSlotLocked}
      onCategoryChange={handleCategoryChange}
      onGradeChange={handleGradeChange}
      periodOptions={periodOptions}
      periodRef={periodRef}
      sharedSlotNotice={sharedSlotNotice}
      subjectOptions={subjectOptions}
      subjectRef={subjectRef}
      subjects={{
        hasSubjectsForGrade: subjectCatalog.subjects.length > 0,
        isError: subjectCatalog.isError,
        isPending: subjectCatalog.isPending,
      }}
    />
  );
};
