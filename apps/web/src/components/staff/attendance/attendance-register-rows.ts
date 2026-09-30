import { QUALIFICATION_LEVELS } from "@school-student-teacher-management/db/constants/teachers";
import type { QualificationLevel } from "@school-student-teacher-management/db/constants/teachers";

import { CLASS_CATEGORIES } from "@/components/staff/class-assignment/class-categories";

import type { AttendancePageApi, RowStatus } from "./use-attendance-page";

/**
 * One teacher, and the state of their day — the register's row.
 *
 * A flat projection of the page hook's callbacks rather than the hook's own
 * structures, for one reason: the table re-renders on every keystroke in the
 * search box, and each of these is a function call into a `Map` lookup that would
 * otherwise run sixty times per keystroke. Snapshotting once per data change
 * keeps the keystroke cheap.
 */
export interface RegisterRow {
  staffId: string;
  name: string;
  /**
   * The NIC — the thing that separates two people.
   *
   * `staff.nic` is `unique()` in the database, so unlike an email or a name it
   * cannot be shared, and it is what a reader uses when two teachers are
   * similarly named. Shown in the row rather than in a tooltip: if it is the
   * identifier, hiding it defeats the purpose. It is `NOT NULL` as well, so this
   * is a `string` and the column's old "No NIC on file" fallback is a state the
   * database can no longer produce.
   */
  nic: string;
  email: string | null;
  phone: string | null;
  /** The credential this row is filed under — the highest held. */
  qualification: QualificationLevel | null;
  /** Every credential held, weakest first. Disclosed, not hidden by the grouping. */
  qualifications: QualificationLevel[];
  /** The grade band key from `CLASS_CATEGORIES`, or `unassigned`. */
  gradeBand: string;
  status: RowStatus;
  /** The day's free-text note: the absence reason, or a remark. */
  remark: string;
  /** The periods marked absent, so "P3, P4" is the whole story in the cell. */
  absentPeriods: number[];
  /** Approved leave is a different fact from absence, and reads differently. */
  isLeaveLocked: boolean;
  leaveLabel: string | null;
}

/** The band a teacher is not placed in by the timetable. */
export const UNASSIGNED_BAND_KEY = "unassigned";

export const ANY_BAND = "any";

/**
 * The grade band a teacher belongs to, from the grades they actually teach.
 *
 * The same three bands the old matrix grouped by, reused rather than restated —
 * the reader who learned the register by its Primary/Secondary/Collegiate
 * headings should not have to learn a new vocabulary for the same fact.
 */
export const bandForGrades = (gradeLevels: number[]): string => {
  const taught = new Set(gradeLevels);
  for (const category of CLASS_CATEGORIES) {
    // `CLASS_CATEGORIES` is `as const`, so `grades` is a tuple of literals and
    // cannot be `includes`'d with a `number` directly. A Set, because this runs
    // once per teacher and the linter is right that a scan inside a loop is the
    // wrong shape; widening the constant would be worse, as every other reader of
    // `CLASS_CATEGORIES` depends on it being `as const`.
    const grades = new Set<number>(category.grades);
    for (const grade of taught) {
      if (grades.has(grade)) {
        return category.key;
      }
    }
  }
  return UNASSIGNED_BAND_KEY;
};

/** The bands, in teaching order, plus the ones the timetable does not place. */
export const gradeBandOptions = (): [string, string][] => [
  ...CLASS_CATEGORIES.map(
    (category) => [category.key, category.label] as [string, string]
  ),
  [UNASSIGNED_BAND_KEY, "No classes assigned"],
];

/**
 * Qualification groups, highest credential first.
 *
 * **A teacher is filed under the highest credential they hold.** That is the
 * qualification which describes what they can be given, and it is why the
 * grouping is not alphabetical or arbitrary — a register that filed a PhD next to
 * a GCE O/L would be claiming a difference in seniority that the College has not
 * defined.
 *
 * **A teacher with no qualification is last, not first.** An empty credential is
 * missing data, and putting that group at the top of an attendance register would
 * read as a warning about the College rather than about rows somebody needs to
 * fill in. The group is still its own group, so the gap is countable instead of
 * invisible.
 */
export const qualificationGroups = (
  rows: RegisterRow[]
): [QualificationLevel | null, RegisterRow[]][] => {
  const byQualification = new Map<QualificationLevel | null, RegisterRow[]>();
  for (const row of rows) {
    const existing = byQualification.get(row.qualification);
    if (existing) {
      existing.push(row);
    } else {
      byQualification.set(row.qualification, [row]);
    }
  }

  return [...byQualification.entries()].toSorted(([a], [b]) => {
    if (a === null) {
      return 1;
    }
    if (b === null) {
      return -1;
    }
    return QUALIFICATION_LEVELS[b].level - QUALIFICATION_LEVELS[a].level;
  });
};

/** The credentials actually on this roll, highest first — not all thirteen. */
export const qualificationsPresent = (
  rows: RegisterRow[]
): QualificationLevel[] => {
  const present = new Set<QualificationLevel>();
  for (const row of rows) {
    if (row.qualification !== null) {
      present.add(row.qualification);
    }
  }
  return [...present].toSorted(
    (a, b) => QUALIFICATION_LEVELS[b].level - QUALIFICATION_LEVELS[a].level
  );
};

/** Snapshot the page hook's per-teacher callbacks into plain rows. */
export const buildRegisterRows = (page: AttendancePageApi): RegisterRow[] =>
  page.teachers.map((teacher) => {
    const leave = page.leaveFor(teacher.id);
    return {
      staffId: teacher.id,
      name: teacher.name,
      nic: teacher.nic,
      email: teacher.email,
      phone: teacher.phone,
      qualification: teacher.highestQualification,
      qualifications: teacher.qualifications,
      gradeBand: bandForGrades(teacher.gradeLevels),
      status: page.rowStatus(teacher.id),
      remark: page.dayReason(teacher.id),
      absentPeriods: [...page.expandedAbsentPeriods(teacher.id).keys()],
      isLeaveLocked: page.isLeaveLocked(teacher.id),
      leaveLabel: leave ? `${leave.type} leave` : null,
    };
  });
