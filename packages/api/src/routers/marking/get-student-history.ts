import {
  subjectMark,
  studentClassAssignment,
} from "@school-student-teacher-management/db/schema/marking";
import { eq, asc } from "drizzle-orm";
import * as v from "valibot";

import { requireStudentPermission } from "../../index";

const getStudentHistorySchema = v.object({
  studentId: v.string(),
});

export const getStudentHistory = requireStudentPermission("read")
  .input(getStudentHistorySchema)
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select({
        id: subjectMark.id,
        mark: subjectMark.mark,
        grade: subjectMark.grade,
        subjectKey: subjectMark.subjectKey,
        examTypeId: subjectMark.examTypeId,
        enteredByStaffId: subjectMark.enteredByStaffId,
        createdAt: subjectMark.createdAt,
        updatedAt: subjectMark.updatedAt,
        academicYearId: studentClassAssignment.academicYearId,
        classId: studentClassAssignment.classId,
      })
      .from(subjectMark)
      .innerJoin(
        studentClassAssignment,
        eq(subjectMark.studentClassAssignmentId, studentClassAssignment.id)
      )
      .where(eq(studentClassAssignment.studentId, input.studentId))
      .orderBy(asc(studentClassAssignment.academicYearId));

    return rows.map((row) => ({
      id: row.id,
      mark: row.mark,
      grade: row.grade,
      subjectKey: row.subjectKey,
      examTypeId: row.examTypeId,
      enteredByStaffId: row.enteredByStaffId,
      academicYearId: row.academicYearId,
      classId: row.classId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  });
