import {
  gradeLevelSchema,
  subjectAssignment,
  subjectKeySchema,
} from "@school-student-teacher-management/db/schema/academics";
import {
  academicYearIdSchema,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { eq, and } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";

export const listSubjectAssignments = adminProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      staffId: v.optional(staffIdSchema),
      gradeLevel: v.optional(gradeLevelSchema),
      subjectKey: v.optional(subjectKeySchema),
    })
  )
  .handler(async ({ input, context }) => {
    const conditions = [
      eq(subjectAssignment.academicYearId, input.academicYearId),
    ];

    if (input.staffId) {
      conditions.push(eq(subjectAssignment.staffId, input.staffId));
    }
    if (input.gradeLevel !== undefined) {
      conditions.push(eq(subjectAssignment.gradeLevel, input.gradeLevel));
    }
    if (input.subjectKey) {
      conditions.push(eq(subjectAssignment.subjectKey, input.subjectKey));
    }

    const rows = await context.db
      .select()
      .from(subjectAssignment)
      .where(and(...conditions));

    return rows.map((row) => ({
      id: row.id,
      staffId: row.staffId,
      academicYearId: row.academicYearId,
      subjectKey: row.subjectKey,
      gradeLevel: row.gradeLevel,
      classId: row.classId,
      createdAt: row.createdAt.toISOString(),
    }));
  });
