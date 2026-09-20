import { class_ } from "@school-student-teacher-management/db/schema/academics";
import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
import {
  academicYearIdSchema,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";

/**
 * List all period assignments for a teacher in a given academic year, with
 * class name/grade joined in. A teacher may legitimately have more than one
 * row for the same (dayOfWeek, periodNumber) - combined sessions (e.g. one
 * Dance/Music teacher running several classes at once) are intentional, not
 * a data error.
 */
export const listTeacherTimetable = requireAssignmentPermission("read")
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      staffId: staffIdSchema,
    })
  )
  .handler(async ({ input, context }) => {
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
