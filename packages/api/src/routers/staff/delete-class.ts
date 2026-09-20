import {
  class_,
  classIdSchema,
} from "@school-student-teacher-management/db/schema/academics";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../index";

export const deleteClass = requireAssignmentPermission("delete")
  .input(v.object({ id: classIdSchema }))
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(class_)
      .where(eq(class_.id, input.id));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Class not found" });
    }

    await context.db.delete(class_).where(eq(class_.id, input.id));

    return { success: true };
  });
