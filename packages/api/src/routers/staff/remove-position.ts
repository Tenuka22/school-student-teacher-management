import { ORPCError } from "@orpc/server";
import {
  leadershipRoleForPosition,
  LEADERSHIP_POSITION_KEYS,
} from "@school-student-teacher-management/auth";
import { user as userTable } from "@school-student-teacher-management/db/schema/auth";
import {
  academicYear,
  staff,
  staffPosition,
  staffPositionIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
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

    const [targetYear] = await context.db
      .select({ isCurrent: academicYear.isCurrent })
      .from(academicYear)
      .where(eq(academicYear.id, existing.academicYearId))
      .limit(1);

    await context.db
      .delete(staffPosition)
      .where(eq(staffPosition.id, input.id));

    if (targetYear?.isCurrent && leadershipRoleForPosition(existing.position)) {
      const [staffRow] = await context.db
        .select({ userId: staff.userId })
        .from(staff)
        .where(eq(staff.id, existing.staffId))
        .limit(1);

      if (staffRow?.userId) {
        const remaining = await context.db
          .select({ position: staffPosition.position })
          .from(staffPosition)
          .where(
            and(
              eq(staffPosition.staffId, existing.staffId),
              eq(staffPosition.academicYearId, existing.academicYearId)
            )
          );

        const stillLeadership = remaining.some((row) =>
          LEADERSHIP_POSITION_KEYS.has(row.position)
        );

        if (!stillLeadership) {
          await context.db
            .update(userTable)
            .set({ role: "teacher" })
            .where(eq(userTable.id, staffRow.userId));
        }
      }
    }

    return { success: true };
  });
