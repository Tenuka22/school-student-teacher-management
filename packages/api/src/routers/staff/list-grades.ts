import { SCHOOL } from "@school-student-teacher-management/db/config/school";
import {
  GRADE_LEVELS,
  getStageForGrade,
} from "@school-student-teacher-management/db/constants/grades";

import { academicProcedure } from "../../index";

export const listGrades = academicProcedure.handler(() => {
  const grades: { level: number; stage: string }[] = [];
  for (const level of GRADE_LEVELS) {
    if (level >= SCHOOL.gradeRange.min && level <= SCHOOL.gradeRange.max) {
      grades.push({ level, stage: getStageForGrade(level) });
    }
  }
  return grades;
});
