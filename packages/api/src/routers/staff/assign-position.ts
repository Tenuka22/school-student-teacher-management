import { ORPCError } from "@orpc/server";
import { leadershipRoleForPosition } from "@school-student-teacher-management/auth";
import { user as userTable } from "@school-student-teacher-management/db/schema/auth";
import {
  staff,
  staffPosition,
  staffPositionInsertSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
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

    // Leadership positions promote the holder: the auth role becomes the
    // seat's own role (`principal` / `vicePrincipal`) so the account is
    // self-describing and the admin workspace stays reachable.
    const leadershipRole = leadershipRoleForPosition(input.position);

    if (leadershipRole) {
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
