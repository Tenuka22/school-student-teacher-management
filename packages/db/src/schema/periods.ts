import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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

import { CODE_DEFINED_PERIODS } from "../periods";
import { classIdSchema, class_ } from "./academics";
import { brand } from "./brand";
import type { Brand } from "./brand";
import {
  academicYearIdSchema,
  staff,
  academicYear,
  staffIdSchema,
} from "./staff";

export type ClassPeriodSubjectId = Brand<string, "ClassPeriodSubjectId">;
export const classPeriodSubjectIdSchema = v.pipe(
  v.string(),
  brand<string, "ClassPeriodSubjectId">()
);

export type ClassPeriodTeacherId = Brand<string, "ClassPeriodTeacherId">;
export const classPeriodTeacherIdSchema = v.pipe(
  v.string(),
  brand<string, "ClassPeriodTeacherId">()
);

// Monday–Friday
const dayOfWeekSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(5)
);

// 1–8 periods
const periodNumberSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(CODE_DEFINED_PERIODS.length)
);

/**
 * A subject taught to a class in one timetable slot, for a given academic year.
 *
 * **Subject-first, teacher-later.** This row names *what* is taught in a
 * (class, day, period) slot and nothing about *who* teaches it — that is
 * `classPeriodTeacher` below, added as a separate step once the subject is on
 * the timetable. A slot is no longer one subject: two or more subjects can
 * legitimately share a slot (e.g. a split period where half the class does Art
 * and half does Music), so there is no unique constraint on
 * (academicYearId, classId, dayOfWeek, periodNumber) alone. What IS unique is
 * the same subject appearing twice in the same slot for the same class —
 * that is a duplicate entry, not a second subject.
 * - (academicYearId, classId, dayOfWeek, periodNumber, subjectKey) UNIQUE.
 */
export const classPeriodSubject = pgTable(
  "class_period_subject",
  {
    id: text("id").primaryKey(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYear.id, { onDelete: "cascade" }),
    classId: text("class_id")
      .notNull()
      .references(() => class_.id, { onDelete: "cascade" }),
    // Monday–Friday
    dayOfWeek: integer("day_of_week").notNull(),
    // 1–8
    periodNumber: integer("period_number").notNull(),
    // Must match ALL_KNOWN_SUBJECT_KEYS
    subjectKey: text("subject_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("class_period_subject_slot_subject_unique").on(
      table.academicYearId,
      table.classId,
      table.dayOfWeek,
      table.periodNumber,
      table.subjectKey
    ),
    index("class_period_subject_year_idx").on(table.academicYearId),
    index("class_period_subject_class_idx").on(table.classId),
    index("class_period_subject_subject_idx").on(table.subjectKey),
    // The valibot ranges above, made unskippable (F-31): a slot outside
    // Monday–Friday or the code-defined bell schedule renders nowhere.
    check(
      "class_period_subject_day_range",
      sql`${table.dayOfWeek} between 1 and 5`
    ),
    check(
      "class_period_subject_period_range",
      sql`${table.periodNumber} between 1 and ${sql.raw(String(CODE_DEFINED_PERIODS.length))}`
    ),
  ]
);

/**
 * One teacher assigned to teach a `classPeriodSubject` slot-entry.
 *
 * Several rows may point at the same `classPeriodSubjectId` — co-taught
 * subjects (a lead teacher and a support teacher in the same period) are a
 * real timetable shape, not an error. Deliberately does NOT enforce
 * single-class-per-teacher-per-(day,period) here either: combined sessions
 * (one Dance/Music teacher running the same period across several classes
 * at once) are a legitimate, intentional overlap, flagged by
 * `isCombinedSession` and excluded from double-booking conflict detection
 * (`listPeriodConflicts` groups by staffId/dayOfWeek/periodNumber via a join
 * back to `classPeriodSubject`).
 * - (classPeriodSubjectId, staffId) UNIQUE: a teacher cannot be assigned
 *   twice to the same subject-slot entry.
 */
export const classPeriodTeacher = pgTable(
  "class_period_teacher",
  {
    id: text("id").primaryKey(),
    classPeriodSubjectId: text("class_period_subject_id")
      .notNull()
      .references(() => classPeriodSubject.id, { onDelete: "cascade" }),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    // Explicitly marks an intentional same-teacher/same-slot overlap (e.g. a
    // Dance/Music teacher running several classes at once) so it can be
    // excluded from double-booking conflict detection. Unmarked overlaps are
    // treated as accidental double-bookings.
    isCombinedSession: boolean("is_combined_session").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("class_period_teacher_subject_staff_unique").on(
      table.classPeriodSubjectId,
      table.staffId
    ),
    index("class_period_teacher_subject_idx").on(table.classPeriodSubjectId),
    index("class_period_teacher_staff_idx").on(table.staffId),
  ]
);

// Export schemas for use in column refinements
export { dayOfWeekSchema, periodNumberSchema };

// Column refinements for classPeriodSubject valibot schemas
const classPeriodSubjectColumnRefinements = {
  id: () => classPeriodSubjectIdSchema,
  academicYearId: () => academicYearIdSchema,
  classId: () => classIdSchema,
  dayOfWeek: () => dayOfWeekSchema,
  periodNumber: () => periodNumberSchema,
  subjectKey: () => v.pipe(v.string(), v.minLength(1)),
};

export const classPeriodSubjectSelectSchema = createSelectSchema(
  classPeriodSubject,
  classPeriodSubjectColumnRefinements
);
export const classPeriodSubjectInsertSchema = createInsertSchema(
  classPeriodSubject,
  classPeriodSubjectColumnRefinements
);
export const classPeriodSubjectUpdateSchema = createUpdateSchema(
  classPeriodSubject,
  classPeriodSubjectColumnRefinements
);

// Column refinements for classPeriodTeacher valibot schemas
const classPeriodTeacherColumnRefinements = {
  id: () => classPeriodTeacherIdSchema,
  classPeriodSubjectId: () => classPeriodSubjectIdSchema,
  staffId: () => staffIdSchema,
};

export const classPeriodTeacherSelectSchema = createSelectSchema(
  classPeriodTeacher,
  classPeriodTeacherColumnRefinements
);
export const classPeriodTeacherInsertSchema = createInsertSchema(
  classPeriodTeacher,
  classPeriodTeacherColumnRefinements
);
