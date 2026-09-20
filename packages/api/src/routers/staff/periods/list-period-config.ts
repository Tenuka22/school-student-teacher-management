import { periodConfig } from "@school-student-teacher-management/db/schema/periods";
import { academicYearIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";

/**
 * List all period configurations for a given academic year.
 * Returns 8 periods (1–8) with start/end times.
 */
export const listPeriodConfig = requireAssignmentPermission("read")
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const records = await context.db
      .select()
      .from(periodConfig)
      .where(eq(periodConfig.academicYearId, input.academicYearId))
      .orderBy(periodConfig.periodNumber);

    return records.map((record) => ({
      id: record.id,
      academicYearId: record.academicYearId,
      periodNumber: record.periodNumber,
      startTime: record.startTime,
      endTime: record.endTime,
      createdAt: record.createdAt.toISOString(),
    }));
  });
