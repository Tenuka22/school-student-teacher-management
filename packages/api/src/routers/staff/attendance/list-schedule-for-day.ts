import { class_ } from "@school-student-teacher-management/db/schema/academics";
import {
  classPeriodSubject,
  classPeriodTeacher,
  dayOfWeekSchema,
} from "@school-student-teacher-management/db/schema/periods";
import { academicYearIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { academicProcedure } from "../../../index";

/**
 * Every teacher's scheduled periods on one weekday (Monday-Friday) for an
 * academic year, across every teacher at once - the attendance grid needs
 * this to know which cells are markable versus not-applicable, without one
 * `listTeacherTimetable` call per row. One row per named teacher, so a
 * co-taught subject-slot yields one row per teacher on it.
 */
export const listScheduleForDay = academicProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      dayOfWeek: dayOfWeekSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const records = await context.db
      .select({
        staffId: classPeriodTeacher.staffId,
        periodNumber: classPeriodSubject.periodNumber,
        classId: classPeriodSubject.classId,
        className: class_.name,
        subjectKey: classPeriodSubject.subjectKey,
      })
      .from(classPeriodTeacher)
      .innerJoin(
        classPeriodSubject,
        eq(classPeriodTeacher.classPeriodSubjectId, classPeriodSubject.id)
      )
      .innerJoin(class_, eq(classPeriodSubject.classId, class_.id))
      .where(
        and(
          eq(classPeriodSubject.academicYearId, input.academicYearId),
          eq(classPeriodSubject.dayOfWeek, input.dayOfWeek)
        )
      );

    return records;
  });
