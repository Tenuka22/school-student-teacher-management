export * from "./auth";
export * from "./attendance";
export * from "./marking";
export * from "./staff";
export * from "./qualifications";
export * from "./files";
export * from "./primitives";
export * from "./brand";

// `academics.ts` and `marking.ts` both independently define a local
// `gradeLevelSchema` picklist (each scoped to its own module in the source
// repo, where they're always imported by direct path, never through a
// shared barrel). Re-exporting both via `export *` here is ambiguous and
// crashes CJS-interop tooling (e.g. the better-auth CLI's config loader), so
// this barrel re-exports every other `academics.ts` symbol explicitly and
// omits its `gradeLevelSchema` from this barrel. The picklist itself still
// lives in and is importable from `@school-student-teacher-management/db/schema/academics` directly.

// Similarly, `periods.ts` defines `periodNumberSchema` and `dayOfWeekSchema`
// which are module-scoped constants; explicitly re-export to avoid ambiguity.
export {
  type ClassId,
  classIdSchema,
  type GradeSubjectConfigId,
  gradeSubjectConfigIdSchema,
  class_,
  gradeSubjectConfig,
  subjectKeySchema,
  mediumSchema,
  basketCategorySchema,
  classSelectSchema,
  classInsertSchema,
  classUpdateSchema,
  gradeSubjectConfigSelectSchema,
  gradeSubjectConfigInsertSchema,
  gradeSubjectConfigUpdateSchema,
} from "./academics";

export {
  type PeriodConfigId,
  periodConfigIdSchema,
  type ClassPeriodAssignmentId,
  classPeriodAssignmentIdSchema,
  periodConfig,
  classPeriodAssignment,
  periodConfigSelectSchema,
  periodConfigInsertSchema,
  periodConfigUpdateSchema,
  classPeriodAssignmentSelectSchema,
  classPeriodAssignmentInsertSchema,
  classPeriodAssignmentUpdateSchema,
} from "./periods";
