import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-valibot";
import * as v from "valibot";

import { GRADE_LEVELS } from "../constants/grades";
import { class_ } from "./academics";
import { brand } from "./brand";
import type { Brand } from "./brand";
import {
  academicYear,
  academicYearIdSchema,
  staff,
  staffIdSchema,
} from "./staff";

// ─── Branded IDs ────────────────────────────────────────────────────────────

export type StudentId = Brand<string, "StudentId">;
export const studentIdSchema = v.pipe(v.string(), brand<string, "StudentId">());

export type StudentClassAssignmentId = Brand<
  string,
  "StudentClassAssignmentId"
>;
export const studentClassAssignmentIdSchema = v.pipe(
  v.string(),
  brand<string, "StudentClassAssignmentId">()
);

export type ExamTypeId = Brand<string, "ExamTypeId">;
export const examTypeIdSchema = v.pipe(
  v.string(),
  brand<string, "ExamTypeId">()
);

export type SubjectMarkId = Brand<string, "SubjectMarkId">;
export const subjectMarkIdSchema = v.pipe(
  v.string(),
  brand<string, "SubjectMarkId">()
);

export type GradeScaleId = Brand<string, "GradeScaleId">;
export const gradeScaleIdSchema = v.pipe(
  v.string(),
  brand<string, "GradeScaleId">()
);

export type StudentAdmissionId = Brand<string, "StudentAdmissionId">;
export const studentAdmissionIdSchema = v.pipe(
  v.string(),
  brand<string, "StudentAdmissionId">()
);

export type StudentSubjectSelectionId = Brand<
  string,
  "StudentSubjectSelectionId"
>;
export const studentSubjectSelectionIdSchema = v.pipe(
  v.string(),
  brand<string, "StudentSubjectSelectionId">()
);

// ─── Constants ──────────────────────────────────────────────────────────────

export const EXAM_CATEGORIES = [
  "firstTerm",
  "secondTerm",
  "thirdTerm",
  "scholarship",
  "levelTest",
] as const;
export type ExamCategory = (typeof EXAM_CATEGORIES)[number];

export const ADMISSION_TYPES = ["grade6", "grade12", "transfer"] as const;
export type AdmissionType = (typeof ADMISSION_TYPES)[number];

const gradeLevelSchema = v.picklist(GRADE_LEVELS);
const examCategorySchema = v.picklist(EXAM_CATEGORIES);
const admissionTypeSchema = v.picklist(ADMISSION_TYPES);

// ─── Students ───────────────────────────────────────────────────────────────

/** Permanent student record — not year-dependent. */
export const student = pgTable(
  "student",
  {
    id: text("id").primaryKey(),
    /** Unique school admission number, e.g. "STU/2025/001" */
    admissionNumber: text("admission_number").notNull().unique(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    /** ISO date string */
    dateOfBirth: text("date_of_birth"),
    gender: text("gender"),
    /** Contact phone (student) */
    phone: text("phone"),
    /** Parent/guardian contact phone */
    parentPhone: text("parent_phone"),
    /** Admission year — the academic year the student first enrolled */
    admissionYear: integer("admission_year"),
    /** How the student was admitted: "grade6" | "grade12" | "transfer" */
    admissionType: text("admission_type").$type<AdmissionType>(),
    /** Birth certificate number — used for grade 6 admission, NOT unique globally */
    birthCertificateNumber: text("birth_certificate_number"),
    /** Grade at which student was first admitted */
    admissionGrade: integer("admission_grade"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("student_admission_number_idx").on(table.admissionNumber),
    index("student_name_idx").on(table.lastName, table.firstName),
    index("student_admission_type_idx").on(table.admissionType),
  ]
);

// ─── Class Assignment (per year) ────────────────────────────────────────────

/**
 * Maps a student to a class for a specific academic year.
 * A new row is created each year when the student is assigned to their class.
 * The class determines the homeroom teacher who manages their marks.
 */
export const studentClassAssignment = pgTable(
  "student_class_assignment",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => student.id, { onDelete: "cascade" }),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYear.id, { onDelete: "cascade" }),
    classId: text("class_id")
      .notNull()
      .references(() => class_.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("sca_student_idx").on(table.studentId),
    index("sca_year_idx").on(table.academicYearId),
    index("sca_class_idx").on(table.classId),
    /** One student can only be in one class per year */
    unique("sca_student_year_unique").on(table.studentId, table.academicYearId),
  ]
);

// ─── Student Admission (per year) ──────────────────────────────────────────

/**
 * Tracks admission events per academic year.
 * One record per student per year — created when a student is first
 * assigned to a class in that year.
 */
export const studentAdmission = pgTable(
  "student_admission",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => student.id, { onDelete: "cascade" }),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYear.id, { onDelete: "cascade" }),
    /** "grade6" | "grade12" | "transfer" */
    admissionType: text("admission_type").$type<AdmissionType>().notNull(),
    /** Birth certificate number — required for grade6 admission */
    birthCertificateNumber: text("birth_certificate_number"),
    /** Previous school — null for grade 6 newcomers */
    previousSchool: text("previous_school"),
    /** JSON array of document references */
    documents: jsonb("documents").$type<string[]>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("sa_student_idx").on(table.studentId),
    index("sa_year_idx").on(table.academicYearId),
    index("sa_type_idx").on(table.admissionType),
    /** One admission record per student per year */
    unique("sa_student_year_unique").on(table.studentId, table.academicYearId),
  ]
);

// ─── Student Subject Selection (per year, per basket) ──────────────────────

/**
 * A student's chosen optional/basket subject for a given academic year and
 * basket category. Append-only: changing a selection never edits the row in
 * place. Instead it stamps `supersededAt` on the previously active row and
 * inserts a new row pointing back at it via `previousSelectionId`, so the
 * full history is preserved.
 *
 * `subjectMark.subjectKey` is denormalized directly on each mark row, so
 * marks entered under a superseded selection are never affected by a later
 * change here.
 */
export const studentSubjectSelection = pgTable(
  "student_subject_selection",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => student.id, { onDelete: "cascade" }),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYear.id, { onDelete: "cascade" }),
    /** Basket category key — e.g. "languagesHumanities" */
    basketCategory: text("basket_category").notNull(),
    /** Subject key chosen for that basket */
    subjectKey: text("subject_key").notNull(),
    /** The prior selection this one supersedes, if any */
    previousSelectionId: text("previous_selection_id").references(
      (): AnyPgColumn => studentSubjectSelection.id,
      { onDelete: "set null" }
    ),
    /** NULL means this is the currently active selection */
    supersededAt: timestamp("superseded_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("sss_student_idx").on(table.studentId),
    index("sss_year_idx").on(table.academicYearId),
    /** Exactly one active selection per student, per year, per basket */
    uniqueIndex("sss_active_unique")
      .on(table.studentId, table.academicYearId, table.basketCategory)
      .where(sql`${table.supersededAt} is null`),
  ]
);

// ─── Exam Types ─────────────────────────────────────────────────────────────

/**
 * Defines the types of exams/assessments in the system.
 * 3 main term exams + scholarship + level tests per year.
 */
export const examType = pgTable(
  "exam_type",
  {
    id: text("id").primaryKey(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYear.id, { onDelete: "cascade" }),
    /** Display name, e.g. "First Term Exam 2027" */
    name: text("name").notNull(),
    /** Category grouping: firstTerm, secondTerm, thirdTerm, scholarship, levelTest */
    category: text("category").notNull(),
    /**
     * Grade this exam type applies to. The same exam category (e.g.
     * "scholarship") commonly needs a different `maxMark` per grade (a
     * grade 5 scholarship exam out of 100 vs. a grade 11 one out of 200),
     * so each grade gets its own exam type row rather than sharing one.
     * Nullable at the DB level only for migration safety on pre-existing
     * rows; required at the API layer for every new exam type.
     */
    gradeLevel: integer("grade_level"),
    /** Maximum possible mark (e.g. 100) */
    maxMark: integer("max_mark").notNull().default(100),
    /** Sort order within the year */
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("exam_type_year_idx").on(table.academicYearId),
    index("exam_type_category_idx").on(table.category),
    index("exam_type_grade_idx").on(table.gradeLevel),
    unique("exam_type_year_grade_name_unique").on(
      table.academicYearId,
      table.gradeLevel,
      table.name
    ),
  ]
);

// ─── Grade Scale ────────────────────────────────────────────────────────────

/**
 * Defines the grade boundaries for a subject in a given academic year.
 * Each row maps a mark range to a letter grade.
 *
 * Example for a subject with maxMark=100:
 *   - A: 75-100
 *   - B: 60-74
 *   - C: 45-59
 *   - D: 30-44
 *   - F: 0-29
 */
export const gradeScale = pgTable(
  "grade_scale",
  {
    id: text("id").primaryKey(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYear.id, { onDelete: "cascade" }),
    /** Subject this scale applies to, or null for a default scale */
    subjectKey: text("subject_key"),
    /** Letter grade, e.g. "A", "B", "C", "D", "F" */
    grade: text("grade").notNull(),
    /** Minimum mark for this grade (inclusive) */
    minMark: integer("min_mark").notNull(),
    /** Maximum mark for this grade (inclusive) */
    maxMark: integer("max_mark").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("grade_scale_year_idx").on(table.academicYearId),
    index("grade_scale_subject_idx").on(table.subjectKey),
    unique("grade_scale_unique").on(
      table.academicYearId,
      table.subjectKey,
      table.grade
    ),
  ]
);

// ─── Subject Marks ──────────────────────────────────────────────────────────

/**
 * Individual mark entry for a student in a specific subject and exam.
 * The homeroom teacher enters marks for all subjects in their class.
 */
export const subjectMark = pgTable(
  "subject_mark",
  {
    id: text("id").primaryKey(),
    studentClassAssignmentId: text("student_class_assignment_id")
      .notNull()
      .references(() => studentClassAssignment.id, { onDelete: "cascade" }),
    examTypeId: text("exam_type_id")
      .notNull()
      .references(() => examType.id, { onDelete: "cascade" }),
    /** Subject key matching the constants (e.g. "mathematics", "english") */
    subjectKey: text("subject_key").notNull(),
    /** Raw numeric mark */
    mark: integer("mark").notNull(),
    /** Auto-calculated letter grade (A/B/C/D/F) */
    grade: text("grade"),
    /** Staff member who entered this mark (homeroom teacher) */
    enteredByStaffId: text("entered_by_staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("sm_assignment_idx").on(table.studentClassAssignmentId),
    index("sm_exam_idx").on(table.examTypeId),
    index("sm_subject_idx").on(table.subjectKey),
    index("sm_entered_by_idx").on(table.enteredByStaffId),
    /** One mark per student per exam per subject */
    unique("sm_unique").on(
      table.studentClassAssignmentId,
      table.examTypeId,
      table.subjectKey
    ),
  ]
);

// ─── Valibot Schemas ────────────────────────────────────────────────────────

// Student
const studentColumnRefinements = {
  id: () => studentIdSchema,
  admissionNumber: () =>
    v.pipe(v.string(), v.minLength(1, "Admission number is required")),
  firstName: () => v.pipe(v.string(), v.minLength(1)),
  lastName: () => v.pipe(v.string(), v.minLength(1)),
  dateOfBirth: () => v.optional(v.nullable(v.string())),
  gender: () => v.optional(v.nullable(v.string())),
  phone: () => v.optional(v.nullable(v.string())),
  parentPhone: () => v.optional(v.nullable(v.string())),
  admissionYear: () => v.optional(v.nullable(v.number())),
  admissionType: () => v.optional(v.nullable(admissionTypeSchema)),
  birthCertificateNumber: () => v.optional(v.nullable(v.string())),
  admissionGrade: () => v.optional(v.nullable(v.number())),
};

export const studentSelectSchema = createSelectSchema(
  student,
  studentColumnRefinements
);
export const studentInsertSchema = createInsertSchema(
  student,
  studentColumnRefinements
);
export const studentUpdateSchema = createUpdateSchema(
  student,
  studentColumnRefinements
);

// Student Class Assignment
const scaColumnRefinements = {
  id: () => studentClassAssignmentIdSchema,
  studentId: () => studentIdSchema,
  academicYearId: () => academicYearIdSchema,
  classId: () => v.string(),
};

export const studentClassAssignmentSelectSchema = createSelectSchema(
  studentClassAssignment,
  scaColumnRefinements
);
export const studentClassAssignmentInsertSchema = createInsertSchema(
  studentClassAssignment,
  scaColumnRefinements
);

// Student Admission
const studentAdmissionColumnRefinements = {
  id: () => studentAdmissionIdSchema,
  studentId: () => studentIdSchema,
  academicYearId: () => academicYearIdSchema,
  admissionType: () => admissionTypeSchema,
  birthCertificateNumber: () => v.optional(v.nullable(v.string())),
  previousSchool: () => v.optional(v.nullable(v.string())),
  documents: () => v.optional(v.nullable(v.array(v.string()))),
};

export const studentAdmissionSelectSchema = createSelectSchema(
  studentAdmission,
  studentAdmissionColumnRefinements
);
export const studentAdmissionInsertSchema = createInsertSchema(
  studentAdmission,
  studentAdmissionColumnRefinements
);

// Student Subject Selection
const studentSubjectSelectionColumnRefinements = {
  id: () => studentSubjectSelectionIdSchema,
  studentId: () => studentIdSchema,
  academicYearId: () => academicYearIdSchema,
  /**
   * Free-form, non-empty string — selections only ever target genuinely
   * optional categories (never `COMPULSORY_BASKET_CATEGORY`); which
   * categories are actually offered for a grade/year is validated by the
   * `subjectSelection.set` handler against that year's materialized
   * `gradeSubjectConfig`, not by a closed enum here.
   */
  basketCategory: () => v.pipe(v.string(), v.minLength(1)),
  subjectKey: () => v.pipe(v.string(), v.minLength(1)),
  previousSelectionId: () =>
    v.optional(v.nullable(studentSubjectSelectionIdSchema)),
  supersededAt: () => v.optional(v.nullable(v.date())),
};

export const studentSubjectSelectionSelectSchema = createSelectSchema(
  studentSubjectSelection,
  studentSubjectSelectionColumnRefinements
);
export const studentSubjectSelectionInsertSchema = createInsertSchema(
  studentSubjectSelection,
  studentSubjectSelectionColumnRefinements
);

// Exam Type
const examTypeColumnRefinements = {
  id: () => examTypeIdSchema,
  academicYearId: () => academicYearIdSchema,
  name: () => v.pipe(v.string(), v.minLength(1)),
  category: () => examCategorySchema,
  gradeLevel: () => v.optional(v.nullable(gradeLevelSchema)),
  maxMark: () => v.pipe(v.number(), v.minValue(1)),
  sortOrder: () => v.number(),
};

export const examTypeSelectSchema = createSelectSchema(
  examType,
  examTypeColumnRefinements
);
export const examTypeInsertSchema = createInsertSchema(examType, {
  ...examTypeColumnRefinements,
  gradeLevel: () => gradeLevelSchema,
});

// Grade Scale
const gradeScaleColumnRefinements = {
  id: () => gradeScaleIdSchema,
  academicYearId: () => academicYearIdSchema,
  subjectKey: () => v.optional(v.nullable(v.string())),
  grade: () => v.pipe(v.string(), v.minLength(1)),
  minMark: () => v.pipe(v.number(), v.minValue(0)),
  maxMark: () => v.pipe(v.number(), v.minValue(0)),
};

export const gradeScaleSelectSchema = createSelectSchema(
  gradeScale,
  gradeScaleColumnRefinements
);
export const gradeScaleInsertSchema = createInsertSchema(
  gradeScale,
  gradeScaleColumnRefinements
);

// Subject Mark
const subjectMarkColumnRefinements = {
  id: () => subjectMarkIdSchema,
  studentClassAssignmentId: () => studentClassAssignmentIdSchema,
  examTypeId: () => examTypeIdSchema,
  subjectKey: () => v.pipe(v.string(), v.minLength(1)),
  mark: () => v.pipe(v.number(), v.minValue(0)),
  grade: () => v.optional(v.nullable(v.string())),
  enteredByStaffId: () => staffIdSchema,
};

export const subjectMarkSelectSchema = createSelectSchema(
  subjectMark,
  subjectMarkColumnRefinements
);
export const subjectMarkInsertSchema = createInsertSchema(
  subjectMark,
  subjectMarkColumnRefinements
);
export const subjectMarkUpdateSchema = createUpdateSchema(
  subjectMark,
  subjectMarkColumnRefinements
);

// ─── Re-export convenience types ────────────────────────────────────────────

export { gradeLevelSchema, examCategorySchema, admissionTypeSchema };
