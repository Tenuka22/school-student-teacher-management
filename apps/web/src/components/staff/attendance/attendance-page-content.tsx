"use client";

import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { IconSearch, IconUsersPlus } from "@tabler/icons-react";
import { useState } from "react";

import { AttendanceGrid } from "@/components/staff/attendance/attendance-grid";
import { useAttendancePage } from "@/components/staff/attendance/use-attendance-page";
import { PortTeachersDialog } from "@/components/staff/teacher-management/port-teachers-dialog";

export const AttendancePageContent = () => {
  const page = useAttendancePage();
  const [filter, setFilter] = useState("");
  const [isPortDialogOpen, setIsPortDialogOpen] = useState(false);
  const showImportBanner =
    !page.isLoadingTeachers &&
    page.teachers.length === 0 &&
    page.hasPreviousYear;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Attendance</h1>
        <p className="text-muted-foreground mt-2">
          Tick a period off to mark that teacher absent for it (with a reason) -
          saves immediately, no separate save step. A teacher absent for every
          scheduled period that day is treated as absent for the whole day.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field className="w-24">
            <FieldLabel htmlFor="attendance-day">Day</FieldLabel>
            <Select
              value={String(page.day)}
              onValueChange={(value: string | null) => {
                if (value) {
                  page.setDay(Number(value));
                }
              }}
            >
              <SelectTrigger id="attendance-day">
                <SelectValue placeholder="Day">
                  {(value: string | null) => value ?? "Day"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {page.dayOptions.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
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

        <Field className="w-64 sm:ml-auto">
          <FieldLabel htmlFor="attendance-filter">Filter teachers</FieldLabel>
          <div className="relative">
            <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="attendance-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="IconSearch by name..."
              className="pl-8"
            />
          </div>
        </Field>
      </div>

      {showImportBanner ? (
        <Empty className="min-h-[40vh] border-none">
          <EmptyTitle>No teachers for {page.currentYear?.year}</EmptyTitle>
          <EmptyDescription>
            This academic year has no teachers yet. Import them from the
            previous year to start marking attendance.
          </EmptyDescription>
          <EmptyContent>
            <Button onClick={() => setIsPortDialogOpen(true)}>
              <IconUsersPlus className="mr-2 size-4" />
              Import from Previous Year
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <AttendanceGrid page={page} filter={filter} />
      )}

      <PortTeachersDialog
        isOpen={isPortDialogOpen}
        onOpenChange={setIsPortDialogOpen}
        academicYearId={page.currentYear?.id}
      />
    </div>
  );
};
