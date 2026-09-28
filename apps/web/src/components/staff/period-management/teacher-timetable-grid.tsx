"use client";

import type { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
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

type PeriodConfig = (typeof CODE_DEFINED_PERIODS)[number];

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
  periodConfig: readonly PeriodConfig[];
  onAssignClick: (dayOfWeek: number, periodNumber: number) => void;
  onEditClick: (entry: TeacherTimetableEntry) => void;
  onDeleteClick: (entry: TeacherTimetableEntry) => void;
}

/** Monday–Friday → 1–5; weekends open on Monday. */
const todayOrMonday = () => {
  const day = new Date().getDay();
  return day >= 1 && day <= 5 ? day : 1;
};

interface SlotStackProps {
  dayOfWeek: number;
  periodNumber: number;
  slotEntries: TeacherTimetableEntry[];
  onAssignClick: TeacherTimetableGridProps["onAssignClick"];
  onEditClick: TeacherTimetableGridProps["onEditClick"];
  onDeleteClick: TeacherTimetableGridProps["onDeleteClick"];
}

/**
 * Every class taught in one slot, plus the button that adds another. The
 * per-class menu shows on hover, on keyboard focus and always on touch.
 */
const SlotStack = ({
  dayOfWeek,
  periodNumber,
  slotEntries,
  onAssignClick,
  onEditClick,
  onDeleteClick,
}: SlotStackProps) => {
  const slotName = `${DAYS_OF_WEEK[dayOfWeek - 1]}, period ${periodNumber}`;

  return (
    <div className="flex flex-col gap-1">
      {slotEntries.map((entry) => (
        <div
          key={entry.id}
          className="group bg-card relative border p-2 text-left text-sm"
        >
          <button
            type="button"
            className="focus-visible:ring-ring w-full pr-6 text-left focus-visible:ring-2 focus-visible:outline-none"
            aria-label={`Edit ${slotName}: ${entry.className}, ${entry.subjectKey}`}
            onClick={() => onEditClick(entry)}
          >
            <span className="block text-sm leading-snug font-semibold">
              {entry.className}
            </span>
            <span className="text-muted-foreground type-caption block">
              {entry.subjectKey}
            </span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`More actions for ${entry.className}, ${slotName}`}
                  className="absolute top-0.5 right-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
                />
              }
            >
              <IconDotsVertical aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditClick(entry)}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDeleteClick(entry)}
                className="text-destructive"
              >
                Unassign
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="w-full"
        aria-label={`${slotEntries.length > 0 ? "Add another class to" : "Assign"} ${slotName}`}
        onClick={() => onAssignClick(dayOfWeek, periodNumber)}
      >
        <IconPlus aria-hidden="true" className="mr-1 size-3" />
        {slotEntries.length > 0 ? "Add class" : "Assign"}
      </Button>
    </div>
  );
};

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
  const [mobileDay, setMobileDay] = useState(todayOrMonday);

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

  const handlers = { onAssignClick, onEditClick, onDeleteClick };

  return (
    <>
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
            {sortedConfig.map((period) => (
              <li
                key={period.periodNumber}
                className="border-border grid grid-cols-[5.5rem_1fr] items-start gap-2 border-b p-2 last:border-b-0"
              >
                <div>
                  <div className="text-sm font-semibold">
                    Period {period.periodNumber}
                  </div>
                  <div className="text-muted-foreground type-caption">
                    {period.startTime}–{period.endTime}
                  </div>
                </div>
                <SlotStack
                  dayOfWeek={mobileDay}
                  periodNumber={period.periodNumber}
                  slotEntries={
                    entriesBySlot.get(`${mobileDay}-${period.periodNumber}`) ??
                    []
                  }
                  {...handlers}
                />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* md and up: the full week. */}
      <Card className="hidden overflow-x-auto md:flex">
        <Table className="min-w-184">
          <TableHeader className="bg-primary">
            <TableRow className="hover:bg-primary">
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
              <TableRow key={period.periodNumber}>
                <TableHead
                  scope="row"
                  className="text-foreground h-auto tracking-normal normal-case"
                >
                  <div className="text-sm font-semibold">
                    Period {period.periodNumber}
                  </div>
                  <div className="text-muted-foreground type-caption font-normal">
                    {period.startTime}–{period.endTime}
                  </div>
                </TableHead>
                {DAYS_OF_WEEK.map((day, dayIndex) => {
                  const dayOfWeek = dayIndex + 1;
                  const slotEntries =
                    entriesBySlot.get(`${dayOfWeek}-${period.periodNumber}`) ??
                    [];

                  return (
                    <TableCell
                      key={day}
                      className={`p-1 align-top ${
                        slotEntries.length > 0 ? "bg-primary/5" : "bg-muted/30"
                      }`}
                    >
                      <SlotStack
                        dayOfWeek={dayOfWeek}
                        periodNumber={period.periodNumber}
                        slotEntries={slotEntries}
                        {...handlers}
                      />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
};
