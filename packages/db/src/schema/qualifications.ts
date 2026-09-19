import {
  index,
  pgTable,
  text,
  timestamp,
  unique,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";
import * as v from "valibot";

import { QUALIFICATION_LEVELS } from "../constants/teachers";
import type { QualificationLevel } from "../constants/teachers";
import { brand } from "./brand";
import type { Brand } from "./brand";
import { fileIdSchema, files } from "./files";
import { staff, staffIdSchema } from "./staff";

const qualificationLevelSchema = v.picklist(
  Object.keys(QUALIFICATION_LEVELS) as [
    QualificationLevel,
    ...QualificationLevel[],
  ]
);

export type TeacherQualificationId = Brand<string, "TeacherQualificationId">;
export const teacherQualificationIdSchema = v.pipe(
  v.string(),
  brand<string, "TeacherQualificationId">()
);

/**
 * Teacher qualification records.
 * Stores multiple qualifications per teacher in ordered manner.
 */
export const teacherQualification = pgTable(
  "teacher_qualification",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    // Qualification type from enum
    qualification: text("qualification").notNull(),
    // Year the qualification was obtained
    yearObtained: integer("year_obtained"),
    // Institution name (optional)
    institution: text("institution"),
    // Subject specialization if applicable (e.g., "Mathematics")
    subjectSpecialization: text("subject_specialization"),
    // Category of the specialization
    specializationCategory: text("specialization_category"),
    // Document file ID (nullable - some may not have uploaded docs)
    documentFileId: text("document_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    // Approval status for the document
    documentStatus: text("document_status").default("pending").notNull(),
    // Admin who reviewed
    reviewedBy: text("reviewed_by").references(() => staff.id, {
      onDelete: "set null",
    }),
    // Admin review note
    reviewNote: text("review_note"),
    // When reviewed
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("teacher_qualification_staff_idx").on(table.staffId),
    index("teacher_qualification_doc_status_idx").on(table.documentStatus),
    unique("teacher_qualification_unique").on(
      table.staffId,
      table.qualification,
      table.yearObtained,
      table.institution
    ),
  ]
);

export { qualificationLevelSchema };

const teacherQualificationColumnRefinements = {
  id: () => teacherQualificationIdSchema,
  staffId: () => staffIdSchema,
  qualification: () => qualificationLevelSchema,
  yearObtained: () =>
    v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(1900), v.maxValue(2100))
    ),
  documentFileId: () => v.optional(v.nullable(fileIdSchema)),
  reviewedBy: () => v.optional(v.nullable(staffIdSchema)),
};

export const teacherQualificationSelectSchema = createSelectSchema(
  teacherQualification,
  teacherQualificationColumnRefinements
);
export const teacherQualificationInsertSchema = createInsertSchema(
  teacherQualification,
  teacherQualificationColumnRefinements
);

/**
 * Employment verification documents.
 * Tracks documents submitted for employment verification.
 */
export const employmentVerification = pgTable(
  "employment_verification",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    // Document type (e.g., "appointmentLetter", "nationalIdentityCard")
    documentType: text("document_type").notNull(),
    // File ID of uploaded document
    fileId: text("file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    // Current approval status
    status: text("status").default("pending").notNull(),
    // Admin who reviewed
    reviewedBy: text("reviewed_by").references(() => staff.id, {
      onDelete: "set null",
    }),
    // Admin review note
    reviewNote: text("review_note"),
    // When reviewed
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("employment_verification_staff_idx").on(table.staffId),
    index("employment_verification_status_idx").on(table.status),
    index("employment_verification_type_idx").on(table.documentType),
  ]
);

/**
 * Password rotation history.
 * Tracks password changes for audit purposes.
 */
export const passwordRotationHistory = pgTable(
  "password_rotation_history",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    // Who changed the password
    changedBy: text("changed_by").references(() => staff.id, {
      onDelete: "set null",
    }),
    // Whether changed by admin or self ("admin" | "self")
    changeMethod: text("change_method").notNull(),
    // When the change occurred
    changedAt: timestamp("changed_at").defaultNow().notNull(),
  },
  (table) => [
    index("password_rotation_staff_idx").on(table.staffId),
    index("password_rotation_changed_by_idx").on(table.changedBy),
  ]
);
