"use client";

import { Button } from "@school-student-teacher-management/ui/components/button";
import { Calendar } from "@school-student-teacher-management/ui/components/calendar";
import { useFieldControlProps } from "@school-student-teacher-management/ui/components/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@school-student-teacher-management/ui/components/popover";
import { IconCalendar } from "@tabler/icons-react";
import { format, isValid, parseISO } from "date-fns";
import { useState, useSyncExternalStore } from "react";

/** The local calendar day, as `yyyy-mm-dd`, and stable for a whole day. */
const getTodayKey = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

/** The server has no day to offer: it renders the unrestricted month. */
const getServerTodayKey = () => null;

/**
 * Nothing outside this component changes the day while it is mounted, so the
 * subscription has nothing to listen to and hands back an inert unsubscribe.
 */
const noopUnsubscribe = () => null;
const subscribeToNothing = () => noopUnsubscribe;

interface DatePickerProps {
  id?: string;
  /** ISO date string, e.g. "1990-05-14". Empty string means unset. */
  value: string;
  onChange: (isoDate: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Disable dates after today (e.g. for birth dates). Default false. */
  disableFuture?: boolean;
  /**
   * Marks the control as failed: the destructive ring, and `aria-invalid` on
   * the trigger, so a `FieldError` beside it is announced against it.
   */
  invalid?: boolean;
  required?: boolean;
  /**
   * Prefixes the spoken name, e.g. "Date of birth". Left off by default so the
   * trigger's accessible name stays the date the user can actually see, which
   * is what WCAG 2.5.3 (Label in Name) asks for.
   */
  ariaLabel?: string;
}

/** Date picker: a button styled like an input, opening a calendar popover.
 * Stores/emits plain "yyyy-MM-dd" ISO date strings to match every other
 * date field in this app.
 *
 * The trigger is a real `<button type="button">`: in the tab order, activated
 * by Enter and Space, and unable to submit the form it sits in — a date the
 * user has not chosen cannot become a silent empty submit. Base UI's popover
 * trigger supplies `aria-haspopup`, `aria-expanded` and `aria-controls`, and
 * the popover itself is portalled, so it is never clipped by a scrolling
 * ancestor. */
export const DatePicker = ({
  id,
  value,
  onChange,
  disabled = false,
  placeholder = "Select a date",
  disableFuture = false,
  invalid = false,
  required = false,
  ariaLabel,
}: DatePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);

  /**
   * Today, as a day key, read from the client only.
   *
   * A module-level constant is evaluated once per server process, so a
   * long-running server would keep enforcing yesterday's cut-off; reading the
   * clock during render would let the server and the browser disagree across a
   * midnight boundary and hydrate a different month grid. `useSyncExternalStore`
   * with a server snapshot is the honest way to say "this is a client value":
   * the server reports no day at all, hydration matches, and the cut-off lands
   * on the next commit.
   */
  const dayKey = useSyncExternalStore(
    subscribeToNothing,
    getTodayKey,
    getServerTodayKey
  );
  const today = dayKey
    ? new Date(
        Number(dayKey.slice(0, 4)),
        Number(dayKey.slice(5, 7)) - 1,
        Number(dayKey.slice(8, 10))
      )
    : undefined;

  // `parseISO` hands back an Invalid Date instead of throwing, and `format` on
  // one throws a RangeError. A malformed value from the ledger would take the
  // screen down, so it reads as unset here.
  const parsed = value ? parseISO(value) : undefined;
  const selectedDate = parsed && isValid(parsed) ? parsed : undefined;
  const spokenLabel = selectedDate
    ? format(selectedDate, "d MMMM yyyy")
    : placeholder;

  const controlProps = useFieldControlProps({
    id,
    disabled,
    "aria-invalid": invalid || undefined,
    "aria-required": required || undefined,
  });

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            data-slot="date-picker-trigger"
            className="w-full justify-start font-normal"
            aria-label={ariaLabel ? `${ariaLabel}: ${spokenLabel}` : undefined}
            {...controlProps}
          >
            <IconCalendar aria-hidden="true" className="size-4" />
            {selectedDate ? (
              format(selectedDate, "PPP")
            ) : (
              <span className="text-[color-mix(in_oklab,var(--foreground)_72%,transparent)]">
                {placeholder}
              </span>
            )}
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
          disabled={disableFuture && today ? { after: today } : undefined}
        />
      </PopoverContent>
    </Popover>
  );
};
