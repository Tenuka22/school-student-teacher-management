import {
  academicYearIdSchema,
  staffIdSchema,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { eq, and } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";

export const listStaffPositions = adminProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      staffId: v.optional(staffIdSchema),
    })
  )
  .handler(async ({ input, context }) => {
    const conditions = [eq(staffPosition.academicYearId, input.academicYearId)];

    if (input.staffId) {
      conditions.push(eq(staffPosition.staffId, input.staffId));
    }

    const rows = await context.db
      .select()
      .from(staffPosition)
      .where(and(...conditions));

    return rows.map((row) => ({
      id: row.id,
      staffId: row.staffId,
      academicYearId: row.academicYearId,
      position: row.position,
      sectionalScope: row.sectionalScope,
      createdAt: row.createdAt.toISOString(),
    }));
  });
