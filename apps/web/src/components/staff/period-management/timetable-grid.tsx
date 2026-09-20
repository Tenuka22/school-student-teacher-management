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

interface TimetableGridProps {
  assignments: PeriodAssignment[];
  periodConfig: PeriodConfig[];
  staff: Map<string, Staff>;
  onAssignClick: (dayOfWeek: number, periodNumber: number) => void;
  onEditClick: (assignment: PeriodAssignment) => void;
  onDeleteClick: (assignment: PeriodAssignment) => void;
}

export const TimetableGrid = ({
  assignments,
  periodConfig,
  staff,
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

  return (
    <Card className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">Period</TableHead>
            {DAYS_OF_WEEK.map((day) => (
              <TableHead key={day} className="text-center">
                {day}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedConfig.map((period) => (
            <TableRow key={period.id}>
              <TableCell className="font-medium">
                <div className="text-sm">{`Period ${period.periodNumber}`}</div>
                <div className="text-muted-foreground text-xs">
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

                return (
                  <TableCell
                    key={key}
                    className={`relative p-1 text-center ${
                      assignment ? "bg-primary/5" : "bg-muted/30"
                    }`}
                  >
                    {assignment && assignedStaff ? (
                      <button
                        className="group bg-card w-full cursor-pointer rounded border p-2 text-left text-xs"
                        onClick={() => onEditClick(assignment)}
                        type="button"
                      >
                        <div className="font-medium">
                          {assignment.subjectKey}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {assignedStaff.name}
                        </div>
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
                        className="w-full text-xs"
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
  );
};
