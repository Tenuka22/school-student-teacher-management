import { classIdSchema } from "@school-student-teacher-management/db/schema/academics";
import {
  classPeriodSubject,
  classPeriodTeacher,
} from "@school-student-teacher-management/db/schema/periods";
import { academicYearIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { and, eq, inArray } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../../index";

/**
 * List every subject on a class's timetable for a given academic year, each
 * with the teacher(s) named for it so far.
 *
 * A slot ((dayOfWeek, periodNumber)) can hold more than one subject row now —
 * the timetable is grouped by slot for rendering, but the query itself is
 * flat: one row per subject, each carrying its own teacher list.
 */
export const listClassTimetable = adminProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      classId: classIdSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const subjects = await context.db
      .select()
      .from(classPeriodSubject)
      .where(
        and(
          eq(classPeriodSubject.academicYearId, input.academicYearId),
          eq(classPeriodSubject.classId, input.classId)
        )
      )
      .orderBy(classPeriodSubject.dayOfWeek, classPeriodSubject.periodNumber);

    if (subjects.length === 0) {
      return [];
    }

    const teachers = await context.db
      .select()
      .from(classPeriodTeacher)
      .where(
        // A single `IN` over every subject id on this class's timetable, not
        // one query per subject \u2014 the timetable page renders every slot at
        // once, so N+1 here would be N+1 on every load of the page.
        inArray(
          classPeriodTeacher.classPeriodSubjectId,
          subjects.map((s) => s.id)
        )
      );

    const teachersBySubjectId = new Map<string, typeof teachers>();
    for (const teacherRow of teachers) {
      const group =
        teachersBySubjectId.get(teacherRow.classPeriodSubjectId) ?? [];
      group.push(teacherRow);
      teachersBySubjectId.set(teacherRow.classPeriodSubjectId, group);
    }

    return subjects.map((subject) => ({
      id: subject.id,
      dayOfWeek: subject.dayOfWeek,
      periodNumber: subject.periodNumber,
      subjectKey: subject.subjectKey,
      createdAt: subject.createdAt.toISOString(),
      teachers: (teachersBySubjectId.get(subject.id) ?? []).map((t) => ({
        id: t.id,
        staffId: t.staffId,
        isCombinedSession: t.isCombinedSession,
        createdAt: t.createdAt.toISOString(),
      })),
    }));
  });
