import { ORPCError } from "@orpc/server";
import {
  academicYear,
  staffPosition,
  staffPositionInsertSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import { pick } from "valibot";

import { positionManagerProcedure } from "../../index";
import { assertMayManagePosition } from "./position-authority";
import { reconcilePositionDerivedRoles } from "./set-current-year";

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
    assertMayManagePosition(
      context.session.user.role,
      input.position,
      "assign"
    );

    /**
     * The position and the role it implies are written together or not at
     * all (F-10). This used to insert the position and, separately, overwrite
     * the account's role with no check of what that role was — so assigning
     * a position to the administrator's own staff row demoted `admin` to
     * `principal`. The role now comes from `reconcilePositionDerivedRoles`,
     * which never touches `admin` or the seeded seats.
     */
    const record = await context.db.transaction(async (tx) => {
      const [targetYear] = await tx
        .select({
          isCurrent: academicYear.isCurrent,
          deletedAt: academicYear.deletedAt,
        })
        .from(academicYear)
        .where(eq(academicYear.id, input.academicYearId))
        .limit(1);

      if (!targetYear) {
        throw new ORPCError("NOT_FOUND", {
          message: "Academic year not found",
        });
      }
      if (targetYear.deletedAt) {
        throw new ORPCError("CONFLICT", {
          message: "A closed academic year cannot be changed",
        });
      }

      const [inserted] = await tx
        .insert(staffPosition)
        .values({
          id: crypto.randomUUID(),
          staffId: input.staffId,
          academicYearId: input.academicYearId,
          position: input.position,
          sectionalScope: input.sectionalScope,
        })
        .returning();

      if (!inserted) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      if (targetYear.isCurrent) {
        await reconcilePositionDerivedRoles(tx, input.academicYearId);
      }
      return inserted;
    });

    return {
      id: record.id,
      staffId: record.staffId,
      academicYearId: record.academicYearId,
      position: record.position,
      sectionalScope: record.sectionalScope,
      createdAt: record.createdAt.toISOString(),
    };
  });
