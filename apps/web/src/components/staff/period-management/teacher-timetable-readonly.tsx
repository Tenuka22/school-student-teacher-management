"use client";

import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@school-student-teacher-management/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { orpc } from "@/utils/orpc";

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

interface TimetableEntry {
  id: string;
  classId: string;
  className: string;
  subjectKey: string;
  dayOfWeek: number;
  periodNumber: number;
}

const TeacherTimetable = () => {
  const { year } = useParams({ from: "/_auth/teacher/$year/timetable" });
  const yearsQuery = useQuery(orpc.staff.listAcademicYears.queryOptions());
  const profileQuery = useQuery(orpc.staff.getMyStaff.queryOptions());
  const academicYear = yearsQuery.data?.find(
    (candidate) => candidate.year === Number(year)
  );
  const timetableQuery = useQuery({
    ...orpc.staff.periods.getMyTeacherTimetable.queryOptions({
      input: { academicYearId: academicYear?.id ?? "" },
    }),
    enabled: Boolean(academicYear?.id),
  });

  if (yearsQuery.isPending || profileQuery.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[32rem] w-full" />
      </div>
    );
  }

  if (yearsQuery.isError) {
    return (
      <Empty className="min-h-[50vh] border border-dashed">
        <EmptyTitle>Academic years could not be loaded</EmptyTitle>
        <EmptyDescription>
          Your timetable is scoped to an academic year, and the year list could
          not be read. Nothing is wrong with your record — try again.
        </EmptyDescription>
        <EmptyContent>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              yearsQuery.refetch();
            }}
          >
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (!academicYear) {
    return (
      <Empty className="min-h-[50vh] border border-dashed">
        <EmptyTitle>Academic year not found</EmptyTitle>
        <EmptyDescription>
          Choose an academic year from the sidebar to view your timetable.
        </EmptyDescription>
      </Empty>
    );
  }

  if (profileQuery.isError || !profileQuery.data?.profile) {
    return (
      <Empty className="min-h-[50vh] border border-dashed">
        <EmptyTitle>No staff profile linked</EmptyTitle>
        <EmptyDescription>
          Your login is not connected to a staff record yet. Ask the
          administration to link your account before viewing your timetable.
        </EmptyDescription>
      </Empty>
    );
  }

  const entries = (timetableQuery.data ?? []) as unknown as TimetableEntry[];
  const entriesBySlot = new Map<string, TimetableEntry[]>();
  for (const entry of entries) {
    const key = `${entry.dayOfWeek}-${entry.periodNumber}`;
    const slotEntries = entriesBySlot.get(key) ?? [];
    slotEntries.push(entry);
    entriesBySlot.set(key, slotEntries);
  }

  let timetableContent: ReactNode;
  if (timetableQuery.isPending) {
    timetableContent = <Skeleton className="h-96 w-full" />;
  } else if (timetableQuery.isError) {
    timetableContent = (
      <Empty className="min-h-64 border border-dashed">
        <EmptyTitle>Timetable could not be loaded</EmptyTitle>
        <EmptyDescription>
          The timetable service returned an error. Try loading it again.
        </EmptyDescription>
        <EmptyContent>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              timetableQuery.refetch();
            }}
          >
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else if (entries.length === 0) {
    timetableContent = (
      <Empty className="min-h-64 border border-dashed">
        <EmptyTitle>No timetable assignments</EmptyTitle>
        <EmptyDescription>
          No class periods are assigned to you for this academic year. If that
          is unexpected, ask the administration to check your timetable.
        </EmptyDescription>
      </Empty>
    );
  } else {
    timetableContent = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead>
            {DAYS_OF_WEEK.map((day) => (
              <TableHead key={day} className="text-center">
                {day}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {CODE_DEFINED_PERIODS.map((period) => (
            <TableRow key={period.periodNumber}>
              <TableCell>
                <div className="font-medium">Period {period.periodNumber}</div>
                <div className="text-muted-foreground text-xs">
                  {period.startTime}–{period.endTime}
                </div>
              </TableCell>
              {DAYS_OF_WEEK.map((_, dayIndex) => {
                const key = `${dayIndex + 1}-${period.periodNumber}`;
                const slotEntries = entriesBySlot.get(key) ?? [];

                return (
                  <TableCell
                    key={key}
                    className={
                      slotEntries.length > 0
                        ? "bg-primary/5 align-top"
                        : "bg-muted/30 align-top"
                    }
                  >
                    {slotEntries.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {slotEntries.map((entry) => (
                          <div
                            key={entry.id}
                            className="bg-card rounded border p-2"
                          >
                            <div className="font-medium">{entry.className}</div>
                            <div className="text-muted-foreground text-xs">
                              {subjectLabel(entry.subjectKey)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl font-bold">My Timetable</h1>
          <Badge variant="secondary">Read only</Badge>
        </div>
        <p className="text-muted-foreground mt-2">
          Your weekly teaching schedule for academic year {academicYear.year}.
          Changes are made by the administration under Teacher Timetable.
        </p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{profileQuery.data.profile.name}</CardTitle>
          <CardDescription>
            Classes and subjects assigned in academic year {academicYear.year}.
          </CardDescription>
        </CardHeader>
        <CardContent>{timetableContent}</CardContent>
      </Card>
    </div>
  );
};

export default TeacherTimetable;
