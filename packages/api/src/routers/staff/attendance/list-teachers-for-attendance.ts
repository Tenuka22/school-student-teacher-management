import { class_ } from "@school-student-teacher-management/db/schema/academics";
import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
import {
  academicYearIdSchema,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../../index";

/**
 * Every staff member plus the distinct grade levels they teach this
 * academic year (via `classPeriodAssignment`), so the caller can group
 * teachers into Primary/Secondary/Collegiate sections without an N+1 of
 * per-teacher timetable calls. A teacher with no period assignments yet
 * gets an empty `gradeLevels` array (still returned - they belong in an
 * "unassigned" group, not hidden).
 */
export const listTeachersForAttendance = adminProcedure
  .input(v.object({ academicYearId: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const [staffRows, gradeRows] = await Promise.all([
      context.db.select().from(staff).orderBy(staff.name),
      context.db
        .selectDistinct({
          staffId: classPeriodAssignment.staffId,
          gradeLevel: class_.gradeLevel,
        })
        .from(classPeriodAssignment)
        .innerJoin(class_, eq(classPeriodAssignment.classId, class_.id))
        .where(eq(classPeriodAssignment.academicYearId, input.academicYearId)),
    ]);

    const gradesByStaff = new Map<string, Set<number>>();
    for (const row of gradeRows) {
      const set = gradesByStaff.get(row.staffId) ?? new Set<number>();
      set.add(row.gradeLevel);
      gradesByStaff.set(row.staffId, set);
    }

    return staffRows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      gradeLevels: [...(gradesByStaff.get(row.id) ?? [])].toSorted(
        (a, b) => a - b
      ),
    }));
  });
