import { assignStudentToClass } from "./assign-student-to-class";
import { createExamType } from "./create-exam-type";
import { createGradeScale } from "./create-grade-scale";
import { createStudent } from "./create-student";
import { deleteStudent } from "./delete-student";
import { enterSubjectMark } from "./enter-subject-mark";
import { getCurrentSubjectSelections } from "./get-current-subject-selections";
import { getStudent } from "./get-student";
import { getStudentHistory } from "./get-student-history";
import { listExamTypes } from "./list-exam-types";
import { listGradeScale } from "./list-grade-scale";
import { listMarksForClass } from "./list-marks-for-class";
import { listStudents } from "./list-students";
import { listStudentsByClass } from "./list-students-by-class";
import { listSubjectSelectionHistory } from "./list-subject-selection-history";
import { setSubjectSelection } from "./set-subject-selection";
import { updateStudent } from "./update-student";
import { updateSubjectMark } from "./update-subject-mark";

export const markingRouter = {
  // Student CRUD
  createStudent,
  listStudents,
  getStudent,
  updateStudent,
  deleteStudent,

  // Class assignments
  assignStudentToClass,
  listStudentsByClass,

  // Exam types
  createExamType,
  listExamTypes,

  // Grade scale
  createGradeScale,
  listGradeScale,

  // Subject marks
  enterSubjectMark,
  listMarksForClass,
  updateSubjectMark,

  // Historical data
  getStudentHistory,

  // Optional subject selection
  setSubjectSelection,
  getCurrentSubjectSelections,
  listSubjectSelectionHistory,
};
