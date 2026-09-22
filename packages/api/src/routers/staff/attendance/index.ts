import { getPolicy } from "./get-policy";
import { getTeacherAttendance } from "./get-teacher-attendance";
import { listAttendanceForDate } from "./list-attendance-for-date";
import { listScheduleForDay } from "./list-schedule-for-day";
import { listTeacherAttendanceRange } from "./list-teacher-attendance-range";
import { listTeachersForAttendance } from "./list-teachers-for-attendance";
import { markAttendance } from "./mark-attendance";
import { recordArrival } from "./record-arrival";
import { updatePolicy } from "./update-policy";

/**
 * Teacher attendance: per-day, per-period tracking with reasons, covering
 * both same-day marking and pre-announced future absences, plus the
 * automatic late-arrival policy (see LEAVE_SYSTEM_DESIGN.md §5).
 */
export const attendanceRouter = {
  getPolicy,
  updatePolicy,
  recordArrival,
  getTeacherAttendance,
  listAttendanceForDate,
  listTeacherAttendanceRange,
  listTeachersForAttendance,
  listScheduleForDay,
  markAttendance,
};
