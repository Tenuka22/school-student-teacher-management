import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import type { SchoolPeriod } from "@school-student-teacher-management/db/periods";
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

const dayOfWeekForDate = (isoDate: string): number | null => {
  const jsDay = getDay(new Date(`${isoDate}T00:00:00`));
  return jsDay >= WEEKDAY_MIN && jsDay <= WEEKDAY_MAX ? jsDay : null;
};

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

const buildAttendanceDraft = (rows: AttendanceForDateRow[]) => {
  const draft = new Map<string, AbsenceEntry>();
  const reasons = new Map<string, string>();
  const locked = new Map<string, AttendanceForDateRow["lockedLeave"]>();

  for (const row of rows) {
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

  return { draft, reasons, locked };
};

export interface AttendancePageApi {
  date: string;
  day: number;
  month: number;
  year: number;
  setDay: (day: number) => void;
  setMonth: (month: number) => void;
  setYear: (year: number) => void;
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
  teachers: AttendanceTeacher[];
  isLoadingTeachers: boolean;
  isErrorTeachers: boolean;
  errorTeachers: Error | null;
  periods: readonly SchoolPeriod[];
  isLoadingSchedule: boolean;
  isLoadingAttendance: boolean;
  /** The register could not be read. The grid must not render: an empty draft
   * would otherwise be read as "nobody is absent". */
  isErrorAttendance: boolean;
  errorAttendance: Error | null;
  refetchAttendance: () => Promise<unknown>;
  scheduleByStaff: Map<string, Map<number, ScheduleCell[]>>;
  pendingCells: Set<string>;
  /** Cells whose last write the server refused and that have been put back. */
  failedCells: Set<string>;
  isPrincipal: boolean;
  isLeaveLocked: (staffId: string) => boolean;
  rowStatus: (staffId: string) => RowStatus;
  isPeriodAbsent: (staffId: string, periodNumber: number) => boolean;
  periodReason: (staffId: string, periodNumber: number) => string;
  togglePeriod: (staffId: string, periodNumber: number) => Promise<void>;
  toggleSchool: (staffId: string) => Promise<void>;
  /** Automatic late-arrival policy (LEAVE_SYSTEM_DESIGN.md §5). */
  recordArrival: (staffId: string, arrivalTime: string) => Promise<void>;
  dayReason: (staffId: string) => string;
  /** `periodNumber: null` saves the whole-day reason; otherwise saves that
   * one period's reason. Applies the value immediately - no separate
   * draft-then-commit step, so there's no window where a just-typed
   * reason could be saved stale. */
  saveReason: (
    staffId: string,
    periodNumber: number | null,
    reason: string
  ) => Promise<void>;
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

  const authorityQuery = useQuery(
    orpc.staff.leaves.getMyAuthority.queryOptions({
      input: { year: selectedAcademicYear },
    })
  );
  const isPrincipal = authorityQuery.data?.isPrincipal ?? false;

  const teachersQuery = useQuery(
    orpc.staff.attendance.listTeachersForAttendance.queryOptions({
      input: { academicYearId: currentYear?.id ?? "" },
      enabled: !!currentYear?.id,
    })
  );
  const teachers = useMemo(
    () => (teachersQuery.data || []) as unknown as AttendanceTeacher[],
    [teachersQuery.data]
  );

  const dayOfWeek = useMemo(() => dayOfWeekForDate(date), [date]);

  const scheduleQuery = useQuery(
    orpc.staff.attendance.listScheduleForDay.queryOptions({
      input: {
        academicYearId: currentYear?.id ?? "",
        dayOfWeek: dayOfWeek ?? 1,
      },
      enabled: !!(currentYear?.id && dayOfWeek !== null),
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
      input: { academicYearId: currentYear?.id ?? "", date },
      enabled: !!currentYear?.id,
    })
  );

  // Local grid draft: staffId -> absence entry (missing = fully present).
  // Re-derived (not effect-synced) whenever the selected date - or the
  // data loaded for it - changes, so ticking a checkbox updates
  // immediately without waiting on a network round trip.
  const [syncedDate, setSyncedDate] = useState("");
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
    Map<string, AttendanceForDateRow["lockedLeave"]>
  >(new Map());
  const attendanceKey = `${currentYear?.id ?? "none"}:${date}`;

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

  if (
    attendanceKey !== syncedDate &&
    !attendanceQuery.isFetching &&
    attendanceQuery.data !== undefined
  ) {
    setSyncedDate(attendanceKey);
    const rows = attendanceQuery.data as unknown as AttendanceForDateRow[];
    const next = buildAttendanceDraft(rows);
    setDraft(next.draft);
    setLockedByStaff(next.locked);
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

  const recordArrival = useCallback(
    async (staffId: string, arrivalTime: string) => {
      if (!currentYear?.id) {
        return;
      }
      try {
        const result = await recordArrivalMutation.mutateAsync({
          staffId,
          academicYearId: currentYear.id,
          date,
          arrivalTime,
        } as never);
        const arrivalNote = result.note ?? "";
        const arrivalMessage =
          result.status === "present"
            ? "Marked present — on time"
            : `Late — ${result.status === "lateShortLeave" ? "short leave" : "half day"} recorded (${arrivalNote})`;
        toast.success(arrivalMessage);
        await queryClient.invalidateQueries({
          queryKey: orpc.staff.attendance.listAttendanceForDate.queryOptions({
            input: { academicYearId: currentYear.id, date },
          }).queryKey,
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to record arrival"
        );
      }
    },
    [currentYear, date, recordArrivalMutation, queryClient]
  );

  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const dayReasonRef = useRef(dayReasonDraftValue);
  useEffect(() => {
    dayReasonRef.current = dayReasonDraftValue;
  }, [dayReasonDraftValue]);

  /** Every scheduled period for this teacher today, currently marked
   * absent - explicit `periods` entries, or every scheduled period at
   * once if the row is a whole-day "absent". */
  const expandedAbsentPeriods = useCallback(
    (staffId: string): Map<number, string> => {
      const entry = draftRef.current.get(staffId);
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
    []
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
      if (!currentYear?.id) {
        return false;
      }
      let status: RowStatus = "partial";
      if (absentPeriods.size === 0) {
        status = "present";
      } else if (absentPeriods.size >= CODE_DEFINED_PERIODS.length) {
        status = "absent";
      }
      try {
        await markMutation.mutateAsync({
          staffId,
          academicYearId: currentYear.id,
          date,
          status,
          reason: status === "absent" ? (dayReason ?? "") : undefined,
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
        } as never);
        await queryClient.invalidateQueries({
          queryKey: orpc.staff.attendance.listAttendanceForDate.queryOptions({
            input: { academicYearId: currentYear.id, date },
          }).queryKey,
        });
        return true;
      } catch (error) {
        toast.error(
          `${error instanceof Error ? error.message : "Failed to save attendance"} — nothing was saved, and the mark has been put back`
        );
        return false;
      }
    },
    [currentYear, date, markMutation, queryClient]
  );

  const applyLocalAbsence = useCallback(
    (staffId: string, absentPeriods: Map<number, string>) => {
      const nextDraft = new Map(draftRef.current);
      if (absentPeriods.size === 0) {
        nextDraft.delete(staffId);
      } else if (absentPeriods.size >= CODE_DEFINED_PERIODS.length) {
        nextDraft.set(staffId, { status: "absent", periods: absentPeriods });
      } else {
        nextDraft.set(staffId, { status: "partial", periods: absentPeriods });
      }
      setDraft(nextDraft);
    },
    []
  );

  const performTogglePeriod = useCallback(
    async (staffId: string, periodNumber: number, overrideLeave = false) => {
      const key = `${staffId}:${periodNumber}`;
      const previous = expandedAbsentPeriods(staffId);
      const current = new Map(previous);
      if (current.has(periodNumber)) {
        current.delete(periodNumber);
      } else {
        current.set(periodNumber, "");
      }
      applyLocalAbsence(staffId, current);
      setPendingCells((prev) => new Set(prev).add(key));
      const saved = await saveTeacherDay(
        staffId,
        current,
        dayReasonRef.current.get(staffId),
        overrideLeave
      );
      if (!saved) {
        // Put the mark back rather than leaving the grid showing a state the
        // server refused, and flag the cell so the failure is visible.
        applyLocalAbsence(staffId, previous);
        setFailedCells((prev) => new Set(prev).add(key));
      }
      setPendingCells((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    },
    [expandedAbsentPeriods, applyLocalAbsence, saveTeacherDay]
  );

  const performToggleSchool = useCallback(
    async (staffId: string, overrideLeave = false) => {
      const key = `${staffId}:school`;
      const previous = expandedAbsentPeriods(staffId);
      const currentlyPresent =
        draftRef.current.get(staffId)?.status !== "absent";
      const nextPeriods = currentlyPresent
        ? new Map(
            CODE_DEFINED_PERIODS.map((period) => [period.periodNumber, ""])
          )
        : new Map<number, string>();
      applyLocalAbsence(staffId, nextPeriods);
      setPendingCells((prev) => new Set(prev).add(key));
      const saved = await saveTeacherDay(
        staffId,
        nextPeriods,
        dayReasonRef.current.get(staffId),
        overrideLeave
      );
      if (!saved) {
        applyLocalAbsence(staffId, previous);
        setFailedCells((prev) => new Set(prev).add(key));
      }
      setPendingCells((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    },
    [expandedAbsentPeriods, applyLocalAbsence, saveTeacherDay]
  );

  const performSaveReason = useCallback(
    async (staffId: string, periodNumber: number | null, reason: string) => {
      if (periodNumber === null) {
        setDayReasonDraftValue((prev) => new Map([...prev, [staffId, reason]]));
        const key = `${staffId}:dayReason`;
        setPendingCells((prev) => new Set(prev).add(key));
        const saved = await saveTeacherDay(
          staffId,
          expandedAbsentPeriods(staffId),
          reason
        );
        if (!saved) {
          setDayReasonDraftValue((prev) => {
            const next = new Map(prev);
            next.delete(staffId);
            return next;
          });
          setFailedCells((prev) => new Set(prev).add(key));
        }
        setPendingCells((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        return;
      }
      const current = expandedAbsentPeriods(staffId);
      if (!current.has(periodNumber)) {
        return;
      }
      const previousReason = current.get(periodNumber) ?? "";
      current.set(periodNumber, reason);
      applyLocalAbsence(staffId, current);
      const key = `${staffId}:${periodNumber}:reason`;
      setPendingCells((prev) => new Set(prev).add(key));
      const saved = await saveTeacherDay(
        staffId,
        current,
        dayReasonRef.current.get(staffId)
      );
      if (!saved) {
        const reverted = expandedAbsentPeriods(staffId);
        reverted.set(periodNumber, previousReason);
        applyLocalAbsence(staffId, reverted);
        setFailedCells((prev) => new Set(prev).add(key));
      }
      setPendingCells((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    },
    [expandedAbsentPeriods, applyLocalAbsence, saveTeacherDay]
  );

  const [pendingPastEdit, setPendingPastEdit] =
    useState<PendingPastEdit | null>(null);

  const togglePeriod = useCallback(
    async (staffId: string, periodNumber: number) => {
      const overrideLeave = lockedByStaff.has(staffId);
      if (overrideLeave && !isPrincipal) {
        return;
      }
      if (isPastDate || overrideLeave) {
        setPendingPastEdit({
          kind: "period",
          staffId,
          periodNumber,
          overrideLeave,
        });
        return;
      }
      await performTogglePeriod(staffId, periodNumber);
    },
    [isPastDate, isPrincipal, lockedByStaff, performTogglePeriod]
  );

  const toggleSchool = useCallback(
    async (staffId: string) => {
      const overrideLeave = lockedByStaff.has(staffId);
      if (overrideLeave && !isPrincipal) {
        return;
      }
      if (isPastDate || overrideLeave) {
        setPendingPastEdit({ kind: "school", staffId, overrideLeave });
        return;
      }
      await performToggleSchool(staffId);
    },
    [isPastDate, isPrincipal, lockedByStaff, performToggleSchool]
  );

  const saveReason = useCallback(
    async (staffId: string, periodNumber: number | null, reason: string) => {
      if (isPastDate) {
        setPendingPastEdit({ kind: "reason", staffId, periodNumber, reason });
        return;
      }
      await performSaveReason(staffId, periodNumber, reason);
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

  const isLeaveLocked = useCallback(
    (staffId: string) => lockedByStaff.has(staffId),
    [lockedByStaff]
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
      if (entry) {
        return entry.status;
      }

      return markedStaffIds.has(staffId) ? "present" : "unmarked";
    },
    [draft, markedStaffIds]
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

  return {
    date,
    day: clampedDay,
    month,
    year,
    setDay: handleSetDay,
    setMonth: handleSetMonth,
    setYear: handleSetYear,
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
    teachers,
    isLoadingTeachers: teachersQuery.isLoading,
    isErrorTeachers: teachersQuery.isError,
    errorTeachers: teachersQuery.error as Error | null,
    periods: CODE_DEFINED_PERIODS,
    isLoadingSchedule: scheduleQuery.isLoading,
    isLoadingAttendance: attendanceQuery.isFetching,
    isErrorAttendance: attendanceQuery.isError,
    errorAttendance: attendanceQuery.error as Error | null,
    refetchAttendance: attendanceQuery.refetch,
    scheduleByStaff,
    pendingCells,
    failedCells,
    isPrincipal,
    isLeaveLocked,
    rowStatus,
    isPeriodAbsent,
    periodReason,
    togglePeriod,
    toggleSchool,
    dayReason,
    saveReason,
    recordArrival,
  };
};
