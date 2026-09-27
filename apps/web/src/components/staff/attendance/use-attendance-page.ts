import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import type { SchoolPeriod } from "@school-student-teacher-management/db/periods";
import type {
  AcademicYearId,
  StaffId,
} from "@school-student-teacher-management/db/schema/staff";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  format,
  getDate,
  getDay,
  getDaysInMonth,
  getMonth,
  getYear,
} from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

export interface AcademicYear {
  id: string;
  year: number;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
}

export interface AttendanceTeacher {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  gradeLevels: number[];
}

interface ScheduleRow {
  staffId: string;
  periodNumber: number;
  classId: string;
  className: string;
  subjectKey: string;
}

export interface ScheduleCell {
  classId: string;
  className: string;
  subjectKey: string;
}

interface AttendanceForDateRow {
  staffId: string;
  status: "present" | "partial" | "absent" | "lateShortLeave" | "halfDay";
  reason: string | null;
  absentPeriods: { periodNumber: number; reason: string }[];
  lockedLeave: {
    id: string;
    type: string;
    dayPart: "full" | "morning" | "afternoon";
  } | null;
}

export type RowStatus =
  | "present"
  | "partial"
  | "absent"
  | "lateShortLeave"
  | "halfDay"
  /**
   * No attendance row exists for this person on this date.
   *
   * The database treats a missing row as "not recorded" and a stored `present`
   * as "present" — two different facts. The grid used to collapse the first
   * into the second, so a day nobody had marked looked like a day where every
   * teacher was present, and a failed request looked like a full school.
   */
  | "unmarked";

/** A teacher missing from `draft` has no absence recorded. An entry here means
 * something is off: "absent" cancels all eight periods for the day, while
 * "partial" cancels exactly the periods listed in `periods`. */
interface AbsenceEntry {
  status: "partial" | "absent";
  periods: Map<number, string>;
}

export interface MonthOption {
  value: number;
  label: string;
}

/** A period/day toggle or reason save requested for a date before today.
 * Past edits aren't applied immediately - the caller must confirm via
 * `confirmPastEdit` first, since backdating attendance is unusual enough
 * to warrant an explicit "are you sure" rather than a silent write. */
export type PendingPastEdit =
  | { kind: "school"; staffId: string; overrideLeave?: boolean }
  | {
      kind: "period";
      staffId: string;
      periodNumber: number;
      overrideLeave?: boolean;
    }
  | {
      kind: "reason";
      staffId: string;
      periodNumber: number | null;
      reason: string;
      overrideLeave?: boolean;
    };

export interface AttendancePolicyValues {
  arrivalCutoffTime: string;
  shortLeavesPerMonth: number;
  primaryStartPeriodNumber: number;
  primaryEndPeriodNumber: number;
  secondaryStartPeriodNumber: number;
  secondaryEndPeriodNumber: number;
}

export interface AttendancePolicyUsage {
  yearMonth: string;
  shortLeavesUsed: number;
}

export interface ApprovedLeave {
  id: string;
  type: string;
  dayPart: "full" | "morning" | "afternoon";
}

/** How much of the year the screen is entitled to draw. */
export type AcademicYearState = "loading" | "ready" | "missing" | "failed";

/**
 * What the register is allowed to show.
 *
 * This is a data-integrity question, not a styling one. A register drawn from
 * half of its reads is not a register: it can put a teacher in the wrong place
 * on the wrong day, so the grid refuses to draw anything that could be mistaken
 * for a register until the two reads that decide the rows — the teaching roll
 * and the day's attendance — have both come back.
 *
 * - `booting`  the year or the teaching roll is still resolving.
 * - `loading`  the roll is known; this date's register has not arrived.
 * - `failed`   a read that decides the rows failed, so nothing may be drawn.
 * - `degraded` the rows are true, but a supporting read (the day's timetable,
 *   the Principal override flag) did not come back.
 * - `ready`    everything the register needs is loaded.
 */
export type RegisterState =
  | "booting"
  | "loading"
  | "ready"
  | "degraded"
  | "failed";

/** One read that did not deliver, named, with the way out of it. */
export interface AttendanceDataIssue {
  id:
    | "academic-year"
    | "teaching-roll"
    | "register"
    | "timetable"
    | "authority";
  label: string;
  detail: string;
  recovery: string;
  /** A blocking issue means the register itself is incomplete. */
  blocking: boolean;
  /** Null when retrying cannot help — a missing policy, say. */
  retry: (() => void) | null;
}

/** The register's own tallies, for the labelled stat row above the grid. */
export interface RegisterSummary {
  onRoll: number;
  recorded: number;
  unmarked: number;
  absentForDay: number;
  periodAbsences: number;
  /** Present marks held only in this browser session (see `sessionPresent`). */
  sessionMarks: number;
  notSaved: number;
}

/** The outcome of the last write, for the polite live region. */
export interface AttendanceWriteNotice {
  tone: "saved" | "failed";
  message: string;
  seq: number;
}

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_MIN = 1;
const WEEKDAY_MAX = 5;

/**
 * `listAttendanceForDate` and `recordArrival` both refuse to work without a
 * policy row, and they refuse it in two different words. That is a *setup*
 * fault rather than a fault of the request, so it gets its own named state and
 * no retry button: pressing "try again" on a missing policy only ever produces
 * the same refusal.
 */
const POLICY_MISSING_PATTERN =
  /policy is not configured|no attendance policy is configured/u;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const isPolicyMissingError = (error: Error | null | undefined): boolean =>
  Boolean(error && POLICY_MISSING_PATTERN.test(error.message));

/** An error's own message, or a sentence written for this screen. `catch`
 * hands over `unknown`, so the narrowing happens here once. */
const errorText = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
};

const orNull = <T>(value: T | null | undefined): T | null => value ?? null;

/** True when the draft belongs to a different date and has to be emptied. */
const draftNeedsClearing = (
  attendanceKey: string,
  draftDateKey: string | null
): boolean => attendanceKey !== draftDateKey;

/** True once this date's register has arrived and has not been read into the
 * draft yet. A background re-read must not re-derive it: the draft is ahead of
 * the server while a write is in flight. */
const draftCanLoad = (input: {
  attendanceKey: string;
  draftDateKey: string | null;
  loadedDateKey: string | null;
  isFetching: boolean;
  hasData: boolean;
}): boolean =>
  input.draftDateKey === input.attendanceKey &&
  input.loadedDateKey !== input.attendanceKey &&
  !input.isFetching &&
  input.hasData;

const dayOfWeekForDate = (isoDate: string): number | null => {
  const jsDay = getDay(new Date(`${isoDate}T00:00:00`));
  return jsDay >= WEEKDAY_MIN && jsDay <= WEEKDAY_MAX ? jsDay : null;
};

const isWeekday = (dayOfWeek: number | null): boolean => dayOfWeek !== null;

const nextWeekdayFrom = (isoDate: string): string => {
  const start = new Date(`${isoDate}T00:00:00`);
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + offset);
    const jsDay = candidate.getDay();
    if (jsDay >= WEEKDAY_MIN && jsDay <= WEEKDAY_MAX) {
      return format(candidate, "yyyy-MM-dd");
    }
  }
  return isoDate;
};

const teacherNameFor = (
  teachers: AttendanceTeacher[],
  staffId: string
): string =>
  teachers.find((teacher) => teacher.id === staffId)?.name ?? "This teacher";

const clampDateToAcademicYear = (
  date: string,
  academicYear: AcademicYear | undefined
) => {
  if (academicYear?.startDate && date < academicYear.startDate) {
    return academicYear.startDate;
  }
  if (academicYear?.endDate && date > academicYear.endDate) {
    return academicYear.endDate;
  }
  return date;
};

const getDayOptions = (
  year: number,
  month: number,
  academicYear: AcademicYear | undefined
): MonthOption[] => {
  const daysInMonth = getDaysInMonth(new Date(year, month, 1));
  const options: MonthOption[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const candidate = format(new Date(year, month, day), "yyyy-MM-dd");
    const isWithinRange =
      (!academicYear?.startDate || candidate >= academicYear.startDate) &&
      (!academicYear?.endDate || candidate <= academicYear.endDate);
    if (isWithinRange) {
      options.push({ value: day, label: String(day) });
    }
  }
  return options;
};

const getMonthOptions = (
  year: number,
  academicYear: AcademicYear | undefined
): MonthOption[] => {
  const options: MonthOption[] = [];
  for (const [value, label] of MONTH_LABELS.entries()) {
    const daysInMonth = getDaysInMonth(new Date(year, value, 1));
    const firstDate = format(new Date(year, value, 1), "yyyy-MM-dd");
    const lastDate = format(new Date(year, value, daysInMonth), "yyyy-MM-dd");
    const isWithinRange =
      (!academicYear?.startDate || lastDate >= academicYear.startDate) &&
      (!academicYear?.endDate || firstDate <= academicYear.endDate);
    if (isWithinRange) {
      options.push({ value, label });
    }
  }
  return options;
};

const getYearOptions = (
  academicYear: AcademicYear | undefined,
  fallbackYear: number
) => {
  if (!academicYear) {
    return [fallbackYear];
  }
  if (!academicYear.startDate || !academicYear.endDate) {
    return [academicYear.year];
  }
  const firstYear = getYear(new Date(`${academicYear.startDate}T00:00:00`));
  const lastYear = getYear(new Date(`${academicYear.endDate}T00:00:00`));
  return Array.from(
    { length: Math.max(1, lastYear - firstYear + 1) },
    (_, index) => firstYear + index
  );
};

const getAcademicYear = (
  data: unknown,
  selectedYear: number
): AcademicYear | undefined => {
  const years = data as unknown[] | undefined;
  if (!years) {
    return;
  }
  return years.find(
    (year) => (year as Record<string, unknown>).year === selectedYear
  ) as AcademicYear | undefined;
};

const hasPreviousAcademicYear = (
  data: unknown,
  currentYear: AcademicYear | undefined
) => {
  const years = data as unknown[] | undefined;
  if (!(years && currentYear)) {
    return false;
  }
  return years.some(
    (year) => (year as Record<string, unknown>).year === currentYear.year - 1
  );
};

interface AttendanceDraft {
  draft: Map<string, AbsenceEntry>;
  reasons: Map<string, string>;
  locked: Map<string, ApprovedLeave>;
  /**
   * The exact status the server holds, which is not always what the absence map
   * implies: `halfDay` and `lateShortLeave` both arrive as period absences, and
   * the register has to keep saying which one it was.
   */
  stored: Map<string, RowStatus>;
}

const buildAttendanceDraft = (
  rows: AttendanceForDateRow[]
): AttendanceDraft => {
  const draft = new Map<string, AbsenceEntry>();
  const reasons = new Map<string, string>();
  const locked = new Map<string, ApprovedLeave>();
  const stored = new Map<string, RowStatus>();

  for (const row of rows) {
    stored.set(row.staffId, row.status);
    if (row.lockedLeave) {
      locked.set(row.staffId, row.lockedLeave);
    }
    if (row.status !== "present") {
      const periods = new Map<number, string>();
      for (const absence of row.absentPeriods) {
        periods.set(absence.periodNumber, absence.reason);
      }
      draft.set(row.staffId, {
        status: row.status === "absent" ? "absent" : "partial",
        periods,
      });
    }
    if (row.reason) {
      reasons.set(row.staffId, row.reason);
    }
  }

  return { draft, reasons, locked, stored };
};

/** How many periods a draft entry cancels. */
const absentPeriodCount = (entry: AbsenceEntry | undefined): number => {
  if (!entry) {
    return 0;
  }
  if (entry.status === "absent" && entry.periods.size === 0) {
    return CODE_DEFINED_PERIODS.length;
  }
  return entry.periods.size;
};

const resolveWriteStatus = (
  absentPeriodCountForDay: number
): "present" | "partial" | "absent" => {
  if (absentPeriodCountForDay === 0) {
    return "present";
  }
  if (absentPeriodCountForDay >= CODE_DEFINED_PERIODS.length) {
    return "absent";
  }
  return "partial";
};

const describeArrivalOutcome = (
  status: "present" | "lateShortLeave" | "halfDay"
): string => {
  if (status === "present") {
    return "present on time";
  }
  return status === "lateShortLeave"
    ? "late, short leave recorded"
    : "late, half day recorded";
};

const resolveTimetableState = (input: {
  dayOfWeek: number | null;
  isPending: boolean;
  isError: boolean;
}): "ready" | "loading" | "failed" => {
  if (input.isError) {
    return "failed";
  }
  if (input.dayOfWeek === null) {
    return "ready";
  }
  return input.isPending ? "loading" : "ready";
};

const resolveAcademicYearState = (input: {
  isPending: boolean;
  isError: boolean;
  hasYear: boolean;
}): AcademicYearState => {
  if (input.isError) {
    return "failed";
  }
  if (input.isPending) {
    return "loading";
  }
  return input.hasYear ? "ready" : "missing";
};

const resolveRegisterState = (input: {
  yearState: AcademicYearState;
  teachersPending: boolean;
  teachersFailed: boolean;
  registerPending: boolean;
  registerFailed: boolean;
  scheduleFailed: boolean;
  authorityFailed: boolean;
}): RegisterState => {
  if (input.yearState !== "ready" || input.teachersPending) {
    return "booting";
  }
  if (input.teachersFailed || input.registerFailed) {
    return "failed";
  }
  if (input.registerPending) {
    return "loading";
  }
  if (input.scheduleFailed || input.authorityFailed) {
    return "degraded";
  }
  return "ready";
};

interface DataIssueInput {
  yearState: AcademicYearState;
  selectedYear: number;
  errorYear: Error | null;
  errorTeachers: Error | null;
  errorAttendance: Error | null;
  errorSchedule: Error | null;
  errorAuthority: Error | null;
  refetchYear: () => void;
  refetchTeachers: () => void;
  refetchAttendance: () => void;
  refetchSchedule: () => void;
  refetchAuthority: () => void;
}

const buildDataIssues = (input: DataIssueInput): AttendanceDataIssue[] => {
  const issues: AttendanceDataIssue[] = [];

  if (input.yearState === "failed") {
    issues.push({
      id: "academic-year",
      label: "Academic year",
      detail: errorText(input.errorYear, "The list of academic years failed."),
      recovery:
        "The register is keyed by academic year, so it cannot be read without it.",
      blocking: true,
      retry: input.refetchYear,
    });
  }

  if (input.yearState === "missing") {
    issues.push({
      id: "academic-year",
      label: "Academic year",
      detail: `The college has no academic year ${input.selectedYear}.`,
      recovery:
        "Pick a year from the sidebar switcher — the year in the address is the whole dataset.",
      blocking: true,
      retry: input.refetchYear,
    });
  }

  if (input.errorTeachers) {
    issues.push({
      id: "teaching-roll",
      label: "Teaching roll",
      detail: errorText(
        input.errorTeachers,
        "The list of teachers to mark could not be read."
      ),
      recovery:
        "Without the roll there are no rows, and an empty grid would read as an empty school.",
      blocking: true,
      retry: input.refetchTeachers,
    });
  }

  if (input.errorAttendance) {
    const policyMissing = isPolicyMissingError(input.errorAttendance);
    issues.push({
      id: "register",
      label: "Attendance register",
      detail: errorText(
        input.errorAttendance,
        "This date's attendance could not be read."
      ),
      recovery: policyMissing
        ? "The attendance policy for this year has to exist before any date can be read. The administrator sets it in the panel above."
        : "Nobody has been marked absent and nothing has been saved — nothing below is the register.",
      blocking: true,
      retry: policyMissing ? null : input.refetchAttendance,
    });
  }

  if (input.errorSchedule) {
    issues.push({
      id: "timetable",
      label: "Timetable",
      detail: errorText(
        input.errorSchedule,
        "The teaching timetable for this weekday could not be read."
      ),
      recovery:
        "Marks still save, but no cell can name the class behind a period. A cell showing no class may be a free period or a timetable that never arrived.",
      blocking: false,
      retry: input.refetchSchedule,
    });
  }

  if (input.errorAuthority) {
    issues.push({
      id: "authority",
      label: "Principal override",
      detail: errorText(
        input.errorAuthority,
        "Your override authority could not be checked."
      ),
      recovery:
        "Rows held by approved leave stay locked until it is known that you are the Principal.",
      blocking: false,
      retry: input.refetchAuthority,
    });
  }

  return issues;
};

export interface AttendancePageApi {
  date: string;
  day: number;
  month: number;
  year: number;
  setDay: (day: number) => void;
  setMonth: (month: number) => void;
  setYear: (year: number) => void;
  /** Move to a whole `yyyy-MM-dd` date in one step. The three setters above
   * each reset the others, so between them they cannot say "the next weekday". */
  setDate: (isoDate: string) => void;
  todayIso: string;
  isToday: boolean;
  /** The next Monday-to-Friday date after the selected one. */
  nextWeekday: string;
  dayOptions: MonthOption[];
  monthOptions: MonthOption[];
  yearOptions: number[];
  dayOfWeek: number | null;
  /** True when the selected date is before today - edits go through the
   * pending-confirmation flow instead of applying immediately. */
  isPastDate: boolean;
  pendingPastEdit: PendingPastEdit | null;
  confirmPastEdit: () => Promise<void>;
  cancelPastEdit: () => void;
  currentYear: AcademicYear | undefined;
  /** True when an academic year for `currentYear.year - 1` exists - lets
   * the page offer "import teachers from previous year" when this year
   * has no teachers ported forward yet. */
  hasPreviousYear: boolean;
  academicYearState: AcademicYearState;
  errorYear: Error | null;
  refetchYear: () => void;
  teachers: AttendanceTeacher[];
  isLoadingTeachers: boolean;
  isErrorTeachers: boolean;
  errorTeachers: Error | null;
  refetchTeachers: () => void;
  periods: readonly SchoolPeriod[];
  isLoadingSchedule: boolean;
  /** How much of the register the screen may draw. Nothing that could be
   * mistaken for a register is rendered unless this is ready or degraded. */
  registerState: RegisterState;
  /** Every read that did not deliver, named, with its way out. */
  dataIssues: AttendanceDataIssue[];
  isLoadingAttendance: boolean;
  /** A background re-read of a date already on screen. The register stays
   * drawn through this; it must never blank a register someone is marking. */
  isRefetchingAttendance: boolean;
  /** The register could not be read. The grid must not render: an empty draft
   * would otherwise be read as "nobody is absent". */
  isErrorAttendance: boolean;
  errorAttendance: Error | null;
  refetchAttendance: () => Promise<unknown>;
  scheduleByStaff: Map<string, Map<number, ScheduleCell[]>>;
  /** The day's timetable could not be read, so no cell can name its class. */
  timetableState: "ready" | "loading" | "failed";
  pendingCells: Set<string>;
  /** Cells whose last write the server refused and that have been put back. */
  failedCells: Set<string>;
  dismissFailedCells: () => void;
  /** The outcome of the last write, announced politely. */
  writeNotice: AttendanceWriteNotice | null;
  summary: RegisterSummary;
  isPrincipal: boolean;
  isLeaveLocked: (staffId: string) => boolean;
  /** The approved leave holding a row, when there is one. "Excused" is a
   * different fact from "absent" and the register has to say which it is. */
  leaveFor: (staffId: string) => ApprovedLeave | null;
  rowStatus: (staffId: string) => RowStatus;
  isPeriodAbsent: (staffId: string, periodNumber: number) => boolean;
  periodReason: (staffId: string, periodNumber: number) => string;
  togglePeriod: (staffId: string, periodNumber: number) => Promise<boolean>;
  toggleSchool: (staffId: string) => Promise<boolean>;
  /** Automatic late-arrival policy (LEAVE_SYSTEM_DESIGN.md §5). */
  recordArrival: (staffId: string, arrivalTime: string) => Promise<boolean>;
  isRecordingArrival: boolean;
  dayReason: (staffId: string) => string;
  /** `periodNumber: null` saves the whole-day reason; otherwise saves that
   * one period's reason. Applies the value immediately - no separate
   * draft-then-commit step, so there's no window where a just-typed
   * reason could be saved stale. Resolves to whether the server took it, so
   * a caller can keep the text on screen when it did not. */
  saveReason: (
    staffId: string,
    periodNumber: number | null,
    reason: string
  ) => Promise<boolean>;
  policy: AttendancePolicyValues | null;
  policyUsage: AttendancePolicyUsage | null;
  isLoadingPolicy: boolean;
  isErrorPolicy: boolean;
  errorPolicy: Error | null;
  refetchPolicy: () => void;
  isSavingPolicy: boolean;
  /** The server's own words on the last refused policy write, so the form can
   * put the reason next to the numbers rather than only in a toast. */
  lastPolicyError: string | null;
  savePolicy: (values: AttendancePolicyValues) => Promise<boolean>;
  configureDefaultPolicy: () => Promise<boolean>;
}

export const useAttendancePage = (
  selectedAcademicYear: number
): AttendancePageApi => {
  const today = useMemo(() => new Date(), []);
  const [dayValue, setDayValue] = useState(() => getDate(today));
  const [monthValue, setMonthValue] = useState(() => getMonth(today));
  const [yearValue, setYearValue] = useState(() => getYear(today));
  const currentYearQuery = useQuery(
    orpc.staff.listAcademicYears.queryOptions()
  );
  const currentYear = useMemo(
    () => getAcademicYear(currentYearQuery.data, selectedAcademicYear),
    [currentYearQuery.data, selectedAcademicYear]
  );
  const rawDate = format(
    new Date(yearValue, monthValue, dayValue),
    "yyyy-MM-dd"
  );
  const date = clampDateToAcademicYear(rawDate, currentYear);
  const clampedDay = Number(date.slice(8, 10));
  const month = Number(date.slice(5, 7)) - 1;
  const year = Number(date.slice(0, 4));

  const todayIso = useMemo(() => format(today, "yyyy-MM-dd"), [today]);
  const isPastDate = date < todayIso;
  const dayOptions = getDayOptions(year, month, currentYear);
  const monthOptions = getMonthOptions(year, currentYear);
  const yearOptions = getYearOptions(currentYear, getYear(today));

  const hasPreviousYear = useMemo(
    () => hasPreviousAcademicYear(currentYearQuery.data, currentYear),
    [currentYearQuery.data, currentYear]
  );

  const academicYearState = resolveAcademicYearState({
    isPending: currentYearQuery.isPending,
    isError: currentYearQuery.isError,
    hasYear: Boolean(currentYear),
  });

  const yearId = currentYear?.id ?? "";
  const hasYearId = yearId !== "";

  const authorityQuery = useQuery(
    orpc.staff.leaves.getMyAuthority.queryOptions({
      input: { year: selectedAcademicYear },
    })
  );
  const isPrincipal = authorityQuery.data?.isPrincipal === true;

  const teachersQuery = useQuery(
    orpc.staff.attendance.listTeachersForAttendance.queryOptions({
      input: { academicYearId: yearId },
      enabled: hasYearId,
    })
  );
  const teachers = useMemo(
    () => (teachersQuery.data || []) as unknown as AttendanceTeacher[],
    [teachersQuery.data]
  );

  const dayOfWeek = useMemo(() => dayOfWeekForDate(date), [date]);
  const isWeekdayDate = isWeekday(dayOfWeek);

  const scheduleQuery = useQuery(
    orpc.staff.attendance.listScheduleForDay.queryOptions({
      input: {
        academicYearId: yearId,
        dayOfWeek: dayOfWeek ?? 1,
      },
      enabled: hasYearId && isWeekdayDate,
    })
  );

  /** staffId -> periodNumber -> the class(es) taught then (combined
   * sessions can stack more than one). */
  const scheduleByStaff = useMemo(() => {
    const map = new Map<string, Map<number, ScheduleCell[]>>();
    if (dayOfWeek === null) {
      return map;
    }
    const rows = (scheduleQuery.data || []) as unknown as ScheduleRow[];
    for (const row of rows) {
      const staffMap =
        map.get(row.staffId) ?? new Map<number, ScheduleCell[]>();
      const cells = staffMap.get(row.periodNumber) ?? [];
      cells.push({
        classId: row.classId,
        className: row.className,
        subjectKey: row.subjectKey,
      });
      staffMap.set(row.periodNumber, cells);
      map.set(row.staffId, staffMap);
    }
    return map;
  }, [scheduleQuery.data, dayOfWeek]);

  const attendanceQuery = useQuery(
    orpc.staff.attendance.listAttendanceForDate.queryOptions({
      input: { academicYearId: yearId, date },
      enabled: hasYearId,
    })
  );

  // Local grid draft: staffId -> absence entry (missing = no absence).
  // Re-derived (not effect-synced) whenever the selected date - or the
  // data loaded for it - changes, so ticking a checkbox updates
  // immediately without waiting on a network round trip.
  const [draftDateKey, setDraftDateKey] = useState<string | null>(null);
  const [loadedDateKey, setLoadedDateKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Map<string, AbsenceEntry>>(new Map());
  const [dayReasonDraftValue, setDayReasonDraftValue] = useState<
    Map<string, string>
  >(new Map());
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set());
  /**
   * Cells whose last write the server refused.
   *
   * The optimistic change is rolled back, so the grid shows the truth again;
   * this set adds the missing half — telling the user that *this* cell did not
   * save, rather than leaving them to assume it did.
   */
  const [failedCells, setFailedCells] = useState<Set<string>>(new Set());
  const [lockedByStaff, setLockedByStaff] = useState<
    Map<string, ApprovedLeave>
  >(new Map());
  const [storedStatusByStaff, setStoredStatusByStaff] = useState<
    Map<string, RowStatus>
  >(new Map());
  /**
   * Teachers marked present in this browser session.
   *
   * `markAttendance` stores absence, not presence: a "present" write for a
   * teacher with no absence leaves no row behind, so a reload cannot tell a
   * register that was taken from one nobody opened. Until the write path keeps
   * a presence record, the mark the user made is real and has to survive the
   * session — and the register says so once, in a banner, rather than in every
   * cell.
   */
  const [sessionPresent, setSessionPresent] = useState<Set<string>>(new Set());
  const [writeNotice, setWriteNotice] = useState<AttendanceWriteNotice | null>(
    null
  );
  const writeSeq = useRef(0);
  const attendanceKey = `${yearId || "none"}:${date}`;

  /** Synchronous in-flight guard: two clicks on one cell must not race. */
  const inFlightRef = useRef(new Set<string>());
  /** The date a write belongs to, so a reply that lands after the user has
   * moved on cannot flag a cell on the new date. */
  const activeDateRef = useRef(attendanceKey);
  useEffect(() => {
    activeDateRef.current = attendanceKey;
  }, [attendanceKey]);

  /** The polite announcement for the last write, and the live region's text. */
  const announce = useCallback((tone: "saved" | "failed", message: string) => {
    writeSeq.current += 1;
    setWriteNotice({ tone, message, seq: writeSeq.current });
  }, []);

  /**
   * Who actually has a record for this date.
   *
   * `listAttendanceForDate` only returns stored rows (plus approved-leave
   * synthesis), so anyone missing from it is unmarked rather than present. This
   * set is what keeps those two states apart on screen.
   */
  const markedStaffIds = useMemo(() => {
    const rows =
      (attendanceQuery.data as unknown as AttendanceForDateRow[] | undefined) ??
      [];
    return new Set(rows.map((row) => row.staffId));
  }, [attendanceQuery.data]);

  // Changing date empties the register before the new one arrives. Without
  // this, yesterday's absences stay on screen against today's date while the
  // request is in flight, which is a wrong mark on a real person's day rather
  // than a cosmetic glitch.
  if (draftNeedsClearing(attendanceKey, draftDateKey)) {
    setDraftDateKey(attendanceKey);
    setDraft(new Map());
    setDayReasonDraftValue(new Map());
    setLockedByStaff(new Map());
    setStoredStatusByStaff(new Map());
    setSessionPresent(new Set());
    setPendingCells(new Set());
    setFailedCells(new Set());
    setWriteNotice(null);
  }

  if (
    draftCanLoad({
      attendanceKey,
      draftDateKey,
      hasData: attendanceQuery.data !== undefined,
      isFetching: attendanceQuery.isFetching,
      loadedDateKey,
    })
  ) {
    setLoadedDateKey(attendanceKey);
    const rows = attendanceQuery.data as unknown as AttendanceForDateRow[];
    const next = buildAttendanceDraft(rows);
    setDraft(next.draft);
    setLockedByStaff(next.locked);
    setStoredStatusByStaff(next.stored);
    setDayReasonDraftValue(next.reasons);
  }

  const queryClient = useQueryClient();
  const markMutation = useMutation(
    orpc.staff.attendance.markAttendance.mutationOptions()
  );

  /**
   * Automatic late-arrival marking (LEAVE_SYSTEM_DESIGN.md §5): the
   * server compares the given arrival time against the year's policy
   * (07:30 cutoff, 2 short leaves/month, half-day overflow) and records
   * present / lateShortLeave / halfDay itself.
   */
  const recordArrivalMutation = useMutation(
    orpc.staff.attendance.recordArrival.mutationOptions()
  );

  const policyQuery = useQuery({
    ...orpc.staff.attendance.getPolicy.queryOptions({
      input: { academicYearId: yearId },
    }),
    enabled: hasYearId,
  });
  const [lastPolicyError, setLastPolicyError] = useState<string | null>(null);
  const updatePolicyMutation = useMutation(
    orpc.staff.attendance.updatePolicy.mutationOptions({
      onSuccess: async () => {
        setLastPolicyError(null);
        toast.success("Attendance policy saved");
        await queryClient.invalidateQueries({
          queryKey: orpc.staff.attendance.getPolicy.queryOptions({
            input: { academicYearId: yearId },
          }).queryKey,
        });
      },
      onError: (error) => {
        setLastPolicyError(
          errorText(error, "The attendance policy could not be saved")
        );
        toast.error(
          errorText(error, "The attendance policy could not be saved")
        );
      },
    })
  );

  const savePolicy = useCallback(
    async (values: AttendancePolicyValues) => {
      if (!hasYearId) {
        return false;
      }
      try {
        await updatePolicyMutation.mutateAsync({
          academicYearId: yearId as AcademicYearId,
          ...values,
        });
        return true;
      } catch {
        return false;
      }
    },
    [hasYearId, updatePolicyMutation, yearId]
  );

  const configureDefaultPolicy = useCallback(async () => {
    if (!hasYearId) {
      return false;
    }
    try {
      await updatePolicyMutation.mutateAsync({
        academicYearId: yearId as AcademicYearId,
      });
      return true;
    } catch {
      return false;
    }
  }, [hasYearId, updatePolicyMutation, yearId]);

  /**
   * Reads this date's register back from the server and folds one teacher's
   * result into the draft. Used after an arrival is recorded, because the
   * server decides which periods a late arrival loses and the grid must show
   * its decision rather than guess at it.
   */
  const refreshTeacherFromServer = useCallback(
    async (staffId: string) => {
      if (!hasYearId) {
        return;
      }
      const rows = (await queryClient.fetchQuery(
        orpc.staff.attendance.listAttendanceForDate.queryOptions({
          input: { academicYearId: yearId, date },
        })
      )) as unknown as AttendanceForDateRow[];
      const row = rows.find((candidate) => candidate.staffId === staffId);
      setDraft((previous) => {
        const next = new Map(previous);
        if (!row || row.status === "present") {
          next.delete(staffId);
          return next;
        }
        const periods = new Map<number, string>();
        for (const absence of row.absentPeriods) {
          periods.set(absence.periodNumber, absence.reason);
        }
        next.set(staffId, {
          status: row.status === "absent" ? "absent" : "partial",
          periods,
        });
        return next;
      });
      setStoredStatusByStaff((previous) => {
        const next = new Map(previous);
        if (row) {
          next.set(staffId, row.status);
        } else {
          next.delete(staffId);
        }
        return next;
      });
      setLockedByStaff((previous) => {
        const next = new Map(previous);
        if (row?.lockedLeave) {
          next.set(staffId, row.lockedLeave);
        } else {
          next.delete(staffId);
        }
        return next;
      });
      setDayReasonDraftValue((previous) => {
        const next = new Map(previous);
        if (row?.reason) {
          next.set(staffId, row.reason);
        }
        return next;
      });
    },
    [date, hasYearId, queryClient, yearId]
  );

  const recordArrival = useCallback(
    async (staffId: string, arrivalTime: string) => {
      if (!hasYearId) {
        return false;
      }
      try {
        const result = await recordArrivalMutation.mutateAsync({
          staffId: staffId as StaffId,
          academicYearId: yearId as AcademicYearId,
          date,
          arrivalTime,
        });
        await refreshTeacherFromServer(staffId);
        toast.success(
          result.status === "present"
            ? "Marked present — on time"
            : `Late — ${result.status === "lateShortLeave" ? "short leave" : "half day"} recorded (${result.note ?? "no note"})`
        );
        announce(
          "saved",
          `${teacherNameFor(teachers, staffId)} recorded ${describeArrivalOutcome(result.status)}`
        );
        return true;
      } catch (error) {
        const message = errorText(error, "The arrival could not be recorded");
        toast.error(message);
        announce("failed", `Arrival not recorded — ${message}`);
        return false;
      }
    },
    [
      announce,
      date,
      hasYearId,
      recordArrivalMutation,
      refreshTeacherFromServer,
      teachers,
      yearId,
    ]
  );

  /**
   * Writes one teacher's day. Returns whether the server accepted it, so the
   * caller can undo the optimistic change instead of leaving the grid showing a
   * mark the database refused.
   */
  const saveTeacherDay = useCallback(
    async (
      staffId: string,
      absentPeriods: Map<number, string>,
      dayReason?: string,
      overrideLeave = false
    ): Promise<boolean> => {
      if (!hasYearId) {
        return false;
      }
      const status = resolveWriteStatus(absentPeriods.size);
      try {
        await markMutation.mutateAsync({
          staffId: staffId as StaffId,
          academicYearId: yearId as AcademicYearId,
          date,
          status,
          // The reason goes with every status, not only a whole-day absence:
          // `markAttendance` nulls the column on any write that omits it, so
          // ticking one period used to wipe the note the late-arrival policy had
          // left on the row.
          reason: dayReason,
          absentPeriods:
            status === "partial"
              ? [...absentPeriods.entries()].map(([periodNumber, reason]) => ({
                  periodNumber,
                  reason,
                }))
              : [],
          overrideApprovedLeave: overrideLeave,
          overrideReason: overrideLeave
            ? "Principal attendance override"
            : undefined,
        });
        await queryClient.invalidateQueries({
          queryKey: orpc.staff.attendance.listAttendanceForDate.queryOptions({
            input: { academicYearId: yearId, date },
          }).queryKey,
        });
        // Mirror what the server now holds, so a Principal override stops
        // reading as the half day it replaced without waiting for the refetch.
        setStoredStatusByStaff((previous) => {
          const next = new Map(previous);
          if (status === "present") {
            next.delete(staffId);
          } else {
            next.set(staffId, status);
          }
          return next;
        });
        setSessionPresent((previous) => {
          const next = new Set(previous);
          if (status === "present") {
            next.add(staffId);
          } else {
            next.delete(staffId);
          }
          return next;
        });
        return true;
      } catch (error) {
        const message = errorText(error, "The server refused the save");
        toast.error(
          `${message} — nothing was saved, and the mark has been put back`
        );
        announce("failed", `Not saved — ${message}`);
        return false;
      }
    },
    [announce, date, hasYearId, markMutation, queryClient, yearId]
  );

  const applyLocalAbsence = useCallback(
    (staffId: string, absentPeriods: Map<number, string>) => {
      setDraft((previous) => {
        const next = new Map(previous);
        if (absentPeriods.size === 0) {
          next.delete(staffId);
        } else if (absentPeriods.size >= CODE_DEFINED_PERIODS.length) {
          next.set(staffId, { status: "absent", periods: absentPeriods });
        } else {
          next.set(staffId, { status: "partial", periods: absentPeriods });
        }
        return next;
      });
    },
    []
  );

  /** Every period a teacher is currently marked absent for. */
  const expandedAbsentPeriods = useCallback(
    (staffId: string): Map<number, string> => {
      const entry = draft.get(staffId);
      if (!entry) {
        return new Map();
      }
      if (entry.status === "absent" && entry.periods.size === 0) {
        return new Map(
          CODE_DEFINED_PERIODS.map((period) => [period.periodNumber, ""])
        );
      }
      return new Map(entry.periods);
    },
    [draft]
  );

  /**
   * The recorded state of one teacher's day.
   *
   * `unmarked` is a real answer, not a fallback: it means the database holds no
   * attendance row for this person on this date. It used to collapse to
   * `present`, which meant a day nobody had marked — or a request that failed to
   * load — displayed as a day where the entire staff was present.
   */
  const rowStatus = useCallback(
    (staffId: string): RowStatus => {
      const entry = draft.get(staffId);
      const stored = storedStatusByStaff.get(staffId);
      if (entry) {
        if (entry.status === "absent" && stored === "halfDay") {
          return "halfDay";
        }
        if (entry.status === "partial" && stored === "lateShortLeave") {
          return "lateShortLeave";
        }
        return entry.status;
      }
      if (stored === "halfDay" || stored === "lateShortLeave") {
        return stored;
      }
      if (sessionPresent.has(staffId)) {
        return "present";
      }
      return markedStaffIds.has(staffId) ? "present" : "unmarked";
    },
    [draft, markedStaffIds, sessionPresent, storedStatusByStaff]
  );

  const isPeriodAbsent = useCallback(
    (staffId: string, periodNumber: number): boolean => {
      const entry = draft.get(staffId);
      if (!entry) {
        return false;
      }
      if (entry.status === "absent" && entry.periods.size === 0) {
        return true;
      }
      return entry.periods.has(periodNumber);
    },
    [draft]
  );

  const periodReason = useCallback(
    (staffId: string, periodNumber: number): string =>
      draft.get(staffId)?.periods.get(periodNumber) ?? "",
    [draft]
  );

  const dayReason = useCallback(
    (staffId: string): string => dayReasonDraftValue.get(staffId) ?? "",
    [dayReasonDraftValue]
  );

  const isLeaveLocked = useCallback(
    (staffId: string) => lockedByStaff.has(staffId),
    [lockedByStaff]
  );

  const leaveFor = useCallback(
    (staffId: string) => lockedByStaff.get(staffId) ?? null,
    [lockedByStaff]
  );

  /**
   * One cell write: claim the key so a second click cannot race it, apply
   * optimistically, put the mark back if the server refuses, and leave the cell
   * flagged either way so a refusal is never mistaken for a save.
   */
  const runCellWrite = useCallback(
    async (
      key: string,
      dateKey: string,
      work: () => Promise<boolean>
    ): Promise<boolean> => {
      if (inFlightRef.current.has(key)) {
        return false;
      }
      inFlightRef.current.add(key);
      setPendingCells((previous) => new Set(previous).add(key));
      let saved = false;
      try {
        saved = await work();
      } catch {
        // `work` handles its own failures; this only stops a thrown error from
        // leaving the cell spinning for ever.
        saved = false;
      }
      inFlightRef.current.delete(key);
      setPendingCells((previous) => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
      if (activeDateRef.current === dateKey) {
        setFailedCells((previous) => {
          const next = new Set(previous);
          if (saved) {
            next.delete(key);
          } else {
            next.add(key);
          }
          return next;
        });
      }
      return saved;
    },
    []
  );

  const performTogglePeriod = useCallback(
    (staffId: string, periodNumber: number, overrideLeave = false) => {
      const key = `${staffId}:${periodNumber}`;
      return runCellWrite(key, attendanceKey, async () => {
        const previous = expandedAbsentPeriods(staffId);
        const current = new Map(previous);
        if (current.has(periodNumber)) {
          current.delete(periodNumber);
        } else if (rowStatus(staffId) !== "unmarked") {
          // An unmarked cell records *present* on its first activation. The
          // cell reads "not recorded yet", so activating it has to mean the
          // ordinary thing a tick means; marking an absence is the second step.
          current.set(periodNumber, "");
        }
        applyLocalAbsence(staffId, current);
        const saved = await saveTeacherDay(
          staffId,
          current,
          dayReason(staffId),
          overrideLeave
        );
        if (!saved) {
          applyLocalAbsence(staffId, previous);
          return false;
        }
        announce(
          "saved",
          `${teacherNameFor(teachers, staffId)}, Period ${periodNumber} marked ${
            current.has(periodNumber) ? "absent" : "present"
          }`
        );
        return true;
      });
    },
    [
      announce,
      applyLocalAbsence,
      attendanceKey,
      dayReason,
      expandedAbsentPeriods,
      rowStatus,
      runCellWrite,
      saveTeacherDay,
      teachers,
    ]
  );

  const performToggleSchool = useCallback(
    (staffId: string, overrideLeave = false) =>
      runCellWrite(`${staffId}:school`, attendanceKey, async () => {
        const previous = expandedAbsentPeriods(staffId);
        const status = rowStatus(staffId);
        // Unmarked and absent both mean "not here today"; only a recorded day
        // can be made absent, and only an absent day can be called back.
        const markingAbsent = status !== "unmarked" && status !== "absent";
        const nextPeriods = markingAbsent
          ? new Map(
              CODE_DEFINED_PERIODS.map((period) => [period.periodNumber, ""])
            )
          : new Map<number, string>();
        applyLocalAbsence(staffId, nextPeriods);
        const saved = await saveTeacherDay(
          staffId,
          nextPeriods,
          dayReason(staffId),
          overrideLeave
        );
        if (!saved) {
          applyLocalAbsence(staffId, previous);
          return false;
        }
        announce(
          "saved",
          `${teacherNameFor(teachers, staffId)} marked ${
            markingAbsent ? "absent for the whole day" : "present for the day"
          }`
        );
        return true;
      }),
    [
      announce,
      applyLocalAbsence,
      attendanceKey,
      dayReason,
      expandedAbsentPeriods,
      rowStatus,
      runCellWrite,
      saveTeacherDay,
      teachers,
    ]
  );

  const performSaveReason = useCallback(
    (staffId: string, periodNumber: number | null, reason: string) => {
      const key =
        periodNumber === null
          ? `${staffId}:dayReason`
          : `${staffId}:${periodNumber}:reason`;
      return runCellWrite(key, attendanceKey, async () => {
        const previousPeriods = expandedAbsentPeriods(staffId);
        if (periodNumber !== null && !previousPeriods.has(periodNumber)) {
          return true;
        }
        const previousDayReason = dayReason(staffId);
        const nextPeriods = new Map(previousPeriods);
        if (periodNumber !== null) {
          nextPeriods.set(periodNumber, reason);
        }
        if (periodNumber === null) {
          setDayReasonDraftValue(
            (previous) => new Map([...previous, [staffId, reason]])
          );
        } else {
          applyLocalAbsence(staffId, nextPeriods);
        }
        const saved = await saveTeacherDay(
          staffId,
          nextPeriods,
          periodNumber === null ? reason : previousDayReason
        );
        if (!saved) {
          // Put the typed text back where the user left it, so a refused save
          // never costs them the sentence they just wrote.
          if (periodNumber === null) {
            setDayReasonDraftValue((previous) => {
              const next = new Map(previous);
              if (previousDayReason) {
                next.set(staffId, previousDayReason);
              } else {
                next.delete(staffId);
              }
              return next;
            });
          } else {
            applyLocalAbsence(staffId, previousPeriods);
          }
          return false;
        }
        announce(
          "saved",
          `Reason saved for ${teacherNameFor(teachers, staffId)}${
            periodNumber === null ? " for the day" : `, Period ${periodNumber}`
          }`
        );
        return true;
      });
    },
    [
      announce,
      applyLocalAbsence,
      attendanceKey,
      dayReason,
      expandedAbsentPeriods,
      runCellWrite,
      saveTeacherDay,
      teachers,
    ]
  );

  const [pendingPastEdit, setPendingPastEdit] =
    useState<PendingPastEdit | null>(null);

  const togglePeriod = useCallback(
    async (staffId: string, periodNumber: number) => {
      const overrideLeave = lockedByStaff.has(staffId);
      if (overrideLeave && !isPrincipal) {
        return false;
      }
      if (isPastDate || overrideLeave) {
        setPendingPastEdit({
          kind: "period",
          staffId,
          periodNumber,
          overrideLeave,
        });
        return true;
      }
      await performTogglePeriod(staffId, periodNumber);
      return true;
    },
    [isPastDate, isPrincipal, lockedByStaff, performTogglePeriod]
  );

  const toggleSchool = useCallback(
    async (staffId: string) => {
      const overrideLeave = lockedByStaff.has(staffId);
      if (overrideLeave && !isPrincipal) {
        return false;
      }
      if (isPastDate || overrideLeave) {
        setPendingPastEdit({ kind: "school", staffId, overrideLeave });
        return true;
      }
      await performToggleSchool(staffId);
      return true;
    },
    [isPastDate, isPrincipal, lockedByStaff, performToggleSchool]
  );

  const saveReason = useCallback(
    async (staffId: string, periodNumber: number | null, reason: string) => {
      if (isPastDate) {
        setPendingPastEdit({ kind: "reason", staffId, periodNumber, reason });
        return true;
      }
      const saved = await performSaveReason(staffId, periodNumber, reason);
      return saved;
    },
    [isPastDate, performSaveReason]
  );

  const confirmPastEdit = useCallback(async () => {
    const pending = pendingPastEdit;
    setPendingPastEdit(null);
    if (!pending) {
      return;
    }
    if (pending.kind === "school") {
      await performToggleSchool(pending.staffId, pending.overrideLeave);
    } else if (pending.kind === "period") {
      await performTogglePeriod(
        pending.staffId,
        pending.periodNumber,
        pending.overrideLeave
      );
    } else {
      await performSaveReason(
        pending.staffId,
        pending.periodNumber,
        pending.reason
      );
    }
  }, [
    pendingPastEdit,
    performToggleSchool,
    performTogglePeriod,
    performSaveReason,
  ]);

  const cancelPastEdit = useCallback(() => setPendingPastEdit(null), []);

  const dismissFailedCells = useCallback(() => setFailedCells(new Set()), []);

  const handleSetDate = useCallback((isoDate: string) => {
    if (!ISO_DATE_PATTERN.test(isoDate)) {
      return;
    }
    setYearValue(Number(isoDate.slice(0, 4)));
    setMonthValue(Number(isoDate.slice(5, 7)) - 1);
    setDayValue(Number(isoDate.slice(8, 10)));
  }, []);

  const handleSetDay = useCallback(
    (next: number) => {
      setDayValue(next);
      setMonthValue(month);
      setYearValue(year);
    },
    [month, year]
  );
  const handleSetMonth = useCallback(
    (next: number) => {
      setDayValue(1);
      setMonthValue(next);
      setYearValue(year);
    },
    [year]
  );
  const handleSetYear = useCallback(
    (next: number) => {
      setDayValue(1);
      setMonthValue(month);
      setYearValue(next);
    },
    [month]
  );

  const errorYear = currentYearQuery.error as Error | null;
  const errorTeachers = teachersQuery.error as Error | null;
  const errorAttendance = attendanceQuery.error as Error | null;
  const errorSchedule = scheduleQuery.error as Error | null;
  const errorAuthority = authorityQuery.error as Error | null;

  const registerState = resolveRegisterState({
    yearState: academicYearState,
    teachersPending: teachersQuery.isPending,
    teachersFailed: teachersQuery.isError,
    registerPending: attendanceQuery.isPending,
    registerFailed: attendanceQuery.isError,
    scheduleFailed: scheduleQuery.isError,
    authorityFailed: authorityQuery.isError,
  });

  const dataIssues = buildDataIssues({
    yearState: academicYearState,
    selectedYear: selectedAcademicYear,
    errorYear,
    errorTeachers,
    errorAttendance,
    errorSchedule,
    errorAuthority,
    refetchYear: () => {
      void currentYearQuery.refetch();
    },
    refetchTeachers: () => {
      void teachersQuery.refetch();
    },
    refetchAttendance: () => {
      void attendanceQuery.refetch();
    },
    refetchSchedule: () => {
      void scheduleQuery.refetch();
    },
    refetchAuthority: () => {
      void authorityQuery.refetch();
    },
  });

  const summary: RegisterSummary = useMemo(() => {
    let unmarked = 0;
    let absentForDay = 0;
    let periodAbsences = 0;
    for (const teacher of teachers) {
      const status = rowStatus(teacher.id);
      if (status === "unmarked") {
        unmarked += 1;
      }
      if (status === "absent" || status === "halfDay") {
        absentForDay += 1;
      }
      periodAbsences += absentPeriodCount(draft.get(teacher.id));
    }
    return {
      onRoll: teachers.length,
      recorded: teachers.length - unmarked,
      unmarked,
      absentForDay,
      periodAbsences,
      sessionMarks: sessionPresent.size,
      notSaved: failedCells.size,
    };
  }, [draft, failedCells.size, rowStatus, sessionPresent.size, teachers]);

  return {
    date,
    day: clampedDay,
    month,
    year,
    setDay: handleSetDay,
    setMonth: handleSetMonth,
    setYear: handleSetYear,
    setDate: handleSetDate,
    todayIso,
    isToday: date === todayIso,
    nextWeekday: nextWeekdayFrom(date),
    dayOptions,
    monthOptions,
    yearOptions,
    dayOfWeek,
    isPastDate,
    pendingPastEdit,
    confirmPastEdit,
    cancelPastEdit,
    currentYear,
    hasPreviousYear,
    academicYearState,
    errorYear,
    refetchYear: currentYearQuery.refetch,
    teachers,
    isLoadingTeachers: teachersQuery.isLoading,
    isErrorTeachers: teachersQuery.isError,
    errorTeachers,
    refetchTeachers: teachersQuery.refetch,
    periods: CODE_DEFINED_PERIODS,
    isLoadingSchedule: scheduleQuery.isLoading,
    registerState,
    dataIssues,
    isLoadingAttendance:
      registerState === "booting" || registerState === "loading",
    isRefetchingAttendance:
      attendanceQuery.isFetching && !attendanceQuery.isPending,
    isErrorAttendance: attendanceQuery.isError,
    errorAttendance,
    refetchAttendance: attendanceQuery.refetch,
    scheduleByStaff,
    timetableState: resolveTimetableState({
      dayOfWeek,
      isPending: scheduleQuery.isPending,
      isError: scheduleQuery.isError,
    }),
    pendingCells,
    failedCells,
    dismissFailedCells,
    writeNotice,
    summary,
    isPrincipal,
    isLeaveLocked,
    leaveFor,
    rowStatus,
    isPeriodAbsent,
    periodReason,
    togglePeriod,
    toggleSchool,
    dayReason,
    saveReason,
    recordArrival,
    isRecordingArrival: recordArrivalMutation.isPending,
    policy: orNull(
      policyQuery.data?.policy as AttendancePolicyValues | null | undefined
    ),
    policyUsage: orNull(
      policyQuery.data?.usage as AttendancePolicyUsage | null | undefined
    ),
    isLoadingPolicy: policyQuery.isPending,
    isErrorPolicy: policyQuery.isError,
    errorPolicy: policyQuery.error as Error | null,
    refetchPolicy: policyQuery.refetch,
    isSavingPolicy: updatePolicyMutation.isPending,
    lastPolicyError,
    savePolicy,
    configureDefaultPolicy,
  };
};
