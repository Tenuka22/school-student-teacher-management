"use client";

import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
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

import { orpc } from "@/utils/orpc";

type Staff = typeof staffTable.$inferSelect;
interface Subject {
  subjectKey: string;
  gradeLevel: number;
}
interface TeacherTimetableEntry {
  dayOfWeek: number;
  periodNumber: number;
  className: string;
}

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
    staffId: initialData?.staffId || "",
    subjectKey: initialData?.subjectKey || "",
  });
  const [isCombinedSession, setIsCombinedSession] = useState(
    initialData?.isCombinedSession ?? false
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState("");

  const subjectsQuery = useQuery({
    ...orpc.staff.listSubjects.queryOptions({
      input: { academicYearId: academicYearId ?? "" },
    }),
    enabled: Boolean(academicYearId),
  });

  const filteredSubjects = useMemo(() => {
    const subjects = subjectsQuery.data as unknown[] | undefined;
    if (!subjects) {
      return [];
    }
    return (subjects as Subject[]).filter((s) => s.gradeLevel === gradeLevel);
  }, [gradeLevel, subjectsQuery.data]);

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
      | (TeacherTimetableEntry & { id: string })[]
      | undefined;
    if (!entries) {
      return { weeklyPeriodCount: 0, sameSlotElsewhere: [] as string[] };
    }
    const clash = entries.filter(
      (e) =>
        e.dayOfWeek === dayOfWeek &&
        e.periodNumber === periodNumber &&
        e.id !== currentAssignmentId
    );
    return {
      weeklyPeriodCount: entries.length,
      sameSlotElsewhere: clash.map((c) => c.className),
    };
  }, [
    teacherTimetableQuery.data,
    dayOfWeek,
    periodNumber,
    currentAssignmentId,
  ]);

  const hasSlotClash = sameSlotElsewhere.length > 0;

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
      await onSubmit({ ...result.output, isCombinedSession });
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
                {subjectLabel(subject.subjectKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.subjectKey && <FieldError>{errors.subjectKey}</FieldError>}
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
            id="isCombinedSession"
            checked={isCombinedSession}
            onCheckedChange={(checked) =>
              setIsCombinedSession(checked === true)
            }
            disabled={isLoading}
          />
          <FieldLabel htmlFor="isCombinedSession" className="font-normal">
            This is an intentional combined session, not a scheduling mistake
          </FieldLabel>
        </Field>
      )}
    </form>
  );
};
