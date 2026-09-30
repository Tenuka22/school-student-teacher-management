import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";

/**
 * The day as one sentence about its periods — **the one place that wording
 * lives.**
 *
 * ## Why a whole module for one function
 *
 * `react-doctor`'s `only-export-components` rule: a module that exports
 * components *and* plain values cannot preserve component state on a Fast
 * Refresh edit, because the whole module has to reload. The function used to
 * live in `attendance-mark-dialogs.tsx` beside the three dialogs and be imported
 * by `attendance-register-columns.tsx`, which is a nicer file count and a worse
 * rule. The dashboards in this app hit the same thing and solved it the same way
 * (`components/admin/dashboard-figure.ts`), so this is the second answer to the
 * same question rather than a new one.
 *
 * ## What this wording is for
 *
 * The register's cell shows the day's periods as a strip and the register's
 * periods dialog shows them as checkboxes, and the two **must agree**, because a
 * reader who opens the dialog to check the strip is doing exactly what it is
 * there for. They first disagreed in the only way that matters: the strip said
 * "All 8 periods present" for a teacher whose dialog opened with eight empty
 * boxes, because the dialog's tick meant *missed* and the strip's meant
 * *present*. "Present" and "nothing recorded" are opposite answers, and the
 * dialog's own description was three lines of prose saying which one it meant.
 *
 * So: one function, one set of words, and a tick in that dialog means *present* —
 * see `PeriodsDialog`'s doc comment for the inversion.
 *
 * `isRecorded` is the "nobody has said anything yet" flag rather than a status
 * string, because that is the only distinction the two callers share: the cell
 * has a row status and the dialog does not, and both need to be able to say
 * "no periods recorded" rather than implying a present day nobody claimed.
 */
export const describePeriodRecord = (
  absentPeriods: number[],
  isRecorded: boolean
): string => {
  if (!isRecorded) {
    return "No periods recorded yet";
  }

  if (absentPeriods.length === 0) {
    return `All ${CODE_DEFINED_PERIODS.length} periods present`;
  }

  if (absentPeriods.length >= CODE_DEFINED_PERIODS.length) {
    return `All ${CODE_DEFINED_PERIODS.length} periods missed`;
  }

  const missed = absentPeriods.toSorted((a, b) => a - b);
  return `Missed P${missed.join(", P")} — present the other ${
    CODE_DEFINED_PERIODS.length - missed.length
  }`;
};

/** Every period of the day, in the order the grid prints them. */
export const allPeriodNumbers = (): number[] => {
  const numbers: number[] = [];
  for (const period of CODE_DEFINED_PERIODS) {
    numbers.push(period.periodNumber);
  }

  return numbers;
};

/** The periods **not** ticked as present — what a save writes as missed. */
export const missedPeriodNumbers = (presentPeriods: Set<number>): number[] => {
  const missed: number[] = [];
  for (const period of CODE_DEFINED_PERIODS) {
    if (!presentPeriods.has(period.periodNumber)) {
      missed.push(period.periodNumber);
    }
  }

  return missed;
};

/** The complement of {@link missedPeriodNumbers} — the tick set for a day. */
export const presentPeriodNumbers = (absentPeriods: Set<number>): number[] => {
  const present: number[] = [];
  for (const periodNumber of allPeriodNumbers()) {
    if (!absentPeriods.has(periodNumber)) {
      present.push(periodNumber);
    }
  }

  return present;
};
