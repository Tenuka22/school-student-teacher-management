/*
 * `<section>` is used for the scrollable grid rather than `role="region"`, and
 * the one suppression below is for the `tabIndex` that makes a scroll container
 * reachable: a region that scrolls but cannot be focused cannot be scrolled with
 * the keyboard, which WCAG 2.1.1 requires.
 */
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be focusable so it can be scrolled from the keyboard */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a status line is not a form output, and the live region is the point */
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
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { IconRepeat } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import type { ReactNode } from "react";

import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;

interface TimetableEntry {
  id: string;
  classId: string;
  className: string;
  subjectKey: string;
  dayOfWeek: number;
  periodNumber: number;
}

/** A free slot, said in words as well as in a dash. */
const FreeSlot = () => (
  <>
    <span aria-hidden="true">—</span>
    <span className="sr-only">No class assigned in this slot</span>
  </>
);

/**
 * The grid's own shape, held while it loads.
 *
 * A single `Skeleton` where the table will be is a blank panel that pops into a
 * 40-cell table and moves everything below it; this reserves the same rows,
 * columns and header block, so nothing jumps when the timetable lands.
 */
const TimetableSkeleton = () => (
  <div aria-hidden="true" className="space-y-1.5">
    <Skeleton className="h-8 w-full motion-reduce:animate-none" />
    {CODE_DEFINED_PERIODS.map((period) => (
      <div className="flex gap-1.5" key={period.periodNumber}>
        <Skeleton className="h-12 w-32 motion-reduce:animate-none" />
        {DAYS_OF_WEEK.map((day) => (
          <Skeleton
            className="h-12 min-w-32 flex-1 motion-reduce:animate-none"
            key={day}
          />
        ))}
      </div>
    ))}
  </div>
);

const ReadFailure = ({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) => (
  <Empty className="min-h-64 border border-dashed">
    <EmptyTitle>{title}</EmptyTitle>
    <EmptyDescription>
      {message} The grid below is not your timetable — nothing has been read, so
      nothing here says you have a free slot.
    </EmptyDescription>
    <EmptyContent>
      <Button onClick={onRetry} size="sm" type="button" variant="outline">
        Try again
      </Button>
    </EmptyContent>
  </Empty>
);

/**
 * The read-only week.
 *
 * A real `<table>` with a caption and `scope` on every header, and the day and
 * period headers pinned while it scrolls. A slot holding more than one class is
 * marked: a teacher who finds two classes in one period deserves to be told what
 * that is, not left to guess whether it is a mistake.
 */
const TimetableTable = ({
  academicYear,
  entriesBySlot,
  name,
}: {
  academicYear: number;
  entriesBySlot: Map<string, TimetableEntry[]>;
  name: string;
}) => (
  <section
    aria-label={`Timetable grid for ${name}, scrollable`}
    className="max-h-[min(70vh,40rem)] overflow-auto [&>[data-slot=table-container]]:h-full"
    tabIndex={0}
  >
    <Table className="w-max min-w-full">
      <TableCaption className="sr-only">
        {`My timetable for academic year ${academicYear}: eight periods by five days, Monday to Friday. Column headers are days, row headers are periods with their start and end times. Read only — the administration assigns these periods.`}
      </TableCaption>
      <TableHeader className="bg-primary [&_tr]:border-none">
        <TableRow className="hover:bg-primary">
          <TableHead
            className="text-accent bg-primary sticky left-0 z-30 h-10 w-32 text-xs font-extrabold tracking-[0.16em] uppercase"
            scope="col"
          >
            Period
          </TableHead>
          {DAYS_OF_WEEK.map((day) => (
            <TableHead
              className="text-accent bg-primary sticky top-0 z-20 h-10 text-center text-xs font-extrabold tracking-[0.16em] uppercase"
              key={day}
              scope="col"
            >
              {day}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {CODE_DEFINED_PERIODS.map((period) => (
          <TableRow key={period.periodNumber}>
            <TableHead
              className="bg-card text-foreground sticky left-0 z-10 w-32 border-r font-medium"
              scope="row"
            >
              <div className="text-sm font-bold">
                {`Period ${period.periodNumber}`}
              </div>
              <div className="text-muted-foreground font-mono text-xs tabular-nums">
                {period.startTime}–{period.endTime}
              </div>
            </TableHead>
            {DAYS_OF_WEEK.map((_, dayIndex) => {
              const key = `${dayIndex + 1}-${period.periodNumber}`;
              const slotEntries = entriesBySlot.get(key) ?? [];
              return (
                <TableCell
                  className={`min-h-[56px] p-2 align-top ${
                    slotEntries.length > 0 ? "bg-primary/5" : "bg-muted/30"
                  }`}
                  key={key}
                >
                  {slotEntries.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {slotEntries.length > 1 && (
                        <Badge
                          className="border-warning-ink/40 text-warning-ink gap-1"
                          variant="outline"
                        >
                          <IconRepeat aria-hidden="true" />
                          {`${slotEntries.length} classes`}
                        </Badge>
                      )}
                      {slotEntries.map((entry) => (
                        <div className="bg-card border p-1.5" key={entry.id}>
                          <div className="font-bold">{entry.className}</div>
                          <div className="text-muted-foreground text-xs">
                            {subjectLabel(entry.subjectKey)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">
                      <FreeSlot />
                    </span>
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </section>
);

const TeacherTimetable = () => {
  const { year } = useParams({ from: "/_auth/teacher/$year/timetable" });
  const yearsQuery = useQuery(orpc.staff.listAcademicYears.queryOptions());
  const profileQuery = useQuery(orpc.staff.getMyStaff.queryOptions());
  const academicYear = useMemo(
    () => yearsQuery.data?.find((candidate) => candidate.year === Number(year)),
    [yearsQuery.data, year]
  );
  const timetableQuery = useQuery({
    ...orpc.staff.periods.getMyTeacherTimetable.queryOptions({
      input: { academicYearId: academicYear?.id ?? "" },
    }),
    enabled: Boolean(academicYear?.id),
  });

  // Grouped before the early returns: a hook cannot sit below a conditional
  // return, and the grouping is what tells a free slot from a busy one.
  const entries = useMemo(
    () => (timetableQuery.data ?? []) as unknown as TimetableEntry[],
    [timetableQuery.data]
  );
  const entriesBySlot = useMemo(() => {
    const map = new Map<string, TimetableEntry[]>();
    for (const entry of entries) {
      const key = `${entry.dayOfWeek}-${entry.periodNumber}`;
      const slotEntries = map.get(key) ?? [];
      slotEntries.push(entry);
      map.set(key, slotEntries);
    }
    return map;
  }, [entries]);
  const sharedSlotCount = useMemo(
    () =>
      [...entriesBySlot.values()].filter(
        (slotEntries) => slotEntries.length > 1
      ).length,
    [entriesBySlot]
  );

  if (yearsQuery.isPending || profileQuery.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-9 w-64 motion-reduce:animate-none" />
        <Card>
          <CardHeader className="border-b">
            <Skeleton className="h-5 w-48 motion-reduce:animate-none" />
            <Skeleton className="h-3 w-72 motion-reduce:animate-none" />
          </CardHeader>
          <CardContent>
            <TimetableSkeleton />
          </CardContent>
        </Card>
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
            onClick={() => {
              yearsQuery.refetch();
            }}
            size="sm"
            type="button"
            variant="outline"
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

  if (profileQuery.isError) {
    return (
      <Empty className="min-h-[50vh] border border-dashed">
        <EmptyTitle>Your staff profile could not be loaded</EmptyTitle>
        <EmptyDescription>
          {formatApiErrorMessage(
            profileQuery.error,
            "The staff service did not answer."
          )}{" "}
          Nothing is wrong with your record — try again, or ask the
          administration to check it.
        </EmptyDescription>
        <EmptyContent>
          <Button
            onClick={() => {
              profileQuery.refetch();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const profile = profileQuery.data?.profile;
  if (!profile) {
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

  let timetableContent: ReactNode;
  if (timetableQuery.isPending) {
    timetableContent = <TimetableSkeleton />;
  } else if (timetableQuery.isError) {
    timetableContent = (
      <ReadFailure
        message={formatApiErrorMessage(
          timetableQuery.error,
          "The timetable service did not answer."
        )}
        onRetry={() => {
          timetableQuery.refetch();
        }}
        title="Timetable could not be loaded"
      />
    );
  } else if (entries.length === 0) {
    timetableContent = (
      <Empty className="min-h-64 border border-dashed">
        <EmptyTitle>No timetable assignments</EmptyTitle>
        <EmptyDescription>
          {`No class periods are assigned to you for academic year ${academicYear.year}. If that is unexpected, ask the administration to assign your periods — the grid is built from their Teacher Timetable page.`}
        </EmptyDescription>
      </Empty>
    );
  } else {
    timetableContent = (
      <>
        <TimetableTable
          academicYear={academicYear.year}
          entriesBySlot={entriesBySlot}
          name={profile.name}
        />
        {sharedSlotCount > 0 && (
          <p className="text-muted-foreground mt-3 text-xs">
            {`${sharedSlotCount} ${
              sharedSlotCount === 1 ? "slot holds" : "slots hold"
            } more than one class. That is how a combined session is recorded: you teach those classes at once. If the administration did not mean it, they can see it on the conflict scan under Period Assignment.`}
          </p>
        )}
      </>
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
          <CardTitle>{profile.name}</CardTitle>
          <CardDescription>
            Classes and subjects assigned in academic year {academicYear.year}.
          </CardDescription>
        </CardHeader>
        <CardContent aria-busy={timetableQuery.isPending ? "true" : undefined}>
          {timetableContent}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeacherTimetable;
