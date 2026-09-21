import { assignClassPeriod } from "./assign-class-period";
import { createPeriodConfig } from "./create-period-config";
import { deleteClassPeriodAssignment } from "./delete-class-period-assignment";
import { listClassTimetable } from "./list-class-timetable";
import { listPeriodConfig } from "./list-period-config";
import { listPeriodConflicts } from "./list-period-conflicts";
import { listTeacherTimetable } from "./list-teacher-timetable";
import { listUnassignedSlots } from "./list-unassigned-slots";
import { updateClassPeriodAssignment } from "./update-class-period-assignment";

/**
 * Period management and timetable procedures.
 * Handles school day period configuration and class/teacher period assignments.
 */
export const periodsRouter = {
  // Period configuration (read, create times)
  listPeriodConfig,
  createPeriodConfig,

  // Period assignments (CRUD)
  assignClassPeriod,
  updateClassPeriodAssignment,
  deleteClassPeriodAssignment,

  // Timetable views
  listClassTimetable,
  listTeacherTimetable,
  listUnassignedSlots,
  listPeriodConflicts,
};
