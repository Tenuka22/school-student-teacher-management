"use client";

import type {
  classPeriodSubject,
  classPeriodTeacher,
} from "@school-student-teacher-management/db/schema/periods";
import type { staff as staffTable } from "@school-student-teacher-management/db/schema/staff";
import { Checkbox } from "@school-student-teacher-management/ui/components/checkbox";
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

type Staff = typeof staffTable.$inferSelect;
type PeriodSubject = typeof classPeriodSubject.$inferSelect & {
  teachers: (typeof classPeriodTeacher.$inferSelect)[];
};

interface TeacherTimetableEntry {
  dayOfWeek: number;
  periodNumber: number;
  className: string;
  id: string;
}

interface TeacherAssignmentFormProps {
  formId: string;
  staff: Staff[];
  subject: PeriodSubject;
  academicYearId: string | undefined;
  onSubmit: (data: unknown) => Promise<void>;
  isLoading?: boolean;
}

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const AvailabilityNotice = ({
  teacherName,
  hasSlotClash,
  sameSlotElsewhere,
  weeklyPeriodCount,
}: {
  teacherName: string;
  hasSlotClash: boolean;
  sameSlotElsewhere: string[];
  weeklyPeriodCount: number;
}) => (
  <div
    className={
      hasSlotClash
        ? "bg-accent/14 border-accent/50 border p-3 text-sm leading-relaxed"
        : "bg-muted border-border border p-3 text-sm leading-relaxed"
    }
  >
    {hasSlotClash ? (
      <>
        <strong>Availability:</strong> {teacherName} is already assigned to{" "}
        {sameSlotElsewhere.join(", ")} at this exact slot. Currently teaches{" "}
        {weeklyPeriodCount} periods this week. If this is intentional (e.g. a
        combined session across classes), mark it below.
      </>
    ) : (
      <>
        <strong>Availability:</strong> {teacherName} is free this slot.
        Currently teaches {weeklyPeriodCount} periods this week.
      </>
    )}
  </div>
);

export const TeacherAssignmentForm = ({
  formId,
  staff,
  subject,
  academicYearId,
  onSubmit,
  isLoading = false,
}: TeacherAssignmentFormProps) => {
  const [formData, setFormData] = useState({
    staffId: "",
  });
  const [isCombinedSession, setIsCombinedSession] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState("");

  const teacherTimetableQuery = useQuery({
    ...orpc.staff.periods.listTeacherTimetable.queryOptions({
      input: {
        academicYearId: academicYearId ?? "",
        staffId: formData.staffId,
      },
    }),
    enabled: !!academicYearId && !!formData.staffId,
  });

  const selectedTeacher = staff.find((s) => s.id === formData.staffId);

  const { weeklyPeriodCount, sameSlotElsewhere } = useMemo(() => {
    const entries = (teacherTimetableQuery.data ?? []) as
      | TeacherTimetableEntry[]
      | undefined;
    if (!entries) {
      return { weeklyPeriodCount: 0, sameSlotElsewhere: [] as string[] };
    }
    const clash = entries.filter(
      (e) =>
        e.dayOfWeek === subject.dayOfWeek &&
        e.periodNumber === subject.periodNumber
    );
    return {
      weeklyPeriodCount: entries.length,
      sameSlotElsewhere: clash.map((c) => c.className),
    };
  }, [teacherTimetableQuery.data, subject.dayOfWeek, subject.periodNumber]);

  const hasSlotClash = sameSlotElsewhere.length > 0;

  const schema = v.object({
    staffId: v.pipe(v.string(), v.minLength(1, "Staff is required")),
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
      await onSubmit({ ...result.output, isCombinedSession });
    } catch (error) {
      setGeneralError(
        error instanceof Error ? error.message : "Failed to assign teacher"
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
          {DAY_NAMES[subject.dayOfWeek]} · Period {subject.periodNumber} ·{" "}
          {subject.subjectKey}
        </p>
      </div>

      <Field data-invalid={Boolean(errors.staffId)}>
        <FieldLabel htmlFor={`${formId}-staffId`}>
          Teacher <RequiredMark />
        </FieldLabel>
        <Select
          value={formData.staffId}
          onValueChange={(value: string) => {
            if (value) {
              handleChange("staffId", value);
            }
          }}
        >
          <SelectTrigger
            {...fieldA11y(`${formId}-staffId`, {
              error: errors.staffId,
              required: true,
            })}
            disabled={isLoading}
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
        {errors.staffId && (
          <FieldError id={errorId(`${formId}-staffId`)}>
            {errors.staffId}
          </FieldError>
        )}
      </Field>

      {selectedTeacher && !teacherTimetableQuery.isLoading && (
        <AvailabilityNotice
          hasSlotClash={hasSlotClash}
          sameSlotElsewhere={sameSlotElsewhere}
          teacherName={selectedTeacher.name}
          weeklyPeriodCount={weeklyPeriodCount}
        />
      )}

      {hasSlotClash && (
        <Field orientation="horizontal">
          <Checkbox
            id={`${formId}-isCombinedSession`}
            checked={isCombinedSession}
            onCheckedChange={(checked) =>
              setIsCombinedSession(checked === true)
            }
            disabled={isLoading}
          />
          <FieldLabel
            htmlFor={`${formId}-isCombinedSession`}
            className="font-normal"
          >
            This is an intentional combined session, not a scheduling mistake
          </FieldLabel>
        </Field>
      )}
    </form>
  );
};
