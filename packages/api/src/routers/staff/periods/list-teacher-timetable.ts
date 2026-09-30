import { ORPCError } from "@orpc/server";
import { class_ } from "@school-student-teacher-management/db/schema/academics";
import {
  classPeriodSubject,
  classPeriodTeacher,
} from "@school-student-teacher-management/db/schema/periods";
import {
  academicYearIdSchema,
  staff,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { academicProcedure } from "../../../index";

/**
 * List every subject-slot a teacher is named on, for a given academic year,
 * with the class name/grade joined in. A teacher may legitimately be named on
 * more than one row for the same (dayOfWeek, periodNumber) — combined
 * sessions (one Dance/Music teacher running several classes at once) are
 * intentional, not a data error, and co-teaching a subject with someone else
 * shows up as one row per teacher, not one row per subject.
 */
export const listTeacherTimetable = academicProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      staffId: staffIdSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const canViewAll = [
      "admin",
      "principal",
      "vicePrincipal",
      "academicAdmin",
    ].includes(context.session.user.role ?? "");
    if (!canViewAll) {
      const [linkedStaff] = await context.db
        .select({ id: staff.id })
        .from(staff)
        .where(eq(staff.userId, context.session.user.id))
        .limit(1);
      if (!linkedStaff || linkedStaff.id !== input.staffId) {
        throw new ORPCError("FORBIDDEN", {
          message: "Teachers may only view their own timetable",
        });
      }
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
          eq(classPeriodTeacher.staffId, input.staffId)
        )
      )
      .orderBy(classPeriodSubject.dayOfWeek, classPeriodSubject.periodNumber);

    return records.map((record) => ({
      ...record,
      createdAt: record.createdAt.toISOString(),
    }));
  });
