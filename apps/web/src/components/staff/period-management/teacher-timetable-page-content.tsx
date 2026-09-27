/*
 * `role="status"` is spelled out rather than swapped for `<output>`: these lines
 * report what a background read found, not the result of a calculation, and the
 * live region is the point.
 */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a status line is not a form output, and the live region is the point */
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
  FieldDescription,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useMemo } from "react";

import { TeacherCombobox } from "@/components/staff/class-assignment/teacher-combobox";
import { TeacherTimetableDialogs } from "@/components/staff/period-management/teacher-timetable-dialogs";
import { TeacherTimetableGrid } from "@/components/staff/period-management/teacher-timetable-grid";
import { useTeacherTimetablePage } from "@/components/staff/period-management/use-teacher-timetable-page";

interface TeacherTimetablePageContentProps {
  /** When set, the teacher is fixed by the route and never asked for again. */
  staffId?: string;
}

/** Monday to Friday: the days a period can be timetabled on. */
const DAYS_IN_WEEK = 5;

/**
 * What a failed read looks like on this page.
 *
 * Each of these leaves the screen with nothing to show, and the honest answer is
 * to name the read and offer the retry — never to fall through to an empty grid,
 * which would say "this teacher teaches nothing" when it means "we could not
 * ask".
 */
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
      {message} Nothing below is this teacher&apos;s timetable.
    </EmptyDescription>
    <EmptyContent>
      <Button onClick={onRetry} size="sm" type="button" variant="outline">
        Try again
      </Button>
    </EmptyContent>
  </Empty>
);

const Metric = ({ label, value }: { label: string; value: number }) => (
  <div>
    <dt className="text-primary-foreground/75 uppercase">{label}</dt>
    <dd className="font-heading text-accent mt-0.5 text-2xl leading-none font-semibold tabular-nums">
      {value}
    </dd>
  </div>
);

/**
 * Who this is, and how full their week is.
 *
 * The counts are derived from the rows that exist rather than from
 * `40 − rows`: a combined session puts two rows in one slot, so the old
 * arithmetic reported busy slots as free and hid the result behind a zero.
 */
const TeacherBanner = ({
  classCount,
  email,
  entriesRead,
  freeSlotCount,
  periodsThisWeek,
  staffRead,
  teacherName,
}: {
  classCount: number;
  email?: string;
  entriesRead: string;
  freeSlotCount: number;
  periodsThisWeek: number;
  staffRead: string;
  teacherName?: string;
}) => (
  <div className="bg-primary text-primary-foreground flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
    <div className="min-w-0">
      <div className="font-heading text-2xl leading-tight font-semibold">
        {teacherName ??
          (staffRead === "pending"
            ? "Loading teacher…"
            : "Teacher not on the staff list")}
      </div>
      {email && (
        <div className="text-primary-foreground/75 mt-1 text-xs">{email}</div>
      )}
      {!teacherName && staffRead === "known" && (
        <div className="text-primary-foreground/75 mt-1 text-xs">
          This id is not on the staff list, so the grid below is not tied to a
          named teacher. Check the link, or pick the teacher again.
        </div>
      )}
    </div>
    {entriesRead === "known" && (
      <dl className="ml-auto flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <Metric label="Periods a week" value={periodsThisWeek} />
        <Metric label="Classes taught" value={classCount} />
        <Metric label="Free slots" value={freeSlotCount} />
      </dl>
    )}
  </div>
);

const ConflictScanNotice = ({
  clashCount,
  message,
  onRetry,
  scanFailed,
}: {
  clashCount: number;
  message: string;
  onRetry: () => void;
  scanFailed: boolean;
}) => {
  if (scanFailed) {
    return (
      <p
        className="text-muted-foreground border-border border border-dashed px-3 py-2 text-xs"
        role="status"
      >
        {`The conflict scan could not be checked, so shared slots below are labelled neither as clashes nor as combined sessions. ${message}`}{" "}
        <button
          className="text-primary font-bold underline"
          onClick={onRetry}
          type="button"
        >
          Re-check
        </button>
      </p>
    );
  }

  if (clashCount === 0) {
    return null;
  }

  return (
    <p
      className="text-destructive flex items-start gap-2 text-xs font-semibold"
      role="status"
    >
      <IconAlertTriangle
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0"
      />
      <span>
        {`The conflict scan reported ${clashCount} of this teacher's rows as an unmarked overlap. They are marked Clash in the grid. A clash is a report, not a guarantee: nothing in the timetable prevents a double-booking from being saved.`}
      </span>
    </p>
  );
};

const ClassesReadFailure = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) => (
  <p className="text-muted-foreground text-xs" role="status">
    {`The class list could not be read, so the assign and edit forms have no classes to offer. ${message}`}{" "}
    <button
      className="text-primary font-bold underline"
      onClick={onRetry}
      type="button"
    >
      Try again
    </button>
  </p>
);

const TimetableBody = ({
  page,
  clashCount,
  classCount,
  freeSlotCount,
}: {
  page: ReturnType<typeof useTeacherTimetablePage>;
  clashCount: number;
  classCount: number;
  freeSlotCount: number;
}) => {
  const showsGrid = page.entriesRead === "known";

  return (
    <>
      {page.staffRead === "failed" ? (
        <ReadFailure
          message={page.staffMessage}
          onRetry={page.handleRetryStaff}
          title="The staff list could not be read"
        />
      ) : (
        <TeacherBanner
          classCount={classCount}
          email={page.currentStaff?.email ?? undefined}
          entriesRead={page.entriesRead}
          freeSlotCount={freeSlotCount}
          periodsThisWeek={page.entries.length}
          staffRead={page.staffRead}
          teacherName={page.currentStaff?.name}
        />
      )}

      {page.entriesRead === "pending" && (
        <div aria-busy="true" className="space-y-2">
          <Skeleton
            aria-hidden="true"
            className="h-[26rem] w-full motion-reduce:animate-none"
          />
          <span className="sr-only">
            {`Loading ${page.currentStaff?.name ?? "this teacher"}'s timetable`}
          </span>
        </div>
      )}

      {page.entriesRead === "failed" && (
        <ReadFailure
          message={page.entriesMessage}
          onRetry={page.handleRetryEntries}
          title="This teacher's timetable could not be loaded"
        />
      )}

      {showsGrid && page.entries.length === 0 && (
        <Empty className="min-h-40 border border-dashed">
          <EmptyTitle>No periods assigned yet</EmptyTitle>
          <EmptyDescription>
            {`${
              page.currentStaff?.name ?? "This teacher"
            } has no classes timetabled for ${
              page.currentYear?.year
            }. Assign one from any slot in the grid below. A slot can hold more than one class when it is a combined session.`}
          </EmptyDescription>
        </Empty>
      )}

      {showsGrid && (
        <ConflictScanNotice
          clashCount={clashCount}
          message={page.conflictsMessage}
          onRetry={page.handleRetryConflicts}
          scanFailed={page.conflictsRead === "failed"}
        />
      )}

      {showsGrid && (
        <TeacherTimetableGrid
          entries={page.entries}
          onAssignClick={page.handleAssignClick}
          onDeleteClick={page.handleDeleteClick}
          onEditClick={page.handleEditClick}
          teacherName={page.currentStaff?.name}
        />
      )}

      {page.classesRead === "failed" && (
        <ClassesReadFailure
          message={page.classesMessage}
          onRetry={page.handleRetryClasses}
        />
      )}

      {page.currentYear && (
        <TeacherTimetableDialogs
          academicYearId={page.currentYear.id}
          addSlot={page.addSlot}
          classes={page.classes}
          isAddOpen={page.isAddDialogOpen}
          isAddPending={page.assignMutation.isPending}
          isDeleteOpen={page.isDeleteDialogOpen}
          isDeletePending={page.deleteMutation.isPending}
          isEditOpen={page.isEditDialogOpen}
          isEditPending={page.updateMutation.isPending}
          onAddOpenChange={page.handleAddOpenChange}
          onAddSubmit={page.handleAddSubmit}
          onConfirmDelete={page.handleConfirmDelete}
          onDeleteOpenChange={(open) => page.setIsDeleteDialogOpen(open)}
          onEditOpenChange={(open) => page.setIsEditDialogOpen(open)}
          onEditSubmit={page.handleEditSubmit}
          selectedEntry={page.selectedEntry}
          staffId={page.staffId}
        />
      )}
    </>
  );
};

export const TeacherTimetablePageContent = ({
  staffId: fixedStaffId,
}: TeacherTimetablePageContentProps) => {
  const page = useTeacherTimetablePage(fixedStaffId);

  const { classCount, freeSlotCount } = useMemo(() => {
    const slots = new Set<string>();
    const classes = new Set<string>();
    for (const entry of page.entries) {
      slots.add(`${entry.dayOfWeek}-${entry.periodNumber}`);
      classes.add(entry.classId);
    }
    return {
      classCount: classes.size,
      freeSlotCount: Math.max(
        page.periods.length * DAYS_IN_WEEK - slots.size,
        0
      ),
    };
  }, [page.entries, page.periods]);

  const clashCount = page.entries.filter((entry) => entry.isClash).length;
  const hasTeacher = page.staffId !== "";
  const hasYear = Boolean(page.currentYear);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-3xl font-bold">Teacher Timetable</h1>
        <p className="text-muted-foreground mt-2">
          One teacher&apos;s periods across every class they teach this academic
          year. Every slot here can be assigned, edited or removed.
        </p>
      </div>

      {!fixedStaffId && (
        <Field className="max-w-sm">
          <FieldLabel htmlFor="teacher-timetable-select">Teacher</FieldLabel>
          <TeacherCombobox
            id="teacher-timetable-select"
            onValueChange={(next) => page.setStaffId(next)}
            value={page.staffId}
          />
          <FieldDescription>
            Pick a teacher to load their week. The add button in a slot assigns
            another class to it.
          </FieldDescription>
        </Field>
      )}

      {page.currentYearRead === "failed" && (
        <ReadFailure
          message={page.currentYearMessage}
          onRetry={page.handleRetryYears}
          title="The academic year could not be read"
        />
      )}

      {page.currentYearRead === "pending" && (
        <Skeleton
          aria-hidden="true"
          className="h-9 w-64 motion-reduce:animate-none"
        />
      )}

      {page.currentYearRead === "known" && !hasYear && (
        <Empty className="min-h-64 border border-dashed">
          <EmptyTitle>No current academic year</EmptyTitle>
          <EmptyDescription>
            A timetable belongs to an academic year, and none is marked current.
            Open the academic year pages and set one before reading timetables.
          </EmptyDescription>
        </Empty>
      )}

      {hasYear && !hasTeacher && !fixedStaffId && (
        <Empty className="min-h-64 border border-dashed">
          <EmptyTitle>No teacher chosen</EmptyTitle>
          <EmptyDescription>
            Choose a teacher above to load their week. Nothing has been read
            yet, so no counts are shown.
          </EmptyDescription>
        </Empty>
      )}

      {hasTeacher && hasYear && page.currentYearRead !== "failed" && (
        <TimetableBody
          clashCount={clashCount}
          classCount={classCount}
          freeSlotCount={freeSlotCount}
          page={page}
        />
      )}
    </div>
  );
};
