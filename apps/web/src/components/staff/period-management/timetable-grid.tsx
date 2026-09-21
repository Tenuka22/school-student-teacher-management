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
import { useMemo } from "react";

type Staff = typeof staffTable.$inferSelect;
type PeriodAssignment = typeof periodAssignmentTable.$inferSelect;
type PeriodConfig = typeof periodConfigTable.$inferSelect;

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const SUBJECT_PALETTE = [
  "#013405",
  "#2F6B8F",
  "#8A5A00",
  "#6B3FA0",
  "#1F7A4D",
  "#A51919",
  "#0E5C73",
  "#7A4A16",
];

const getSubjectColor = (subjectKey: string) => {
  let hash = 0;
  for (let i = 0; i < subjectKey.length; i += 1) {
    hash = Math.abs(hash * 31 + (subjectKey.codePointAt(i) ?? 0));
  }
  return SUBJECT_PALETTE[hash % SUBJECT_PALETTE.length];
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

interface TimetableGridProps {
  assignments: PeriodAssignment[];
  periodConfig: PeriodConfig[];
  staff: Map<string, Staff>;
  conflictingAssignmentIds: Set<string>;
  onAssignClick: (dayOfWeek: number, periodNumber: number) => void;
  onEditClick: (assignment: PeriodAssignment) => void;
  onDeleteClick: (assignment: PeriodAssignment) => void;
}

export const TimetableGrid = ({
  assignments,
  periodConfig,
  staff,
  conflictingAssignmentIds,
  onAssignClick,
  onEditClick,
  onDeleteClick,
}: TimetableGridProps) => {
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

  return (
    <div className="space-y-3">
      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-primary hover:bg-primary border-none">
              <TableHead className="text-accent h-11 w-32 text-xs font-extrabold tracking-[0.16em]">
                PERIOD
              </TableHead>
              {DAYS_OF_WEEK.map((day) => (
                <TableHead
                  key={day}
                  className="text-accent h-11 text-center text-xs font-extrabold tracking-[0.16em]"
                >
                  {day.toUpperCase()}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedConfig.map((period) => (
              <TableRow key={period.id}>
                <TableCell className="border-primary/12 border-r font-medium">
                  <div className="text-sm font-bold">{`Period ${period.periodNumber}`}</div>
                  <div className="text-muted-foreground font-mono text-xs">
                    {period.startTime}–{period.endTime}
                  </div>
                </TableCell>
                {DAYS_OF_WEEK.map((_, dayIndex: number) => {
                  const dayOfWeek = dayIndex + 1;
                  const key = `${dayOfWeek}-${period.periodNumber}`;
                  const assignment = assignmentMap.get(key);
                  const assignedStaff = assignment
                    ? staff.get(assignment.staffId)
                    : null;
                  const subjectColor = assignment
                    ? getSubjectColor(assignment.subjectKey)
                    : undefined;
                  const isConflict = assignment
                    ? conflictingAssignmentIds.has(assignment.id)
                    : false;

                  return (
                    <TableCell
                      key={key}
                      className={`relative min-h-[66px] p-1 text-center ${getCellBackgroundClass(
                        { assignment, isConflict }
                      )}`}
                    >
                      {assignment && assignedStaff ? (
                        <button
                          className="group bg-card hover:bg-accent/8 w-full cursor-pointer border-l-[3px] p-2 text-left text-xs transition-colors"
                          style={{
                            borderLeftColor: isConflict
                              ? "var(--color-destructive)"
                              : subjectColor,
                          }}
                          onClick={() => onEditClick(assignment)}
                          type="button"
                        >
                          <div className="text-sm font-bold">
                            {assignment.subjectKey}
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <span className="bg-primary/10 text-primary flex size-5 shrink-0 items-center justify-center text-[9px] font-bold">
                              {getInitials(assignedStaff.name)}
                            </span>
                            <span className="text-muted-foreground truncate text-xs">
                              {assignedStaff.name}
                            </span>
                          </div>
                          {isConflict && (
                            <div className="text-destructive mt-1.5 inline-flex items-center gap-1 text-[9px] font-extrabold tracking-wider">
                              <span className="bg-destructive size-1.5 rotate-45" />
                              DOUBLE-BOOKED
                            </div>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute top-0 right-0 size-6 opacity-0 group-hover:opacity-100"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <IconDotsVertical className="size-3" />
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => onEditClick(assignment)}
                              >
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
                        </button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-primary w-full text-xs font-semibold"
                          onClick={() =>
                            onAssignClick(dayOfWeek, period.periodNumber)
                          }
                        >
                          <IconPlus className="mr-1 size-3" />
                          Assign
                        </Button>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {subjectKeysPresent.length > 0 && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
          <span className="text-xs font-extrabold tracking-[0.18em]">
            SUBJECT KEY
          </span>
          {subjectKeysPresent.map((subjectKey) => (
            <span key={subjectKey} className="inline-flex items-center gap-2">
              <span
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
