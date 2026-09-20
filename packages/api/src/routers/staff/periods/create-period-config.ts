import { ORPCError } from "@orpc/server";
import {
  periodConfig,
  periodConfigInsertSchema,
} from "@school-student-teacher-management/db/schema/periods";
import { pick } from "valibot";

import { adminProcedure } from "../../../index";

/**
 * Create period configuration for an academic year.
 * Admin-only: sets the school day structure (8 periods with times).
 * One config row per period per year.
 */
export const createPeriodConfig = adminProcedure
  .input(
    pick(periodConfigInsertSchema, [
      "academicYearId",
      "periodNumber",
      "startTime",
      "endTime",
    ])
  )
  .handler(async ({ input, context }) => {
    const id = crypto.randomUUID();

    const [record] = await context.db
      .insert(periodConfig)
      .values({
        id,
        academicYearId: input.academicYearId,
        periodNumber: input.periodNumber,
        startTime: input.startTime,
        endTime: input.endTime,
      })
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      id: record.id,
      academicYearId: record.academicYearId,
      periodNumber: record.periodNumber,
      startTime: record.startTime,
      endTime: record.endTime,
      createdAt: record.createdAt.toISOString(),
    };
  });
