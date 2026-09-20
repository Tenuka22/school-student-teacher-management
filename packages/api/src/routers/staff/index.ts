import { approveQualification } from "./approve-qualification";
import { assignClassTeacher } from "./assign-class-teacher";
import { assignPosition } from "./assign-position";
import { assignSubject } from "./assign-subject";
import { deleteSubjectAssignment } from "./delete-subject-assignment";
import { updateSubjectAssignment } from "./update-subject-assignment";
import { createAcademicYear } from "./create-academic-year";
import { createClass } from "./create-class";
import { deleteClass } from "./delete-class";
import { updateClass } from "./update-class";
import { createStaff } from "./create-staff";
import { deleteStaff } from "./delete-staff";
import { getStaff } from "./get-staff";
import { listAcademicYears } from "./list-academic-years";
import { listClasses } from "./list-classes";
import { listGrades } from "./list-grades";
import { listPositions } from "./list-positions";
import { listQualifications } from "./list-qualifications";
import { listStaff } from "./list-staff";
import { listStaffPositions } from "./list-staff-positions";
import { listStructureVersions } from "./list-structure-versions";
import { listSubjectAssignments } from "./list-subject-assignments";
import { listSubjects } from "./list-subjects";
import { removePosition } from "./remove-position";
import { setCurrentYear } from "./set-current-year";
import { updateProfile } from "./update-profile";
import { updateStaff } from "./update-staff";
import { uploadQualification } from "./upload-qualification";
import { periodsRouter } from "./periods";
import { exportsRouter } from "./exports";

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
