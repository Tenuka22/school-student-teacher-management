"use client";

import type {
  classPeriodAssignment as periodAssignmentTable,
  periodConfig as periodConfigTable,
} from "@school-student-teacher-management/db/schema/periods";
import type { staff as staffTable } from "@school-student-teacher-management/db/schema/staff";
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { IconDotsVertical, IconPlus } from "@tabler/icons-react";
import { useMemo, useState } from "react";

type Staff = typeof staffTable.$inferSelect;
type PeriodAssignment = typeof periodAssignmentTable.$inferSelect;
type PeriodConfig = typeof periodConfigTable.$inferSelect;

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** Subject colours live in the design tokens (`--subject-1` … `--subject-8`). */
const SUBJECT_COLOR_COUNT = 8;

const getSubjectColor = (subjectKey: string) => {
  let hash = 0;
  for (let i = 0; i < subjectKey.length; i += 1) {
    hash = Math.abs(hash * 31 + (subjectKey.codePointAt(i) ?? 0));
  }
  return `var(--subject-${(hash % SUBJECT_COLOR_COUNT) + 1})`;
};

const getCellBackgroundClass = ({
  assignment,
  isConflict,
}: {
  assignment: unknown;
  isConflict: boolean;
}) => {
  if (!assignment) {
    return "bg-primary/2";
  }
  return isConflict ? "bg-destructive/6" : "";
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

/** Monday–Friday → 1–5; weekends open on Monday. */
const todayOrMonday = () => {
  const day = new Date().getDay();
  return day >= 1 && day <= 5 ? day : 1;
};

interface TimetableGridProps {
  assignments: PeriodAssignment[];
  periodConfig: PeriodConfig[];
  staff: Map<string, Staff>;
  conflictingAssignmentIds: Set<string>;
  onAssignClick: (dayOfWeek: number, periodNumber: number) => void;
  onEditClick: (assignment: PeriodAssignment) => void;
  onDeleteClick: (assignment: PeriodAssignment) => void;
}

interface SlotProps extends Omit<
  TimetableGridProps,
  "assignments" | "periodConfig" | "staff" | "conflictingAssignmentIds"
> {
  dayOfWeek: number;
  periodNumber: number;
  assignment: PeriodAssignment | undefined;
  assignedStaff: Staff | undefined;
  isConflict: boolean;
}

/**
 * One timetable slot. The filled state is a container with two sibling
 * buttons — "edit this slot" and a "more actions" menu — rather than a menu
 * button nested inside a button (invalid HTML, unpredictable focus). The
 * menu is always reachable: it shows on hover, on keyboard focus, and
 * permanently on touch screens.
 */
const SlotContent = ({
  dayOfWeek,
  periodNumber,
  assignment,
  assignedStaff,
  isConflict,
  onAssignClick,
  onEditClick,
  onDeleteClick,
}: SlotProps) => {
  const slotName = `${DAYS_OF_WEEK[dayOfWeek - 1]}, period ${periodNumber}`;

  if (!(assignment && assignedStaff)) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-primary w-full"
        aria-label={`Assign ${slotName}`}
        onClick={() => onAssignClick(dayOfWeek, periodNumber)}
      >
        <IconPlus aria-hidden="true" className="mr-1 size-3" />
        Assign
      </Button>
    );
  }

  return (
    <div className="group relative">
      <button
        type="button"
        className="bg-card hover:bg-accent/8 focus-visible:ring-ring w-full cursor-pointer border-l-[3px] p-2 pr-8 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
        style={{
          borderLeftColor: isConflict
            ? "var(--color-destructive)"
            : getSubjectColor(assignment.subjectKey),
        }}
        aria-label={`Edit ${slotName}: ${assignment.subjectKey}, ${assignedStaff.name}${isConflict ? ", double-booked" : ""}`}
        onClick={() => onEditClick(assignment)}
      >
        <span className="block text-sm leading-snug font-semibold">
          {assignment.subjectKey}
        </span>
        <span className="mt-1.5 flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center text-xs font-semibold"
          >
            {getInitials(assignedStaff.name)}
          </span>
          <span className="text-muted-foreground type-caption truncate">
            {assignedStaff.name}
          </span>
        </span>
        {isConflict && (
          <span className="text-destructive type-caption mt-1.5 inline-flex items-center gap-1.5 font-semibold">
            <span
              aria-hidden="true"
              className="bg-destructive size-1.5 rotate-45"
            />
            Double-booked
          </span>
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`More actions for ${slotName}`}
              className="absolute top-0.5 right-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
            />
          }
        >
          <IconDotsVertical aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEditClick(assignment)}>
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onDeleteClick(assignment)}
            className="text-destructive"
          >
            Unassign
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export const TimetableGrid = ({
  assignments,
  periodConfig,
  staff,
  conflictingAssignmentIds,
  onAssignClick,
  onEditClick,
  onDeleteClick,
}: TimetableGridProps) => {
  const [mobileDay, setMobileDay] = useState(todayOrMonday);

  // Build a map for quick lookup
  const assignmentMap = useMemo(() => {
    const map = new Map<string, PeriodAssignment>();
    for (const a of assignments) {
      const key = `${a.dayOfWeek}-${a.periodNumber}`;
      map.set(key, a);
    }
    return map;
  }, [assignments]);

  const sortedConfig = useMemo(
    () => periodConfig.toSorted((a, b) => a.periodNumber - b.periodNumber),
    [periodConfig]
  );

  const subjectKeysPresent = useMemo(
    () => [...new Set(assignments.map((a) => a.subjectKey))].toSorted(),
    [assignments]
  );

  const slotProps = (dayOfWeek: number, periodNumber: number): SlotProps => {
    const assignment = assignmentMap.get(`${dayOfWeek}-${periodNumber}`);
    return {
      dayOfWeek,
      periodNumber,
      assignment,
      assignedStaff: assignment ? staff.get(assignment.staffId) : undefined,
      isConflict: assignment
        ? conflictingAssignmentIds.has(assignment.id)
        : false,
      onAssignClick,
      onEditClick,
      onDeleteClick,
    };
  };

  return (
    <div className="space-y-3">
      {/* Phones and small tablets: one day at a time. */}
      <div className="space-y-3 md:hidden">
        <fieldset className="m-0 grid min-w-0 grid-cols-5 gap-1 border-0 p-0">
          <legend className="sr-only">Day shown</legend>
          {DAYS_OF_WEEK.map((day, index) => (
            <Button
              key={day}
              type="button"
              size="sm"
              variant={mobileDay === index + 1 ? "default" : "outline"}
              aria-pressed={mobileDay === index + 1}
              aria-label={day}
              onClick={() => setMobileDay(index + 1)}
              className="px-0"
            >
              {day.slice(0, 3)}
            </Button>
          ))}
        </fieldset>
        <Card className="gap-0 p-0">
          <h3 className="bg-primary text-accent m-0 px-3 py-2.5 text-xs font-bold tracking-[0.08em] uppercase">
            {DAYS_OF_WEEK[mobileDay - 1]}
          </h3>
          <ul className="m-0 list-none p-0">
            {sortedConfig.map((period) => {
              const props = slotProps(mobileDay, period.periodNumber);
              return (
                <li
                  key={period.id}
                  className={`border-border grid grid-cols-[5.5rem_1fr] items-center gap-2 border-b p-2 last:border-b-0 ${getCellBackgroundClass(props)}`}
                >
                  <div>
                    <div className="text-sm font-semibold">{`Period ${period.periodNumber}`}</div>
                    <div className="text-muted-foreground type-caption">
                      {period.startTime}–{period.endTime}
                    </div>
                  </div>
                  <SlotContent {...props} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {/* md and up: the full week. */}
      <Card className="hidden overflow-x-auto p-0 md:block">
        <Table className="min-w-184">
          <TableHeader>
            <TableRow className="bg-primary hover:bg-primary border-none">
              <TableHead className="text-accent h-11 w-32 text-xs font-bold tracking-[0.08em]">
                Period
              </TableHead>
              {DAYS_OF_WEEK.map((day) => (
                <TableHead
                  key={day}
                  className="text-accent h-11 text-center text-xs font-bold tracking-[0.08em]"
                >
                  {day}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedConfig.map((period) => (
              <TableRow key={period.id}>
                <TableHead
                  scope="row"
                  className="border-primary/12 text-foreground h-auto border-r tracking-normal normal-case"
                >
                  <div className="text-sm font-semibold">{`Period ${period.periodNumber}`}</div>
                  <div className="text-muted-foreground type-caption font-normal">
                    {period.startTime}–{period.endTime}
                  </div>
                </TableHead>
                {DAYS_OF_WEEK.map((day, dayIndex: number) => {
                  const props = slotProps(dayIndex + 1, period.periodNumber);
                  return (
                    <TableCell
                      key={day}
                      className={`relative min-h-16.5 p-1 text-center ${getCellBackgroundClass(props)}`}
                    >
                      <SlotContent {...props} />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {subjectKeysPresent.length > 0 && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="type-eyebrow">Subject key</span>
          {subjectKeysPresent.map((subjectKey) => (
            <span key={subjectKey} className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-3"
                style={{ background: getSubjectColor(subjectKey) }}
              />
              {subjectKey}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
