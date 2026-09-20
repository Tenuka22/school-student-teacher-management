"use client";

import { cn } from "@school-student-teacher-management/ui/lib/utils";
import { format, parseISO } from "date-fns";

import type { DayStatus } from "@/components/staff/attendance/use-attendance-page";

interface AttendanceDateStripProps {
  days: { date: string; status: DayStatus | "unmarked" }[];
  selectedDate: string;
  onSelect: (date: string) => void;
}

const STATUS_STYLES: Record<DayStatus | "unmarked", string> = {
  present: "border-primary/40 bg-primary/10 text-primary",
  partial:
    "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  absent: "border-destructive/40 bg-destructive/10 text-destructive",
  unmarked: "border-border bg-muted/30 text-muted-foreground",
};

const STATUS_LABEL: Record<DayStatus | "unmarked", string> = {
  present: "Present",
  partial: "Partial",
  absent: "Absent",
  unmarked: "Not marked",
};

/** Compact week strip: one chip per nearby date showing that day's
 * attendance status at a glance, click to jump the picker to it. */
export const AttendanceDateStrip = ({
  days,
  selectedDate,
  onSelect,
}: AttendanceDateStripProps) => (
  <div className="flex flex-wrap gap-2">
    {days.map((day) => {
      const isSelected = day.date === selectedDate;
      return (
        <button
          key={day.date}
          type="button"
          onClick={() => onSelect(day.date)}
          className={cn(
            "flex min-w-20 flex-col items-center gap-0.5 rounded-md border px-3 py-2 text-xs transition-colors",
            STATUS_STYLES[day.status],
            isSelected &&
              "ring-ring ring-offset-background ring-2 ring-offset-2"
          )}
          title={STATUS_LABEL[day.status]}
        >
          <span className="font-medium">
            {format(parseISO(day.date), "EEE")}
          </span>
          <span>{format(parseISO(day.date), "MMM d")}</span>
          <span className="text-[10px] tracking-wide uppercase">
            {STATUS_LABEL[day.status]}
          </span>
        </button>
      );
    })}
  </div>
);
