"use client";

import type { periodConfig as periodConfigTable } from "@school-student-teacher-management/db/schema/periods";
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

type PeriodConfig = typeof periodConfigTable.$inferSelect;

interface TeacherTimetableEntry {
  id: string;
  classId: string;
  className: string;
  gradeLevel: number;
  dayOfWeek: number;
  periodNumber: number;
  subjectKey: string;
}

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

interface TeacherTimetableGridProps {
  entries: TeacherTimetableEntry[];
  periodConfig: PeriodConfig[];
  onAssignClick: (dayOfWeek: number, periodNumber: number) => void;
  onEditClick: (entry: TeacherTimetableEntry) => void;
  onDeleteClick: (entry: TeacherTimetableEntry) => void;
}

/** Day x Period datagrid for a single teacher: each cell can hold more than
 * one class (combined sessions, e.g. Dance/Music run across several classes
 * at once) instead of assuming a strict 1:1 slot-to-class mapping. */
export const TeacherTimetableGrid = ({
  entries,
  periodConfig,
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
                <div className="text-sm">Period {period.periodNumber}</div>
                <div className="text-muted-foreground text-xs">
                  {period.startTime}-{period.endTime}
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
                      slotEntries.length > 0 ? "bg-blue-50" : "bg-gray-50"
                    }`}
                  >
                    <div className="flex flex-col gap-1">
                      {slotEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="group relative rounded border border-blue-200 bg-white p-2 text-left text-xs"
                        >
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => onEditClick(entry)}
                          >
                            <div className="font-medium">{entry.className}</div>
                            <div className="text-muted-foreground text-xs">
                              {entry.subjectKey}
                            </div>
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute top-0 right-0 size-6 opacity-0 group-hover:opacity-100"
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
