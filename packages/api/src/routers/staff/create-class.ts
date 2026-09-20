import { ORPCError } from "@orpc/server";
import {
  class_,
  classInsertSchema,
} from "@school-student-teacher-management/db/schema/academics";
import { pick } from "valibot";

import { requireAssignmentPermission } from "../../index";

export const createClass = requireAssignmentPermission("create")
  .input(
    pick(classInsertSchema, ["academicYearId", "gradeLevel", "name", "medium"])
  )
  .handler(async ({ input, context }) => {
    const id = crypto.randomUUID();

    const [record] = await context.db
      .insert(class_)
      .values({
        id,
        academicYearId: input.academicYearId,
        gradeLevel: input.gradeLevel,
        name: input.name,
        medium: input.medium,
      })
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      id: record.id,
      academicYearId: record.academicYearId,
      gradeLevel: record.gradeLevel,
      name: record.name,
      medium: record.medium,
      homeroomTeacherId: record.homeroomTeacherId,
      subHomeroomTeacherId: record.subHomeroomTeacherId,
      createdAt: record.createdAt.toISOString(),
    };
  });
