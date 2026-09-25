import { class_ } from "@school-student-teacher-management/db/schema/academics";
import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
import {
  academicYearIdSchema,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { teacherProcedure } from "../../../index";

export const getMyTeacherTimetable = teacherProcedure
  .input(v.object({ academicYearId: academicYearIdSchema }))
  .handler(async ({ input, context }) => {
    const [linkedStaff] = await context.db
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.userId, context.session.user.id))
      .limit(1);

    if (!linkedStaff) {
      return [];
    }

    const records = await context.db
      .select({
        id: classPeriodAssignment.id,
        classId: classPeriodAssignment.classId,
        className: class_.name,
        gradeLevel: class_.gradeLevel,
        dayOfWeek: classPeriodAssignment.dayOfWeek,
        periodNumber: classPeriodAssignment.periodNumber,
        subjectKey: classPeriodAssignment.subjectKey,
        createdAt: classPeriodAssignment.createdAt,
      })
      .from(classPeriodAssignment)
      .innerJoin(class_, eq(classPeriodAssignment.classId, class_.id))
      .where(
        and(
          eq(classPeriodAssignment.academicYearId, input.academicYearId),
          eq(classPeriodAssignment.staffId, linkedStaff.id)
        )
      )
      .orderBy(
        classPeriodAssignment.dayOfWeek,
        classPeriodAssignment.periodNumber
      );

    return records.map((record) => ({
      ...record,
      createdAt: record.createdAt.toISOString(),
    }));
  });
