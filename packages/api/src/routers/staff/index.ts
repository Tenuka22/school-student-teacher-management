import { approveQualification } from "./approve-qualification";
import { assignClassTeacher } from "./assign-class-teacher";
import { assignPosition } from "./assign-position";
import { assignSubject } from "./assign-subject";
import { createAcademicYear } from "./create-academic-year";
import { createClass } from "./create-class";
import { createStaff } from "./create-staff";
import { deleteClass } from "./delete-class";
import { deleteStaff } from "./delete-staff";
import { deleteSubjectAssignment } from "./delete-subject-assignment";
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
import { listStaffPositions } from "./list-staff-positions";
import { listStructureVersions } from "./list-structure-versions";
import { listSubjectAssignments } from "./list-subject-assignments";
import { listSubjects } from "./list-subjects";
import { periodsRouter } from "./periods";
import { portTeachersFromPreviousYear } from "./port-teachers-from-previous-year";
import { removePosition } from "./remove-position";
import { seedDefaultClasses } from "./seed-default-classes";
import { setCurrentYear } from "./set-current-year";
import { updateClass } from "./update-class";
import { updateProfile } from "./update-profile";
import { updateStaff } from "./update-staff";
import { updateSubjectAssignment } from "./update-subject-assignment";
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
  listStaffPositions,
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

  // Subject assignments
  listSubjectAssignments,
  assignSubject,
  updateSubjectAssignment,
  deleteSubjectAssignment,

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

  // File exports (Excel/PDF)
  exports: exportsRouter,
};
