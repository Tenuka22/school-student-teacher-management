import {
  academicYear,
  academicYearIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { ORPCError } from "@orpc/server";
import { eq, sql } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";

export const setCurrentYear = adminProcedure
  .input(v.object({ id: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(academicYear)
      .where(eq(academicYear.id, input.id));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Academic year not found" });
    }

    // Unset all current flags
    await context.db
      .update(academicYear)
      .set({ isCurrent: false })
      .where(sql`1 = 1`);

    // Set the selected year as current
    const [record] = await context.db
      .update(academicYear)
      .set({ isCurrent: true })
      .where(eq(academicYear.id, input.id))
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      id: record.id,
      year: record.year,
      isCurrent: record.isCurrent,
    };
  });
