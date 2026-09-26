import { class_ } from "@school-student-teacher-management/db/schema/academics";
import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
import {
  academicYearIdSchema,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../../index";
import { teachingStaff } from "../teacher-eligibility";

/**
 * Every **active teaching staff member** plus the distinct grade levels they
 * teach this academic year (via `classPeriodAssignment`), so the caller can
 * group teachers into Primary/Secondary/Collegiate sections without an N+1 of
 * per-teacher timetable calls. A teacher with no period assignments yet gets an
 * empty `gradeLevels` array (still returned - they belong in an "unassigned"
 * group, not hidden).
 *
 * **The `teachingStaff` filter is the point of this procedure, not a refinement
 * of it.** The query used to be `db.select().from(staff).orderBy(staff.name)`
 * with no `where` at all, while this comment described the result as teachers
 * and the caller (`groupTeachers` in
 * `apps/web/src/components/staff/attendance/attendance-grid.tsx`) built its
 * Primary/Secondary/Collegiate sections out of `gradeLevels`. The intent was
 * always the teaching roll; the implementation was the whole staff table. So
 * every office staff member in the system was offered for daily attendance
 * marking, and the leadership seats made it visible: the Principal and Deputy
 * Principal `staff` rows are `staffCategory: "officeStaff"`, so they produced
 * `gradeLevels: []`, failed to match any grade, and landed in the "Not yet
 * assigned to classes" group — a group that means *a teacher without a timetable
 * yet*, and which now reads as though the Principal needs a class. Those rows
 * are seeded deliberately (`packages/auth/src/admin.ts`); the filter, not the
 * seed, is what keeps them off a teacher's attendance register.
 *
 * `teachingStaff` is imported from `../teacher-eligibility` rather than
 * restated, so "who is on the teaching roll" is decided in exactly one place.
 * `isTeachingStaff` in `packages/api/src/routers/marking/assert-caller-teaches-class.ts`
 * is a deliberate second spelling of the same rule, in TypeScript, for a guard
 * that has to report *which* half of the rule the caller failed.
 *
 * **All active teaching staff, not the year roster.** `getYearRosterTeacherIds`
 * in the same module is the tempting alternative and it is the wrong one here:
 * it is positioned-in-the-year **or** created-during-the-year, so a long-serving
 * teacher whose `staff_position` row for this year has not been entered yet
 * falls out of it — and attendance is marked *daily*, by the office, for every
 * teacher on the roll. A teacher who silently stops appearing in the register
 * is not a narrower list, it is a teacher who is never marked present. The
 * "unassigned group" behaviour above is the tell: it exists precisely so that a
 * teacher with no timetable this year is still markable, which is only true if
 * the list is the roll and not the subset of it that has been positioned.
 */
export const listTeachersForAttendance = adminProcedure
  .input(v.object({ academicYearId: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const [staffRows, gradeRows] = await Promise.all([
      context.db
        .select({
          id: staff.id,
          name: staff.name,
          email: staff.email,
          phone: staff.phone,
        })
        .from(staff)
        .where(teachingStaff)
        .orderBy(staff.name),
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
