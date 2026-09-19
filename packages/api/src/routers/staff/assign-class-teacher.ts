import {
  class_,
  classIdSchema,
  classInsertSchema,
} from "@school-student-teacher-management/db/schema/academics";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { pick } from "valibot";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../index";

export const assignClassTeacher = requireAssignmentPermission("update")
  .input(
    v.object({
      classId: classIdSchema,
      ...pick(classInsertSchema, ["homeroomTeacherId", "subHomeroomTeacherId"])
        .entries,
    })
  )
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(class_)
      .where(eq(class_.id, input.classId));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Class not found" });
    }

    const [record] = await context.db
      .update(class_)
      .set({
        homeroomTeacherId: input.homeroomTeacherId,
        subHomeroomTeacherId: input.subHomeroomTeacherId,
      })
      .where(eq(class_.id, input.classId))
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
