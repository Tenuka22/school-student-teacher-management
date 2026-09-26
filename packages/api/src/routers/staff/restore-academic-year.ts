import { ORPCError } from "@orpc/server";
import {
  academicYear,
  academicYearIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminOnlyProcedure } from "../../index";

/**
 * The inverse of `deleteAcademicYear`, and the reason a soft delete is soft
 * rather than merely gentle.
 *
 * `deleteAcademicYear` only ever retires an *empty* year — no classes, no
 * staff positions, no attendance, nothing — so a restore never has to decide
 * what to do with data that arrived while the year was hidden, because
 * nothing could have: every write path that would attach a row to an
 * academic year (`createClass`, `assignPosition`, `markAttendance`, …) reads
 * the year first, and a deleted year does not appear in `listAcademicYears`
 * for any of those pickers to offer. Restoring is therefore just clearing the
 * one column that hid it.
 */
export const restoreAcademicYear = adminOnlyProcedure
  .input(v.object({ id: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(academicYear)
      .where(eq(academicYear.id, input.id));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Academic year not found" });
    }

    if (!existing.deletedAt) {
      throw new ORPCError("BAD_REQUEST", {
        message: "This academic year is not deleted",
      });
    }

    const [restored] = await context.db
      .update(academicYear)
      .set({ deletedAt: null })
      .where(eq(academicYear.id, input.id))
      .returning();

    if (!restored) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Could not restore this academic year",
      });
    }

    return { id: restored.id, year: restored.year };
  });
