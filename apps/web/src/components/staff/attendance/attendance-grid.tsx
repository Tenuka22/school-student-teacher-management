"use client";

import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
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
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import {
  IconAlertTriangle,
  IconBan,
  IconCheck,
  IconClockCheck,
  IconInfoCircle,
  IconLoader2,
  IconMessage2,
  IconMinus,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { format } from "date-fns";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  AttendanceDataIssue,
  AttendancePageApi,
  AttendanceTeacher,
  PendingPastEdit,
  RowStatus,
} from "@/components/staff/attendance/use-attendance-page";

/**
 * Grade bands, restated here rather than imported.
 *
 * The Classes feature keeps its own copy of this list and this feature keeps
 * its own: feature folders in this app are deliberately independent, with no
 * shared module between them, so an import across that line would be the one
 * thing quietly coupling two features that are meant to change separately.
 * Four lines of data is a cheap price for that boundary.
 */
const GRADE_BANDS = [
  { key: "primary", label: "Primary", grades: [1, 2, 3, 4, 5] },
  { key: "secondary", label: "Secondary", grades: [6, 7, 8, 9, 10, 11] },
  { key: "collegiate", label: "Collegiate (A/L)", grades: [12, 13] },
] as const;

const UNASSIGNED_LABEL = "Not yet assigned to classes";

const SCHOOL_COLUMN = "school";

const PERIOD_CELL_WIDTH = "w-[4.75rem]";
const SCHOOL_CELL_WIDTH = "w-24";
const TEACHER_COLUMN_WIDTH = "min-w-56";

/** The scrollport that lets the register's headers stay put. */
const SCROLL_CONTAINER_CLASS =
  "[&>[data-slot=table-container]]:max-h-[68vh] [&>[data-slot=table-container]]:overflow-y-auto";

/** Row keys for the loading register. */
const SKELETON_ROW_KEYS = Array.from(
  { length: 8 },
  (_, index) => `skeleton-row-${index}`
);

/** Which rows the register shows, beyond the name search. */
type RowFilter = "all" | "unmarked" | "absent" | "periods" | "locked";

const ROW_FILTER_OPTIONS: { value: RowFilter; label: string }[] = [
  { value: "all", label: "Every teacher" },
  { value: "unmarked", label: "Not recorded yet" },
  { value: "absent", label: "Absent for the day" },
  { value: "periods", label: "Period absences" },
  { value: "locked", label: "Held by approved leave" },
];

interface TeacherGroup {
  key: string;
  label: string;
  teachers: AttendanceTeacher[];
}

const groupTeachers = (teachers: AttendanceTeacher[]): TeacherGroup[] => {
  const groups: TeacherGroup[] = GRADE_BANDS.map((band) => ({
    key: band.key,
    label: band.label,
    teachers: [] as AttendanceTeacher[],
  }));
  const unassigned: AttendanceTeacher[] = [];

  for (const teacher of teachers) {
    let matched = false;
    for (const [index, band] of GRADE_BANDS.entries()) {
      const group = groups[index];
      const teachesBand = teacher.gradeLevels.some((grade) =>
        (band.grades as readonly number[]).includes(grade)
      );
      if (group && teachesBand) {
        group.teachers.push(teacher);
        matched = true;
      }
    }
    if (!matched) {
      unassigned.push(teacher);
    }
  }

  return unassigned.length > 0
    ? [
        ...groups,
        { key: "unassigned", label: UNASSIGNED_LABEL, teachers: unassigned },
      ]
    : groups;
};

/** The three states a mark cell can be in. */
type MarkState = "present" | "absent" | "unmarked";

const MARK_STATE_TEXT: Record<MarkState, string> = {
  present: "marked present",
  absent: "marked absent",
  unmarked: "not recorded yet",
};

/**
 * Each state carries a shape as well as a colour.
 *
 * A tick, a cross and a dash are three different silhouettes, so the register
 * survives a colourblind reader, a monochrome print and a badly projected
 * screen. The tint on each reinforces the shape; it is never the message.
 */
const MARK_STATE_CLASS: Record<MarkState, string> = {
  present: "border-primary bg-primary text-primary-foreground",
  absent: "border-destructive/60 bg-destructive/10 text-destructive",
  unmarked: "border-input border-dashed bg-transparent text-muted-foreground",
};

const MARK_STATE_GLYPH: Record<MarkState, typeof IconCheck> = {
  present: IconCheck,
  absent: IconX,
  unmarked: IconMinus,
};

const ROW_STATUS_BADGE: Record<
  RowStatus,
  { label: string; variant: "outline" | "destructive" | "secondary" }
> = {
  present: { label: "Present", variant: "outline" },
  partial: { label: "Partial", variant: "secondary" },
  absent: { label: "Absent", variant: "destructive" },
  lateShortLeave: { label: "Late — short leave", variant: "secondary" },
  halfDay: { label: "Half day", variant: "destructive" },
  unmarked: { label: "Not recorded", variant: "secondary" },
};

const cellId = (staffId: string, column: string): string =>
  `${staffId}:${column}`;

/** True when either filter is doing something, so both can be undone at once. */
const hasActiveFilter = (search: string, rowFilter: RowFilter): boolean =>
  search.trim() !== "" || rowFilter !== "all";

/**
 * Which cell holds the register's single tab stop.
 *
 * It is the cell the user last reached, unless a filter has since hidden that
 * row — then the first visible cell, so the grid is never left with no way in
 * by keyboard.
 */
const resolveActiveCell = (
  activeCell: string | null,
  rowOrder: AttendanceTeacher[],
  columns: string[]
): string | null => {
  const [firstTeacher] = rowOrder;
  const [firstColumn] = columns;
  if (!firstTeacher || !firstColumn) {
    return null;
  }
  if (activeCell === null) {
    return cellId(firstTeacher.id, firstColumn);
  }
  const staffId = activeCell.slice(0, activeCell.lastIndexOf(":"));
  const isVisible = rowOrder.some((teacher) => teacher.id === staffId);
  return isVisible ? activeCell : cellId(firstTeacher.id, firstColumn);
};

/** Period absences a teacher currently carries, as a count. */
const absentPeriodTotal = (page: AttendancePageApi, staffId: string): number =>
  page.periods.filter((period) =>
    page.isPeriodAbsent(staffId, period.periodNumber)
  ).length;

/** The state of one cell, kept distinct per cell rather than per row. */
const cellState = (
  page: AttendancePageApi,
  staffId: string,
  periodNumber: number | null
): MarkState => {
  const status = page.rowStatus(staffId);
  if (status === "unmarked") {
    return "unmarked";
  }
  const isAbsent =
    periodNumber === null
      ? status === "absent"
      : page.isPeriodAbsent(staffId, periodNumber);
  return isAbsent ? "absent" : "present";
};

interface RowBadge {
  label: string;
  variant: "outline" | "destructive" | "secondary";
}

/**
 * What the row says about the day.
 *
 * "On approved leave" is a different fact from "absent", and the register has
 * to say which one it is: the first is a decision somebody else has already
 * made, the second is a mark this office took.
 */
const rowBadge = (page: AttendancePageApi, staffId: string): RowBadge => {
  const leave = page.leaveFor(staffId);
  if (leave) {
    return { label: `On approved ${leave.type} leave`, variant: "outline" };
  }
  const status = page.rowStatus(staffId);
  if (status === "partial" || status === "lateShortLeave") {
    const count = absentPeriodTotal(page, staffId);
    return {
      label: `${ROW_STATUS_BADGE[status].label} · ${count} ${count === 1 ? "period" : "periods"}`,
      variant: "secondary",
    };
  }
  const badge = ROW_STATUS_BADGE[status];
  if (status === "present" || status === "unmarked") {
    return { label: badge.label, variant: "secondary" };
  }
  return { label: badge.label, variant: "destructive" };
};

interface ReasonTarget {
  kind: "day" | "period";
  staffId: string;
  teacherName: string;
  periodNumber: number | null;
}

interface ArrivalTarget {
  staffId: string;
  teacherName: string;
}

interface AttendanceGridProps {
  page: AttendancePageApi;
  filter: string;
  /** Optional: clears the page's name search as well as this grid's row
   * filter, so one control can undo both. */
  onClearFilters?: () => void;
}

/* ------------------------------------------------------------------ *
 * Notices above the register
 * ------------------------------------------------------------------ */

const IssueList = ({ issues }: { issues: AttendanceDataIssue[] }) => (
  <ul className="mt-2 flex flex-col gap-2">
    {issues.map((issue) => (
      <li className="flex flex-wrap items-start gap-x-3 gap-y-1" key={issue.id}>
        <span className="min-w-0 flex-1">
          <span className="font-medium">{issue.label}: </span>
          {issue.detail} {issue.recovery}
        </span>
        {issue.retry ? (
          <Button
            onClick={() => {
              issue.retry?.();
            }}
            size="xs"
            type="button"
            variant="outline"
          >
            <IconRefresh data-icon="inline-start" />
            Retry {issue.label.toLowerCase()}
          </Button>
        ) : null}
      </li>
    ))}
  </ul>
);

/**
 * The register could not be drawn, and it names the read that stopped it.
 *
 * The alternative — an empty grid — is the one state this screen must never
 * show, because an empty grid reads as "nobody is absent", and an administrator
 * would carry straight on marking the wrong person absent on the strength of it.
 */
const RegisterUnavailable = ({
  issues,
  onRetryAll,
}: {
  issues: AttendanceDataIssue[];
  onRetryAll: () => void;
}) => (
  <section
    aria-labelledby="register-unavailable-heading"
    className="border-destructive/40 bg-card border px-4 py-4"
    role="alert"
  >
    <div className="flex items-start gap-2">
      <IconAlertTriangle
        aria-hidden="true"
        className="text-destructive mt-0.5 size-4 shrink-0"
      />
      <div className="min-w-0">
        <h2
          className="text-destructive text-sm font-semibold"
          id="register-unavailable-heading"
        >
          This register is not loaded, so it has not been drawn
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Nothing on this page is attendance yet. No mark can be saved until the
          reads below succeed.
        </p>
        <IssueList issues={issues} />
        {issues.some((issue) => issue.retry) ? (
          <Button
            className="mt-3"
            onClick={onRetryAll}
            size="sm"
            type="button"
            variant="outline"
          >
            <IconRefresh data-icon="inline-start" />
            Reload the register
          </Button>
        ) : null}
      </div>
    </div>
  </section>
);

/** A read that did not deliver while the register itself is sound. */
const DegradedNotice = ({ issues }: { issues: AttendanceDataIssue[] }) => (
  <section
    aria-labelledby="register-degraded-heading"
    className="border-warning-ink/40 bg-card border px-4 py-3"
  >
    <div className="flex items-start gap-2">
      <IconInfoCircle
        aria-hidden="true"
        className="text-warning-ink mt-0.5 size-4 shrink-0"
      />
      <div className="min-w-0">
        <h2 className="text-sm font-semibold" id="register-degraded-heading">
          Part of this register could not be read
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          The rows and the marks below are real and will save. What is missing
          is named here rather than left looking like a fact about a teacher.
        </p>
        <IssueList issues={issues} />
      </div>
    </div>
  </section>
);

/**
 * Marks the server refused.
 *
 * A register that quietly drops a write is worse than one that refuses it
 * loudly: the clerk walks away believing a morning's work is stored.
 */
const UnsavedMarksNotice = ({ page }: { page: AttendancePageApi }) => (
  <section
    aria-labelledby="register-unsaved-heading"
    className="border-destructive/40 bg-card border px-4 py-3"
    role="alert"
  >
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <IconAlertTriangle
        aria-hidden="true"
        className="text-destructive mt-0.5 size-4 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold" id="register-unsaved-heading">
          {page.summary.notSaved}{" "}
          {page.summary.notSaved === 1
            ? "mark did not save"
            : "marks did not save"}
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          {page.writeNotice?.tone === "failed"
            ? page.writeNotice.message
            : "The last change to those cells was refused."}{" "}
          Each one has been put back to the last value the server accepted and
          is flagged with a warning in the grid. Nothing else on this date
          changed — mark it again, or reload the register.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          onClick={() => page.refetchAttendance()}
          size="sm"
          type="button"
          variant="outline"
        >
          Reload the register
        </Button>
        <Button
          onClick={() => page.dismissFailedCells()}
          size="sm"
          type="button"
          variant="ghost"
        >
          Dismiss
        </Button>
      </div>
    </div>
  </section>
);

const WeekendNotice = ({
  dayLabel,
  page,
}: {
  dayLabel: string;
  page: AttendancePageApi;
}) => (
  <section className="border-border bg-card border px-4 py-4">
    <h2 className="text-sm font-semibold">No periods on this date</h2>
    <p className="text-muted-foreground mt-1 text-xs">
      {dayLabel} is a weekend day, and the timetable runs Monday to Friday, so
      there is nothing to mark.
    </p>
    <Button
      className="mt-3"
      onClick={() => page.setDate(page.nextWeekday)}
      size="sm"
      type="button"
      variant="outline"
    >
      Go to the next teaching day
    </Button>
  </section>
);

/**
 * The register's tallies, as a labelled row.
 *
 * Deliberately a row of small labelled figures and not one large number: what
 * the office needs from a register at 07:40 is how many people are still
 * unrecorded, not a percentage to admire.
 */
const SummaryRow = ({ page }: { page: AttendancePageApi }) => {
  const { summary } = page;
  const stats: { label: string; value: number; hint: string }[] = [
    { label: "On the roll", value: summary.onRoll, hint: "teaching staff" },
    { label: "Recorded", value: summary.recorded, hint: "in the database" },
    {
      label: "Not recorded",
      value: summary.unmarked,
      hint: summary.unmarked > 0 ? "still to take" : "day is taken",
    },
    {
      label: "Absent for the day",
      value: summary.absentForDay,
      hint: "whole day",
    },
    { label: "Period absences", value: summary.periodAbsences, hint: "cells" },
    {
      label: "Not saved",
      value: summary.notSaved,
      hint: summary.notSaved > 0 ? "put back" : "all marks stored",
    },
  ];
  return (
    <dl className="border-border bg-border grid grid-cols-2 gap-px overflow-hidden border sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((stat) => (
        <div className="bg-card px-3 py-2" key={stat.label}>
          <dt className="text-muted-foreground text-xs">{stat.label}</dt>
          <dd className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-lg leading-none font-semibold tabular-nums">
              {stat.value}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {stat.hint}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
};

const MarkLegend = () => (
  <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
    {(["present", "absent", "unmarked"] as const).map((state) => {
      const Glyph = MARK_STATE_GLYPH[state];
      return (
        <li className="flex items-center gap-1.5" key={state}>
          <span
            aria-hidden="true"
            className={`grid size-4 place-items-center border ${MARK_STATE_CLASS[state]}`}
          >
            <Glyph className="size-3" />
          </span>
          {MARK_STATE_TEXT[state]}
        </li>
      );
    })}
    <li className="flex items-center gap-1.5">
      <IconBan aria-hidden="true" className="text-destructive size-3.5" />
      Held by approved leave
    </li>
  </ul>
);

/* ------------------------------------------------------------------ *
 * Cells and rows
 * ------------------------------------------------------------------ */

interface CellContext {
  page: AttendancePageApi;
  dayLabel: string;
  isTabStop: (key: string) => boolean;
  registerNode: (key: string, node: HTMLButtonElement | null) => void;
  onNavigate: (event: React.KeyboardEvent<HTMLTableCellElement>) => void;
  onOpenReason: (target: ReasonTarget) => void;
}

interface MarkButtonProps {
  cellKey: string;
  state: MarkState;
  label: string;
  title?: string;
  isSaving: boolean;
  isFailing: boolean;
  isLockedByLeave: boolean;
  /** Why the cell will not act, or null when it will. */
  blockedMessage: string | null;
  onToggle: () => void;
  registerNode: (key: string, node: HTMLButtonElement | null) => void;
  isTabStop: boolean;
}

/**
 * One markable cell.
 *
 * A real `<button>`, because a cell a keyboard cannot reach is not a control.
 * The two states that block a write — a write already in flight, and a row held
 * by approved leave — use `aria-disabled` rather than `disabled`: a disabled
 * control cannot be focused, so it cannot explain itself either, and someone who
 * cannot focus it never finds out why the cell will not move.
 */
const MarkButton = ({
  cellKey,
  state,
  label,
  title,
  isSaving,
  isFailing,
  isLockedByLeave,
  blockedMessage,
  onToggle,
  registerNode,
  isTabStop,
}: MarkButtonProps) => {
  const Glyph = MARK_STATE_GLYPH[state];
  return (
    <button
      aria-busy={isSaving || undefined}
      aria-disabled={blockedMessage ? true : undefined}
      aria-label={label}
      className={`focus-visible:ring-ring focus-visible:ring-offset-card relative grid size-6 place-items-center border transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-1 motion-reduce:transition-none ${MARK_STATE_CLASS[state]} ${isLockedByLeave ? "opacity-70" : ""} ${isFailing ? "ring-destructive ring-1" : ""}`}
      data-cell-key={cellKey}
      data-state={state}
      data-unrecorded={state === "unmarked" || undefined}
      onClick={() => {
        if (blockedMessage) {
          toast.error(blockedMessage);
          return;
        }
        onToggle();
      }}
      ref={(node) => registerNode(cellKey, node)}
      tabIndex={isTabStop ? 0 : -1}
      title={title}
      type="button"
    >
      <Glyph aria-hidden="true" className="size-3.5" />
      {isSaving ? (
        <IconLoader2
          aria-hidden="true"
          className="text-warning-ink absolute -top-1 -right-1 size-3 motion-safe:animate-spin"
        />
      ) : null}
      {isFailing ? (
        <IconAlertTriangle
          aria-hidden="true"
          className="text-destructive absolute -top-1 -right-1 size-3"
        />
      ) : null}
    </button>
  );
};

const ReasonButton = ({
  isTabStop,
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
  isTabStop: boolean;
}) => (
  <Button
    aria-label={label}
    className="size-6"
    onClick={onClick}
    size="icon-xs"
    tabIndex={isTabStop ? 0 : -1}
    title={label}
    type="button"
    variant="ghost"
  >
    <IconMessage2 aria-hidden="true" className="size-3.5" />
  </Button>
);

interface MarkCellCopy {
  teacherName: string;
  dayLabel: string;
  scope: string;
  state: MarkState;
  leaveType: string | null;
  isPrincipal: boolean;
  periodAbsenceCount: number;
  isSaving: boolean;
  isFailing: boolean;
}

const actionNoteFor = (state: MarkState): string => {
  if (state === "unmarked") {
    return " Activating records present.";
  }
  return state === "present"
    ? " Activating marks absent."
    : " Activating marks present.";
};

/**
 * The cell's accessible name.
 *
 * It has to carry the person, the date, which period, and the state — plus what
 * activating it will do — because a screen-reader user in a grid of nine
 * identical boxes has no other way to tell where they are. "Present" on its own
 * is not a name, it is noise.
 */
const markCellLabel = (copy: MarkCellCopy): string => {
  const parts = [
    `${copy.teacherName}, ${copy.dayLabel}, ${copy.scope}, ${MARK_STATE_TEXT[copy.state]}.`,
  ];
  if (copy.periodAbsenceCount > 0) {
    const plural = copy.periodAbsenceCount === 1 ? "absence" : "absences";
    parts.push(
      ` ${copy.periodAbsenceCount} period ${plural} recorded; activating marks the whole day absent.`
    );
  }
  if (copy.leaveType) {
    parts.push(
      copy.isPrincipal
        ? " Held by approved leave; activating asks before overriding it."
        : ` Held by approved ${copy.leaveType} leave; only the Principal can change it.`
    );
  } else {
    parts.push(actionNoteFor(copy.state));
  }
  if (copy.isSaving) {
    parts.push(" Saving.");
  }
  if (copy.isFailing) {
    parts.push(" The last change did not save and has been put back.");
  }
  return parts.join("");
};

/** Why the cell will not act, or null when it will. */
const markCellBlockedMessage = (copy: MarkCellCopy): string | null => {
  if (copy.isSaving) {
    return "Still saving this cell. Wait for it to finish before marking it again.";
  }
  if (copy.leaveType && !copy.isPrincipal) {
    return `Approved ${copy.leaveType} leave holds ${copy.teacherName}'s attendance on ${copy.dayLabel}. Only the Principal can override it.`;
  }
  return null;
};

/** The reason button's name, which has to say whose, which period and which
 * date: "Add a reason" on its own is not an action anybody can act on. */
const reasonButtonLabel = (
  teacherName: string,
  periodNumber: number | null,
  dayLabel: string
): string =>
  periodNumber === null
    ? `Add a reason for ${teacherName}'s whole-day absence on ${dayLabel}`
    : `Add a reason for ${teacherName}'s absence in Period ${periodNumber}, ${dayLabel}`;

/**
 * The hover text for a cell.
 *
 * Three things are worth spelling out and none of them can be inferred from the
 * box: what class is behind a period, that nothing has been recorded yet, and
 * that the timetable itself never arrived — which is a different fact from a
 * free period and used to look identical to one.
 */
const markCellTitle = (
  context: CellContext,
  teacher: AttendanceTeacher,
  periodNumber: number | null,
  scope: string
): string | undefined => {
  const { page } = context;
  if (periodNumber === null) {
    const count = absentPeriodTotal(page, teacher.id);
    if (count === 0) {
      return undefined;
    }
    return `${count} period ${count === 1 ? "absence" : "absences"} recorded; activating marks the whole day absent.`;
  }
  const scheduled = page.scheduleByStaff.get(teacher.id)?.get(periodNumber);
  if (scheduled) {
    return `${scheduled
      .map((entry) => `${entry.className} (${subjectLabel(entry.subjectKey)})`)
      .join(", ")} — ${scope}`;
  }
  if (page.timetableState === "failed") {
    return "The timetable could not be read, so this period cannot be matched to a class";
  }
  return `No class scheduled in ${scope}`;
};

const MarkCell = ({
  column,
  context,
  periodNumber,
  teacher,
}: {
  context: CellContext;
  column: string;
  periodNumber: number | null;
  teacher: AttendanceTeacher;
}) => {
  const { dayLabel, page } = context;
  const key = cellId(teacher.id, column);
  const state = cellState(page, teacher.id, periodNumber);
  const isAbsent = state === "absent";
  const leave = page.leaveFor(teacher.id);
  const isLockedByLeave = Boolean(leave) && !page.isPrincipal;
  const scope =
    periodNumber === null ? "whole school day" : `Period ${periodNumber}`;
  const copy: MarkCellCopy = {
    dayLabel,
    isFailing: page.failedCells.has(key),
    isPrincipal: page.isPrincipal,
    isSaving: page.pendingCells.has(key),
    leaveType: leave?.type ?? null,
    periodAbsenceCount:
      periodNumber === null ? absentPeriodTotal(page, teacher.id) : 0,
    scope,
    state,
    teacherName: teacher.name,
  };
  const cellTitle = markCellTitle(context, teacher, periodNumber, scope);
  // A reason can only be stored against a row that records something, and a row
  // held by approved leave only by the Principal. Offering the button anywhere
  // else invites a write the server will refuse.
  const canRecordReason = isAbsent && (!leave || page.isPrincipal);

  return (
    <TableCell
      className={`${periodNumber === null ? SCHOOL_CELL_WIDTH : PERIOD_CELL_WIDTH} p-1 text-center ${isAbsent ? "bg-destructive/5" : ""} ${state === "unmarked" ? "bg-muted/40" : ""}`}
      data-cell-key={key}
      onKeyDown={(event) => context.onNavigate(event)}
    >
      <div className="flex items-center justify-center gap-0.5">
        <MarkButton
          blockedMessage={markCellBlockedMessage(copy)}
          cellKey={key}
          isFailing={copy.isFailing}
          isLockedByLeave={isLockedByLeave}
          isSaving={copy.isSaving}
          isTabStop={context.isTabStop(key)}
          label={markCellLabel(copy)}
          onToggle={() => {
            if (periodNumber === null) {
              page.toggleSchool(teacher.id);
            } else {
              page.togglePeriod(teacher.id, periodNumber);
            }
          }}
          registerNode={context.registerNode}
          state={state}
          title={cellTitle}
        />
        {canRecordReason ? (
          <ReasonButton
            isTabStop={context.isTabStop(key)}
            label={reasonButtonLabel(teacher.name, periodNumber, dayLabel)}
            onClick={() =>
              context.onOpenReason({
                kind: periodNumber === null ? "day" : "period",
                periodNumber,
                staffId: teacher.id,
                teacherName: teacher.name,
              })
            }
          />
        ) : null}
      </div>
    </TableCell>
  );
};

const TeacherRow = ({
  context,
  onOpenArrival,
  teacher,
}: {
  context: CellContext;
  teacher: AttendanceTeacher;
  onOpenArrival: (target: ArrivalTarget) => void;
}) => {
  const { dayLabel, page } = context;
  const status = page.rowStatus(teacher.id);
  const reason = page.dayReason(teacher.id);
  // A reason persists against a row that records something, so the affordance
  // is offered exactly when a typed sentence can actually be stored.
  const canRecordReason = status !== "unmarked" && status !== "present";
  const badge = rowBadge(page, teacher.id);

  return (
    <TableRow
      className="group/row hover:bg-muted/40 data-[unmarked]:bg-muted/20"
      data-locked={page.isLeaveLocked(teacher.id) || undefined}
      data-unmarked={status === "unmarked" || undefined}
    >
      <TableHead
        className={`bg-card group-data-[unmarked]/row:bg-muted/30 sticky left-0 z-10 h-9 border-r p-1.5 font-medium ${TEACHER_COLUMN_WIDTH}`}
        scope="row"
      >
        <div className="flex items-center gap-1.5">
          <span className="truncate">{teacher.name}</span>
          <Badge className="shrink-0" variant={badge.variant}>
            {badge.label}
          </Badge>
          {reason ? (
            <span
              className="text-muted-foreground min-w-0 flex-1 truncate text-xs"
              title={reason}
            >
              {reason}
            </span>
          ) : null}
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            {canRecordReason ? (
              <ReasonButton
                isTabStop={false}
                label={`${reason ? "Edit" : "Add"} the reason for ${teacher.name} on ${dayLabel}`}
                onClick={() =>
                  context.onOpenReason({
                    kind: "day",
                    periodNumber: null,
                    staffId: teacher.id,
                    teacherName: teacher.name,
                  })
                }
              />
            ) : null}
            <Button
              aria-label={`Record arrival time for ${teacher.name} on ${dayLabel}`}
              className="size-6"
              onClick={() =>
                onOpenArrival({
                  staffId: teacher.id,
                  teacherName: teacher.name,
                })
              }
              size="icon-xs"
              title="Record arrival — applies this year's late-arrival policy"
              type="button"
              variant="ghost"
            >
              <IconClockCheck aria-hidden="true" className="size-3.5" />
            </Button>
          </span>
        </div>
      </TableHead>
      <MarkCell
        column={SCHOOL_COLUMN}
        context={context}
        periodNumber={null}
        teacher={teacher}
      />
      {page.periods.map((period) => (
        <MarkCell
          column={String(period.periodNumber)}
          context={context}
          key={period.periodNumber}
          periodNumber={period.periodNumber}
          teacher={teacher}
        />
      ))}
    </TableRow>
  );
};

const PeriodHead = ({
  periodNumber,
  startTime,
}: {
  periodNumber: number;
  startTime: string;
}) => (
  <TableHead
    className="bg-card z-20 h-9 text-center whitespace-nowrap"
    scope="col"
    title={`Period ${periodNumber}, ${startTime}`}
  >
    <span className="block">P{periodNumber}</span>
    <span className="text-muted-foreground block text-xs font-normal tabular-nums">
      {startTime}
    </span>
  </TableHead>
);

const RegisterTable = ({
  context,
  group,
  onOpenArrival,
}: {
  context: CellContext;
  group: TeacherGroup;
  onOpenArrival: (target: ArrivalTarget) => void;
}) => {
  const { dayLabel, page } = context;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{group.label}</h3>
        <Badge variant="secondary">{group.teachers.length}</Badge>
      </div>
      {/* The container shadcn puts around every table is the only scrollport a
          sticky header can work against, so it is bounded here: the register
          scrolls inside itself, and the teacher column and the day and period
          headings stay put while it does. */}
      <div className={SCROLL_CONTAINER_CLASS}>
        <Table className="w-auto">
          <TableCaption className="sr-only">
            Attendance register, {group.label}, {dayLabel}.{" "}
            {group.teachers.length} teachers. Use the arrow keys to move between
            cells; Space or Enter marks a cell present or absent.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead
                className={`bg-card sticky left-0 z-30 h-9 border-r ${TEACHER_COLUMN_WIDTH}`}
                scope="col"
              >
                Teacher
              </TableHead>
              <TableHead
                className={`bg-card z-20 h-9 text-center ${SCHOOL_CELL_WIDTH}`}
                scope="col"
              >
                School day
              </TableHead>
              {page.periods.map((period) => (
                <PeriodHead
                  key={period.periodNumber}
                  periodNumber={period.periodNumber}
                  startTime={period.startTime}
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.teachers.map((teacher) => (
              <TeacherRow
                context={context}
                key={teacher.id}
                onOpenArrival={onOpenArrival}
                teacher={teacher}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

/**
 * The shape of the register before it has rows in it.
 *
 * Built from the same table, the same columns and the same row height as the
 * real thing, so nothing jumps when the data lands, and marked `aria-busy` for
 * anyone who has to be told the screen is still working.
 */
const RegisterSkeleton = ({
  dayLabel,
  page,
}: {
  dayLabel: string;
  page: AttendancePageApi;
}) => (
  <div aria-busy="true" className="space-y-2">
    <p className="sr-only">Loading the attendance register for {dayLabel}.</p>
    <div aria-hidden="true" className="flex items-center gap-2">
      <Skeleton className="h-4 w-28 motion-reduce:animate-none" />
    </div>
    <div className={SCROLL_CONTAINER_CLASS}>
      <Table className="w-auto">
        <TableCaption className="sr-only">
          Attendance register loading for {dayLabel}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead
              className={`bg-card sticky left-0 z-30 h-9 border-r ${TEACHER_COLUMN_WIDTH}`}
              scope="col"
            >
              Teacher
            </TableHead>
            <TableHead
              className={`bg-card z-20 h-9 text-center ${SCHOOL_CELL_WIDTH}`}
              scope="col"
            >
              School day
            </TableHead>
            {page.periods.map((period) => (
              <PeriodHead
                key={period.periodNumber}
                periodNumber={period.periodNumber}
                startTime={period.startTime}
              />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {SKELETON_ROW_KEYS.map((rowKey) => (
            <TableRow className="h-9" key={rowKey}>
              <TableHead
                className={`bg-card sticky left-0 z-10 h-9 border-r p-1.5 font-normal ${TEACHER_COLUMN_WIDTH}`}
                scope="row"
              >
                <Skeleton className="h-4 w-32 motion-reduce:animate-none" />
              </TableHead>
              <TableCell className={`${SCHOOL_CELL_WIDTH} p-1`}>
                <Skeleton className="mx-auto size-6 motion-reduce:animate-none" />
              </TableCell>
              {page.periods.map((period) => (
                <TableCell
                  className={`${PERIOD_CELL_WIDTH} p-1`}
                  key={period.periodNumber}
                >
                  <Skeleton className="mx-auto size-6 motion-reduce:animate-none" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </div>
);

/* ------------------------------------------------------------------ *
 * Dialogs
 * ------------------------------------------------------------------ */

const initialReasonFor = (
  page: AttendancePageApi,
  target: ReasonTarget | null
): string => {
  if (!target) {
    return "";
  }
  if (target.kind === "day") {
    return page.dayReason(target.staffId);
  }
  return page.periodReason(target.staffId, target.periodNumber ?? 0);
};

/**
 * The reason dialog holds its text and stays open until the server has taken
 * it. It used to close on the click whether or not the write landed, which
 * threw away the sentence someone had just typed over a dropped connection.
 */
const ReasonDialog = ({
  onOpenChange,
  page,
  target,
}: {
  page: AttendancePageApi;
  target: ReasonTarget | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const [reason, setReason] = useState(() => initialReasonFor(page, target));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!target || isSaving) {
      return;
    }
    setIsSaving(true);
    setError(null);
    const saved =
      target.kind === "day"
        ? await page.saveReason(target.staffId, null, reason)
        : await page.saveReason(target.staffId, target.periodNumber, reason);
    setIsSaving(false);
    if (saved) {
      onOpenChange(false);
      return;
    }
    setError(
      "Not saved, and the text is still here. Check the connection and save again — nothing else on this date has changed."
    );
  };

  const scope =
    target?.kind === "period" ? `Period ${target.periodNumber}` : "whole day";

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onOpenChange(false);
        }
      }}
      open={Boolean(target)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reason for absence</DialogTitle>
          <DialogDescription>
            {target?.teacherName} — {scope}, {page.date}
          </DialogDescription>
        </DialogHeader>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="absence-reason">Reason</FieldLabel>
          <Textarea
            aria-describedby={error ? "absence-reason-error" : undefined}
            aria-invalid={Boolean(error) || undefined}
            autoFocus
            disabled={isSaving}
            id="absence-reason"
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Sick leave"
            value={reason}
          />
          {error ? (
            <FieldError id="absence-reason-error">{error}</FieldError>
          ) : null}
          <FieldDescription>
            Recorded against this absence. A reason helps the Principal decide
            on leave; it is not required.
          </FieldDescription>
        </Field>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button
            aria-busy={isSaving || undefined}
            className="min-w-28"
            disabled={isSaving}
            onClick={handleSave}
          >
            {isSaving ? "Saving…" : "Save reason"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * The arrival dialog states the policy it is about to apply rather than
 * describing it in the abstract, and holds its state until the server answers.
 */
const ArrivalDialog = ({
  onOpenChange,
  page,
  target,
}: {
  page: AttendancePageApi;
  target: ArrivalTarget | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const [arrivalTime, setArrivalTime] = useState("07:30");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { policy, policyUsage } = page;

  const submit = async () => {
    if (!target || isSaving) {
      return;
    }
    setIsSaving(true);
    setError(null);
    const saved = await page.recordArrival(target.staffId, arrivalTime);
    setIsSaving(false);
    if (saved) {
      onOpenChange(false);
      return;
    }
    setError(
      "Not recorded, and the time is still here. Try again — nothing else on this date has changed."
    );
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onOpenChange(false);
        }
      }}
      open={Boolean(target)}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record arrival — {target?.teacherName}</DialogTitle>
          <DialogDescription>
            {page.date}. This year&apos;s late-arrival policy decides what the
            time records, and the register shows the result.
          </DialogDescription>
        </DialogHeader>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="arrival-time">Arrival time</FieldLabel>
          <Input
            aria-describedby="arrival-time-help"
            disabled={isSaving}
            id="arrival-time"
            onChange={(event) => setArrivalTime(event.target.value)}
            type="time"
            value={arrivalTime}
          />
          <FieldDescription id="arrival-time-help">
            {policy ? (
              <>
                On time before {policy.arrivalCutoffTime}. After it, an unused
                short leave is taken first
                {policyUsage
                  ? ` (${policyUsage.shortLeavesUsed} of ${policy.shortLeavesPerMonth} used this month)`
                  : ""}
                ; once those are used up, a half day is recorded over periods{" "}
                {policy.primaryStartPeriodNumber}–
                {policy.primaryEndPeriodNumber}.
              </>
            ) : (
              "The policy for this year could not be read, so what this time will record cannot be shown here."
            )}
          </FieldDescription>
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button
            aria-busy={isSaving || undefined}
            className="min-w-32"
            disabled={isSaving}
            onClick={submit}
          >
            {isSaving ? "Recording…" : "Record arrival"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const pastEditLabel = (
  teacher: AttendanceTeacher | undefined,
  pending: PendingPastEdit
): string => {
  const name = teacher?.name ?? "this teacher";
  if (pending.kind === "school") {
    return `${name} — whole day`;
  }
  if (pending.kind === "period") {
    return `${name} — Period ${pending.periodNumber}`;
  }
  return pending.periodNumber === null
    ? `${name} — whole day reason`
    : `${name} — Period ${pending.periodNumber} reason`;
};

const PastEditConfirmDialog = ({ page }: { page: AttendancePageApi }) => {
  const pending = page.pendingPastEdit;
  const teacher = pending
    ? page.teachers.find((candidate) => candidate.id === pending.staffId)
    : undefined;
  const dateLabel = format(new Date(`${page.date}T00:00:00`), "d MMMM yyyy");

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) {
          page.cancelPastEdit();
        }
      }}
      open={Boolean(pending)}
    >
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <IconAlertTriangle aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {pending?.overrideLeave
              ? "Override approved leave attendance"
              : "Editing attendance for a past date"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pending?.overrideLeave
              ? `${teacher?.name ?? "This teacher"} has approved leave on ${dateLabel}. Overriding changes the attendance exception on the record, and only the Principal can do it.`
              : `${dateLabel} has already passed. ${
                  pending ? pastEditLabel(teacher, pending) : ""
                } — changing a past date can alter records that have already been reported on. Save this change?`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex justify-end gap-2">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => page.confirmPastEdit()}>
            Save change
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

/** What each mark means, and a quiet note when the date is being re-read. */
const RegisterLegendBar = ({ page }: { page: AttendancePageApi }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
    <MarkLegend />
    {page.isRefetchingAttendance ? (
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <IconRefresh
          aria-hidden="true"
          className="size-3.5 motion-safe:animate-spin"
        />
        Re-reading this date
      </span>
    ) : null}
  </div>
);

const RegisterToolbar = ({
  isFilterActive,
  onClear,
  onFilterChange,
  rollSize,
  rowCount,
  rowFilter,
}: {
  rowFilter: RowFilter;
  rowCount: number;
  rollSize: number;
  isFilterActive: boolean;
  onFilterChange: (next: RowFilter) => void;
  onClear: () => void;
}) => (
  <div className="flex flex-wrap items-end gap-3">
    <Field className="w-64" orientation="horizontal">
      <FieldLabel htmlFor="attendance-row-filter">Show</FieldLabel>
      <Select
        onValueChange={(value) => {
          const next = ROW_FILTER_OPTIONS.find(
            (option) => option.value === value
          );
          if (next) {
            onFilterChange(next.value);
          }
        }}
        value={rowFilter}
      >
        <SelectTrigger id="attendance-row-filter">
          <SelectValue placeholder="Every teacher" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {ROW_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
    <p className="text-muted-foreground text-xs">
      {rowCount === rollSize
        ? `All ${rollSize} on the roll are shown.`
        : `${rowCount} of ${rollSize} on the roll are shown.`}
    </p>
    {isFilterActive ? (
      <Button
        className="ml-auto"
        onClick={onClear}
        size="sm"
        type="button"
        variant="outline"
      >
        Clear the filters
      </Button>
    ) : null}
  </div>
);

/**
 * Everything the register has to say before it is drawn: a read that did not
 * deliver, a mark the server refused, and a mark that exists only in this
 * session. Each is a different kind of problem with a different way out.
 */
const RegisterNotices = ({
  degradedIssues,
  page,
}: {
  page: AttendancePageApi;
  degradedIssues: AttendanceDataIssue[];
}) => (
  <>
    {degradedIssues.length > 0 ? (
      <DegradedNotice issues={degradedIssues} />
    ) : null}
    {page.summary.notSaved > 0 ? <UnsavedMarksNotice page={page} /> : null}
    {page.summary.sessionMarks > 0 ? (
      <p className="text-muted-foreground border-border border-l-2 pl-3 text-xs">
        {page.summary.sessionMarks}{" "}
        {page.summary.sessionMarks === 1 ? "teacher is" : "teachers are"} marked
        present in this browser session. Attendance stores absences, so a day
        with nobody absent leaves nothing behind to read back — these marks last
        until the page is reloaded.
      </p>
    ) : null}
  </>
);

/**
 * "No rows" has to say which of the three reasons it is, because they look the
 * same otherwise and only one of them is about the data.
 */
const NoRowsNotice = ({
  isFilterActive,
  onClear,
  page,
}: {
  page: AttendancePageApi;
  isFilterActive: boolean;
  onClear: () => void;
}) => {
  const rollIsEmpty = page.summary.onRoll === 0;
  const year = page.currentYear?.year;
  return (
    <Empty className="min-h-48 border-none py-6">
      <EmptyTitle>
        {rollIsEmpty
          ? `No teachers on the roll for ${year ?? "this year"}`
          : "No teacher matches these filters"}
      </EmptyTitle>
      <EmptyDescription>
        {rollIsEmpty
          ? "The register is empty because nobody is on the teaching roll for this year — not because they are all present."
          : `${page.summary.onRoll} teachers are on the roll and the filters are hiding every one of them. That is a filter result, not an attendance state, and nobody here is marked absent.`}
      </EmptyDescription>
      {isFilterActive ? (
        <EmptyContent>
          <Button onClick={onClear} size="sm" type="button" variant="outline">
            Clear the filters
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
};

export const AttendanceGrid = ({
  filter,
  onClearFilters,
  page,
}: AttendanceGridProps) => {
  const [reasonTarget, setReasonTarget] = useState<ReasonTarget | null>(null);
  const [arrivalTarget, setArrivalTarget] = useState<ArrivalTarget | null>(
    null
  );
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const cellNodes = useRef(new Map<string, HTMLButtonElement>());

  const dayLabel = format(
    new Date(`${page.date}T00:00:00`),
    "EEEE d MMMM yyyy"
  );

  const matchesRowFilter = useCallback(
    (teacher: AttendanceTeacher) => {
      if (rowFilter === "all") {
        return true;
      }
      const status = page.rowStatus(teacher.id);
      if (rowFilter === "unmarked") {
        return status === "unmarked";
      }
      if (rowFilter === "absent") {
        return status === "absent" || status === "halfDay";
      }
      if (rowFilter === "locked") {
        return page.isLeaveLocked(teacher.id);
      }
      return page.periods.some((period) =>
        page.isPeriodAbsent(teacher.id, period.periodNumber)
      );
    },
    [page, rowFilter]
  );

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return page.teachers.filter(
      (teacher) =>
        (query === "" || teacher.name.toLowerCase().includes(query)) &&
        matchesRowFilter(teacher)
    );
  }, [filter, matchesRowFilter, page.teachers]);

  const groups = useMemo(
    () => groupTeachers(filtered).filter((group) => group.teachers.length > 0),
    [filtered]
  );
  const rowOrder = useMemo(
    () => groups.flatMap((group) => group.teachers),
    [groups]
  );
  const columns = useMemo(
    () => [
      SCHOOL_COLUMN,
      ...page.periods.map((period) => String(period.periodNumber)),
    ],
    [page.periods]
  );

  const registerNode = useCallback(
    (key: string, node: HTMLButtonElement | null) => {
      if (node) {
        cellNodes.current.set(key, node);
      } else {
        cellNodes.current.delete(key);
      }
    },
    []
  );

  /**
   * One tab stop for the whole register, arrows for everything inside it.
   */
  const activeKey = resolveActiveCell(activeCell, rowOrder, columns);
  const isTabStop = useCallback(
    (key: string) => key === activeKey,
    [activeKey]
  );

  /**
   * Arrow keys walk the register, Home and End walk a row, and Tab leaves it.
   * The target cell is already on screen, so it can take focus straight away and
   * keep it through the re-render that follows.
   */
  const onNavigate = useCallback(
    (event: React.KeyboardEvent<HTMLTableCellElement>) => {
      const fromKey = event.currentTarget.dataset.cellKey;
      if (!fromKey || rowOrder.length === 0) {
        return;
      }
      const separator = fromKey.lastIndexOf(":");
      const rowIndex = rowOrder.findIndex(
        (teacher) => teacher.id === fromKey.slice(0, separator)
      );
      if (rowIndex === -1) {
        return;
      }
      const colIndex = Math.max(
        0,
        columns.indexOf(fromKey.slice(separator + 1))
      );
      let nextRow = rowIndex;
      let nextCol = colIndex;
      const wholeGrid = event.ctrlKey || event.metaKey;
      switch (event.key) {
        case "ArrowLeft": {
          nextCol = Math.max(0, colIndex - 1);
          break;
        }
        case "ArrowRight": {
          nextCol = Math.min(columns.length - 1, colIndex + 1);
          break;
        }
        case "ArrowUp": {
          nextRow = Math.max(0, rowIndex - 1);
          break;
        }
        case "ArrowDown": {
          nextRow = Math.min(rowOrder.length - 1, rowIndex + 1);
          break;
        }
        case "Home": {
          nextCol = 0;
          nextRow = wholeGrid ? 0 : rowIndex;
          break;
        }
        case "End": {
          nextCol = columns.length - 1;
          nextRow = wholeGrid ? rowOrder.length - 1 : rowIndex;
          break;
        }
        default: {
          return;
        }
      }
      const targetTeacher = rowOrder[nextRow];
      const targetColumn = columns[nextCol];
      if (!targetTeacher || !targetColumn) {
        return;
      }
      const targetKey = cellId(targetTeacher.id, targetColumn);
      event.preventDefault();
      setActiveCell(targetKey);
      cellNodes.current.get(targetKey)?.focus();
    },
    [columns, rowOrder]
  );

  const context: CellContext = {
    dayLabel,
    isTabStop,
    onNavigate,
    onOpenReason: setReasonTarget,
    page,
    registerNode,
  };

  const blockingIssues = page.dataIssues.filter((issue) => issue.blocking);
  const degradedIssues = page.dataIssues.filter((issue) => !issue.blocking);
  const isRegisterLoading =
    page.registerState === "booting" || page.registerState === "loading";
  const isFilterActive = hasActiveFilter(filter, rowFilter);
  const isWeekend = page.dayOfWeek === null;
  const hasVisibleRows = rowOrder.length > 0;

  const clearFilters = () => {
    setRowFilter("all");
    onClearFilters?.();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* The polite live region for saves. It is always present and usually
          empty, because a live region that appears together with its text is
          regularly missed. */}
      <p aria-live="polite" className="sr-only">
        {page.writeNotice?.message ?? ""}
      </p>

      {page.registerState === "failed" ? (
        <RegisterUnavailable
          issues={blockingIssues}
          onRetryAll={() => {
            for (const issue of blockingIssues) {
              issue.retry?.();
            }
          }}
        />
      ) : null}

      {isRegisterLoading ? (
        <RegisterSkeleton dayLabel={dayLabel} page={page} />
      ) : null}

      {isRegisterLoading || page.registerState === "failed" ? null : (
        <>
          <SummaryRow page={page} />
          <RegisterLegendBar page={page} />
          <RegisterToolbar
            isFilterActive={isFilterActive}
            onClear={clearFilters}
            onFilterChange={setRowFilter}
            rollSize={page.summary.onRoll}
            rowCount={rowOrder.length}
            rowFilter={rowFilter}
          />
          <RegisterNotices degradedIssues={degradedIssues} page={page} />
          {isWeekend ? <WeekendNotice dayLabel={dayLabel} page={page} /> : null}
          {isWeekend || hasVisibleRows ? null : (
            <NoRowsNotice
              isFilterActive={isFilterActive}
              onClear={clearFilters}
              page={page}
            />
          )}
          {isWeekend
            ? null
            : groups.map((group) => (
                <RegisterTable
                  context={context}
                  group={group}
                  key={group.key}
                  onOpenArrival={setArrivalTarget}
                />
              ))}
        </>
      )}

      <ReasonDialog
        key={
          reasonTarget
            ? `${reasonTarget.kind}-${reasonTarget.staffId}-${reasonTarget.periodNumber ?? "day"}`
            : "closed"
        }
        onOpenChange={(open) => {
          if (!open) {
            setReasonTarget(null);
          }
        }}
        page={page}
        target={reasonTarget}
      />
      <ArrivalDialog
        key={arrivalTarget?.staffId ?? "closed"}
        onOpenChange={(open) => {
          if (!open) {
            setArrivalTarget(null);
          }
        }}
        page={page}
        target={arrivalTarget}
      />
      <PastEditConfirmDialog page={page} />
    </div>
  );
};
