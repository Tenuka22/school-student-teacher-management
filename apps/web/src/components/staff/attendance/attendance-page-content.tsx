"use client";

import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
} from "@school-student-teacher-management/ui/components/card";
import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import { IconCircleCheck, IconCircleX } from "@tabler/icons-react";

import { AttendanceDateStrip } from "@/components/staff/attendance/attendance-date-strip";
import { AttendanceTeacherGroups } from "@/components/staff/attendance/attendance-teacher-groups";
import type { AttendancePageApi } from "@/components/staff/attendance/use-attendance-page";
import { useAttendancePage } from "@/components/staff/attendance/use-attendance-page";

const DAY_LABELS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const FullDayAbsenceEditor = ({ page }: { page: AttendancePageApi }) => (
  <Field>
    <FieldLabel htmlFor="day-reason">Reason for full-day absence</FieldLabel>
    <Textarea
      id="day-reason"
      value={page.dayReason}
      onChange={(e) => page.setDayReason(e.target.value)}
      placeholder="e.g. Sick leave"
    />
    <p className="text-muted-foreground text-sm">
      Every period scheduled for this teacher today is cancelled.
    </p>
  </Field>
);

const PeriodsEditor = ({ page }: { page: AttendancePageApi }) => {
  if (page.scheduledPeriods.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        This teacher has no periods scheduled on{" "}
        {page.dayOfWeek === null
          ? "this day"
          : `${DAY_LABELS[page.dayOfWeek]}s`}
        .
      </p>
    );
  }
  return (
    <div className="divide-y rounded-md border">
      {page.scheduledPeriods.map(({ periodNumber, classes }) => {
        const absence = page.periodAbsences.get(periodNumber);
        const isAbsent = !!absence;
        return (
          <div key={periodNumber} className="space-y-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-medium">Period {periodNumber}</span>
                <span className="text-muted-foreground ml-2 text-sm">
                  {classes
                    .map((c) => `${c.className} (${c.subjectKey})`)
                    .join(", ")}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant={isAbsent ? "destructive" : "outline"}
                onClick={() => page.togglePeriodAbsent(periodNumber)}
              >
                {isAbsent ? "Absent" : "Present"}
              </Button>
            </div>
            {isAbsent && (
              <Textarea
                value={absence.reason}
                onChange={(e) =>
                  page.setPeriodReason(periodNumber, e.target.value)
                }
                placeholder="Reason for missing this period"
                className="text-sm"
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

const DayAttendanceCard = ({ page }: { page: AttendancePageApi }) => {
  if (page.dayOfWeek === null) {
    return (
      <Card>
        <CardContent className="text-muted-foreground pt-6 text-center text-sm">
          No periods are scheduled on weekends - nothing to mark for this date.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">{DAY_LABELS[page.dayOfWeek]}</span>
            {page.dayStatus === "present" && (
              <Badge variant="outline">
                <IconCircleCheck className="text-primary" />
                Present
              </Badge>
            )}
            {page.dayStatus === "partial" && (
              <Badge variant="outline">Partial</Badge>
            )}
            {page.dayStatus === "absent" && (
              <Badge variant="destructive">
                <IconCircleX />
                Absent (whole day)
              </Badge>
            )}
          </div>
          {page.dayStatus === "absent" ? (
            <Button
              variant="outline"
              onClick={() => page.markWholeDayPresent()}
            >
              Undo whole-day absence
            </Button>
          ) : (
            <Button variant="outline" onClick={() => page.markWholeDayAbsent()}>
              Mark whole day absent
            </Button>
          )}
        </div>

        {page.dayStatus === "absent" ? (
          <FullDayAbsenceEditor page={page} />
        ) : (
          <PeriodsEditor page={page} />
        )}

        <div className="flex justify-end">
          <Button onClick={() => page.handleSave()} disabled={page.isSaving}>
            {page.isSaving ? "Saving..." : "Save Attendance"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export const AttendancePageContent = () => {
  const page = useAttendancePage();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Attendance</h1>
        <p className="text-muted-foreground mt-2">
          Mark a teacher present, partially absent (specific periods), or absent
          for the whole day - for today, a past day, or a pre-announced future
          day.
        </p>
      </div>

      <div className="flex flex-wrap gap-6">
        <AttendanceTeacherGroups
          teachers={page.teachers}
          selectedStaffId={page.staffId}
          onSelect={(next) => page.setStaffId(next)}
          isLoading={page.isLoadingTeachers}
        />

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field className="w-40">
              <FieldLabel htmlFor="attendance-month">Month</FieldLabel>
              <Select
                value={String(page.month)}
                onValueChange={(value: string | null) => {
                  if (value) {
                    page.setMonth(Number(value));
                  }
                }}
              >
                <SelectTrigger id="attendance-month">
                  <SelectValue placeholder="Month">
                    {(value: string | null) =>
                      page.monthOptions.find((o) => String(o.value) === value)
                        ?.label ?? "Month"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {page.monthOptions.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field className="w-28">
              <FieldLabel htmlFor="attendance-year">Year</FieldLabel>
              <Select
                value={String(page.year)}
                onValueChange={(value: string | null) => {
                  if (value) {
                    page.setYear(Number(value));
                  }
                }}
              >
                <SelectTrigger id="attendance-year">
                  <SelectValue placeholder="Year">
                    {(value: string | null) => value ?? "Year"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {page.yearOptions.map((yearOption) => (
                    <SelectItem key={yearOption} value={String(yearOption)}>
                      {yearOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {page.staffId ? (
            <>
              <AttendanceDateStrip
                days={page.dateStrip}
                selectedDate={page.date}
                onSelect={(next) => page.setDate(next)}
              />
              <DayAttendanceCard page={page} />
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              Select a teacher to mark or review their attendance.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
