import {
  boolean,
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

import { classIdSchema, class_ } from "./academics";
import { brand } from "./brand";
import type { Brand } from "./brand";
import {
  academicYearIdSchema,
  staff,
  academicYear,
  staffIdSchema,
} from "./staff";

export type PeriodConfigId = Brand<string, "PeriodConfigId">;
export const periodConfigIdSchema = v.pipe(
  v.string(),
  brand<string, "PeriodConfigId">()
);

export type ClassPeriodAssignmentId = Brand<string, "ClassPeriodAssignmentId">;
export const classPeriodAssignmentIdSchema = v.pipe(
  v.string(),
  brand<string, "ClassPeriodAssignmentId">()
);

const periodTimeSchema = v.pipe(
  v.string(),
  v.regex(/^\d{2}:\d{2}$/u, "Time must be in HH:MM format")
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
  v.maxValue(8)
);

/**
 * School day period configuration: times for each period (1–8).
 * Immutable once created; if school changes periods, create a new academic year.
 * One row per period per academic year.
 */
export const periodConfig = pgTable(
  "period_config",
  {
    id: text("id").primaryKey(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYear.id, { onDelete: "cascade" }),
    periodNumber: integer("period_number").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("period_config_unique").on(table.academicYearId, table.periodNumber),
    index("period_config_year_idx").on(table.academicYearId),
  ]
);

/**
 * Class period assignment: maps (class, day, period) -> (teacher, subject) for a given academic year.
 * Core timetable table. Enforces no double-booking of a *class* at the database
 * level via a UNIQUE constraint (a class can't have two subjects in the same
 * slot). Deliberately does NOT enforce single-class-per-teacher-per-slot:
 * combined sessions (e.g. one Dance/Music teacher running the same period
 * across multiple classes at once) are a legitimate, intentional overlap.
 * - (academicYearId, classId, dayOfWeek, periodNumber) UNIQUE: no duplicate slots for a class.
 */
export const classPeriodAssignment = pgTable(
  "class_period_assignment",
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
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    // Explicitly marks an intentional same-teacher/same-slot overlap (e.g. a
    // Dance/Music teacher running several classes at once) so it can be
    // excluded from double-booking conflict detection. Unmarked overlaps are
    // treated as accidental double-bookings.
    isCombinedSession: boolean("is_combined_session").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("class_period_assignment_class_slot_unique").on(
      table.academicYearId,
      table.classId,
      table.dayOfWeek,
      table.periodNumber
    ),
    index("class_period_assignment_year_idx").on(table.academicYearId),
    index("class_period_assignment_class_idx").on(table.classId),
    index("class_period_assignment_staff_idx").on(table.staffId),
    index("class_period_assignment_subject_idx").on(table.subjectKey),
  ]
);

// Export schemas for use in column refinements
export { dayOfWeekSchema, periodNumberSchema };

// Column refinements for periodConfig valibot schemas
const periodConfigColumnRefinements = {
  id: () => periodConfigIdSchema,
  academicYearId: () => academicYearIdSchema,
  periodNumber: () => periodNumberSchema,
  startTime: () => periodTimeSchema,
  endTime: () => periodTimeSchema,
};

export const periodConfigSelectSchema = createSelectSchema(
  periodConfig,
  periodConfigColumnRefinements
);
export const periodConfigInsertSchema = createInsertSchema(
  periodConfig,
  periodConfigColumnRefinements
);
export const periodConfigUpdateSchema = createUpdateSchema(
  periodConfig,
  periodConfigColumnRefinements
);

// Column refinements for classPeriodAssignment valibot schemas
const classPeriodAssignmentColumnRefinements = {
  id: () => classPeriodAssignmentIdSchema,
  academicYearId: () => academicYearIdSchema,
  classId: () => classIdSchema,
  dayOfWeek: () => dayOfWeekSchema,
  periodNumber: () => periodNumberSchema,
  subjectKey: () => v.pipe(v.string(), v.minLength(1)),
  staffId: () => staffIdSchema,
};

export const classPeriodAssignmentSelectSchema = createSelectSchema(
  classPeriodAssignment,
  classPeriodAssignmentColumnRefinements
);
export const classPeriodAssignmentInsertSchema = createInsertSchema(
  classPeriodAssignment,
  classPeriodAssignmentColumnRefinements
);
export const classPeriodAssignmentUpdateSchema = createUpdateSchema(
  classPeriodAssignment,
  classPeriodAssignmentColumnRefinements
);
