import { class_ } from "@school-student-teacher-management/db/schema/academics";
import {
  classPeriodSubject,
  classPeriodTeacher,
} from "@school-student-teacher-management/db/schema/periods";
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
        id: classPeriodTeacher.id,
        classId: classPeriodSubject.classId,
        className: class_.name,
        gradeLevel: class_.gradeLevel,
        dayOfWeek: classPeriodSubject.dayOfWeek,
        periodNumber: classPeriodSubject.periodNumber,
        subjectKey: classPeriodSubject.subjectKey,
        isCombinedSession: classPeriodTeacher.isCombinedSession,
        createdAt: classPeriodTeacher.createdAt,
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
          eq(classPeriodTeacher.staffId, linkedStaff.id)
        )
      )
      .orderBy(classPeriodSubject.dayOfWeek, classPeriodSubject.periodNumber);

    return records.map((record) => ({
      ...record,
      createdAt: record.createdAt.toISOString(),
    }));
  });
