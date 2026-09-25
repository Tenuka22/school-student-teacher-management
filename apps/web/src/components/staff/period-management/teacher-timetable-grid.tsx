"use client";

import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
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

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

interface TeacherTimetableEntry {
  id: string;
  classId: string;
  className: string;
  gradeLevel: number;
  dayOfWeek: number;
  periodNumber: number;
  subjectKey: string;
}

interface TeacherTimetableGridProps {
  entries: TeacherTimetableEntry[];
  onAssignClick: (dayOfWeek: number, periodNumber: number) => void;
  onEditClick: (entry: TeacherTimetableEntry) => void;
  onDeleteClick: (entry: TeacherTimetableEntry) => void;
}

/**
 * Day × Period grid for one teacher.
 *
 * A cell can hold more than one class — a combined session runs across several
 * classes at once — so entries are grouped by slot rather than assuming a 1:1
 * slot-to-class mapping. The period times come from the shared
 * `CODE_DEFINED_PERIODS` list, the same one the attendance grid and the
 * timetable builder read, so the three can never disagree about what "Period 3"
 * is.
 */
export const TeacherTimetableGrid = ({
  entries,
  onAssignClick,
  onEditClick,
  onDeleteClick,
}: TeacherTimetableGridProps) => {
  const entriesBySlot = useMemo(() => {
    const map = new Map<string, TeacherTimetableEntry[]>();
    for (const entry of entries) {
      const key = `${entry.dayOfWeek}-${entry.periodNumber}`;
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return map;
  }, [entries]);

  return (
    <Card className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-primary">
          <TableRow className="hover:bg-primary">
            <TableHead className="text-accent w-32 font-bold tracking-wider uppercase">
              Period
            </TableHead>
            {DAYS_OF_WEEK.map((day) => (
              <TableHead
                key={day}
                className="text-accent text-center font-bold tracking-wider uppercase"
              >
                {day}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {CODE_DEFINED_PERIODS.map((period) => (
            <TableRow key={period.periodNumber}>
              <TableCell className="font-medium">
                <div className="text-sm">Period {period.periodNumber}</div>
                <div className="text-muted-foreground text-xs">
                  {period.startTime}–{period.endTime}
                </div>
              </TableCell>
              {DAYS_OF_WEEK.map((_, dayIndex) => {
                const dayOfWeek = dayIndex + 1;
                const key = `${dayOfWeek}-${period.periodNumber}`;
                const slotEntries = entriesBySlot.get(key) ?? [];

                return (
                  <TableCell
                    key={key}
                    className={`p-1 align-top ${
                      slotEntries.length > 0 ? "bg-primary/5" : "bg-muted/30"
                    }`}
                  >
                    <div className="flex flex-col gap-1">
                      {slotEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="group bg-card relative rounded border p-2 text-left text-xs"
                        >
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => onEditClick(entry)}
                            aria-label={`Edit ${entry.className}, ${subjectLabel(entry.subjectKey)}`}
                          >
                            <div className="font-medium">{entry.className}</div>
                            <div className="text-muted-foreground text-xs">
                              {subjectLabel(entry.subjectKey)}
                            </div>
                          </button>
                          {/* A sibling of the cell button, not a child, and
                              visible on focus as well as hover. */}
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute top-0 right-0 size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                  aria-label={`More actions for ${entry.className}, ${subjectLabel(entry.subjectKey)}`}
                                >
                                  <IconDotsVertical className="size-3" />
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => onEditClick(entry)}
                              >
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onDeleteClick(entry)}
                                className="text-destructive"
                              >
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs"
                        aria-label={`${
                          slotEntries.length > 0
                            ? "Add another class to"
                            : "Assign a class to"
                        } ${DAYS_OF_WEEK[dayIndex - 1]}, period ${period.periodNumber}`}
                        onClick={() =>
                          onAssignClick(dayOfWeek, period.periodNumber)
                        }
                      >
                        <IconPlus className="mr-1 size-3" />
                        {slotEntries.length > 0 ? "Add class" : "Assign"}
                      </Button>
                    </div>
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
