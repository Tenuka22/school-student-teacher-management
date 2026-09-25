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
import { leaveRequest, leaveRequestIdSchema } from "./leaves";
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
  "lateShortLeave",
  "halfDay",
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
    leaveRequestId: text("leave_request_id").references(() => leaveRequest.id, {
      onDelete: "set null",
    }),
    markedAt: timestamp("marked_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("teacher_attendance_staff_year_date_unique").on(
      table.staffId,
      table.academicYearId,
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
  leaveRequestId: () => v.optional(v.nullable(leaveRequestIdSchema)),
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
  reason: () => v.optional(v.string(), ""),
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

/**
 * Automatic late-arrival policy for one academic year. All values are
 * editable data (never constants in code) so a new year can use different
 * rules without a code change. Historical years keep their own row.
 */
export const attendancePolicy = pgTable(
  "attendance_policy",
  {
    id: text("id").primaryKey(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYear.id, { onDelete: "cascade" }),
    /** Arrival cut-off in school-local HH:MM (24h). Arrival after this is late. */
    arrivalCutoffTime: text("arrival_cutoff_time").notNull().default("07:30"),
    /** Short leaves allowed per calendar month. */
    shortLeavesPerMonth: integer("short_leaves_per_month").notNull().default(2),
    primaryStartPeriodNumber: integer("primary_start_period_number")
      .notNull()
      .default(1),
    primaryEndPeriodNumber: integer("primary_end_period_number")
      .notNull()
      .default(4),
    secondaryStartPeriodNumber: integer("secondary_start_period_number")
      .notNull()
      .default(5),
    secondaryEndPeriodNumber: integer("secondary_end_period_number")
      .notNull()
      .default(8),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [unique("attendance_policy_year_unique").on(table.academicYearId)]
);

/**
 * Append-only monthly consumption counters for the late-arrival policy.
 * One row per (staff, year-month); created on first use and only ever
 * incremented, so "current usage" is always reconstructible and history
 * is never rewritten when policies change.
 */
export const shortLeaveUsage = pgTable(
  "short_leave_usage",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYear.id, { onDelete: "cascade" }),
    /** Calendar month key, "YYYY-MM" (school-local). */
    yearMonth: text("year_month").notNull(),
    shortLeavesUsed: integer("short_leaves_used").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("short_leave_usage_staff_year_month_unique").on(
      table.staffId,
      table.academicYearId,
      table.yearMonth
    ),
    index("short_leave_usage_year_idx").on(table.academicYearId),
  ]
);

export type AttendancePolicyId = Brand<string, "AttendancePolicyId">;
export const attendancePolicyIdSchema = v.pipe(
  v.string(),
  brand<string, "AttendancePolicyId">()
);

export type ShortLeaveUsageId = Brand<string, "ShortLeaveUsageId">;
export const shortLeaveUsageIdSchema = v.pipe(
  v.string(),
  brand<string, "ShortLeaveUsageId">()
);

/** HH:MM 24-hour time-of-day validation ("07:30"). */
export const timeOfDaySchema = v.pipe(
  v.string(),
  // oxlint-disable-next-line require-unicode-regexp, prefer-named-capture-group
  v.regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24-hour)")
);

const attendancePolicyColumnRefinements = {
  id: () => attendancePolicyIdSchema,
  academicYearId: () => academicYearIdSchema,
  arrivalCutoffTime: () => timeOfDaySchema,
  primaryStartPeriodNumber: () => periodNumberSchema,
  primaryEndPeriodNumber: () => periodNumberSchema,
  secondaryStartPeriodNumber: () => periodNumberSchema,
  secondaryEndPeriodNumber: () => periodNumberSchema,
};

export const attendancePolicySelectSchema = createSelectSchema(
  attendancePolicy,
  attendancePolicyColumnRefinements
);
export const attendancePolicyInsertSchema = createInsertSchema(
  attendancePolicy,
  attendancePolicyColumnRefinements
);
export const attendancePolicyUpdateSchema = createUpdateSchema(
  attendancePolicy,
  attendancePolicyColumnRefinements
);

const shortLeaveUsageColumnRefinements = {
  id: () => shortLeaveUsageIdSchema,
  staffId: () => staffIdSchema,
  academicYearId: () => academicYearIdSchema,
  yearMonth: () =>
    v.pipe(
      v.string(),
      // oxlint-disable-next-line require-unicode-regexp
      v.regex(/^\d{4}-\d{2}$/)
    ),
};

export const shortLeaveUsageSelectSchema = createSelectSchema(
  shortLeaveUsage,
  shortLeaveUsageColumnRefinements
);
export const shortLeaveUsageInsertSchema = createInsertSchema(
  shortLeaveUsage,
  shortLeaveUsageColumnRefinements
);
export const shortLeaveUsageUpdateSchema = createUpdateSchema(
  shortLeaveUsage,
  shortLeaveUsageColumnRefinements
);
