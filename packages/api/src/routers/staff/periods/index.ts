import { assignTeacherToPeriodSubject } from "./assign-teacher-to-period-subject";
import { createClassPeriodSubject } from "./create-class-period-subject";
import { deleteClassPeriodSubject } from "./delete-class-period-subject";
import { getMyTeacherTimetable } from "./get-my-teacher-timetable";
import { listClassTimetable } from "./list-class-timetable";
import { listPeriodConfig } from "./list-period-config";
import { listPeriodConflicts } from "./list-period-conflicts";
import { listTeacherTimetable } from "./list-teacher-timetable";
import { listUnassignedSlots } from "./list-unassigned-slots";
import { removeTeacherFromPeriodSubject } from "./remove-teacher-from-period-subject";

/**
 * Period management and timetable procedures.
 *
 * Subject-first: a class's timetable slot gets a subject
 * (`createClassPeriodSubject`/`deleteClassPeriodSubject`) before it gets a
 * teacher. Naming a teacher for that subject is the separate, later step
 * (`assignTeacherToPeriodSubject`/`removeTeacherFromPeriodSubject`), and more
 * than one subject may share a slot, and more than one teacher may be named
 * on one subject (co-teaching).
 */
export const periodsRouter = {
  // Period configuration (read)
  listPeriodConfig,

  // Subjects on a timetable slot (step 1)
  createClassPeriodSubject,
  deleteClassPeriodSubject,

  // Teachers named for a subject-slot entry (step 2)
  assignTeacherToPeriodSubject,
  removeTeacherFromPeriodSubject,

  // Timetable views
  listClassTimetable,
  listTeacherTimetable,
  getMyTeacherTimetable,
  listUnassignedSlots,
  listPeriodConflicts,
};
