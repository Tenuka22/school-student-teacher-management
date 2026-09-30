import {
  compareQualifications,
  getHighestQualification,
  QUALIFICATION_LEVELS,
} from "@school-student-teacher-management/db/constants/teachers";
import type { QualificationLevel } from "@school-student-teacher-management/db/constants/teachers";
import { class_ } from "@school-student-teacher-management/db/schema/academics";
import {
  classPeriodSubject,
  classPeriodTeacher,
} from "@school-student-teacher-management/db/schema/periods";
import { teacherQualification } from "@school-student-teacher-management/db/schema/qualifications";
import {
  academicYearIdSchema,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { academicProcedure } from "../../../index";
import { teachingStaff } from "../teacher-eligibility";

/**
 * Every **active teaching staff member** plus the distinct grade levels they
 * teach this academic year (via `classPeriodSubject`/`classPeriodTeacher`), so the caller can
 * group teachers into Primary/Secondary/Collegiate sections without an N+1 of
 * per-teacher timetable calls. A teacher with no period assignments yet gets an
 * empty `gradeLevels` array (still returned - they belong in an "unassigned"
 * group, not hidden).
 *
 * **The `teachingStaff` filter is the point of this procedure, not a refinement
 * of it.** The query used to be `db.select().from(staff).orderBy(staff.name)`
 * with no `where` at all, while this comment described the result as teachers
 * and the caller (`bandForGrades` in
 * `apps/web/src/components/staff/attendance/attendance-register-rows.ts`) built
 * its Primary/Secondary/Collegiate sections out of `gradeLevels`. The intent was
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
export const listTeachersForAttendance = academicProcedure
  .input(v.object({ academicYearId: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const [staffRows, gradeRows, qualificationRows] = await Promise.all([
      context.db
        .select({
          id: staff.id,
          name: staff.name,
          email: staff.email,
          phone: staff.phone,
          /**
           * The identifier, not a contact detail.
           *
           * `staff.nic` is `text("nic").unique()` — unique at the database level,
           * so it is the one column that can never be shared by two people and
           * therefore the one that separates them. An email can be a personal
           * address a teacher signs up with twice, and a name can repeat outright.
           * Nullable, so a missing NIC has to be handled rather than assumed.
           */
          nic: staff.nic,
        })
        .from(staff)
        .where(teachingStaff)
        .orderBy(staff.name),
      context.db
        .selectDistinct({
          staffId: classPeriodTeacher.staffId,
          gradeLevel: class_.gradeLevel,
        })
        .from(classPeriodTeacher)
        .innerJoin(
          classPeriodSubject,
          eq(classPeriodTeacher.classPeriodSubjectId, classPeriodSubject.id)
        )
        .innerJoin(class_, eq(classPeriodSubject.classId, class_.id))
        .where(eq(classPeriodSubject.academicYearId, input.academicYearId)),
      /**
       * Every qualification, not the highest one per teacher.
       *
       * `getHighestQualification` picks the group a teacher is filed under, and it
       * cannot do that in SQL: the ordering is the `level` in
       * `QUALIFICATION_LEVELS`, a TypeScript constant, and not a column. So the
       * rows come back and the choice is made here, where that constant is
       * readable — a `max(level)` over a column that does not exist would have
       * been the alternative and would have been wrong the day a level is
       * renumbered.
       */
      context.db
        .selectDistinct({
          staffId: teacherQualification.staffId,
          qualification: teacherQualification.qualification,
        })
        .from(teacherQualification),
    ]);

    const gradesByStaff = new Map<string, Set<number>>();
    for (const row of gradeRows) {
      const set = gradesByStaff.get(row.staffId) ?? new Set<number>();
      set.add(row.gradeLevel);
      gradesByStaff.set(row.staffId, set);
    }

    const qualificationsByStaff = new Map<string, QualificationLevel[]>();
    for (const row of qualificationRows) {
      // A value the picklist would have rejected can still be in the table: the
      // column is `text` and only the API layer enforces the 13 keys, so a row
      // written before a level was removed, or by a script, is possible. It is
      // dropped rather than allowed to become an unlabelled group.
      if (!(row.qualification in QUALIFICATION_LEVELS)) {
        continue;
      }
      const level = row.qualification as QualificationLevel;
      const existing = qualificationsByStaff.get(row.staffId) ?? [];
      existing.push(level);
      qualificationsByStaff.set(row.staffId, existing);
    }

    return staffRows.map((row) => {
      const highest = getHighestQualification(
        qualificationsByStaff.get(row.id) ?? []
      );
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        nic: row.nic,
        gradeLevels: [...(gradesByStaff.get(row.id) ?? [])].toSorted(
          (a, b) => a - b
        ),
        /**
         * The group this teacher is filed under, and every credential behind it.
         *
         * Both, because they answer different questions: the register groups by
         * the highest, and a reader who disagrees with that — a BEd teacher who
         * also holds an NDT — is entitled to see the rest rather than to be told
         * their degree does not exist.
         */
        highestQualification: highest,
        qualifications: (qualificationsByStaff.get(row.id) ?? []).toSorted(
          compareQualifications
        ),
      };
    });
  });
