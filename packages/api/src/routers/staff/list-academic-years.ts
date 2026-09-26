import { academicYear } from "@school-student-teacher-management/db/schema/staff";
import { desc, isNull } from "drizzle-orm";
import * as v from "valibot";

import { protectedProcedure } from "../../index";

/**
 * Academic years, newest first. Readable by every signed-in member because
 * the sidebar year switcher and the academic-year gate both render on
 * teacher pages too \u2014 not just the admin workspace. Mutating the current
 * year stays admin-only (`setCurrentYear`).
 *
 * `includeDeleted` surfaces soft-deleted years too, newest first alongside
 * the live ones \u2014 the one place that needs it is the academic-years page's
 * own "Deleted years" panel, where `restoreAcademicYear` is offered. Every
 * other reader (the sidebar switcher, the academic-year gate) calls this with
 * no input at all, so a retired year drops out of both the moment it is
 * deleted, with no second flag for either to remember to pass.
 */
export const listAcademicYears = protectedProcedure
  .input(
    v.optional(v.object({ includeDeleted: v.optional(v.boolean(), false) }))
  )
  .handler(async ({ input, context }) => {
    const query = context.db.select().from(academicYear);

    const rows = await (
      input?.includeDeleted
        ? query
        : query.where(isNull(academicYear.deletedAt))
    ).orderBy(desc(academicYear.year));

    return rows.map((row) => ({
      id: row.id,
      year: row.year,
      startDate: row.startDate,
      endDate: row.endDate,
      structureVersionKey: row.structureVersionKey,
      structureSubversionKey: row.structureSubversionKey,
      isCurrent: row.isCurrent,
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    }));
  });
