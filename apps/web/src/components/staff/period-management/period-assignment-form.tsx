/*
 * `role="status"` is spelled out rather than swapped for `<output>`: these are
 * live-region lines about the slot being edited, not the results of a
 * calculation, and a mount-time announcement is the point.
 */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a status line is not a form output, and the live region is the point */
"use client";

import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import type { staff as staffTable } from "@school-student-teacher-management/db/schema/staff";
import { Checkbox } from "@school-student-teacher-management/ui/components/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
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

import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

type Staff = typeof staffTable.$inferSelect;
interface Subject {
  subjectKey: string;
  gradeLevel: number;
}
interface TeacherSlot {
  id: string;
  className: string;
  dayOfWeek: number;
  periodNumber: number;
}

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const PERIOD_TIMES = new Map<number, string>(
  CODE_DEFINED_PERIODS.map((period) => [
    period.periodNumber,
    `${period.startTime}–${period.endTime}`,
  ])
);

const COMBINED_SESSION_HINT_ID = "period-combined-session-hint";

const schema = v.object({
  staffId: v.pipe(v.string(), v.minLength(1, "Choose a teacher")),
  subjectKey: v.pipe(v.string(), v.minLength(1, "Choose a subject")),
});

/**
 * What to say under the subject control.
 *
 * "No subjects for this grade" is only true once the catalog has answered. An
 * unanswered read used to disable the control with no explanation at all, which
 * reads as "there is nothing here" whether or not that is so.
 */
const subjectHintFor = ({
  gradeLevel,
  isError,
  isPending,
  hasSubjects,
}: {
  gradeLevel: number;
  isError: boolean;
  isPending: boolean;
  hasSubjects: boolean;
}): string | undefined => {
  if (isPending) {
    return "Loading the subjects catalogued for this year…";
  }
  if (isError) {
    return "The subjects catalog could not be read, so there is nothing to choose from yet.";
  }
  if (!hasSubjects) {
    return `No subjects are catalogued for Grade ${gradeLevel} in this academic year, so there is nothing to assign. Subjects come from the structure versions.`;
  }
  return undefined;
};

/**
 * What the chosen teacher already holds, and whether we know it yet.
 *
 * `readState` exists because the three answers are not interchangeable. An
 * unanswered read used to be reported as the good news — "N is free this slot" —
 * which is a claim about a colleague's week made out of a network failure.
 */
interface Availability {
  readState: "pending" | "known" | "failed";
  weeklyPeriodCount: number;
  sameSlotElsewhere: string[];
}

const NO_AVAILABILITY: Availability = {
  readState: "known",
  weeklyPeriodCount: 0,
  sameSlotElsewhere: [],
};

const availabilityNotice = ({
  availability,
  isCombinedSession,
  teacherName,
}: {
  availability: Availability;
  isCombinedSession: boolean;
  teacherName: string;
}): string => {
  if (availability.readState === "pending") {
    return `Checking ${teacherName}'s other periods in this slot…`;
  }
  if (availability.readState === "failed") {
    return `${teacherName}'s other periods in this slot could not be read, so this form cannot tell you whether the slot clashes. Saving is still allowed — nothing in the timetable prevents a double-booking — and the conflict scan will report it afterwards.`;
  }

  const elsewhere = availability.sameSlotElsewhere.join(", ");
  const teaching = `${availability.weeklyPeriodCount} ${
    availability.weeklyPeriodCount === 1 ? "period" : "periods"
  } this week`;

  if (!elsewhere) {
    return `${teacherName} has nothing else in this slot and teaches ${teaching}.`;
  }
  if (isCombinedSession) {
    return `Marked as an intentional combined session, so the overlap with ${elsewhere} in this slot is left out of the conflict scan. ${teacherName} will teach ${teaching}.`;
  }
  return `${teacherName} is already timetabled in this slot for ${elsewhere}, and teaches ${teaching}. If that overlap is intentional, mark it as a combined session below and the conflict scan will leave it out of its report.`;
};

/**
 * The tone of the availability line.
 *
 * Amber for a real overlap with a way to declare it, a dashed neutral border
 * when the read failed — which must not look like a clean bill of health — and
 * the quiet muted panel when the slot is simply free.
 */
const availabilityTone = (
  readState: Availability["readState"],
  hasSlotClash: boolean
): string => {
  if (readState === "failed") {
    return "border-border border-dashed";
  }
  if (readState === "known" && hasSlotClash) {
    return "border-warning-ink/40 bg-accent/14 text-warning-ink";
  }
  return "bg-muted border-border";
};

const SlotField = ({ slot, times }: { slot: string; times?: string }) => (
  <Field>
    <FieldTitle>Slot</FieldTitle>
    <p className="text-sm">
      <span className="font-semibold">{slot}</span>
      {times && (
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {` ${times}`}
        </span>
      )}
    </p>
    <FieldDescription>
      The class and slot cannot be changed here. Unassign the slot first to move
      it.
    </FieldDescription>
  </Field>
);

const CombinedSessionField = ({
  formId,
  isCombinedSession,
  isLoading,
  onChange,
}: {
  formId: string;
  isCombinedSession: boolean;
  isLoading: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <Field orientation="horizontal">
    <Checkbox
      aria-describedby={COMBINED_SESSION_HINT_ID}
      checked={isCombinedSession}
      disabled={isLoading}
      id={`${formId}-combined-session`}
      onCheckedChange={(checked) => onChange(checked === true)}
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
          : "Leave this unticked for an ordinary period. An unticked overlap in this slot is reported as a clash by the conflict scan."}
      </FieldDescription>
    </div>
  </Field>
);

const StaffField = ({
  disabled,
  error,
  formId,
  onChange,
  staff,
  triggerRef,
  value,
}: {
  disabled: boolean;
  error?: string;
  formId: string;
  onChange: (value: string | null) => void;
  staff: Staff[];
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  value: string;
}) => {
  const errorId = `${formId}-staff-error`;
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel id={`${formId}-staff-label`}>Teacher *</FieldLabel>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          aria-labelledby={`${formId}-staff-label`}
          aria-required="true"
          disabled={disabled}
          id={`${formId}-staff`}
          ref={triggerRef}
        >
          <SelectValue placeholder="Select teacher" />
        </SelectTrigger>
        <SelectContent>
          {staff.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {member.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </Field>
  );
};

const SubjectField = ({
  disabled,
  error,
  formId,
  hint,
  onChange,
  subjects,
  triggerRef,
  value,
}: {
  disabled: boolean;
  error?: string;
  formId: string;
  hint?: string;
  onChange: (value: string | null) => void;
  subjects: Subject[];
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  value: string;
}) => {
  const errorId = `${formId}-subject-error`;
  const hintId = `${formId}-subject-hint`;
  const placeholder =
    subjects.length > 0 ? "Select subject" : "No subjects for this grade";
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel id={`${formId}-subject-label`}>Subject *</FieldLabel>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          aria-labelledby={`${formId}-subject-label`}
          aria-required="true"
          disabled={disabled}
          id={`${formId}-subject`}
          ref={triggerRef}
        >
          <SelectValue placeholder={placeholder}>
            {(selected: string | null) =>
              selected ? subjectLabel(selected) : placeholder
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {subjects.map((subject) => (
            <SelectItem key={subject.subjectKey} value={subject.subjectKey}>
              {subjectLabel(subject.subjectKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </Field>
  );
};

interface PeriodAssignmentFormProps {
  formId: string;
  staff: Staff[];
  gradeLevel: number;
  dayOfWeek: number;
  periodNumber: number;
  academicYearId: string | undefined;
  currentAssignmentId?: string;
  onSubmit: (data: unknown) => Promise<void>;
  isLoading?: boolean;
  initialData?: {
    staffId: string;
    subjectKey: string;
    isCombinedSession?: boolean;
  };
}

export const PeriodAssignmentForm = ({
  formId,
  staff,
  gradeLevel,
  dayOfWeek,
  periodNumber,
  academicYearId,
  currentAssignmentId,
  onSubmit,
  isLoading = false,
  initialData,
}: PeriodAssignmentFormProps) => {
  const [formData, setFormData] = useState({
    staffId: initialData?.staffId ?? "",
    subjectKey: initialData?.subjectKey ?? "",
  });
  const [isCombinedSession, setIsCombinedSession] = useState(
    initialData?.isCombinedSession ?? false
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState("");

  const staffRef = useRef<HTMLButtonElement | null>(null);
  const subjectRef = useRef<HTMLButtonElement | null>(null);

  const subjectsQuery = useQuery({
    ...orpc.staff.listSubjects.queryOptions({
      input: { academicYearId: academicYearId ?? "" },
    }),
    enabled: Boolean(academicYearId),
  });

  const subjects = useMemo(() => {
    const catalog = subjectsQuery.data as unknown[] | undefined;
    if (!catalog) {
      return [] as Subject[];
    }
    return (catalog as Subject[]).filter(
      (subject) => subject.gradeLevel === gradeLevel
    );
  }, [gradeLevel, subjectsQuery.data]);

  const teacherWeekQuery = useQuery({
    ...orpc.staff.periods.listTeacherTimetable.queryOptions({
      input: {
        academicYearId: academicYearId ?? "",
        staffId: formData.staffId,
      },
    }),
    enabled: !!academicYearId && !!formData.staffId,
  });

  const availability = useMemo<Availability>(() => {
    if (!formData.staffId) {
      return NO_AVAILABILITY;
    }
    if (teacherWeekQuery.isError) {
      return { ...NO_AVAILABILITY, readState: "failed" };
    }
    if (teacherWeekQuery.isPending) {
      return { ...NO_AVAILABILITY, readState: "pending" };
    }
    const week = (teacherWeekQuery.data ?? []) as unknown as TeacherSlot[];
    const sameSlotElsewhere: string[] = [];
    for (const entry of week) {
      const isSameSlot =
        entry.dayOfWeek === dayOfWeek &&
        entry.periodNumber === periodNumber &&
        entry.id !== currentAssignmentId;
      if (isSameSlot) {
        sameSlotElsewhere.push(entry.className);
      }
    }
    return {
      readState: "known",
      weeklyPeriodCount: week.length,
      sameSlotElsewhere,
    };
  }, [
    currentAssignmentId,
    dayOfWeek,
    formData.staffId,
    periodNumber,
    teacherWeekQuery.data,
    teacherWeekQuery.isError,
    teacherWeekQuery.isPending,
  ]);

  const selectedTeacher = staff.find(
    (member) => member.id === formData.staffId
  );
  const hasSubjectsForGrade = subjects.length > 0;
  const subjectHint = subjectHintFor({
    gradeLevel,
    hasSubjects: hasSubjectsForGrade,
    isError: subjectsQuery.isError,
    isPending: subjectsQuery.isPending,
  });
  const hasSlotClash = availability.sameSlotElsewhere.length > 0;

  const handleChange = (
    field: "staffId" | "subjectKey",
    value: string | null
  ) => {
    if (!value) {
      return;
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field))
    );
  };

  /** Move focus to the first control the schema rejected. */
  const focusFirstInvalid = (fieldErrors: Record<string, string>) => {
    if (fieldErrors.staffId) {
      staffRef.current?.focus();
    } else if (fieldErrors.subjectKey) {
      subjectRef.current?.focus();
    }
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
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.issues) {
        const path = issue.path?.[0]?.key as string | undefined;
        if (path) {
          fieldErrors[path] = issue.message || "Invalid value";
        }
      }
      setErrors(fieldErrors);
      focusFirstInvalid(fieldErrors);
      return;
    }

    try {
      await onSubmit({ ...result.output, isCombinedSession });
    } catch (error) {
      setGeneralError(
        formatApiErrorMessage(
          error,
          "The assignment was not saved. Nothing was changed."
        )
      );
    }
  };

  const slotLabel = `${DAY_NAMES[dayOfWeek] ?? `Day ${dayOfWeek}`}, Period ${periodNumber}`;

  return (
    <form
      className="space-y-5"
      id={formId}
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      {generalError && (
        <div
          className="bg-destructive/10 text-destructive rounded-md p-3 text-sm"
          role="alert"
        >
          {generalError}
        </div>
      )}

      <SlotField slot={slotLabel} times={PERIOD_TIMES.get(periodNumber)} />

      <StaffField
        disabled={isLoading}
        error={errors.staffId}
        formId={formId}
        onChange={(value) => handleChange("staffId", value)}
        staff={staff}
        triggerRef={staffRef}
        value={formData.staffId}
      />

      <SubjectField
        disabled={isLoading || !hasSubjectsForGrade}
        error={errors.subjectKey}
        formId={formId}
        hint={subjectHint}
        onChange={(value) => handleChange("subjectKey", value)}
        subjects={subjects}
        triggerRef={subjectRef}
        value={formData.subjectKey}
      />
      {selectedTeacher && (
        <p
          className={`border p-3 text-sm leading-relaxed ${availabilityTone(
            availability.readState,
            hasSlotClash
          )}`}
          role="status"
        >
          {availabilityNotice({
            availability,
            isCombinedSession,
            teacherName: selectedTeacher.name,
          })}
        </p>
      )}

      {hasSlotClash && (
        <CombinedSessionField
          formId={formId}
          isCombinedSession={isCombinedSession}
          isLoading={isLoading}
          onChange={setIsCombinedSession}
        />
      )}
    </form>
  );
};
