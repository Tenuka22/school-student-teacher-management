import { leadershipRoleForPosition } from "@school-student-teacher-management/auth";
import {
  academicYear,
  academicYearIdSchema,
  staffIdSchema,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { desc, eq, lt } from "drizzle-orm";
import { array, object, optional } from "valibot";

import { academicProcedure } from "../../index";

/**
 * Copies each staff member's position(s) from the academic year immediately
 * before `toAcademicYearId` into that year, skipping anyone in
 * `excludeStaffIds` (teachers the admin marked as not returning) and any
 * position that's already been assigned for the target year (idempotent -
 * safe to re-run).
 */
export const portTeachersFromPreviousYear = academicProcedure
  .input(
    object({
      toAcademicYearId: academicYearIdSchema,
      excludeStaffIds: optional(array(staffIdSchema), []),
    })
  )
  .handler(async ({ input, context }) => {
    const [targetYear] = await context.db
      .select()
      .from(academicYear)
      .where(eq(academicYear.id, input.toAcademicYearId));

    if (!targetYear) {
      return { ported: 0, skipped: 0, skippedLeadership: 0 };
    }

    const [previousYear] = await context.db
      .select()
      .from(academicYear)
      .where(lt(academicYear.year, targetYear.year))
      .orderBy(desc(academicYear.year))
      .limit(1);

    if (!previousYear) {
      return { ported: 0, skipped: 0, skippedLeadership: 0 };
    }

    const excludeSet = new Set<string>(input.excludeStaffIds);

    const previousPositions = await context.db
      .select()
      .from(staffPosition)
      .where(eq(staffPosition.academicYearId, previousYear.id));

    // Leadership positions promote their holder into `ADMIN_ROLES` once the
    // year is current, so they carry over only for the Administrator or the
    // Principal — the same rule as `assignPosition` (Z2). Without this the
    // academic desk could re-appoint a Deputy the Principal had removed.
    const mayPortLeadership = ["admin", "principal"].includes(
      context.session.user.role ?? ""
    );
    const notExcluded = previousPositions.filter(
      (p) => !excludeSet.has(p.staffId)
    );
    const toPort = mayPortLeadership
      ? notExcluded
      : notExcluded.filter(
          (p) => leadershipRoleForPosition(p.position) === null
        );
    const skippedLeadership = notExcluded.length - toPort.length;

    const existingTarget = await context.db
      .select({
        staffId: staffPosition.staffId,
        position: staffPosition.position,
        sectionalScope: staffPosition.sectionalScope,
      })
      .from(staffPosition)
      .where(eq(staffPosition.academicYearId, input.toAcademicYearId));

    const existingKeys = new Set(
      existingTarget.map(
        (p) => `${p.staffId}:${p.position}:${p.sectionalScope ?? ""}`
      )
    );

    const rowsToInsert = toPort.filter(
      (p) =>
        !existingKeys.has(
          `${p.staffId}:${p.position}:${p.sectionalScope ?? ""}`
        )
    );

    if (rowsToInsert.length > 0) {
      await context.db.insert(staffPosition).values(
        rowsToInsert.map((p) => ({
          id: crypto.randomUUID(),
          staffId: p.staffId,
          academicYearId: input.toAcademicYearId,
          position: p.position,
          sectionalScope: p.sectionalScope,
        }))
      );
    }

    return {
      ported: rowsToInsert.length,
      skipped: toPort.length - rowsToInsert.length,
      skippedLeadership,
    };
  });
