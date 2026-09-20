import { useMutation, useQuery } from "@tanstack/react-query";
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  getMonth,
  getYear,
  parseISO,
  startOfMonth,
} from "date-fns";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import type { AttendanceTeacher } from "@/components/staff/attendance/attendance-teacher-groups";
import { orpc } from "@/utils/orpc";

interface AcademicYear {
  id: string;
  year: number;
  isCurrent: boolean;
}

interface TeacherTimetableEntry {
  id: string;
  classId: string;
  className: string;
  gradeLevel: number;
  dayOfWeek: number;
  periodNumber: number;
  subjectKey: string;
}

export type DayStatus = "present" | "partial" | "absent";

interface PeriodAbsenceDraft {
  periodNumber: number;
  reason: string;
}

interface AttendanceRecord {
  status: DayStatus;
  reason: string | null;
  absentPeriods: { periodNumber: number; reason: string }[];
}

interface Draft {
  status: DayStatus;
  reason: string;
  periods: Map<number, PeriodAbsenceDraft>;
}

export interface ScheduledPeriod {
  periodNumber: number;
  classes: TeacherTimetableEntry[];
}

export interface AttendanceDateStripEntry {
  date: string;
  status: DayStatus | "unmarked";
}

export interface MonthOption {
  value: number;
  label: string;
}

export interface AttendancePageApi {
  staffId: string;
  setStaffId: (staffId: string) => void;
  teachers: AttendanceTeacher[];
  isLoadingTeachers: boolean;
  date: string;
  setDate: (date: string) => void;
  month: number;
  year: number;
  setMonth: (month: number) => void;
  setYear: (year: number) => void;
  monthOptions: MonthOption[];
  yearOptions: number[];
  currentYear: AcademicYear | undefined;
  dayOfWeek: number | null;
  scheduledPeriods: ScheduledPeriod[];
  isLoadingSchedule: boolean;
  isLoadingAttendance: boolean;
  dateStrip: AttendanceDateStripEntry[];
  dayStatus: DayStatus;
  dayReason: string;
  setDayReason: (reason: string) => void;
  periodAbsences: Map<number, PeriodAbsenceDraft>;
  togglePeriodAbsent: (periodNumber: number) => void;
  setPeriodReason: (periodNumber: number, reason: string) => void;
  markWholeDayAbsent: () => void;
  markWholeDayPresent: () => void;
  handleSave: () => Promise<void>;
  isSaving: boolean;
}

const EMPTY_DRAFT: Draft = {
  status: "present",
  reason: "",
  periods: new Map(),
};

const WEEKDAY_MIN = 1;
const WEEKDAY_MAX = 5;
const YEARS_BEFORE = 1;
const YEARS_AFTER = 1;

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

const draftFromRecord = (
  record: AttendanceRecord | null | undefined
): Draft => {
  if (!record) {
    return EMPTY_DRAFT;
  }
  return {
    status: record.status,
    reason: record.reason ?? "",
    periods: new Map(record.absentPeriods.map((p) => [p.periodNumber, p])),
  };
};

/** Monday-Friday map to the 1-5 `dayOfWeek` used by the timetable; weekends
 * have no scheduled periods at all. */
const dayOfWeekForDate = (isoDate: string): number | null => {
  const jsDay = getDay(parseISO(isoDate));
  return jsDay >= WEEKDAY_MIN && jsDay <= WEEKDAY_MAX ? jsDay : null;
};

export const useAttendancePage = (): AttendancePageApi => {
  const [staffIdValue, setStaffIdValue] = useState("");

  const today = useMemo(() => new Date(), []);
  const [monthValue, setMonthValue] = useState(() => getMonth(today));
  const [yearValue, setYearValue] = useState(() => getYear(today));
  const [dateValue, setDateValue] = useState(() => format(today, "yyyy-MM-dd"));

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

  const timetableQuery = useQuery(
    orpc.staff.periods.listTeacherTimetable.queryOptions({
      input: {
        academicYearId: currentYear?.id ?? "",
        staffId: staffIdValue || "",
      },
      enabled: !!(currentYear?.id && staffIdValue),
    })
  );

  const entries = useMemo(
    () => (timetableQuery.data || []) as unknown as TeacherTimetableEntry[],
    [timetableQuery.data]
  );

  const dayOfWeek = useMemo(() => dayOfWeekForDate(dateValue), [dateValue]);

  /** Every period the teacher is scheduled to teach on the selected date's
   * weekday, one row per (period, class) - combined sessions mean a period
   * can list more than one class. */
  const scheduledPeriods = useMemo(() => {
    if (dayOfWeek === null) {
      return [];
    }
    const byPeriod = new Map<number, TeacherTimetableEntry[]>();
    for (const entry of entries) {
      if (entry.dayOfWeek !== dayOfWeek) {
        continue;
      }
      const list = byPeriod.get(entry.periodNumber) ?? [];
      list.push(entry);
      byPeriod.set(entry.periodNumber, list);
    }
    return [...byPeriod.entries()]
      .toSorted(([a], [b]) => a - b)
      .map(([periodNumber, classes]) => ({ periodNumber, classes }));
  }, [entries, dayOfWeek]);

  const attendanceQuery = useQuery(
    orpc.staff.attendance.getTeacherAttendance.queryOptions({
      input: { staffId: staffIdValue || "", date: dateValue },
      enabled: !!staffIdValue,
    })
  );

  const monthStart = useMemo(
    () => startOfMonth(new Date(yearValue, monthValue, 1)),
    [yearValue, monthValue]
  );
  const monthEnd = useMemo(
    () => endOfMonth(new Date(yearValue, monthValue, 1)),
    [yearValue, monthValue]
  );
  const monthStartIso = format(monthStart, "yyyy-MM-dd");
  const monthEndIso = format(monthEnd, "yyyy-MM-dd");

  const rangeQuery = useQuery(
    orpc.staff.attendance.listTeacherAttendanceRange.queryOptions({
      input: {
        staffId: staffIdValue || "",
        startDate: monthStartIso,
        endDate: monthEndIso,
      },
      enabled: !!staffIdValue,
    })
  );

  const dateStrip = useMemo<AttendanceDateStripEntry[]>(() => {
    const records = (rangeQuery.data || []) as unknown as {
      date: string;
      status: DayStatus;
    }[];
    const statusByDate = new Map<string, DayStatus>();
    for (const record of records) {
      statusByDate.set(record.date, record.status);
    }
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const result: AttendanceDateStripEntry[] = [];
    for (const d of days) {
      const iso = format(d, "yyyy-MM-dd");
      const status: DayStatus | "unmarked" =
        statusByDate.get(iso) ?? "unmarked";
      result.push({ date: iso, status });
    }
    return result;
  }, [rangeQuery.data, monthStart, monthEnd]);

  // Local editable draft, re-derived (not effect-synced) whenever the
  // selected teacher/date - or the record loaded for it - changes.
  const recordKey = `${staffIdValue}|${dateValue}`;
  const [syncedKey, setSyncedKey] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  if (
    staffIdValue &&
    recordKey !== syncedKey &&
    !attendanceQuery.isFetching &&
    attendanceQuery.data !== undefined
  ) {
    setSyncedKey(recordKey);
    setDraft(draftFromRecord(attendanceQuery.data as AttendanceRecord | null));
  }

  const togglePeriodAbsent = useCallback((periodNumber: number) => {
    setDraft((prev) => {
      const periods = new Map(prev.periods);
      if (periods.has(periodNumber)) {
        periods.delete(periodNumber);
      } else {
        periods.set(periodNumber, { periodNumber, reason: "" });
      }
      return { ...prev, status: "partial", periods };
    });
  }, []);

  const setPeriodReason = useCallback(
    (periodNumber: number, reason: string) => {
      setDraft((prev) => {
        const existing = prev.periods.get(periodNumber);
        if (!existing) {
          return prev;
        }
        const periods = new Map(prev.periods);
        return {
          ...prev,
          periods: new Map([
            ...periods,
            [periodNumber, { ...existing, reason }],
          ]),
        };
      });
    },
    []
  );

  const markWholeDayAbsent = useCallback(() => {
    setDraft({ status: "absent", reason: "", periods: new Map() });
  }, []);

  const markWholeDayPresent = useCallback(() => {
    setDraft(EMPTY_DRAFT);
  }, []);

  const setDayReason = useCallback((reason: string) => {
    setDraft((prev) => ({ ...prev, reason }));
  }, []);

  const markMutation = useMutation(
    orpc.staff.attendance.markAttendance.mutationOptions()
  );

  const handleSave = useCallback(async () => {
    if (!(staffIdValue && currentYear?.id)) {
      return;
    }
    if (draft.status === "absent" && !draft.reason.trim()) {
      toast.error("A reason is required for a full-day absence");
      return;
    }
    const absentPeriods = [...draft.periods.values()];
    if (
      draft.status === "partial" &&
      (absentPeriods.length === 0 ||
        absentPeriods.some((p) => !p.reason.trim()))
    ) {
      toast.error("Every absent period needs a reason");
      return;
    }
    try {
      await markMutation.mutateAsync({
        staffId: staffIdValue,
        academicYearId: currentYear.id,
        date: dateValue,
        status: draft.status,
        reason: draft.status === "absent" ? draft.reason.trim() : undefined,
        absentPeriods: draft.status === "partial" ? absentPeriods : [],
      } as never);
      await Promise.all([attendanceQuery.refetch(), rangeQuery.refetch()]);
      toast.success("Attendance saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save attendance"
      );
    }
  }, [
    staffIdValue,
    currentYear,
    dateValue,
    draft,
    markMutation,
    attendanceQuery,
    rangeQuery,
  ]);

  const handleSetStaffId = useCallback((next: string) => {
    setStaffIdValue(next);
    setSyncedKey("");
  }, []);

  const handleSetDate = useCallback((next: string) => {
    setDateValue(next);
    setSyncedKey("");
  }, []);

  const handleSetMonth = useCallback(
    (next: number) => {
      setMonthValue(next);
      setDateValue(format(new Date(yearValue, next, 1), "yyyy-MM-dd"));
      setSyncedKey("");
    },
    [yearValue]
  );

  const handleSetYear = useCallback(
    (next: number) => {
      setYearValue(next);
      setDateValue(format(new Date(next, monthValue, 1), "yyyy-MM-dd"));
      setSyncedKey("");
    },
    [monthValue]
  );

  return {
    staffId: staffIdValue,
    setStaffId: handleSetStaffId,
    teachers,
    isLoadingTeachers: teachersQuery.isLoading,
    date: dateValue,
    setDate: handleSetDate,
    month: monthValue,
    year: yearValue,
    setMonth: handleSetMonth,
    setYear: handleSetYear,
    monthOptions,
    yearOptions,
    currentYear,
    dayOfWeek,
    scheduledPeriods,
    isLoadingSchedule: timetableQuery.isLoading,
    isLoadingAttendance: attendanceQuery.isFetching,
    dateStrip,
    dayStatus: draft.status,
    dayReason: draft.reason,
    setDayReason,
    periodAbsences: draft.periods,
    togglePeriodAbsent,
    setPeriodReason,
    markWholeDayAbsent,
    markWholeDayPresent,
    handleSave,
    isSaving: markMutation.isPending,
  };
};
