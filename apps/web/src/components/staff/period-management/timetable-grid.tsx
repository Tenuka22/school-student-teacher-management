/*
 * `<section>` is used for the scrollable grid rather than `role="region"`, and
 * the one suppression below is for the `tabIndex` that makes a scroll container
 * reachable: a region that scrolls but cannot be focused cannot be scrolled with
 * the keyboard, which WCAG 2.1.1 requires.
 */
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be focusable so it can be scrolled from the keyboard */
/* oxlint-disable react-doctor/only-export-components -- useSlotNavigation is the grid's keyboard model and is shared with the teacher grid in this folder */
"use client";

import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import type { classPeriodAssignment as periodAssignmentTable } from "@school-student-teacher-management/db/schema/periods";
import type { staff as staffTable } from "@school-student-teacher-management/db/schema/staff";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { Card } from "@school-student-teacher-management/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@school-student-teacher-management/ui/components/dropdown-menu";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import {
  IconAlertTriangle,
  IconDotsVertical,
  IconPlus,
  IconRepeat,
  IconUserOff,
} from "@tabler/icons-react";
import { useCallback, useMemo, useRef, useState } from "react";

type Staff = typeof staffTable.$inferSelect;
type PeriodAssignment = typeof periodAssignmentTable.$inferSelect;

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;

const PERIOD_COUNT = CODE_DEFINED_PERIODS.length;
const DAY_COUNT = DAYS_OF_WEEK.length;

const PERIOD_TIMES = new Map<number, string>(
  CODE_DEFINED_PERIODS.map((period) => [
    period.periodNumber,
    `${period.startTime}–${period.endTime}`,
  ])
);

/** "Tuesday, Period 3 (09:15–09:50)" — the words a screen reader should hear. */
const describeSlot = (dayOfWeek: number, periodNumber: number): string => {
  const day = DAYS_OF_WEEK[dayOfWeek - 1] ?? `Day ${dayOfWeek}`;
  const times = PERIOD_TIMES.get(periodNumber);
  return times
    ? `${day}, Period ${periodNumber} (${times})`
    : `${day}, Period ${periodNumber}`;
};

const getInitials = (name: string) =>
  name
    .replace(/^(?<prefix>Mr\.|Mrs\.|Ms\.|Dr\.)\s*/iu, "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const clampIndex = (value: number, last: number) =>
  Math.min(Math.max(value, 0), last);

/** The first or last index of a range, for Home/End. */
const edgeIndex = (toEnd: boolean, length: number) => (toEnd ? length - 1 : 0);

export interface SlotPosition {
  dayIndex: number;
  periodIndex: number;
  itemIndex: number;
}

export interface SlotNavigation {
  activeSlot: SlotPosition;
  focusSlot: (dayIndex: number, periodIndex: number, itemIndex: number) => void;
  handleSlotKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    position: SlotPosition
  ) => void;
  /** Whether this control is the grid's one tab stop. */
  isActive: (position: SlotPosition) => boolean;
  registerSlotButton: (key: string, node: HTMLButtonElement | null) => void;
  registerSlotMenu: (key: string, node: HTMLButtonElement | null) => void;
}

const slotKey = (position: SlotPosition) =>
  `${position.dayIndex}:${position.periodIndex}:${position.itemIndex}`;

/**
 * Roving focus for a timetable grid.
 *
 * A 40-slot grid with a tab stop in every cell is a trap: reaching the bottom of
 * the table costs 40 presses and there is no way back up except Shift+Tab. So
 * the grid is a single tab stop and the arrow keys move inside it — the pattern
 * the ARIA grid role describes. A slot's actions live behind `Shift+F10`, the
 * Menu key or `Alt`+`Down` (the row-actions affordance) rather than a second tab
 * stop per cell, so `Tab` still leaves the grid in one press.
 *
 * `controlCountFor` says how many controls a slot holds: one for the class grid,
 * one per class plus an add button for the teacher grid, where a combined
 * session puts several rows in one slot.
 */
export const useSlotNavigation = (
  controlCountFor: (dayIndex: number, periodIndex: number) => number
): SlotNavigation => {
  const [activeSlot, setActiveSlot] = useState<SlotPosition>({
    dayIndex: 0,
    periodIndex: 0,
    itemIndex: 0,
  });
  const slotButtons = useRef(new Map<string, HTMLButtonElement | null>());
  const slotMenus = useRef(new Map<string, HTMLButtonElement | null>());

  const focusSlot = useCallback(
    (dayIndex: number, periodIndex: number, itemIndex: number) => {
      const next: SlotPosition = {
        dayIndex: clampIndex(dayIndex, DAY_COUNT - 1),
        periodIndex: clampIndex(periodIndex, PERIOD_COUNT - 1),
        itemIndex: 0,
      };
      next.itemIndex = clampIndex(
        itemIndex,
        controlCountFor(next.dayIndex, next.periodIndex) - 1
      );
      setActiveSlot(next);
      slotButtons.current.get(slotKey(next))?.focus();
    },
    [controlCountFor]
  );

  const handleSlotKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, position: SlotPosition) => {
      const wantsRowActions =
        event.key === "ContextMenu" ||
        (event.shiftKey && event.key === "F10") ||
        (event.altKey && event.key === "ArrowDown");
      if (wantsRowActions) {
        const trigger = slotMenus.current.get(slotKey(position));
        if (trigger) {
          event.preventDefault();
          trigger.click();
        }
        return;
      }

      const deltas: Record<string, readonly [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const delta = deltas[event.key];
      if (delta) {
        event.preventDefault();
        focusSlot(
          position.dayIndex + delta[0],
          position.periodIndex + delta[1],
          // Up and down walk the controls inside one slot; left and right change
          // day and keep the place in the stack.
          delta[0] === 0 ? position.itemIndex + delta[1] : position.itemIndex
        );
        return;
      }

      if (event.key !== "Home" && event.key !== "End") {
        return;
      }
      event.preventDefault();
      const toEnd = event.key === "End";
      const wholeGrid = event.ctrlKey || event.metaKey;
      const dayIndex = wholeGrid
        ? edgeIndex(toEnd, DAY_COUNT)
        : position.dayIndex;
      const periodIndex = wholeGrid
        ? edgeIndex(toEnd, PERIOD_COUNT)
        : position.periodIndex;
      focusSlot(
        dayIndex,
        periodIndex,
        toEnd ? controlCountFor(dayIndex, periodIndex) - 1 : 0
      );
    },
    [controlCountFor, focusSlot]
  );

  return {
    activeSlot,
    focusSlot,
    handleSlotKeyDown,
    isActive: (position) =>
      activeSlot.dayIndex === position.dayIndex &&
      activeSlot.periodIndex === position.periodIndex &&
      activeSlot.itemIndex === position.itemIndex,
    registerSlotButton: (key, node) => {
      slotButtons.current.set(key, node);
    },
    registerSlotMenu: (key, node) => {
      slotMenus.current.set(key, node);
    },
  };
};

type SlotMarkKind = "combined" | "clash" | "unresolved";

/**
 * One mark per cell, and never two.
 *
 * The three are distinct facts, not shades of one: an intentional overlap the
 * scan skips, an overlap the scan reported, and a row whose teacher the staff
 * list has not supplied. A cell flagged as a combined session is never also
 * reported as a clash, so the two can share a cell without contradicting.
 */
const markForSlot = ({
  isCombined,
  isConflict,
  hasStaff,
}: {
  isCombined: boolean;
  isConflict: boolean;
  hasStaff: boolean;
}): SlotMarkKind | null => {
  if (!hasStaff) {
    return "unresolved";
  }
  if (isConflict) {
    return "clash";
  }
  return isCombined ? "combined" : null;
};

const MARK_SUMMARY: Record<SlotMarkKind, string> = {
  combined:
    " Marked as an intentional combined session, so the conflict scan does not report it.",
  clash:
    " The conflict scan found this teacher in another class at this slot, and the overlap is not marked as an intentional combined session.",
  unresolved:
    " The staff list has not supplied this teacher's record, so the teacher cannot be named and the slot cannot be checked for clashes.",
};

const MARK_MEANING: Record<SlotMarkKind, { label: string; meaning: string }> = {
  combined: {
    label: "Combined session",
    meaning:
      "the overlap is recorded as intentional, so the conflict scan does not report it",
  },
  clash: {
    label: "Clash",
    meaning:
      "the conflict scan found this teacher in another class at this slot and the overlap is not marked intentional",
  },
  unresolved: {
    label: "Teacher not loaded",
    meaning:
      "the slot is assigned, but the staff list has not supplied this teacher's record, so no teacher is named here",
  },
};

/** The mark a cell can carry, in words the reader can act on. */
const SlotMark = ({ kind }: { kind: SlotMarkKind }) => {
  if (kind === "combined") {
    return (
      <Badge
        className="border-warning-ink/40 text-warning-ink gap-1"
        variant="outline"
      >
        <IconRepeat aria-hidden="true" />
        Combined
      </Badge>
    );
  }
  if (kind === "clash") {
    return (
      <Badge className="gap-1" variant="destructive">
        <IconAlertTriangle aria-hidden="true" />
        Clash
      </Badge>
    );
  }
  return (
    <Badge className="text-muted-foreground gap-1" variant="secondary">
      <IconUserOff aria-hidden="true" />
      Teacher not loaded
    </Badge>
  );
};

const MarkLegend = ({ mark }: { mark: SlotMarkKind }) => (
  <span className="flex items-center gap-1.5">
    <SlotMark kind={mark} />
    <span>
      <span className="font-bold">{MARK_MEANING[mark].label}</span> —{" "}
      {MARK_MEANING[mark].meaning}
    </span>
  </span>
);

/**
 * A slot with nothing in it.
 *
 * Dashed and quiet, and it says so in words as well as in a dash: a free slot is
 * a fact, and it is the one cell that offers the action which fills it.
 */
const FreeSlotCell = ({
  navigation,
  onAssign,
  position,
  slot,
}: {
  navigation: SlotNavigation;
  onAssign: () => void;
  position: SlotPosition;
  slot: string;
}) => (
  <TableCell className="bg-muted/30 min-h-[66px] p-1 align-top">
    <Button
      aria-label={`Assign a subject and teacher to ${slot}. Nothing is timetabled in this slot yet.`}
      className="text-muted-foreground hover:text-primary border-border w-full justify-start border border-dashed px-2 text-xs font-semibold"
      onClick={onAssign}
      onKeyDown={(event) => navigation.handleSlotKeyDown(event, position)}
      ref={(node) => navigation.registerSlotButton(slotKey(position), node)}
      tabIndex={navigation.isActive(position) ? 0 : -1}
      type="button"
      variant="ghost"
    >
      <IconPlus aria-hidden="true" className="size-3" />
      Assign
      <span className="sr-only">{`. Free slot — ${slot}.`}</span>
    </Button>
  </TableCell>
);

/** A slot with a subject and teacher in it, and whatever the scan says. */
const AssignedSlotCell = ({
  assignment,
  mark,
  navigation,
  onDelete,
  onEdit,
  position,
  slot,
  teacher,
}: {
  assignment: PeriodAssignment;
  mark: SlotMarkKind | null;
  navigation: SlotNavigation;
  onDelete: () => void;
  onEdit: () => void;
  position: SlotPosition;
  slot: string;
  teacher: Staff | null;
}) => {
  const subject = subjectLabel(assignment.subjectKey);
  const who = teacher ? `, taught by ${teacher.name}` : ", teacher unknown";

  return (
    <TableCell
      className={`min-h-[66px] p-1 align-top ${
        mark === "clash" ? "bg-destructive/6" : ""
      }`}
    >
      <div className="group bg-card hover:bg-accent/8 relative w-full border p-2 text-left text-xs transition-colors">
        <button
          aria-label={`Edit ${subject} in ${slot}${who}.${mark ? MARK_SUMMARY[mark] : ""}`}
          className="block w-full cursor-pointer pr-6 text-left"
          onClick={onEdit}
          onKeyDown={(event) => navigation.handleSlotKeyDown(event, position)}
          ref={(node) => navigation.registerSlotButton(slotKey(position), node)}
          tabIndex={navigation.isActive(position) ? 0 : -1}
          type="button"
        >
          <div className="text-sm font-bold">{subject}</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            {teacher ? (
              <>
                <span
                  aria-hidden="true"
                  className="bg-primary/10 text-primary flex size-5 shrink-0 items-center justify-center text-[9px] font-bold"
                >
                  {getInitials(teacher.name)}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {teacher.name}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground truncate text-xs italic">
                Teacher not listed
              </span>
            )}
          </div>
          {mark && (
            <div className="mt-1.5">
              <SlotMark kind={mark} />
            </div>
          )}
        </button>
        {/* Sibling of the cell's button, not a child: a dropdown inside a button
            is neither focusable nor reachable by keyboard. It leaves the tab
            order because the grid roves; the focused cell opens it with
            Shift+F10, the Menu key, or Alt+Down. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={`Actions for ${subject} in ${slot}${teacher ? `, taught by ${teacher.name}` : ""}`}
                className="absolute top-0 right-0 size-6 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                ref={(node: HTMLButtonElement | null) =>
                  navigation.registerSlotMenu(slotKey(position), node)
                }
                tabIndex={-1}
                size="icon"
                variant="ghost"
              >
                <IconDotsVertical aria-hidden="true" className="size-3" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>
              Unassign
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TableCell>
  );
};

const PeriodRow = ({
  assignmentFor,
  conflictingAssignmentIds,
  navigation,
  onAssignClick,
  onDeleteClick,
  onEditClick,
  period,
  periodIndex,
  staff,
}: {
  assignmentFor: (
    dayOfWeek: number,
    periodNumber: number
  ) => PeriodAssignment | undefined;
  conflictingAssignmentIds: Set<string>;
  navigation: SlotNavigation;
  onAssignClick: (dayOfWeek: number, periodNumber: number) => void;
  onDeleteClick: (assignment: PeriodAssignment) => void;
  onEditClick: (assignment: PeriodAssignment) => void;
  period: (typeof CODE_DEFINED_PERIODS)[number];
  periodIndex: number;
  staff: Map<string, Staff>;
}) => (
  <TableRow>
    <TableHead
      className="bg-card text-foreground sticky left-0 z-10 w-36 border-r font-medium"
      scope="row"
    >
      <div className="text-sm font-bold">{`Period ${period.periodNumber}`}</div>
      <div className="text-muted-foreground font-mono text-xs tabular-nums">
        {period.startTime}–{period.endTime}
      </div>
    </TableHead>
    {DAYS_OF_WEEK.map((_, dayIndex) => {
      const dayOfWeek = dayIndex + 1;
      const position = { dayIndex, periodIndex, itemIndex: 0 };
      const slot = describeSlot(dayOfWeek, period.periodNumber);
      const assignment = assignmentFor(dayOfWeek, period.periodNumber);

      if (!assignment) {
        return (
          <FreeSlotCell
            key={`${dayOfWeek}-${period.periodNumber}`}
            navigation={navigation}
            onAssign={() => onAssignClick(dayOfWeek, period.periodNumber)}
            position={position}
            slot={slot}
          />
        );
      }

      const teacher = staff.get(assignment.staffId) ?? null;
      return (
        <AssignedSlotCell
          key={`${dayOfWeek}-${period.periodNumber}`}
          assignment={assignment}
          mark={markForSlot({
            hasStaff: Boolean(teacher),
            isCombined: assignment.isCombinedSession,
            isConflict: conflictingAssignmentIds.has(assignment.id),
          })}
          navigation={navigation}
          onDelete={() => onDeleteClick(assignment)}
          onEdit={() => onEditClick(assignment)}
          position={position}
          slot={slot}
          teacher={teacher}
        />
      );
    })}
  </TableRow>
);

const TimetableGridTable = ({
  assignmentFor,
  conflictingAssignmentIds,
  navigation,
  onAssignClick,
  onDeleteClick,
  onEditClick,
  staff,
}: {
  assignmentFor: (
    dayOfWeek: number,
    periodNumber: number
  ) => PeriodAssignment | undefined;
  conflictingAssignmentIds: Set<string>;
  navigation: SlotNavigation;
  onAssignClick: (dayOfWeek: number, periodNumber: number) => void;
  onDeleteClick: (assignment: PeriodAssignment) => void;
  onEditClick: (assignment: PeriodAssignment) => void;
  staff: Map<string, Staff>;
}) => (
  <Table className="w-max min-w-full">
    <TableCaption className="sr-only">
      Class timetable: eight periods by five days, Monday to Friday. Column
      headers are days, row headers are periods with their start and end times.
      Each cell names the subject and teacher assigned to that slot, or offers
      to assign one.
    </TableCaption>
    <TableHeader className="bg-primary [&_tr]:border-none">
      <TableRow className="hover:bg-primary">
        <TableHead
          className="text-accent bg-primary sticky left-0 z-30 h-11 w-36 text-xs font-extrabold tracking-[0.16em] uppercase"
          scope="col"
        >
          Period
        </TableHead>
        {DAYS_OF_WEEK.map((day) => (
          <TableHead
            className="text-accent bg-primary sticky top-0 z-20 h-11 text-center text-xs font-extrabold tracking-[0.16em] uppercase"
            key={day}
            scope="col"
          >
            {day}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
    <TableBody>
      {CODE_DEFINED_PERIODS.map((period, periodIndex) => (
        <PeriodRow
          key={period.periodNumber}
          assignmentFor={assignmentFor}
          conflictingAssignmentIds={conflictingAssignmentIds}
          navigation={navigation}
          onAssignClick={onAssignClick}
          onDeleteClick={onDeleteClick}
          onEditClick={onEditClick}
          period={period}
          periodIndex={periodIndex}
          staff={staff}
        />
      ))}
    </TableBody>
  </Table>
);

interface TimetableGridProps {
  assignments: PeriodAssignment[];
  staff: Map<string, Staff>;
  conflictingAssignmentIds: Set<string>;
  onAssignClick: (dayOfWeek: number, periodNumber: number) => void;
  onEditClick: (assignment: PeriodAssignment) => void;
  onDeleteClick: (assignment: PeriodAssignment) => void;
}

/**
 * The class timetable: five days across, eight periods down, one cell per slot.
 *
 * A real `<table>` with a caption and `scope` on every header, so a screen
 * reader hears "Tuesday, Period 3" rather than a wall of cells. Day headers are
 * column headers, the period column is a row header, and both stay pinned while
 * the grid scrolls: this is a six-column table in a records tool, and losing
 * track of which day you are on is the one mistake that costs real time.
 *
 * Three slot states are kept apart, because they mean different things: a free
 * slot (which offers the action that fills it), an assigned slot, and an
 * assigned slot whose teacher the staff list has not supplied — a data problem,
 * not an invitation to overwrite the row.
 */
export const TimetableGrid = ({
  assignments,
  staff,
  conflictingAssignmentIds,
  onAssignClick,
  onEditClick,
  onDeleteClick,
}: TimetableGridProps) => {
  const assignmentMap = useMemo(() => {
    const map = new Map<string, PeriodAssignment>();
    for (const assignment of assignments) {
      map.set(`${assignment.dayOfWeek}-${assignment.periodNumber}`, assignment);
    }
    return map;
  }, [assignments]);

  const navigation = useSlotNavigation(() => 1);
  const assignmentFor = useCallback(
    (dayOfWeek: number, periodNumber: number) =>
      assignmentMap.get(`${dayOfWeek}-${periodNumber}`),
    [assignmentMap]
  );

  const hasUnresolvedTeacher = assignments.some(
    (assignment) => !staff.has(assignment.staffId)
  );
  const hasCombinedSession = assignments.some(
    (assignment) => assignment.isCombinedSession
  );

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        Arrow keys move between slots, Enter assigns or edits the focused slot,
        and Shift+F10 opens its actions. The day and period headers stay in
        place while the grid scrolls.
      </p>

      {/* The shadcn table container is held to this card's height so the header
          row's `sticky` has a scrollport to stick to; `overflow-auto` here is
          the fallback if that height ever fails to resolve, so the grid scrolls
          rather than overflowing. */}
      <Card className="max-h-[min(72vh,42rem)] overflow-hidden p-0 py-0">
        <section
          aria-label="Class timetable grid, scrollable"
          className="min-h-0 flex-1 overflow-auto [&>[data-slot=table-container]]:h-full"
          tabIndex={0}
        >
          <TimetableGridTable
            assignmentFor={assignmentFor}
            conflictingAssignmentIds={conflictingAssignmentIds}
            navigation={navigation}
            onAssignClick={onAssignClick}
            onDeleteClick={onDeleteClick}
            onEditClick={onEditClick}
            staff={staff}
          />
        </section>
      </Card>

      <div className="text-muted-foreground flex flex-wrap items-start gap-x-5 gap-y-2 text-xs">
        <span className="font-extrabold tracking-[0.18em] uppercase">
          Reading this grid
        </span>
        {hasCombinedSession && <MarkLegend mark="combined" />}
        {hasUnresolvedTeacher && <MarkLegend mark="unresolved" />}
        <MarkLegend mark="clash" />
        <span className="basis-full">
          A clash is a report, not a guarantee: nothing in the timetable
          prevents a double-booking from being saved, and this grid shows what
          the conflict scan found.
        </span>
      </div>
    </div>
  );
};
