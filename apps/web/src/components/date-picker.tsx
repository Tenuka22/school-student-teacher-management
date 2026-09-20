"use client";

import { Button } from "@school-student-teacher-management/ui/components/button";
import { Calendar } from "@school-student-teacher-management/ui/components/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@school-student-teacher-management/ui/components/popover";
import { IconCalendar } from "@tabler/icons-react";
import { format, parseISO } from "date-fns";
import { useState } from "react";

const TODAY = new Date();

interface DatePickerProps {
  id?: string;
  /** ISO date string, e.g. "1990-05-14". Empty string means unset. */
  value: string;
  onChange: (isoDate: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Disable dates after today (e.g. for birth dates). Default false. */
  disableFuture?: boolean;
}

/** Date picker: a button styled like an input, opening a calendar popover.
 * Stores/emits plain "yyyy-MM-dd" ISO date strings to match every other
 * date field in this app. */
export const DatePicker = ({
  id,
  value,
  onChange,
  disabled = false,
  placeholder = "Select a date",
  disableFuture = false,
}: DatePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const selectedDate = value ? parseISO(value) : undefined;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full justify-start font-normal"
          >
            <IconCalendar className="mr-2 size-4" />
            {selectedDate ? format(selectedDate, "PPP") : placeholder}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selectedDate}
          captionLayout="dropdown"
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : "");
            setIsOpen(false);
          }}
          disabled={disableFuture ? { after: TODAY } : undefined}
        />
      </PopoverContent>
    </Popover>
  );
};
