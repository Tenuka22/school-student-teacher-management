import { staff, staffIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";

export const getStaff = adminProcedure
  .input(v.object({ id: staffIdSchema }))
  .handler(async ({ input, context }) => {
    const [row] = await context.db
      .select()
      .from(staff)
      .where(eq(staff.id, input.id));

    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Staff member not found" });
    }

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      nic: row.nic,
      phone: row.phone,
      portraitFileId: row.portraitFileId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
