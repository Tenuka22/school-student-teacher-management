import { ORPCError } from "@orpc/server";
import {
  staffPosition,
  staffPositionInsertSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { pick } from "valibot";

import { adminProcedure } from "../../index";

export const assignPosition = adminProcedure
  .input(
    pick(staffPositionInsertSchema, [
      "staffId",
      "academicYearId",
      "position",
      "sectionalScope",
    ])
  )
  .handler(async ({ input, context }) => {
    const id = crypto.randomUUID();

    const [record] = await context.db
      .insert(staffPosition)
      .values({
        id,
        staffId: input.staffId,
        academicYearId: input.academicYearId,
        position: input.position,
        sectionalScope: input.sectionalScope,
      })
      .returning();

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    return {
      id: record.id,
      staffId: record.staffId,
      academicYearId: record.academicYearId,
      position: record.position,
      sectionalScope: record.sectionalScope,
      createdAt: record.createdAt.toISOString(),
    };
  });
