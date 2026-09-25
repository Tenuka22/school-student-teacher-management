import { ORPCError } from "@orpc/server";
import { class_ } from "@school-student-teacher-management/db/schema/academics";
import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
import {
  academicYearIdSchema,
  staff,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../../index";

/**
 * List all period assignments for a teacher in a given academic year, with
 * class name/grade joined in. A teacher may legitimately have more than one
 * row for the same (dayOfWeek, periodNumber) - combined sessions (e.g. one
 * Dance/Music teacher running several classes at once) are intentional, not
 * a data error.
 */
export const listTeacherTimetable = adminProcedure
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      staffId: staffIdSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const canViewAll = ["admin", "principal", "vicePrincipal"].includes(
      context.session.user.role ?? ""
    );
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
          eq(classPeriodAssignment.staffId, input.staffId)
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
