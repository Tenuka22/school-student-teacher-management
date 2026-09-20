import { approveQualification } from "./approve-qualification";
import { assignClassTeacher } from "./assign-class-teacher";
import { assignPosition } from "./assign-position";
import { attendanceRouter } from "./attendance";
import { createAcademicYear } from "./create-academic-year";
import { createClass } from "./create-class";
import { createStaff } from "./create-staff";
import { deleteClass } from "./delete-class";
import { deleteStaff } from "./delete-staff";
import { exportsRouter } from "./exports";
import { getStaff } from "./get-staff";
import { listAcademicYears } from "./list-academic-years";
import { listClassTeacherHistory } from "./list-class-teacher-history";
import { listClasses } from "./list-classes";
import { listGrades } from "./list-grades";
import { listPositions } from "./list-positions";
import { listPreviousYearTeachers } from "./list-previous-year-teachers";
import { listQualifications } from "./list-qualifications";
import { listStaff } from "./list-staff";
import { listStructureVersions } from "./list-structure-versions";
import { listSubjects } from "./list-subjects";
import { periodsRouter } from "./periods";
import { portTeachersFromPreviousYear } from "./port-teachers-from-previous-year";
import { removePosition } from "./remove-position";
import { seedDefaultClasses } from "./seed-default-classes";
import { setCurrentYear } from "./set-current-year";
import { updateClass } from "./update-class";
import { updateProfile } from "./update-profile";
import { updateStaff } from "./update-staff";
import { uploadQualification } from "./upload-qualification";

export const staffRouter = {
  // Staff CRUD
  listStaff,
  getStaff,
  createStaff,
  updateStaff,
  deleteStaff,

  // Academic years
  listAcademicYears,
  createAcademicYear,
  setCurrentYear,
  listPreviousYearTeachers,
  portTeachersFromPreviousYear,

  // Position assignments
  assignPosition,
  removePosition,

  // Classes
  listClasses,
  createClass,
  updateClass,
  deleteClass,
  assignClassTeacher,
  seedDefaultClasses,
  listClassTeacherHistory,

  // Constants (read-only)
  listSubjects,
  listGrades,
  listPositions,
  listStructureVersions,

  // Self-service
  updateProfile,

  // Qualifications
  uploadQualification,
  listQualifications,
  approveQualification,

  // Periods and timetable
  periods: periodsRouter,

  // Attendance
  attendance: attendanceRouter,

  // File exports (Excel/PDF)
  exports: exportsRouter,
};
