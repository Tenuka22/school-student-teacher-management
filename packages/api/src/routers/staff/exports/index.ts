import { exportAllTimetablesExcel } from "./export-all-timetables-excel";
import { exportClassTeacherHistoryExcel } from "./export-class-teacher-history-excel";
import { exportClassTimetablePdf } from "./export-class-timetable-pdf";
import { exportClassesExcel } from "./export-classes-excel";
import { exportTeacherProfilePdf } from "./export-teacher-profile-pdf";
import { exportTeachersExcel } from "./export-teachers-excel";

/** File-export procedures: Excel for lists/groups, PDF for a single entity or a single timetable. */
export const exportsRouter = {
  teachersExcel: exportTeachersExcel,
  teacherProfilePdf: exportTeacherProfilePdf,
  classesExcel: exportClassesExcel,
  classTimetablePdf: exportClassTimetablePdf,
  classTeacherHistoryExcel: exportClassTeacherHistoryExcel,
  allTimetablesExcel: exportAllTimetablesExcel,
};
