"use client";

import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import type { ReactNode } from "react";

import { TeacherCombobox } from "@/components/staff/class-assignment/teacher-combobox";
import { TeacherTimetableDialogs } from "@/components/staff/period-management/teacher-timetable-dialogs";
import { TeacherTimetableGrid } from "@/components/staff/period-management/teacher-timetable-grid";
import type { TeacherTimetableSearch } from "@/components/staff/period-management/teacher-timetable-search";
import { useTeacherTimetablePage } from "@/components/staff/period-management/use-teacher-timetable-page";
import { PageHeader } from "@/components/ui-patterns/page-header";

type TeacherTimetablePage = ReturnType<typeof useTeacherTimetablePage>;

/** The grid's five columns, so the skeleton reserves exactly what it will. */
const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

interface TeacherTimetablePageContentProps {
  /** When set, the teacher is fixed by the route and never asked for again. */
  staffId?: string;
  /** The validated URL picks, handed over by the route that declared them. */
  search: TeacherTimetableSearch;
}

interface ReadProblemProps {
  title: string;
  message: string;
  /** Absent when retrying cannot help, and the button is left out. */
  onRetry?: () => void;
}

/**
 * A read that failed, named and retryable.
 *
 * Each read on this page used to fail into a blank panel: no reason, no way to
 * try again, and — for the timetable itself — a grid of forty free slots that
 * looked like a real answer.
 */
const ReadProblem = ({ title, message, onRetry }: ReadProblemProps) => (
  <Empty className="min-h-48 border border-dashed">
    <EmptyTitle>{title}</EmptyTitle>
    <EmptyDescription>{message}</EmptyDescription>
    {onRetry && (
      <EmptyContent>
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          Try again
        </Button>
      </EmptyContent>
    )}
  </Empty>
);

interface ReadWarningProps {
  message: string;
  onRetry: () => void;
}

/**
 * A read that failed without invalidating the page.
 *
 * The timetable below is still a real timetable; only what can be done with it
 * is affected. Said out loud rather than left as a control that does nothing.
 */
const ReadWarning = ({ message, onRetry }: ReadWarningProps) => (
  <div className="border-warning-ink/40 bg-accent/14 text-warning-ink border p-3 text-sm leading-relaxed">
    <div>{message}</div>
    <Button
      className="mt-2"
      onClick={onRetry}
      size="sm"
      type="button"
      variant="outline"
    >
      Try again
    </Button>
  </div>
);

interface TimetableSkeletonProps {
  periodConfig: readonly { periodNumber: number }[];
}

/**
 * The grid's own shape, held while a read is in flight.
 *
 * One bare `Skeleton` where the table goes would be a blank panel that pops
 * into a forty-cell grid and shoves everything below it; this reserves the
 * same rows and columns, so nothing moves when the timetable lands.
 */
const TimetableSkeleton = ({ periodConfig }: TimetableSkeletonProps) => (
  <div aria-busy="true" className="space-y-1.5">
    <Skeleton className="h-8 w-full motion-reduce:animate-none" />
    {periodConfig.map((period) => (
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

interface TeacherSummaryStripProps {
  freeSlotCount: number;
  occupiedSlotCount: number;
  staff: NonNullable<TeacherTimetablePage["currentStaff"]>;
}

const TeacherSummaryStrip = ({
  staff,
  occupiedSlotCount,
  freeSlotCount,
}: TeacherSummaryStripProps) => (
  <div className="bg-primary text-primary-foreground flex flex-wrap items-center gap-5 p-5">
    <span className="bg-accent/20 text-accent flex size-12 flex-none items-center justify-center rounded-full text-base font-bold">
      {staff.name
        .split(/\s+/u)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("")}
    </span>
    <div className="min-w-0">
      <div className="type-section-title">{staff.name}</div>
      {staff.email && (
        <div className="text-primary-foreground/80 mt-1 text-sm">
          {staff.email}
        </div>
      )}
    </div>
    <div className="ml-auto flex gap-6">
      <div>
        <div className="text-accent text-2xl leading-none font-bold tracking-[-0.02em] tabular-nums">
          {occupiedSlotCount}
        </div>
        <div className="text-primary-foreground/80 type-eyebrow mt-1.5">
          Periods / week
        </div>
      </div>
      <div>
        <div className="text-accent text-2xl leading-none font-bold tracking-[-0.02em] tabular-nums">
          {freeSlotCount}
        </div>
        <div className="text-primary-foreground/80 type-eyebrow mt-1.5">
          Free slots
        </div>
      </div>
    </div>
  </div>
);

interface TimetableAreaProps {
  page: TeacherTimetablePage;
}

/**
 * The narrowing picks matched nothing on a week that does have periods.
 *
 * Deliberately not the "no periods are assigned" sentence: the teacher *does*
 * teach, and the reason nothing is on screen is the three dropdowns above. The
 * one thing that resolves it is here rather than back up in the bar, because
 * this is the sentence the reader is already looking at.
 */
const FilteredEmpty = ({ onClear }: { onClear: () => void }) => (
  <div className="border-primary/22 text-muted-foreground flex min-h-[40vh] flex-col items-center justify-center gap-3 border border-dashed p-6 text-center text-sm">
    <p>No period on this teacher&apos;s timetable matches those filters.</p>
    <Button onClick={onClear} size="sm" type="button" variant="outline">
      Clear filters
    </Button>
  </div>
);

/**
 * The grid, and everything that decides whether it may be shown.
 *
 * The read is `[]` before a teacher is chosen, while it is in flight and after
 * a failure. Handing the grid any of those would render forty free slots and
 * call it a timetable, so each state has its own answer here.
 *
 * **The grid is fed `filteredEntries`, the strip above it is fed `entries`.**
 * The strip describes the teacher's whole week — that is what "Periods / week"
 * means — while the grid shows the slice the picks selected. A summary that
 * narrowed with the grid would report two periods per week for a teacher who
 * teaches thirty, which is false.
 */
const TimetableArea = ({ page }: TimetableAreaProps) => {
  if (page.entriesRead === "failed") {
    return (
      <ReadProblem
        message={page.entriesMessage}
        onRetry={page.handleRetryEntries}
        title="This teacher's timetable could not be read"
      />
    );
  }

  if (page.entriesRead !== "known") {
    return <TimetableSkeleton periodConfig={page.periodConfig} />;
  }

  return (
    <div className="space-y-3">
      {page.classesRead === "failed" && (
        <ReadWarning
          message={`${page.classesMessage} No slot below can be assigned until the class list reads.`}
          onRetry={page.handleRetryClasses}
        />
      )}

      {page.conflictsRead === "failed" && (
        <ReadWarning
          message={`${page.conflictsMessage} Nothing below is marked as double-booked, and that is not the same as being checked.`}
          onRetry={page.handleRetryConflicts}
        />
      )}

      {page.entries.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {`No periods are assigned in academic year ${page.currentYear?.year}. Click any slot below to assign one.`}
        </p>
      )}

      {page.entries.length > 0 && page.filteredEntries.length === 0 ? (
        <FilteredEmpty onClear={page.handleClearFilters} />
      ) : (
        <TeacherTimetableGrid
          entries={page.filteredEntries}
          periodConfig={page.periodConfig}
          onAssignClick={page.handleAssignClick}
          onEditClick={page.handleEditClick}
          onDeleteClick={page.handleDeleteClick}
        />
      )}
    </div>
  );
};

interface SetupProblem {
  title: string;
  message: string;
  onRetry?: () => void;
}

/**
 * The reads without which this page cannot say anything at all.
 *
 * Without the year there is no year to scope the timetable to; without the
 * staff list the teacher cannot be named or chosen. The class list is left
 * out on purpose — it only decides whether a slot can be assigned, not
 * whether the week on screen is true.
 */
const setupProblemOf = (
  page: TeacherTimetablePage
): SetupProblem | undefined => {
  if (page.currentYearRead === "failed") {
    return {
      title: "Academic years could not be loaded",
      message: page.currentYearMessage,
      onRetry: page.handleRetryYears,
    };
  }
  if (page.staffRead === "failed") {
    return {
      title: "Staff list could not be loaded",
      message: page.staffMessage,
      onRetry: page.handleRetryStaff,
    };
  }
  if (page.staffId && page.currentYearRead === "known" && !page.currentYear) {
    return {
      title: "No academic year is marked current",
      message:
        "A timetable belongs to an academic year, and this page shows the year marked current. Mark one current under Academic Years, then come back.",
    };
  }
  return undefined;
};

export const TeacherTimetablePageContent = ({
  search,
  staffId: fixedStaffId,
}: TeacherTimetablePageContentProps) => {
  const page = useTeacherTimetablePage(search, fixedStaffId);
  const setupProblem = setupProblemOf(page);

  let body: ReactNode = null;
  if (setupProblem) {
    body = <ReadProblem {...setupProblem} />;
  } else if (page.staffId && page.currentYear?.id) {
    body = (
      <>
        {page.currentStaff && (
          <TeacherSummaryStrip
            freeSlotCount={Math.max(
              page.periodConfig.length * 5 - page.occupiedSlotCount,
              0
            )}
            occupiedSlotCount={page.occupiedSlotCount}
            staff={page.currentStaff}
          />
        )}
        <TimetableArea page={page} />
        <TeacherTimetableDialogs
          classes={page.classes}
          selectedEntry={page.selectedEntry}
          addSlot={page.addSlot}
          isAddOpen={page.isAddDialogOpen}
          onAddOpenChange={page.handleAddOpenChange}
          isAddPending={page.assignMutation.isPending}
          onAddSubmit={page.handleAddSubmit}
          isEditOpen={page.isEditDialogOpen}
          onEditOpenChange={(open) => page.setIsEditDialogOpen(open)}
          isEditPending={page.updateMutation.isPending}
          onEditSubmit={page.handleEditSubmit}
          isDeleteOpen={page.isDeleteDialogOpen}
          onDeleteOpenChange={(open) => page.setIsDeleteDialogOpen(open)}
          isDeletePending={page.deleteMutation.isPending}
          onConfirmDelete={page.handleConfirmDelete}
        />
      </>
    );
  } else if (page.staffId && page.currentYearRead === "pending") {
    body = <TimetableSkeleton periodConfig={page.periodConfig} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Staff management"
        title="Teacher timetable"
        description={
          <>
            View and manage a single teacher&apos;s periods across every class
            they teach this academic year.
          </>
        }
      />

      {/*
        The narrowing bar, laid out the way the period-assignment page lays out
        its own: one bordered row of labelled picks, each free to wrap onto the
        next line rather than the row growing a horizontal scrollbar.

        It renders even on `/teacher-timetable/$staffId`, where the teacher is
        fixed by the route and its control is left out — the three picks below
        still narrow a teacher nobody on that route can change.
      */}
      <div className="border-primary/14 bg-card flex flex-wrap items-end gap-3 border p-4">
        {!fixedStaffId && (
          <div className="block min-w-0 flex-1 basis-44">
            <label
              htmlFor="teacher-timetable-select"
              className="text-foreground mb-1.5 block text-sm font-semibold"
            >
              Teacher
            </label>
            <TeacherCombobox
              id="teacher-timetable-select"
              value={page.staffId}
              onValueChange={(next) => page.setStaffId(next)}
            />
          </div>
        )}

        <div className="block min-w-0 flex-1 basis-36">
          <label
            htmlFor="teacher-timetable-section"
            className="text-foreground mb-1.5 block text-sm font-semibold"
          >
            Section
          </label>
          <Select
            value={page.section}
            onValueChange={(value: string | null) => {
              if (value) {
                page.setSection(value);
              }
            }}
          >
            <SelectTrigger
              id="teacher-timetable-section"
              className="w-full"
              disabled={!page.staffId}
            >
              <SelectValue
                placeholder={
                  page.staffId ? "Select section" : "Select a teacher first"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {page.categoryOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="block min-w-0 flex-1 basis-36">
          <label
            htmlFor="teacher-timetable-grade"
            className="text-foreground mb-1.5 block text-sm font-semibold"
          >
            Grade
          </label>
          <Select
            value={page.grade}
            onValueChange={(value: string | null) => {
              if (value) {
                page.setGrade(value);
              }
            }}
          >
            <SelectTrigger
              id="teacher-timetable-grade"
              className="w-full"
              disabled={!page.section}
            >
              <SelectValue
                placeholder={
                  page.section ? "Select grade" : "Select section first"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {page.gradeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="block min-w-0 flex-1 basis-36">
          <label
            htmlFor="teacher-timetable-class"
            className="text-foreground mb-1.5 block text-sm font-semibold"
          >
            Class
          </label>
          <Select
            value={page.selectedClassId}
            onValueChange={(value: string | null) => {
              if (value) {
                page.setSelectedClassId(value);
              }
            }}
          >
            <SelectTrigger
              id="teacher-timetable-class"
              className="w-full"
              disabled={!page.grade}
            >
              <SelectValue
                placeholder={page.grade ? "Select class" : "Select grade first"}
              />
            </SelectTrigger>
            <SelectContent>
              {page.classOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {body}
    </div>
  );
};
