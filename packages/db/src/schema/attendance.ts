import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-valibot";
import * as v from "valibot";

import { brand } from "./brand";
import type { Brand } from "./brand";
import { periodNumberSchema } from "./periods";
import { isoDateSchema } from "./primitives";
import {
  academicYearIdSchema,
  staff,
  academicYear,
  staffIdSchema,
} from "./staff";

export type TeacherAttendanceId = Brand<string, "TeacherAttendanceId">;
export const teacherAttendanceIdSchema = v.pipe(
  v.string(),
  brand<string, "TeacherAttendanceId">()
);

export type TeacherPeriodAbsenceId = Brand<string, "TeacherPeriodAbsenceId">;
export const teacherPeriodAbsenceIdSchema = v.pipe(
  v.string(),
  brand<string, "TeacherPeriodAbsenceId">()
);

/**
 * Attendance is an explicit daily action ("mark attendance"), not merely
 * inferred from the absence of a row - a school day with no row means
 * nobody has marked it yet, which is a distinct state from "confirmed
 * present" for reporting ("who hasn't marked attendance yet today").
 */
export const teacherAttendanceStatusSchema = v.picklist([
  "present",
  "partial",
  "absent",
]);
export type TeacherAttendanceStatus = v.InferOutput<
  typeof teacherAttendanceStatusSchema
>;

/**
 * One row per (teacher, calendar date): the day-level attendance record.
 * `status`:
 * - "present": attends every period scheduled for them that day.
 * - "partial": misses only the periods listed in `teacherPeriodAbsence`
 *   (e.g. left after the interval); every other scheduled period still runs.
 * - "absent": did not come to school at all; every period scheduled for
 *   them that day is cancelled, without needing one row per period.
 * `date` can be in the past (recording what happened) or the future
 * (pre-announcing a planned absence ahead of time) - the same row shape
 * covers both, only `date` relative to "today" differs.
 */
export const teacherAttendance = pgTable(
  "teacher_attendance",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYear.id, { onDelete: "cascade" }),
    /** ISO date string, e.g. "2026-09-22" */
    date: text("date").notNull(),
    status: text("status").notNull(),
    /** Whole-day reason, set when status is "absent". */
    reason: text("reason"),
    markedAt: timestamp("marked_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("teacher_attendance_staff_date_unique").on(
      table.staffId,
      table.date
    ),
    index("teacher_attendance_staff_idx").on(table.staffId),
    index("teacher_attendance_date_idx").on(table.date),
    index("teacher_attendance_year_idx").on(table.academicYearId),
  ]
);

/**
 * Which specific periods a "partial" attendance day covers. Only exists for
 * status="partial" rows - a status="absent" row cancels every scheduled
 * period without needing one row per period here.
 * `substituteStaffId` is unused by the UI for now (relief/substitute
 * teacher assignment is a future feature) but modeled up front so covering
 * a period later doesn't require a schema migration.
 */
export const teacherPeriodAbsence = pgTable(
  "teacher_period_absence",
  {
    id: text("id").primaryKey(),
    teacherAttendanceId: text("teacher_attendance_id")
      .notNull()
      .references(() => teacherAttendance.id, { onDelete: "cascade" }),
    periodNumber: integer("period_number").notNull(),
    reason: text("reason").notNull(),
    substituteStaffId: text("substitute_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("teacher_period_absence_unique").on(
      table.teacherAttendanceId,
      table.periodNumber
    ),
    index("teacher_period_absence_attendance_idx").on(
      table.teacherAttendanceId
    ),
    index("teacher_period_absence_substitute_idx").on(table.substituteStaffId),
  ]
);

const teacherAttendanceColumnRefinements = {
  id: () => teacherAttendanceIdSchema,
  staffId: () => staffIdSchema,
  academicYearId: () => academicYearIdSchema,
  date: () => isoDateSchema,
  status: () => teacherAttendanceStatusSchema,
  reason: () => v.optional(v.nullable(v.string())),
};

export const teacherAttendanceSelectSchema = createSelectSchema(
  teacherAttendance,
  teacherAttendanceColumnRefinements
);
export const teacherAttendanceInsertSchema = createInsertSchema(
  teacherAttendance,
  teacherAttendanceColumnRefinements
);
export const teacherAttendanceUpdateSchema = createUpdateSchema(
  teacherAttendance,
  teacherAttendanceColumnRefinements
);

const teacherPeriodAbsenceColumnRefinements = {
  id: () => teacherPeriodAbsenceIdSchema,
  teacherAttendanceId: () => teacherAttendanceIdSchema,
  periodNumber: () => periodNumberSchema,
  reason: () => v.pipe(v.string(), v.minLength(1, "Reason is required")),
  substituteStaffId: () => v.optional(v.nullable(staffIdSchema)),
};

export const teacherPeriodAbsenceSelectSchema = createSelectSchema(
  teacherPeriodAbsence,
  teacherPeriodAbsenceColumnRefinements
);
export const teacherPeriodAbsenceInsertSchema = createInsertSchema(
  teacherPeriodAbsence,
  teacherPeriodAbsenceColumnRefinements
);
export const teacherPeriodAbsenceUpdateSchema = createUpdateSchema(
  teacherPeriodAbsence,
  teacherPeriodAbsenceColumnRefinements
);
