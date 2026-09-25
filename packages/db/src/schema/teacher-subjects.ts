import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-valibot";
import * as v from "valibot";

import { subjectKeySchema } from "./academics";
import { brand } from "./brand";
import type { Brand } from "./brand";
import {
  academicYear,
  academicYearIdSchema,
  staff,
  staffIdSchema,
} from "./staff";

export type TeacherSubjectAssignmentId = Brand<
  string,
  "TeacherSubjectAssignmentId"
>;
export const teacherSubjectAssignmentIdSchema = v.pipe(
  v.string(),
  brand<string, "TeacherSubjectAssignmentId">()
);

export const teacherSubjectAssignment = pgTable(
  "teacher_subject_assignment",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYear.id, { onDelete: "cascade" }),
    subjectKey: text("subject_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("teacher_subject_assignment_unique").on(
      table.staffId,
      table.academicYearId,
      table.subjectKey
    ),
    index("teacher_subject_assignment_staff_year_idx").on(
      table.staffId,
      table.academicYearId
    ),
  ]
);

const teacherSubjectAssignmentColumnRefinements = {
  id: () => teacherSubjectAssignmentIdSchema,
  staffId: () => staffIdSchema,
  academicYearId: () => academicYearIdSchema,
  subjectKey: () => subjectKeySchema,
};

export const teacherSubjectAssignmentSelectSchema = createSelectSchema(
  teacherSubjectAssignment,
  teacherSubjectAssignmentColumnRefinements
);
export const teacherSubjectAssignmentInsertSchema = createInsertSchema(
  teacherSubjectAssignment,
  teacherSubjectAssignmentColumnRefinements
);
export const teacherSubjectAssignmentUpdateSchema = createUpdateSchema(
  teacherSubjectAssignment,
  teacherSubjectAssignmentColumnRefinements
);
