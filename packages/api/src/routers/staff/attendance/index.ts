import { getTeacherAttendance } from "./get-teacher-attendance";
import { listTeacherAttendanceRange } from "./list-teacher-attendance-range";
import { listTeachersForAttendance } from "./list-teachers-for-attendance";
import { markAttendance } from "./mark-attendance";

/**
 * Teacher attendance: per-day, per-period tracking with reasons, covering
 * both same-day marking and pre-announced future absences.
 */
export const attendanceRouter = {
  getTeacherAttendance,
  listTeacherAttendanceRange,
  listTeachersForAttendance,
  markAttendance,
};
