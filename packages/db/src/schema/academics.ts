import {
  index,
  pgTable,
  text,
  timestamp,
  unique,
  integer,
} from "drizzle-orm/pg-core";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-valibot";
import * as v from "valibot";

import { GRADE_LEVELS } from "../constants/grades";
import { MOTHER_TONGUE_OPTIONS } from "../constants/languages";
import { ALL_KNOWN_SUBJECT_KEYS } from "../constants/structureVersions/index";
import { brand } from "./brand";
import type { Brand } from "./brand";
import {
  academicYearIdSchema,
  staff,
  academicYear,
  staffIdSchema,
} from "./staff";

export type ClassId = Brand<string, "ClassId">;
export const classIdSchema = v.pipe(v.string(), brand<string, "ClassId">());

export type SubjectAssignmentId = Brand<string, "SubjectAssignmentId">;
export const subjectAssignmentIdSchema = v.pipe(
  v.string(),
  brand<string, "SubjectAssignmentId">()
);

export type GradeSubjectConfigId = Brand<string, "GradeSubjectConfigId">;
export const gradeSubjectConfigIdSchema = v.pipe(
  v.string(),
  brand<string, "GradeSubjectConfigId">()
);

const gradeLevelSchema = v.picklist(GRADE_LEVELS);
const subjectKeySchema = v.picklist(ALL_KNOWN_SUBJECT_KEYS);
const mediumSchema = v.picklist([...MOTHER_TONGUE_OPTIONS, "english"]);

/**
 * Classes within a grade for a given academic year.
 * `gradeLevel` is integer (1-13), `medium` is enum key.
 */
export const class_ = pgTable(
  "class",
  {
    id: text("id").primaryKey(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYear.id, { onDelete: "cascade" }),
    gradeLevel: integer("grade_level").notNull(),
    name: text("name").notNull(),
    medium: text("medium").default("sinhala").notNull(),
    homeroomTeacherId: text("homeroom_teacher_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    subHomeroomTeacherId: text("sub_homeroom_teacher_id").references(
      () => staff.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("class_year_idx").on(table.academicYearId),
    index("class_grade_idx").on(table.gradeLevel),
    unique("class_unique").on(
      table.academicYearId,
      table.gradeLevel,
      table.name
    ),
  ]
);

/**
 * What a teacher teaches in a given year.
 * `subjectKey` maps to a constant from the subject enums.
 * `gradeLevel` is integer (1-13).
 * `classId` is nullable: null = teaches all classes of that grade.
 */
export const subjectAssignment = pgTable(
  "subject_assignment",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYear.id, { onDelete: "cascade" }),
    subjectKey: text("subject_key").notNull(),
    gradeLevel: integer("grade_level").notNull(),
    classId: text("class_id").references(() => class_.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("subject_assignment_staff_idx").on(table.staffId),
    index("subject_assignment_year_idx").on(table.academicYearId),
    index("subject_assignment_subject_idx").on(table.subjectKey),
    unique("subject_assignment_unique").on(
      table.staffId,
      table.academicYearId,
      table.subjectKey,
      table.classId
    ),
  ]
);

/**
 * Defines which subjects are available per grade per academic year.
 * Seeded by code with defaults but stored in DB so basket layout changes
 * (e.g. 3→4 baskets) don't require a code deploy.
 *
 * For O/L grades (10-11), this stores the basket configuration:
 * which subjects belong to which basket category, and how many
 * students must pick from each basket.
 */
export const gradeSubjectConfig = pgTable(
  "grade_subject_config",
  {
    id: text("id").primaryKey(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYear.id, { onDelete: "cascade" }),
    gradeLevel: integer("grade_level").notNull(),
    /** Basket category key — e.g. "languagesHumanities", "aestheticsArts" */
    basketCategory: text("basket_category").notNull(),
    /** Subject key matching the constants */
    subjectKey: text("subject_key").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("gsc_year_idx").on(table.academicYearId),
    index("gsc_grade_idx").on(table.gradeLevel),
    index("gsc_basket_idx").on(table.basketCategory),
    unique("gsc_unique").on(
      table.academicYearId,
      table.gradeLevel,
      table.basketCategory,
      table.subjectKey
    ),
  ]
);

export { gradeLevelSchema, subjectKeySchema, mediumSchema };

const classColumnRefinements = {
  id: () => classIdSchema,
  academicYearId: () => academicYearIdSchema,
  gradeLevel: () => gradeLevelSchema,
  name: () => v.pipe(v.string(), v.minLength(1)),
  medium: () => v.optional(mediumSchema, "sinhala"),
  homeroomTeacherId: () => v.optional(v.nullable(staffIdSchema)),
  subHomeroomTeacherId: () => v.optional(v.nullable(staffIdSchema)),
};

export const classSelectSchema = createSelectSchema(
  class_,
  classColumnRefinements
);
export const classInsertSchema = createInsertSchema(
  class_,
  classColumnRefinements
);
export const classUpdateSchema = createUpdateSchema(
  class_,
  classColumnRefinements
);

const subjectAssignmentColumnRefinements = {
  id: () => subjectAssignmentIdSchema,
  staffId: () => staffIdSchema,
  academicYearId: () => academicYearIdSchema,
  subjectKey: () => subjectKeySchema,
  gradeLevel: () => gradeLevelSchema,
  classId: () => v.optional(v.nullable(classIdSchema)),
};

export const subjectAssignmentSelectSchema = createSelectSchema(
  subjectAssignment,
  subjectAssignmentColumnRefinements
);
export const subjectAssignmentInsertSchema = createInsertSchema(
  subjectAssignment,
  subjectAssignmentColumnRefinements
);
export const subjectAssignmentUpdateSchema = createUpdateSchema(
  subjectAssignment,
  subjectAssignmentColumnRefinements
);

/**
 * Basket category is deliberately a free-form, non-empty string rather than
 * a closed picklist: `gradeSubjectConfig` rows now cover both O/L optional
 * baskets ("languagesHumanities", ...), the `COMPULSORY_BASKET_CATEGORY`
 * sentinel, and future elective slots (e.g. "op1") — every category is
 * defined by whichever `StructureVersion` materialized the row, not by a
 * single hardcoded global enum. See `constants/structureVersions`.
 */
const basketCategorySchema = v.pipe(v.string(), v.minLength(1));
export { basketCategorySchema };

const gradeSubjectConfigColumnRefinements = {
  id: () => gradeSubjectConfigIdSchema,
  academicYearId: () => academicYearIdSchema,
  gradeLevel: () => gradeLevelSchema,
  basketCategory: () => basketCategorySchema,
  subjectKey: () => subjectKeySchema,
  sortOrder: () => v.number(),
};

export const gradeSubjectConfigSelectSchema = createSelectSchema(
  gradeSubjectConfig,
  gradeSubjectConfigColumnRefinements
);
export const gradeSubjectConfigInsertSchema = createInsertSchema(
  gradeSubjectConfig,
  gradeSubjectConfigColumnRefinements
);
export const gradeSubjectConfigUpdateSchema = createUpdateSchema(
  gradeSubjectConfig,
  gradeSubjectConfigColumnRefinements
);
