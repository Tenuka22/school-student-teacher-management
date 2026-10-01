import { ORPCError } from "@orpc/server";
import { leadershipRoleForPosition } from "@school-student-teacher-management/auth";
import { user as userTable } from "@school-student-teacher-management/db/schema/auth";
import {
  academicYear,
  staff,
  staffPosition,
  staffPositionInsertSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import { pick } from "valibot";

import { positionManagerProcedure } from "../../index";

export const assignPosition = positionManagerProcedure
  .input(
    pick(staffPositionInsertSchema, [
      "staffId",
      "academicYearId",
      "position",
      "sectionalScope",
    ])
  )
  .handler(async ({ input, context }) => {
    if (
      input.position === "principal" &&
      context.session.user.role === "academicAdmin"
    ) {
      throw new ORPCError("FORBIDDEN", {
        message:
          "Only the Administrator or Principal may assign the Principal position.",
      });
    }

    const id = crypto.randomUUID();
    const [[targetYear], [record]] = await Promise.all([
      context.db
        .select({ isCurrent: academicYear.isCurrent })
        .from(academicYear)
        .where(eq(academicYear.id, input.academicYearId))
        .limit(1),
      context.db
        .insert(staffPosition)
        .values({
          id,
          staffId: input.staffId,
          academicYearId: input.academicYearId,
          position: input.position,
          sectionalScope: input.sectionalScope,
        })
        .returning(),
    ]);

    if (!record) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }

    const leadershipRole = leadershipRoleForPosition(input.position);

    if (leadershipRole && targetYear?.isCurrent) {
      const [staffRow] = await context.db
        .select({ userId: staff.userId })
        .from(staff)
        .where(eq(staff.id, input.staffId))
        .limit(1);

      if (staffRow?.userId) {
        await context.db
          .update(userTable)
          .set({ role: leadershipRole })
          .where(eq(userTable.id, staffRow.userId));
      }
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
