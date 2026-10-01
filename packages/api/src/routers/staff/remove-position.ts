import { ORPCError } from "@orpc/server";
import {
  academicYear,
  staffPosition,
  staffPositionIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { positionManagerProcedure } from "../../index";
import { reconcilePositionDerivedRoles } from "./set-current-year";

export const removePosition = positionManagerProcedure
  .input(v.object({ id: staffPositionIdSchema }))
  .handler(async ({ input, context }) => {
    await context.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(staffPosition)
        .where(eq(staffPosition.id, input.id))
        .for("update");

      if (!existing) {
        throw new ORPCError("NOT_FOUND", {
          message: "Position assignment not found",
        });
      }

      if (
        existing.position === "principal" &&
        context.session.user.role === "academicAdmin"
      ) {
        throw new ORPCError("FORBIDDEN", {
          message:
            "Only the Administrator or Principal may remove the Principal position.",
        });
      }

      const [targetYear] = await tx
        .select({
          isCurrent: academicYear.isCurrent,
          deletedAt: academicYear.deletedAt,
        })
        .from(academicYear)
        .where(eq(academicYear.id, existing.academicYearId))
        .limit(1);

      if (targetYear?.deletedAt) {
        throw new ORPCError("CONFLICT", {
          message: "A closed academic year cannot be changed",
        });
      }

      await tx.delete(staffPosition).where(eq(staffPosition.id, input.id));

      // Same authority as a year switch: the role falls back to what the
      // person's remaining positions and staff category imply, instead of a
      // hard-coded `teacher` (F-10).
      if (targetYear?.isCurrent) {
        await reconcilePositionDerivedRoles(tx, existing.academicYearId);
      }
    });

    return { success: true };
  });
