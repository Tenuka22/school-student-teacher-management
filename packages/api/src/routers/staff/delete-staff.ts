import { ORPCError } from "@orpc/server";
import {
  staff,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";

export const deleteStaff = adminProcedure
  .input(v.object({ id: staffIdSchema }))
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(staff)
      .where(eq(staff.id, input.id));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Staff member not found" });
    }

    await context.db.delete(staff).where(eq(staff.id, input.id));

    return { success: true };
  });
