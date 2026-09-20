import {
  class_,
  classIdSchema,
  classUpdateSchema,
} from "@school-student-teacher-management/db/schema/academics";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import * as v from "valibot";
import { pick } from "valibot";

import { requireAssignmentPermission } from "../../index";

const EDITABLE_CLASS_FIELDS = ["name", "medium"] as const;

export const updateClass = requireAssignmentPermission("update")
  .input(
    v.object({
      id: classIdSchema,
      ...pick(classUpdateSchema, [...EDITABLE_CLASS_FIELDS]).entries,
    })
  )
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(class_)
      .where(eq(class_.id, input.id));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Class not found" });
    }

    const { id, ...updates } = input;

    const [record] = await context.db
      .update(class_)
      .set(updates)
      .where(eq(class_.id, id))
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
