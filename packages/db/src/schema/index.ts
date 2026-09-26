// Intentional barrel file: the schema registry is the single import surface
// for drizzle-kit, better-auth and the API layer (established project pattern).
// oxlint-disable-next-line no-barrel-file
export * from "./auth";
export * from "./attendance";
export * from "./leaves";
export * from "./marking";
export * from "./staff";
export * from "./teacher-subjects";
export * from "./qualifications";
export * from "./files";
export * from "./primitives";
export * from "./brand";
export * from "./inventory";

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
  type ClassPeriodAssignmentId,
  classPeriodAssignmentIdSchema,
  classPeriodAssignment,
  classPeriodAssignmentSelectSchema,
  classPeriodAssignmentInsertSchema,
  classPeriodAssignmentUpdateSchema,
} from "./periods";
