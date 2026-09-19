/**
 * Grade levels as defined by the Sri Lankan Ministry of Education.
 * Grades 1-13 form the complete general education span.
 */
export const GRADE_LEVELS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
] as const;
export type GradeLevel = (typeof GRADE_LEVELS)[number];

/**
 * Education stage groups per MOE standard structure.
 * Each stage maps to a set of grade levels and a display label.
 */
export const EDUCATION_STAGES = {
  primary: {
    grades: [1, 2, 3, 4, 5] as const,
    label: "Primary",
  },
  juniorSecondary: {
    grades: [6, 7, 8, 9] as const,
    label: "Junior Secondary",
  },
  seniorSecondaryPhaseI: {
    grades: [10, 11] as const,
    label: "Senior Secondary Phase I (O/L)",
  },
  seniorSecondaryPhaseII: {
    grades: [12, 13] as const,
    label: "Senior Secondary Phase II (A/L)",
  },
} as const;

export type EducationStage = keyof typeof EDUCATION_STAGES;

/**
 * Returns the education stage for a given grade level.
 */
export const getStageForGrade = (grade: GradeLevel): EducationStage => {
  if (grade >= 1 && grade <= 5) {
    return "primary";
  }
  if (grade >= 6 && grade <= 9) {
    return "juniorSecondary";
  }
  if (grade >= 10 && grade <= 11) {
    return "seniorSecondaryPhaseI";
  }
  return "seniorSecondaryPhaseII";
};
