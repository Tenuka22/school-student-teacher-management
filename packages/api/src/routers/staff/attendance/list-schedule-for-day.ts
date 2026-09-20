import { class_ } from "@school-student-teacher-management/db/schema/academics";
import {
  classPeriodAssignment,
  dayOfWeekSchema,
} from "@school-student-teacher-management/db/schema/periods";
import { academicYearIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";

/**
 * Every teacher's scheduled periods on one weekday (Monday-Friday) for an
 * academic year, across every teacher at once - the attendance grid needs
 * this to know which cells are markable versus not-applicable, without one
 * `listTeacherTimetable` call per row.
 */
export const listScheduleForDay = requireAssignmentPermission("read")
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      dayOfWeek: dayOfWeekSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const records = await context.db
      .select({
        staffId: classPeriodAssignment.staffId,
        periodNumber: classPeriodAssignment.periodNumber,
        classId: classPeriodAssignment.classId,
        className: class_.name,
        subjectKey: classPeriodAssignment.subjectKey,
      })
      .from(classPeriodAssignment)
      .innerJoin(class_, eq(classPeriodAssignment.classId, class_.id))
      .where(
        and(
          eq(classPeriodAssignment.academicYearId, input.academicYearId),
          eq(classPeriodAssignment.dayOfWeek, input.dayOfWeek)
        )
      );

    return records;
  });
