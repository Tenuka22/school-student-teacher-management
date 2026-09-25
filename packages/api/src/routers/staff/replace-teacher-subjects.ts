import { subjectKeySchema } from "@school-student-teacher-management/db/schema/academics";
import {
  academicYearIdSchema,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { teacherSubjectAssignment } from "@school-student-teacher-management/db/schema/teacher-subjects";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../index";

export const replaceTeacherSubjects = requireAssignmentPermission("update")
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
      staffId: staffIdSchema,
      subjectKeys: v.array(subjectKeySchema),
    })
  )
  .handler(({ input, context }) => {
    const subjectKeys = [...new Set(input.subjectKeys)];

    return context.db.transaction(async (tx) => {
      await tx
        .delete(teacherSubjectAssignment)
        .where(
          and(
            eq(teacherSubjectAssignment.staffId, input.staffId),
            eq(teacherSubjectAssignment.academicYearId, input.academicYearId)
          )
        );

      if (subjectKeys.length === 0) {
        return [];
      }

      const records = await tx
        .insert(teacherSubjectAssignment)
        .values(
          subjectKeys.map((subjectKey) => ({
            id: crypto.randomUUID(),
            staffId: input.staffId,
            academicYearId: input.academicYearId,
            subjectKey,
          }))
        )
        .returning();

      return records.map((record) => ({
        id: record.id,
        staffId: record.staffId,
        academicYearId: record.academicYearId,
        subjectKey: record.subjectKey,
        createdAt: record.createdAt.toISOString(),
      }));
    });
  });
