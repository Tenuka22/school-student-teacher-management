import { ORPCError } from "@orpc/server";
import {
  leadershipRoleForPosition,
  LEADERSHIP_POSITION_KEYS,
} from "@school-student-teacher-management/auth";
import { user as userTable } from "@school-student-teacher-management/db/schema/auth";
import {
  staff,
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

    // Removing the last leadership seat demotes the holder back to teacher,
    // so the account stops landing on a leadership workspace.
    if (leadershipRoleForPosition(existing.position)) {
      const [staffRow] = await context.db
        .select({ userId: staff.userId })
        .from(staff)
        .where(eq(staff.id, existing.staffId))
        .limit(1);

      if (staffRow?.userId) {
        const remaining = await context.db
          .select({ position: staffPosition.position })
          .from(staffPosition)
          .where(eq(staffPosition.staffId, existing.staffId));

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
