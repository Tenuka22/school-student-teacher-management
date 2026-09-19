import {
  class_,
  gradeLevelSchema,
} from "@school-student-teacher-management/db/schema/academics";
import { academicYearIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { eq, and } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";

export const listClasses = adminProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      gradeLevel: v.optional(gradeLevelSchema),
    })
  )
  .handler(async ({ input, context }) => {
    const conditions = [eq(class_.academicYearId, input.academicYearId)];

    if (input.gradeLevel !== undefined) {
      conditions.push(eq(class_.gradeLevel, input.gradeLevel));
    }

    const rows = await context.db
      .select()
      .from(class_)
      .where(and(...conditions));

    return rows.map((row) => ({
      id: row.id,
      academicYearId: row.academicYearId,
      gradeLevel: row.gradeLevel,
      name: row.name,
      medium: row.medium,
      homeroomTeacherId: row.homeroomTeacherId,
      subHomeroomTeacherId: row.subHomeroomTeacherId,
      createdAt: row.createdAt.toISOString(),
    }));
  });
