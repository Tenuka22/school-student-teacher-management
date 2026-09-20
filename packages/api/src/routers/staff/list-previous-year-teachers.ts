import {
  academicYear,
  academicYearIdSchema,
  staff,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { desc, eq, inArray, lt } from "drizzle-orm";
import { object } from "valibot";

import { adminProcedure } from "../../index";

/**
 * Staff who held any position in the academic year immediately before the
 * given one - candidates for "port teachers to the new year". Only the
 * single closest prior year is considered, matching the workflow: porting
 * happens right after a new year is created, from the year that just ended.
 */
export const listPreviousYearTeachers = adminProcedure
  .input(object({ academicYearId: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const [targetYear] = await context.db
      .select()
      .from(academicYear)
      .where(eq(academicYear.id, input.academicYearId));

    if (!targetYear) {
      return { previousAcademicYearId: null, teachers: [] };
    }

    const [previousYear] = await context.db
      .select()
      .from(academicYear)
      .where(lt(academicYear.year, targetYear.year))
      .orderBy(desc(academicYear.year))
      .limit(1);

    if (!previousYear) {
      return { previousAcademicYearId: null, teachers: [] };
    }

    const positions = await context.db
      .select({
        staffId: staffPosition.staffId,
        position: staffPosition.position,
        sectionalScope: staffPosition.sectionalScope,
      })
      .from(staffPosition)
      .where(eq(staffPosition.academicYearId, previousYear.id));

    const staffIds = [...new Set(positions.map((p) => p.staffId))];
    if (staffIds.length === 0) {
      return { previousAcademicYearId: previousYear.id, teachers: [] };
    }

    const staffRows = await context.db
      .select({
        id: staff.id,
        name: staff.name,
        email: staff.email,
        nic: staff.nic,
      })
      .from(staff)
      .where(inArray(staff.id, staffIds));

    const positionsByStaff = new Map<string, string[]>();
    for (const p of positions) {
      const list = positionsByStaff.get(p.staffId) ?? [];
      list.push(
        p.sectionalScope ? `${p.position} (${p.sectionalScope})` : p.position
      );
      positionsByStaff.set(p.staffId, list);
    }

    return {
      previousAcademicYearId: previousYear.id,
      previousYear: previousYear.year,
      teachers: staffRows.map((row) => ({
        ...row,
        positions: positionsByStaff.get(row.id) ?? [],
      })),
    };
  });
