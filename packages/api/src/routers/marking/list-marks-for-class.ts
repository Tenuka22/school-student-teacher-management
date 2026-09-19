import {
  subjectMark,
  studentClassAssignment,
} from "@school-student-teacher-management/db/schema/marking";
import { eq, and, asc } from "drizzle-orm";
import * as v from "valibot";

import { requireMarkPermission } from "../../index";

const listMarksForClassSchema = v.object({
  classId: v.string(),
  academicYearId: v.string(),
  examTypeId: v.string(),
  subjectKey: v.optional(v.string()),
});

export const listMarksForClass = requireMarkPermission("read")
  .input(listMarksForClassSchema)
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select({
        id: subjectMark.id,
        mark: subjectMark.mark,
        grade: subjectMark.grade,
        subjectKey: subjectMark.subjectKey,
        enteredByStaffId: subjectMark.enteredByStaffId,
        createdAt: subjectMark.createdAt,
        updatedAt: subjectMark.updatedAt,
        studentClassAssignmentId: subjectMark.studentClassAssignmentId,
        studentId: studentClassAssignment.studentId,
      })
      .from(subjectMark)
      .innerJoin(
        studentClassAssignment,
        eq(subjectMark.studentClassAssignmentId, studentClassAssignment.id)
      )
      .where(
        and(
          eq(studentClassAssignment.classId, input.classId),
          eq(subjectMark.examTypeId, input.examTypeId)
        )
      )
      .orderBy(asc(subjectMark.subjectKey));

    return rows.map((row) => ({
      id: row.id,
      mark: row.mark,
      grade: row.grade,
      subjectKey: row.subjectKey,
      enteredByStaffId: row.enteredByStaffId,
      studentClassAssignmentId: row.studentClassAssignmentId,
      studentId: row.studentId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  });
