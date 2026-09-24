import { previewUnverifiedPurge, purgeUnverified } from "./account-admin";
import { approveQualification } from "./approve-qualification";
import { assignClassTeacher } from "./assign-class-teacher";
import { assignPosition } from "./assign-position";
import { attendanceRouter } from "./attendance";
import { createAcademicYear } from "./create-academic-year";
import { createClass } from "./create-class";
import { createStaff } from "./create-staff";
import { deleteAcademicYear } from "./delete-academic-year";
import { deleteClass } from "./delete-class";
import { deleteStaff } from "./delete-staff";
import { exportsRouter } from "./exports";
import { getMyStaff } from "./get-my-staff";
import { getStaff } from "./get-staff";
import { leavesRouter } from "./leaves";
import { seedLeaveEntitlements } from "./leaves/entitlements";
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
import { signupStaff } from "./signup";
import { approveTeacherRequest, listTeacherRequests } from "./teacher-requests";
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
  deleteAcademicYear,
  setCurrentYear,
  seedLeaveEntitlements,
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

  // Sign-up (staff self-service; leadership is env-seeded)
  signupStaff,

  // Teacher requests: who is waiting to be approved as staff
  listTeacherRequests,
  approveTeacherRequest,

  // Account housekeeping
  previewUnverifiedPurge,
  purgeUnverified,

  // Self-service
  updateProfile,
  getMyStaff,

  // Leave management (teacher apply / admin review)
  leaves: leavesRouter,

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
