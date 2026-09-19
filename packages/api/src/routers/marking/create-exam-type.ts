import {
  examType,
  examTypeInsertSchema,
} from "@school-student-teacher-management/db/schema/marking";
import { ORPCError } from "@orpc/server";
import { pick } from "valibot";

import { requireExamPermission } from "../../index";

export const createExamType = requireExamPermission("create")
  .input(
    pick(examTypeInsertSchema, [
      "academicYearId",
      "name",
      "category",
      "gradeLevel",
      "maxMark",
      "sortOrder",
    ])
  )
  .handler(async ({ input, context }) => {
    const id = crypto.randomUUID();

    const [record] = await context.db
      .insert(examType)
      .values({
        id,
        academicYearId: input.academicYearId,
        name: input.name,
        category: input.category,
        gradeLevel: input.gradeLevel,
        maxMark: input.maxMark,
        sortOrder: input.sortOrder,
      })
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      id: record.id,
      academicYearId: record.academicYearId,
      name: record.name,
      category: record.category,
      gradeLevel: record.gradeLevel,
      maxMark: record.maxMark,
      sortOrder: record.sortOrder,
      createdAt: record.createdAt.toISOString(),
    };
  });
