import { ORPCError } from "@orpc/server";
import {
  staffPosition,
  staffPositionIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";

export const removePosition = adminProcedure
  .input(v.object({ id: staffPositionIdSchema }))
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(staffPosition)
      .where(eq(staffPosition.id, input.id));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", {
        message: "Position assignment not found",
      });
    }

    await context.db
      .delete(staffPosition)
      .where(eq(staffPosition.id, input.id));

    return { success: true };
  });
