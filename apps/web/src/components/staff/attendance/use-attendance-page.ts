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

interface AcademicYear {
  id: string;
  year: number;
  isCurrent: boolean;
}

interface PeriodConfigRow {
  periodNumber: number;
  startTime: string;
  endTime: string;
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
  status: "present" | "partial" | "absent";
  reason: string | null;
  absentPeriods: { periodNumber: number; reason: string }[];
}

export type RowStatus =
  | "present"
  | "partial"
  | "absent"
  | "lateShortLeave"
  | "halfDay";

/** A teacher missing from `draft` is fully present. An entry here means
 * something is off: "absent" cancels every scheduled period for the day
 * regardless of what `periods` enumerates (the whole point of the status
 * being explicit is that a full-day absence doesn't need one row per
 * period); "partial" cancels exactly the periods listed in `periods`. */
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
  | { kind: "school"; staffId: string }
  | { kind: "period"; staffId: string; periodNumber: number }
  | {
      kind: "reason";
      staffId: string;
      periodNumber: number | null;
      reason: string;
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
const YEARS_BEFORE = 1;
const YEARS_AFTER = 1;

const dayOfWeekForDate = (isoDate: string): number | null => {
  const jsDay = getDay(new Date(`${isoDate}T00:00:00`));
  return jsDay >= WEEKDAY_MIN && jsDay <= WEEKDAY_MAX ? jsDay : null;
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
  periods: PeriodConfigRow[];
  isLoadingSchedule: boolean;
  isLoadingAttendance: boolean;
  scheduleByStaff: Map<string, Map<number, ScheduleCell[]>>;
  pendingCells: Set<string>;
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

export const useAttendancePage = (): AttendancePageApi => {
  const today = useMemo(() => new Date(), []);
  const [dayValue, setDayValue] = useState(() => getDate(today));
  const [monthValue, setMonthValue] = useState(() => getMonth(today));
  const [yearValue, setYearValue] = useState(() => getYear(today));

  const daysInMonth = useMemo(
    () => getDaysInMonth(new Date(yearValue, monthValue, 1)),
    [yearValue, monthValue]
  );
  const clampedDay = Math.min(dayValue, daysInMonth);
  const date = format(
    new Date(yearValue, monthValue, clampedDay),
    "yyyy-MM-dd"
  );

  const todayIso = useMemo(() => format(today, "yyyy-MM-dd"), [today]);
  const isPastDate = date < todayIso;

  const dayOptions = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => ({
        value: d,
        label: String(d),
      })),
    [daysInMonth]
  );
  const monthOptions = useMemo(
    () => MONTH_LABELS.map((label, value) => ({ value, label })),
    []
  );
  const yearOptions = useMemo(() => {
    const base = getYear(today);
    const years: number[] = [];
    for (let y = base - YEARS_BEFORE; y <= base + YEARS_AFTER; y += 1) {
      years.push(y);
    }
    return years;
  }, [today]);

  const currentYearQuery = useQuery(
    orpc.staff.listAcademicYears.queryOptions()
  );
  const currentYear = useMemo(() => {
    const years = currentYearQuery.data as unknown[] | undefined;
    if (!years) {
      return;
    }
    return (
      (years.find(
        (y) => (y as Record<string, unknown>).isCurrent === true
      ) as AcademicYear) || undefined
    );
  }, [currentYearQuery.data]);

  const hasPreviousYear = useMemo(() => {
    const years = currentYearQuery.data as unknown[] | undefined;
    if (!(years && currentYear)) {
      return false;
    }
    return years.some(
      (y) => (y as Record<string, unknown>).year === currentYear.year - 1
    );
  }, [currentYearQuery.data, currentYear]);

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

  const periodConfigQuery = useQuery(
    orpc.staff.periods.listPeriodConfig.queryOptions({
      input: { academicYearId: currentYear?.id ?? "" },
      enabled: !!currentYear?.id,
    })
  );
  const periods = useMemo(
    () =>
      ((periodConfigQuery.data || []) as unknown as PeriodConfigRow[]).toSorted(
        (a, b) => a.periodNumber - b.periodNumber
      ),
    [periodConfigQuery.data]
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
      input: { date },
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

  if (
    date !== syncedDate &&
    !attendanceQuery.isFetching &&
    attendanceQuery.data !== undefined
  ) {
    setSyncedDate(date);
    const rows = attendanceQuery.data as unknown as AttendanceForDateRow[];
    const next = new Map<string, AbsenceEntry>();
    const nextReasons = new Map<string, string>();
    for (const row of rows) {
      if (row.status === "partial" || row.status === "absent") {
        const periodMap = new Map<number, string>();
        for (const absence of row.absentPeriods) {
          periodMap.set(absence.periodNumber, absence.reason);
        }
        next.set(row.staffId, { status: row.status, periods: periodMap });
      }
      if (row.reason) {
        nextReasons.set(row.staffId, row.reason);
      }
    }
    setDraft(next);
    setDayReasonDraftValue(nextReasons);
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
            input: { date },
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

  const scheduleByStaffRef = useRef(scheduleByStaff);
  useEffect(() => {
    scheduleByStaffRef.current = scheduleByStaff;
  }, [scheduleByStaff]);

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
        const scheduled = scheduleByStaffRef.current.get(staffId);
        return new Map(
          [...(scheduled?.keys() ?? [])].map((periodNumber) => [
            periodNumber,
            "",
          ])
        );
      }
      return new Map(entry.periods);
    },
    []
  );

  const saveTeacherDay = useCallback(
    async (
      staffId: string,
      absentPeriods: Map<number, string>,
      dayReason?: string
    ) => {
      if (!currentYear?.id) {
        return;
      }
      const scheduledCount = scheduleByStaffRef.current.get(staffId)?.size ?? 0;
      let status: RowStatus = "partial";
      if (absentPeriods.size === 0) {
        status = "present";
      } else if (scheduledCount > 0 && absentPeriods.size >= scheduledCount) {
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
        } as never);
        await queryClient.invalidateQueries({
          queryKey: orpc.staff.attendance.listAttendanceForDate.queryOptions({
            input: { date },
          }).queryKey,
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to save attendance"
        );
      }
    },
    [currentYear, date, markMutation, queryClient]
  );

  const applyLocalAbsence = useCallback(
    (staffId: string, absentPeriods: Map<number, string>) => {
      const scheduledCount = scheduleByStaffRef.current.get(staffId)?.size ?? 0;
      const nextDraft = new Map(draftRef.current);
      if (absentPeriods.size === 0) {
        nextDraft.delete(staffId);
      } else if (scheduledCount > 0 && absentPeriods.size >= scheduledCount) {
        nextDraft.set(staffId, { status: "absent", periods: absentPeriods });
      } else {
        nextDraft.set(staffId, { status: "partial", periods: absentPeriods });
      }
      setDraft(nextDraft);
    },
    []
  );

  const performTogglePeriod = useCallback(
    async (staffId: string, periodNumber: number) => {
      const key = `${staffId}:${periodNumber}`;
      const current = expandedAbsentPeriods(staffId);
      if (current.has(periodNumber)) {
        current.delete(periodNumber);
      } else {
        current.set(periodNumber, "");
      }
      applyLocalAbsence(staffId, current);
      setPendingCells((prev) => new Set(prev).add(key));
      await saveTeacherDay(staffId, current, dayReasonRef.current.get(staffId));
      setPendingCells((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    },
    [expandedAbsentPeriods, applyLocalAbsence, saveTeacherDay]
  );

  const performToggleSchool = useCallback(
    async (staffId: string) => {
      const key = `${staffId}:school`;
      const currentlyPresent = !draftRef.current.has(staffId);
      let nextPeriods: Map<number, string>;
      if (currentlyPresent) {
        const scheduled = scheduleByStaffRef.current.get(staffId);
        nextPeriods = new Map(
          [...(scheduled?.keys() ?? [])].map((periodNumber) => [
            periodNumber,
            "",
          ])
        );
      } else {
        nextPeriods = new Map();
      }
      applyLocalAbsence(staffId, nextPeriods);
      setPendingCells((prev) => new Set(prev).add(key));
      await saveTeacherDay(
        staffId,
        nextPeriods,
        dayReasonRef.current.get(staffId)
      );
      setPendingCells((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    },
    [applyLocalAbsence, saveTeacherDay]
  );

  const performSaveReason = useCallback(
    async (staffId: string, periodNumber: number | null, reason: string) => {
      if (periodNumber === null) {
        setDayReasonDraftValue((prev) => new Map([...prev, [staffId, reason]]));
        const key = `${staffId}:dayReason`;
        setPendingCells((prev) => new Set(prev).add(key));
        await saveTeacherDay(staffId, expandedAbsentPeriods(staffId), reason);
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
      current.set(periodNumber, reason);
      applyLocalAbsence(staffId, current);
      const key = `${staffId}:${periodNumber}:reason`;
      setPendingCells((prev) => new Set(prev).add(key));
      await saveTeacherDay(staffId, current, dayReasonRef.current.get(staffId));
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
      if (isPastDate) {
        setPendingPastEdit({ kind: "period", staffId, periodNumber });
        return;
      }
      await performTogglePeriod(staffId, periodNumber);
    },
    [isPastDate, performTogglePeriod]
  );

  const toggleSchool = useCallback(
    async (staffId: string) => {
      if (isPastDate) {
        setPendingPastEdit({ kind: "school", staffId });
        return;
      }
      await performToggleSchool(staffId);
    },
    [isPastDate, performToggleSchool]
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
      await performToggleSchool(pending.staffId);
    } else if (pending.kind === "period") {
      await performTogglePeriod(pending.staffId, pending.periodNumber);
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

  const rowStatus = useCallback(
    (staffId: string): RowStatus => draft.get(staffId)?.status ?? "present",
    [draft]
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

  const handleSetDay = useCallback((next: number) => setDayValue(next), []);
  const handleSetMonth = useCallback((next: number) => {
    setMonthValue(next);
  }, []);
  const handleSetYear = useCallback((next: number) => {
    setYearValue(next);
  }, []);

  return {
    date,
    day: clampedDay,
    month: monthValue,
    year: yearValue,
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
    periods,
    isLoadingSchedule: scheduleQuery.isLoading,
    isLoadingAttendance: attendanceQuery.isFetching,
    scheduleByStaff,
    pendingCells,
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
