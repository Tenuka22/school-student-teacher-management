import {
  ATTENDANCE_PERIOD_REASON_KEYS,
  attendanceReasonLabel,
  composeAttendanceReason,
  OTHER_ATTENDANCE_REASON,
  parseAttendanceReason,
} from "@school-student-teacher-management/db/constants/attendance";
import type { AttendancePeriodReason } from "@school-student-teacher-management/db/constants/attendance";
import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { useState } from "react";

import {
  describePeriodRecord,
  missedPeriodNumbers,
  presentPeriodNumbers,
} from "./period-record";

/**
 * What the periods dialog holds for one missed period: a category from
 * `ATTENDANCE_PERIOD_REASONS` and whatever text was typed alongside it.
 *
 * The two are separate because the stored value is one sentence built from them
 * (`composeAttendanceReason`) and the form is two controls: re-opening a day
 * needs the category back, not the sentence, so a saved "Sick — came back at
 * noon" can be re-shown as Sick with the remainder still in the box.
 */
interface ReasonDraft {
  key: AttendancePeriodReason;
  otherText: string;
}

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
 * Which periods of the day are being missed.
 *
 * The matrix this register replaced had a tickable box per period, which made it
 * the cheapest thing to do and the hardest to find anyone in. Ticks now live
 * behind one dialog per teacher: eight checkboxes, one write on save, because
 * `saveTeacherDay` takes the whole set and the server stores it in a single
 * transaction — one tick per request would be eight round trips and eight
 * chances to half-mark the day.
 *
 * ## A tick means **present**, and that is the correction this dialog needed
 *
 * It used to mean *missed*, with "nothing ticked is a present day" stated in the
 * description. The rule was right and the encoding was wrong, because the same
 * day's periods are shown elsewhere as a strip where the *present* ones are
 * marked. A teacher marked present for the day opened this dialog to see what the
 * register already said, found eight empty boxes, and had no way to tell whether
 * that meant "present" or "nothing recorded" — the two are opposite answers and
 * the dialog's own description is three lines of prose.
 *
 * So the boxes now carry the day's state directly: an all-present teacher opens
 * with **eight ticked boxes**, a part-absent day opens with the missed ones
 * unticked, and the sentence under the list is the register's own. The write is
 * unchanged — `onSave` still receives the *absent* periods — because the
 * inversion is in what the box means, not in what is stored.
 *
 * The three outcomes are still stated rather than left to be inferred from how
 * many boxes are ticked, because that rule is the whole reason the dialog exists.
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
  /**
   * The periods ticked as **present**, seeded as every period the row is not
   * recorded absent for.
   *
   * A *missing* seed is the failure mode worth naming: an empty set would open a
   * present teacher as an absent one, and saving without a further thought would
   * write eight absences. It is built as the complement of `absent` for that
   * reason — the tick set is the day, and the absences are the exception.
   */
  const [presentPeriods, setPresentPeriods] = useState<Set<number>>(
    () => new Set(presentPeriodNumbers(new Set(absent.keys())))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  /**
   * The reason each missed period carries, seeded by reading the stored sentence
   * back into a category and any typed remainder.
   *
   * **The reason is per period, not per day, and the column already says so.**
   * `teacher_period_absence.reason` is one row per missed period, and
   * `saveReason(staffId, periodNumber, reason)` has always taken the period
   * number — so a part-absent day could always hold eight different reasons, and
   * there was no way to *give* one. A day where Period 3 is "not timetabled" and
   * Period 6 is "sick" is two facts, and asking for them at the day level would
   * have flattened one of them.
   *
   * The seed parses what is already stored rather than resetting it, so opening
   * the dialog on a day marked by hand last week shows the same category it was
   * written as — and an unrecognised sentence comes back as Other with the whole
   * sentence intact, so nothing typed by a person is lost by opening the form.
   */
  const [reasons, setReasons] = useState<Map<number, ReasonDraft>>(() => {
    const seeded = new Map<number, ReasonDraft>();
    for (const [periodNumber, stored] of absent) {
      const parsed = parseAttendanceReason(stored);
      seeded.set(periodNumber, {
        key: parsed.key,
        otherText: parsed.otherText,
      });
    }
    return seeded;
  });

  const toggle = (periodNumber: number) => {
    setPresentPeriods((previous) => {
      const next = new Set(previous);
      if (next.has(periodNumber)) {
        next.delete(periodNumber);
      } else {
        next.add(periodNumber);
      }
      return next;
    });
  };

  /**
   * The periods the save will write as missed: every one not ticked, each with
   * the sentence its reason composes to.
   */
  const missedPeriods = missedPeriodNumbers(presentPeriods);

  const setReason = (periodNumber: number, next: ReasonDraft) => {
    setReasons((previous) => new Map([...previous, [periodNumber, next]]));
  };

  const outcome = describePeriodRecord(missedPeriods, true);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Periods for {teacherName}</DialogTitle>
          <DialogDescription>
            Ticked means the teacher was there. Un-tick every period missed and
            say why on each one — all eight ticked is a present day, none ticked
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
            for (const periodNumber of missedPeriods) {
              const draft = reasons.get(periodNumber);
              // A missed period with no draft still gets a sentence: the store
              // holds a reason for every absence, and an empty string here would
              // write a marked absence that cannot be explained later.
              next.set(
                periodNumber,
                composeAttendanceReason(
                  draft?.key ?? "other",
                  draft?.otherText ?? absent.get(periodNumber) ?? ""
                )
              );
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
              const isPresent = presentPeriods.has(period.periodNumber);
              const reason = reasons.get(period.periodNumber);
              const reasonId = `${id}-reason`;
              const otherId = `${id}-reason-other`;

              return (
                <li key={period.periodNumber}>
                  <label
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm"
                    htmlFor={id}
                  >
                    <Checkbox
                      checked={isPresent}
                      id={id}
                      onCheckedChange={() => {
                        toggle(period.periodNumber);
                      }}
                    />
                    <span
                      className={
                        // The mark a reader looks for: a missed period's name is
                        // struck through and tinted, so the list reads as a set of
                        // marks rather than as eight tick boxes with two of them
                        // off. The strike is not decoration — it is the same
                        // information the `Missed P…` sentence below carries, said
                        // where the reader is looking.
                        isPresent
                          ? "font-medium tabular-nums"
                          : "text-destructive font-medium tabular-nums line-through"
                      }
                    >
                      Period {period.periodNumber}
                    </span>
                    <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                      {period.startTime}–{period.endTime}
                    </span>
                    {isPresent ? null : <Badge variant="outline">Missed</Badge>}
                  </label>
                  {isPresent ? null : (
                    <div className="bg-muted/40 flex flex-col gap-2 px-3 pb-3">
                      <Field>
                        <FieldLabel htmlFor={reasonId}>
                          Why {period.periodNumber} was missed
                        </FieldLabel>
                        <Select
                          onValueChange={(value) => {
                            setReason(period.periodNumber, {
                              key: (value ?? "other") as AttendancePeriodReason,
                              otherText: reason?.otherText ?? "",
                            });
                          }}
                          value={reason?.key ?? "other"}
                        >
                          <SelectTrigger id={reasonId}>
                            <SelectValue placeholder="Choose a reason" />
                          </SelectTrigger>
                          <SelectContent>
                            {ATTENDANCE_PERIOD_REASON_KEYS.map((key) => (
                              <SelectItem key={key} value={key}>
                                {attendanceReasonLabel(key)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      {/*
                        The free text appears only for "Other", and it is optional
                        there: `composeAttendanceReason` falls back to the label
                        rather than writing an empty string, so a missed period can
                        never be saved with a blank reason. For a chosen category the
                        text is still accepted and is appended, which is how a clerk
                        who typed first and then picked "Sick" keeps what they typed.
                      */}
                      {reason?.key === OTHER_ATTENDANCE_REASON || !reason ? (
                        <Field>
                          <FieldLabel htmlFor={otherId}>
                            Anything to add (optional)
                          </FieldLabel>
                          <Input
                            id={otherId}
                            onChange={(event) => {
                              setReason(period.periodNumber, {
                                key: reason?.key ?? OTHER_ATTENDANCE_REASON,
                                otherText: event.target.value,
                              });
                            }}
                            placeholder="Anything the reason above does not say"
                            value={reason?.otherText ?? ""}
                          />
                        </Field>
                      ) : null}
                    </div>
                  )}
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
