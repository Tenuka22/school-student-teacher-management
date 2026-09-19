import { approveQualification } from "./approve-qualification";
import { assignClassTeacher } from "./assign-class-teacher";
import { assignPosition } from "./assign-position";
import { assignSubject } from "./assign-subject";
import { createAcademicYear } from "./create-academic-year";
import { createClass } from "./create-class";
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
  assignClassTeacher,

  // Subject assignments
  listSubjectAssignments,
  assignSubject,

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
};
