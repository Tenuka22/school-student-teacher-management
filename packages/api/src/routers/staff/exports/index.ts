import { exportAllTimetablesExcel } from "./export-all-timetables-excel";
import { exportClassTimetablePdf } from "./export-class-timetable-pdf";
import { exportClassesExcel } from "./export-classes-excel";
import { exportStaffPositionsExcel } from "./export-staff-positions-excel";
import { exportSubjectAssignmentsExcel } from "./export-subject-assignments-excel";
import { exportTeacherProfilePdf } from "./export-teacher-profile-pdf";
import { exportTeachersExcel } from "./export-teachers-excel";

/** File-export procedures: Excel for lists/groups, PDF for a single entity or a single timetable. */
export const exportsRouter = {
  teachersExcel: exportTeachersExcel,
  teacherProfilePdf: exportTeacherProfilePdf,
  subjectAssignmentsExcel: exportSubjectAssignmentsExcel,
  staffPositionsExcel: exportStaffPositionsExcel,
  classesExcel: exportClassesExcel,
  classTimetablePdf: exportClassTimetablePdf,
  allTimetablesExcel: exportAllTimetablesExcel,
};
