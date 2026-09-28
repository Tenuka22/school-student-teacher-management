import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { Checkbox } from "@school-student-teacher-management/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import { useState } from "react";

/**
 * The three things a row can be told without changing its mark.
 *
 * They live apart from the table because they are dialogs — a whole screen's
 * worth of controls each — and the table file is already the one holding the
 * grouping, the filters and the search. A row hands up *which* teacher and
 * *what* is already on the file; these own the way in and the write back.
 *
 * The arrival dialog is the policy itself made reachable. `recordArrival` decides
 * between on time, a short leave and a half day from the time typed here and the
 * year's cut-off, so this is the only input the cut-off rule actually reads.
 */
interface MarkDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  teacherName: string;
}

/**
 * The remark, typed into a dialog.
 *
 * `saveReason(staffId, null, …)` is the whole-day note and it is the same write
 * the absence reason has always used — `markAttendance` nulls the column on any
 * write that omits it, which is why the hook sends the reason with every status
 * rather than only with an absence. So a remark on a present teacher and a reason
 * on an absent one are the same field: the remark is not a new concept, it is the
 * reason box, reachable for a teacher who is not absent.
 */
export const RemarkDialog = ({
  initialValue,
  onOpenChange,
  onSave,
  open,
  teacherName,
}: MarkDialogProps & {
  initialValue: string;
  onSave: (value: string) => Promise<boolean>;
}) => {
  const [value, setValue] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputId = "attendance-remark";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remark for {teacherName}</DialogTitle>
          <DialogDescription>
            Anything worth remembering about this teacher on this date — a call
            from a parent, why a mark was changed, a note to yourself. It is the
            same field the absence reason uses, and saving it does not change
            the mark.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (isSaving) {
              return;
            }
            setIsSaving(true);
            setFailed(false);
            const saved = await onSave(value);
            setIsSaving(false);
            if (saved) {
              onOpenChange(false);
            } else {
              // The text stays and the dialog stays: a refused save is not a
              // reason to make somebody type it again.
              setFailed(true);
            }
          }}
        >
          <Field>
            <FieldLabel htmlFor={inputId}>Remark</FieldLabel>
            <Input
              autoFocus
              id={inputId}
              onChange={(event) => {
                setValue(event.target.value);
              }}
              placeholder="e.g. Called the office at 09:20, traffic"
              value={value}
            />
          </Field>
          {failed ? (
            <p className="text-destructive mt-2 text-sm" role="alert">
              The remark was not saved and the text is still here. Try again.
            </p>
          ) : null}
          <DialogFooter className="mt-4">
            <Button
              onClick={() => {
                onOpenChange(false);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isSaving} type="submit">
              {isSaving ? "Saving…" : "Save remark"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Arrival time, which is where the cut-off rule gets its one input.
 *
 * The server compares the time typed here against `arrivalCutoffTime` as a
 * string, and both are `HH:MM`, so the comparison is the same one on screen as in
 * the handler. Late means the month's short leave is spent if any remain, and a
 * half day if none do — so the description says both outcomes rather than
 * promising one that the numbers may not produce.
 */
export const ArrivalDialog = ({
  cutoff,
  onOpenChange,
  onSave,
  open,
  teacherName,
}: MarkDialogProps & {
  /** The year's cut-off, quoted back so the answer is not a surprise. */
  cutoff: string | null;
  onSave: (arrivalTime: string) => Promise<boolean>;
}) => {
  const [value, setValue] = useState(cutoff ?? "07:30");
  const [isSaving, setIsSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputId = "attendance-arrival";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record arrival — {teacherName}</DialogTitle>
          <DialogDescription>
            {cutoff === null
              ? "No cut-off is configured for this year, so this records the time only."
              : `After ${cutoff} the short leave is used while any remain this month; once they are gone the day becomes a half day.`}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (isSaving) {
              return;
            }
            setIsSaving(true);
            setFailed(false);
            const saved = await onSave(value);
            setIsSaving(false);
            if (saved) {
              onOpenChange(false);
            } else {
              setFailed(true);
            }
          }}
        >
          <Field>
            <FieldLabel htmlFor={inputId}>Arrival time</FieldLabel>
            <Input
              autoFocus
              id={inputId}
              onChange={(event) => {
                setValue(event.target.value);
              }}
              type="time"
              value={value}
            />
          </Field>
          {failed ? (
            <p className="text-destructive mt-2 text-sm" role="alert">
              The arrival was not recorded and the time is still here. Try
              again.
            </p>
          ) : null}
          <DialogFooter className="mt-4">
            <Button
              onClick={() => {
                onOpenChange(false);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isSaving || value === ""} type="submit">
              {isSaving ? "Recording…" : "Record arrival"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/**
 * The three-way rule the dialog exists to make visible, said in words.
 *
 * Worth a named function rather than a chain in the body: this is the decision
 * about *what the day will become*, it is the thing a reader is checking against
 * the ticks, and an early return reads as a rule where a nested ternary reads as
 * a lookup.
 */
const describePeriodOutcome = (selected: Set<number>): string => {
  if (selected.size === 0) {
    return "Present";
  }
  if (selected.size >= CODE_DEFINED_PERIODS.length) {
    return "Absent for the day";
  }
  const missed = [...selected].toSorted((a, b) => a - b);
  return `Part absent — P${missed.join(", P")}`;
};

/**
 * Which periods of the day are being missed.
 *
 * The matrix this register replaced had a tickable box per period, which made it
 * the cheapest thing to do and the hardest to find anyone in. Ticks now live
 * behind one dialog per teacher: eight checkboxes, one write on save, because
 * `saveTeacherDay` takes the whole set and the server stores it in a single
 * transaction — one tick per request would be eight round trips and eight
 * chances to half-mark the day.
 *
 * The three outcomes are stated rather than left to be inferred from how many
 * boxes are ticked, because that rule is the whole reason the dialog exists.
 */
export const PeriodsDialog = ({
  absent,
  onOpenChange,
  onSave,
  open,
  teacherName,
}: MarkDialogProps & {
  /** The periods already marked absent, each with the reason it carries. */
  absent: Map<number, string>;
  onSave: (absentPeriods: Map<number, string>) => Promise<boolean>;
}) => {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(absent.keys())
  );
  const [isSaving, setIsSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = (periodNumber: number) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(periodNumber)) {
        next.delete(periodNumber);
      } else {
        next.add(periodNumber);
      }
      return next;
    });
  };

  const outcome = describePeriodOutcome(selected);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Periods for {teacherName}</DialogTitle>
          <DialogDescription>
            Tick every period missed. Nothing ticked is a present day, all eight
            is an absence, and anything between is part absent.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (isSaving) {
              return;
            }
            setIsSaving(true);
            setFailed(false);
            const next = new Map<number, string>();
            for (const period of CODE_DEFINED_PERIODS) {
              if (selected.has(period.periodNumber)) {
                // The reason travels with the tick, so re-saving a day does not
                // drop the note a period already carried.
                next.set(
                  period.periodNumber,
                  absent.get(period.periodNumber) ?? ""
                );
              }
            }
            const saved = await onSave(next);
            setIsSaving(false);
            if (saved) {
              onOpenChange(false);
            } else {
              setFailed(true);
            }
          }}
        >
          <ul className="divide-border/60 border-border/60 divide-y rounded-md border">
            {CODE_DEFINED_PERIODS.map((period) => {
              const id = `period-${period.periodNumber}`;
              return (
                <li key={period.periodNumber}>
                  <label
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm"
                    htmlFor={id}
                  >
                    <Checkbox
                      checked={selected.has(period.periodNumber)}
                      id={id}
                      onCheckedChange={() => {
                        toggle(period.periodNumber);
                      }}
                    />
                    <span className="font-medium tabular-nums">
                      Period {period.periodNumber}
                    </span>
                    <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                      {period.startTime}–{period.endTime}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p
            aria-live="polite"
            className="text-muted-foreground mt-2 text-sm tabular-nums"
          >
            {outcome}
          </p>
          {failed ? (
            <p className="text-destructive mt-2 text-sm" role="alert">
              The periods were not saved and the ticks are still here. Try
              again.
            </p>
          ) : null}
          <DialogFooter className="mt-4">
            <Button
              onClick={() => {
                onOpenChange(false);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isSaving} type="submit">
              {isSaving ? "Saving…" : "Save periods"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
