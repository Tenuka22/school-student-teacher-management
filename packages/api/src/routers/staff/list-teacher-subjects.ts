import { ORPCError } from "@orpc/server";
import {
  academicYearIdSchema,
  staff,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { teacherSubjectAssignment } from "@school-student-teacher-management/db/schema/teacher-subjects";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../index";

export const listTeacherSubjects = requireAssignmentPermission("read")
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
          message: "Teachers may only view their own subjects",
        });
      }
    }

    const records = await context.db
      .select({
        id: teacherSubjectAssignment.id,
        staffId: teacherSubjectAssignment.staffId,
        academicYearId: teacherSubjectAssignment.academicYearId,
        subjectKey: teacherSubjectAssignment.subjectKey,
        createdAt: teacherSubjectAssignment.createdAt,
      })
      .from(teacherSubjectAssignment)
      .where(
        and(
          eq(teacherSubjectAssignment.staffId, input.staffId),
          eq(teacherSubjectAssignment.academicYearId, input.academicYearId)
        )
      )
      .orderBy(asc(teacherSubjectAssignment.subjectKey));

    return records.map((record) => ({
      ...record,
      createdAt: record.createdAt.toISOString(),
    }));
  });
